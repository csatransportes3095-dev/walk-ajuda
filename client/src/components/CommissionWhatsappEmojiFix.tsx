import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { snapshotUnicodeText } from "@shared/whatsappUnicodeDiagnostics";

type DiagnosticRecord = {
  capturedAt: string;
  source: "anchor" | "window.open" | "auto-scan";
  action: string;
  rawAttribute: string | null;
  resolvedUrl: string;
  encodedText: string;
  decodedText: string;
  payload: ReturnType<typeof snapshotUnicodeText>;
  encodedHasReplacementUtf8: boolean;
  encodedHasKnownEmojiUtf8: boolean;
};

const STORAGE_KEY = "h2:commission-whatsapp-diagnostic";

function classifyAction(text: string): string {
  if (/DADOS PARA PAGAMENTO DA COMISSÃO/i.test(text)) return "PEDIR PIX";
  if (/INDICAÇÃO CONFIRMADA/i.test(text)) return "INDICAÇÃO CONFIRMADA";
  if (/COMISSÃO PAGA/i.test(text)) return "PAGAMENTO CONFIRMADO";
  return "WHATSAPP COMISSÕES";
}

function isCommissionWhatsappText(text: string): boolean {
  return /COMISSÃO PAGA|INDICAÇÃO CONFIRMADA|DADOS PARA PAGAMENTO DA COMISSÃO/i.test(text);
}

function captureWhatsappUrl(
  rawUrl: string,
  source: DiagnosticRecord["source"],
  rawAttribute: string | null,
): DiagnosticRecord | null {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.hostname !== "wa.me" && url.hostname !== "api.whatsapp.com" && !url.hostname.endsWith(".whatsapp.com")) {
      return null;
    }

    const decodedText = url.searchParams.get("text") ?? "";
    if (!decodedText || !isCommissionWhatsappText(decodedText)) return null;

    const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;
    const encodedText = query
      .split("&")
      .find((part) => part.startsWith("text="))
      ?.slice(5) ?? "";

    const upperEncoded = encodedText.toUpperCase();
    const encodedHasKnownEmojiUtf8 = [
      "%E2%9C%85",
      "%F0%9F%8E%89",
      "%F0%9F%91%A4",
      "%F0%9F%93%B1",
      "%F0%9F%92%B0",
      "%F0%9F%92%B3",
    ].some((token) => upperEncoded.includes(token));

    return {
      capturedAt: new Date().toISOString(),
      source,
      action: classifyAction(decodedText),
      rawAttribute,
      resolvedUrl: url.toString(),
      encodedText,
      decodedText,
      payload: snapshotUnicodeText(decodedText),
      encodedHasReplacementUtf8: upperEncoded.includes("%EF%BF%BD"),
      encodedHasKnownEmojiUtf8,
    };
  } catch {
    return null;
  }
}

function saveRecord(record: DiagnosticRecord) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {}
}

function loadRecord(): DiagnosticRecord | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DiagnosticRecord;
  } catch {
    return null;
  }
}

export default function CommissionWhatsappEmojiFix() {
  const [record, setRecord] = useState<DiagnosticRecord | null>(() => loadRecord());
  const [expanded, setExpanded] = useState(false);
  const sentKeysRef = useRef(new Set<string>());
  const reportMutation = trpc.whatsappTemplates.reportCommissionDiagnostic.useMutation();
  const onCommissionRoute = window.location.pathname.startsWith("/admin/commissions");

  const publishRecord = (captured: DiagnosticRecord) => {
    saveRecord(captured);
    setRecord(captured);

    const key = `${captured.action}|${captured.source}|${captured.encodedText}`;
    if (sentKeysRef.current.has(key)) return;
    sentKeysRef.current.add(key);

    reportMutation.mutate({
      action: captured.action,
      source: captured.source,
      decodedText: captured.decodedText,
      encodedText: captured.encodedText,
      resolvedUrl: captured.resolvedUrl,
      rawAttribute: captured.rawAttribute,
      hasReplacementCharacter: captured.payload.hasReplacementCharacter,
      encodedHasReplacementUtf8: captured.encodedHasReplacementUtf8,
      encodedHasKnownEmojiUtf8: captured.encodedHasKnownEmojiUtf8,
      codePoints: captured.payload.codePoints,
      utf8BytesHex: captured.payload.utf8BytesHex,
      capturedAt: captured.capturedAt,
    });
  };

  useEffect(() => {
    const originalOpen = window.open;

    window.open = function diagnosticWindowOpen(url?: string | URL, target?: string, features?: string) {
      if (typeof url === "string") {
        const captured = captureWhatsappUrl(url, "window.open", null);
        if (captured) publishRecord(captured);
      }
      return originalOpen.call(window, url as string | URL | undefined, target, features);
    } as typeof window.open;

    const captureAnchor = (event: Event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
      if (!anchor) return;

      const captured = captureWhatsappUrl(anchor.href, "anchor", anchor.getAttribute("href"));
      if (captured) publishRecord(captured);
    };

    const scanAnchors = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href*="wa.me"], a[href*="api.whatsapp.com"]').forEach((anchor) => {
        const captured = captureWhatsappUrl(anchor.href, "auto-scan", anchor.getAttribute("href"));
        if (captured) publishRecord(captured);
      });
    };

    document.addEventListener("pointerdown", captureAnchor, true);
    document.addEventListener("click", captureAnchor, true);

    if (onCommissionRoute) {
      scanAnchors();
      const observer = new MutationObserver(scanAnchors);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
      return () => {
        window.open = originalOpen;
        document.removeEventListener("pointerdown", captureAnchor, true);
        document.removeEventListener("click", captureAnchor, true);
        observer.disconnect();
      };
    }

    return () => {
      window.open = originalOpen;
      document.removeEventListener("pointerdown", captureAnchor, true);
      document.removeEventListener("click", captureAnchor, true);
    };
  }, [onCommissionRoute]);

  const diagnosis = useMemo(() => {
    if (!record) return null;

    if (record.payload.hasReplacementCharacter || record.encodedHasReplacementUtf8) {
      return {
        level: "problem" as const,
        title: "U+FFFD JÁ EXISTE ANTES DO WHATSAPP",
        detail: "O caractere � já está no payload/URL gerado pelo sistema. A falha acontece antes de o WhatsApp receber a mensagem.",
      };
    }

    if (record.encodedHasKnownEmojiUtf8) {
      return {
        level: "ok" as const,
        title: "PAYLOAD E URL ESTÃO UTF-8 CORRETOS",
        detail: "Os emojis chegaram à URL como bytes UTF-8 válidos e não há U+FFFD. Se o WhatsApp mostrar �, a transformação acontece depois da URL sair do sistema.",
      };
    }

    return {
      level: "warn" as const,
      title: "SEM U+FFFD, MAS NÃO IDENTIFIQUEI OS BYTES DOS EMOJIS ESPERADOS",
      detail: "O texto precisa ser conferido pelos code points e pelo text= capturado abaixo.",
    };
  }, [record]);

  if (!onCommissionRoute) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] w-[min(680px,calc(100vw-2rem))] rounded-2xl border border-amber-500/40 bg-[#160f08]/95 p-4 text-white shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-amber-200">DIAGNÓSTICO UTF-8 — COMISSÕES</p>
          <p className="mt-1 text-[11px] text-amber-100/70">Somente leitura. Não altera mensagem, link, comissão, PIX ou pagamento.</p>
        </div>
        <div className="flex gap-2">
          {record && (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-lg border border-amber-400/30 px-2 py-1 text-[10px] font-bold text-amber-100 hover:bg-amber-400/10">
              {expanded ? "OCULTAR" : "DETALHES"}
            </button>
          )}
          <button type="button" onClick={() => { try { sessionStorage.removeItem(STORAGE_KEY); } catch {} setRecord(null); setExpanded(false); }} className="rounded-lg border border-white/15 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10">
            LIMPAR
          </button>
        </div>
      </div>

      {!record ? (
        <p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/70">
          O diagnóstico agora também lê automaticamente os links de <b>WhatsApp</b> e <b>Pedir PIX</b> assim que os cards aparecem. Para <b>Pagar → Confirmar</b>, a captura ocorre no instante do window.open.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className={`rounded-xl border p-3 ${diagnosis?.level === "problem" ? "border-red-500/40 bg-red-500/10" : diagnosis?.level === "ok" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
            <div className="flex flex-wrap items-center gap-2 text-[11px]"><span className="rounded-full bg-white/10 px-2 py-0.5 font-bold">{record.action}</span><span className="text-white/50">origem: {record.source}</span><span className="text-white/50">{new Date(record.capturedAt).toLocaleTimeString("pt-BR")}</span></div>
            <p className="mt-2 text-xs font-black">{diagnosis?.title}</p>
            <p className="mt-1 text-[11px] text-white/75">{diagnosis?.detail}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg bg-black/20 p-2">hasReplacementCharacter: <b>{String(record.payload.hasReplacementCharacter)}</b></div><div className="rounded-lg bg-black/20 p-2">URL contém %EF%BF%BD: <b>{String(record.encodedHasReplacementUtf8)}</b></div></div>
          </div>

          {expanded && (
            <div className="max-h-[48vh] space-y-2 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-[10px]">
              <p className="font-bold text-amber-100">1. TEXTO DECODIFICADO IMEDIATAMENTE ANTES DO WA.ME</p><pre className="whitespace-pre-wrap break-all text-white/80">{record.decodedText}</pre>
              <p className="pt-2 font-bold text-amber-100">2. CODE POINTS / BYTES UTF-8</p><pre className="whitespace-pre-wrap break-all text-white/70">{JSON.stringify(record.payload, null, 2)}</pre>
              <p className="pt-2 font-bold text-amber-100">3. TEXT= PERCENT-ENCODED</p><pre className="whitespace-pre-wrap break-all text-white/70">{record.encodedText}</pre>
              <p className="pt-2 font-bold text-amber-100">4. HREF ORIGINAL DO LINK</p><pre className="whitespace-pre-wrap break-all text-white/60">{record.rawAttribute ?? "window.open: não existe atributo href"}</pre>
              <p className="pt-2 font-bold text-amber-100">5. URL RESOLVIDA</p><pre className="whitespace-pre-wrap break-all text-white/60">{record.resolvedUrl}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
