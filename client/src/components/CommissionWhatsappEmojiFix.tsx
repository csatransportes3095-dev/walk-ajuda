import { useEffect } from "react";

const EMOJI = {
  check: String.fromCodePoint(0x2705),
  person: String.fromCodePoint(0x1f464),
  money: String.fromCodePoint(0x1f4b0),
  party: String.fromCodePoint(0x1f389),
  phone: String.fromCodePoint(0x1f4f1),
  card: String.fromCodePoint(0x1f4b3),
};

const COMMISSION_MARKERS = [
  /COMISSÃO PAGA/i,
  /INDICAÇÃO CONFIRMADA/i,
  /DADOS PARA PAGAMENTO DA COMISSÃO/i,
];

function isWhatsappHost(hostname: string) {
  return hostname === "wa.me" || hostname === "api.whatsapp.com" || hostname.endsWith(".whatsapp.com");
}

function isCommissionWhatsappText(text: string) {
  return COMMISSION_MARKERS.some((marker) => marker.test(text));
}

function cleanValue(value: string) {
  return value
    .replace(/\uFFFD/g, "")
    .replace(/\u00EF\u00BF\u00BD/g, "")
    .replace(/^[*\s:.-]+/, "")
    .trim();
}

function valueAfterLabel(line: string, label: RegExp) {
  const normalized = line
    .replace(/\uFFFD/g, "")
    .replace(/\u00EF\u00BF\u00BD/g, "")
    .trim();
  const value = normalized.replace(label, "");
  return cleanValue(value);
}

function repairCommissionText(text: string) {
  if (!isCommissionWhatsappText(text)) return text;

  return text
    .split("\n")
    .map((originalLine) => {
      const line = originalLine.trim();
      if (!line) return "";

      if (/COMISSÃO PAGA/i.test(line)) {
        return `${EMOJI.check} *COMISSÃO PAGA*`;
      }

      if (/INDICAÇÃO CONFIRMADA/i.test(line)) {
        return `${EMOJI.party} *INDICAÇÃO CONFIRMADA*`;
      }

      if (/DADOS PARA PAGAMENTO DA COMISSÃO/i.test(line)) {
        return `${EMOJI.card} *DADOS PARA PAGAMENTO DA COMISSÃO*`;
      }

      if (/Cliente indicado:/i.test(line)) {
        const value = valueAfterLabel(line, /^.*?Cliente indicado:\*?\s*/i);
        return `${EMOJI.person} *Cliente indicado:* ${value || "Cliente"}`;
      }

      if (/Telefone:/i.test(line)) {
        const value = valueAfterLabel(line, /^.*?Telefone:\*?\s*/i);
        return `${EMOJI.phone} *Telefone:* ${value}`.trim();
      }

      if (/Valor pago:/i.test(line)) {
        const value = valueAfterLabel(line, /^.*?Valor pago:\*?\s*/i);
        return `${EMOJI.money} *Valor pago:* ${value}`.trim();
      }

      if (/Valor da comissão:/i.test(line)) {
        const value = valueAfterLabel(line, /^.*?Valor da comissão:\*?\s*/i);
        return `${EMOJI.money} *Valor da comissão:* ${value}`.trim();
      }

      if (/Comissão:/i.test(line)) {
        const value = valueAfterLabel(line, /^.*?Comissão:\*?\s*/i);
        return `${EMOJI.money} *Comissão:* ${value}`.trim();
      }

      if (/Pagamento da comissão confirmado/i.test(line)) {
        return `${EMOJI.check} *Pagamento da comissão confirmado.*`;
      }

      if (/Obrigado pela indicação!/i.test(line)) {
        return `Obrigado pela indicação! ${EMOJI.party}`;
      }

      // Remove somente os caracteres de substituição que já chegaram quebrados.
      // O restante do texto (nome, cliente, valores e instruções) é preservado.
      return line
        .replace(/\uFFFD/g, "")
        .replace(/\u00EF\u00BF\u00BD/g, "")
        .trim();
    })
    .join("\n");
}

function repairCommissionWhatsappUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (!isWhatsappHost(url.hostname)) return rawUrl;

    const text = url.searchParams.get("text");
    if (!text || !isCommissionWhatsappText(text)) return rawUrl;

    url.searchParams.set("text", repairCommissionText(text));
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function repairCommissionAnchor(anchor: HTMLAnchorElement) {
  const repaired = repairCommissionWhatsappUrl(anchor.href);
  if (repaired !== anchor.href) anchor.href = repaired;
}

export default function CommissionWhatsappEmojiFix() {
  useEffect(() => {
    // 1) Pagar > Confirmar usa window.open depois que o backend confirma o pagamento.
    const originalOpen = window.open;
    window.open = function patchedWindowOpen(url?: string | URL, target?: string, features?: string) {
      const nextUrl = typeof url === "string" ? repairCommissionWhatsappUrl(url) : url;
      return originalOpen.call(window, nextUrl as string | URL | undefined, target, features);
    } as typeof window.open;

    // 2) Os botões WhatsApp e Pedir PIX são links <a>, portanto não passam por
    // window.open. Corrigimos o href antes da navegação e também em cada clique.
    const repairAllAnchors = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href*="wa.me"], a[href*="api.whatsapp.com"]').forEach(repairCommissionAnchor);
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
      if (anchor) repairCommissionAnchor(anchor);
    };

    document.addEventListener("click", onClickCapture, true);
    repairAllAnchors();

    const observer = new MutationObserver(() => repairAllAnchors());
    const root = document.getElementById("root");
    if (root) observer.observe(root, { childList: true, subtree: true });

    return () => {
      window.open = originalOpen;
      document.removeEventListener("click", onClickCapture, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
