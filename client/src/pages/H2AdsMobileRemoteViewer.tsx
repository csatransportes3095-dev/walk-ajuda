import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Minus, Plus, Send, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Action = { kind: "tap"; x: number; y: number } | { kind: "scroll"; deltaY: number; x?: number; y?: number } |
  { kind: "text"; text: string } | { kind: "key"; key: "Enter" | "Backspace" | "Tab" | "Escape" };

export default function H2AdsMobileRemoteViewer({ instanceId, instanceName, sessionToken, onClose }: {
  instanceId: number;
  instanceName: string;
  sessionToken: string;
  onClose: () => void;
}) {
  // POST para o token nunca ir para a URL nem logs de query string.
  const frameRequest = trpc.h2Ads.mobileRemoteFrame.useMutation();
  const [frameData, setFrameData] = useState<{ active: boolean; image: string | null; at: number | null; lastInput?: { id: number; kind: string; state: "queued" | "sent" | "blocked" | "failed"; reason: string | null } | null; tabStatus?: { selectedTargetId: string | null; tabs: { targetId: string; title: string; label: string; kind: "web" | "label" }[] } | null } | null>(null);
  const requestRef = useRef(frameRequest.mutateAsync);
  requestRef.current = frameRequest.mutateAsync;

  useEffect(() => {
    let disposed = false;
    let inflight = false;
    const fetchFrame = async () => {
      if (disposed || inflight || document.visibilityState === "hidden") return;
      inflight = true;
      try {
        const value = await requestRef.current({ instanceId, sessionToken });
        if (!disposed) setFrameData(value);
      } catch {
        if (!disposed) setFrameData(previous => previous || { active: false, image: null, at: null });
      } finally {
        inflight = false;
      }
    };
    void fetchFrame();
    const timer = window.setInterval(() => { void fetchFrame(); }, 1_400);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [instanceId, sessionToken]);
  const mutation = trpc.h2Ads.mobileRemoteInput.useMutation();
  const selectTab = trpc.h2Ads.mobileRemoteSelectTab.useMutation();
  const [text, setText] = useState("");
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [waitingTooLong, setWaitingTooLong] = useState(false);
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const expired = frameData?.active === false;

  useEffect(() => {
    if (frameData?.image || expired) {
      setWaitingTooLong(false);
      return;
    }
    // Nao reinicia o cronometro a cada consulta: mostra o diagnostico
    // quando o Worker ainda nao enviou nenhuma imagem desta sessao.
    const timer = window.setTimeout(() => setWaitingTooLong(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [frameData?.image, expired, instanceId, sessionToken]);

  const send = async (command: Action) => {
    try {
      await mutation.mutateAsync({ instanceId, sessionToken, command });
    } catch {
      toast.error("Comando nao enviado. Verifique a conexao e a sessao remota.");
    }
  };

  // Mapeia o toque para os pixels da pagina original mesmo usando "Ajustar",
  // "Preencher" ou zoom: nunca clique nas margens pretas do object-fit.
  const pointInChrome = (event: React.PointerEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    const bounds = img.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !img.naturalWidth || !img.naturalHeight) return null;
    const scale = fitMode === "contain"
      ? Math.min(bounds.width / img.naturalWidth, bounds.height / img.naturalHeight)
      : Math.max(bounds.width / img.naturalWidth, bounds.height / img.naturalHeight);
    const drawWidth = img.naturalWidth * scale;
    const drawHeight = img.naturalHeight * scale;
    const left = bounds.left + (bounds.width - drawWidth) / 2;
    const top = bounds.top + (bounds.height - drawHeight) / 2;
    const x = (event.clientX - left) / drawWidth;
    const y = (event.clientY - top) / drawHeight;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  };

  const pointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (expired) return;
    pointerOrigin.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerUp = (event: React.PointerEvent<HTMLImageElement>) => {
    const start = pointerOrigin.current;
    pointerOrigin.current = null;
    if (!start || expired) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const point = pointInChrome(event);
    if (Math.abs(dy) >= 22 && Math.abs(dy) >= Math.abs(dx)) {
      void send({
        kind: "scroll", deltaY: Math.max(-800, Math.min(800, -dy * 2)),
        x: point?.x ?? 0.5, y: point?.y ?? 0.6,
      });
      return;
    }
    if (point) void send({ kind: "tap", ...point });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={"Controle remoto: " + instanceName}
      className="fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#06070A] text-white">
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-blue-300">H2ADS · Controle remoto</span>
          <strong className="block truncate text-sm">{instanceName}</strong>
        </div>
        <button type="button" onClick={onClose} className="flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 text-xs font-bold text-rose-100">
          <X className="h-4 w-4" /> Encerrar
        </button>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-2 py-1.5">
        {(frameData?.tabStatus?.tabs.length ?? 0) > 1 ? (
          <select aria-label="Escolher aba Chrome" value={frameData?.tabStatus?.selectedTargetId ?? ""}
            onChange={event => {
              if (event.target.value) void selectTab.mutateAsync({
                instanceId, sessionToken, targetId: event.target.value,
              }).catch(() => toast.error("Nao foi possivel selecionar a aba."));
            }}
            className="min-w-0 flex-1 rounded-lg border border-white/20 bg-[#141922] px-2 py-2 text-xs text-white">
            <option value="">Selecione a aba</option>
            {frameData?.tabStatus?.tabs.map(tab => (
              <option key={tab.targetId} value={tab.targetId}>
                {tab.kind === "label" ? "Identificacao H2ADS" : tab.label} - {tab.title.slice(0, 45)}
              </option>
            ))}
          </select>
        ) : <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{frameData?.image ? "Chrome conectado" : "Aguardando Chrome..."}</span>}
        <button type="button" onClick={() => setFitMode(mode => mode === "contain" ? "cover" : "contain")}
          className="shrink-0 rounded-lg border border-blue-400/40 px-2 py-2 text-[11px] font-bold text-blue-200">
          {fitMode === "contain" ? "Preencher" : "Ajustar"}
        </button>
        <button type="button" aria-label="Diminuir zoom" onClick={() => setZoom(z => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
          className="rounded-lg border border-white/20 p-2"><Minus className="h-4 w-4" /></button>
        <button type="button" aria-label="Aumentar zoom" onClick={() => setZoom(z => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
          className="rounded-lg border border-white/20 p-2"><Plus className="h-4 w-4" /></button>
      </div>

      <main className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {frameData?.image ? (
          <img
            src={frameData.image} alt="Chrome remoto em tela cheia"
            className="block h-full w-full select-none"
            style={{ objectFit: fitMode, transform: "scale(" + zoom + ")", transformOrigin: "center center", touchAction: "none" }}
            draggable={false} onPointerDown={pointerDown} onPointerUp={pointerUp}
            onPointerCancel={() => { pointerOrigin.current = null; }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
            {expired ? "Sessao expirada. Encerre e abra outra." :
              waitingTooLong ? "Chrome sem imagem. Confira a aba selecionada ou reabra somente a instancia de teste." :
              <div className="flex flex-col items-center gap-3"><Loader2 className="h-6 w-6 animate-spin" />Aguardando imagem...</div>}
          </div>
        )}
      </main>

      <div className="shrink-0 border-t border-white/10 bg-[#10151E] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={expired} onClick={() => void send({ kind: "scroll", deltaY: -550, x: 0.5, y: 0.6 })}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600/25 text-sm font-bold text-blue-100 disabled:opacity-40">
            <ArrowUp className="h-5 w-5" /> Subir
          </button>
          <button type="button" disabled={expired} onClick={() => void send({ kind: "scroll", deltaY: 550, x: 0.5, y: 0.6 })}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600/25 text-sm font-bold text-blue-100 disabled:opacity-40">
            <ArrowDown className="h-5 w-5" /> Descer
          </button>
        </div>
        <details className="mt-1.5 text-xs text-slate-300">
          <summary className="cursor-pointer select-none px-2 py-1.5">Teclado e diagnostico</summary>
          <p role="status" className="mb-2 rounded-lg bg-black/30 p-2">
            {!frameData?.lastInput ? "Nenhum comando enviado." :
              <>Ultimo comando #{frameData.lastInput.id}: {frameData.lastInput.state === "queued" ? "Aguardando o Windows" :
                frameData.lastInput.state === "sent" ? "Enviado ao Chrome (sem garantia de rolagem)" :
                frameData.lastInput.state === "blocked" ? "Bloqueado: aba alterada ou indisponivel" : "Falhou no Chrome"}</>}
          </p>
          <label htmlFor="h2ads-mobile-remote-text" className="block pb-1">Teclado do Android</label>
          <div className="flex gap-2">
            <input id="h2ads-mobile-remote-text" value={text} maxLength={180} onChange={e => setText(e.target.value)} autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-white" placeholder="Texto para o Chrome..." />
            <button type="button" disabled={!text || expired} onClick={() => { void send({ kind: "text", text }); setText(""); }}
              className="rounded-lg bg-blue-600 px-3 font-bold disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {(["Enter", "Backspace", "Tab", "Escape"] as const).map(key => (
              <button key={key} type="button" disabled={expired} onClick={() => void send({ kind: "key", key })}
                className="min-h-10 rounded-lg border border-white/20 text-xs font-bold disabled:opacity-40">
                {key === "Backspace" ? "Apagar" : key === "Escape" ? "Esc" : key}
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
