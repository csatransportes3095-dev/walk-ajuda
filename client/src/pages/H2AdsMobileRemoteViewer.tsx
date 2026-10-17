import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Minus, Plus, Send, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Action = { kind: "tap"; x: number; y: number } | { kind: "scroll"; deltaY: number } |
  { kind: "text"; text: string } | { kind: "key"; key: "Enter" | "Backspace" | "Tab" | "Escape" };

export default function H2AdsMobileRemoteViewer({ instanceId, instanceName, sessionToken, onClose }: {
  instanceId: number;
  instanceName: string;
  sessionToken: string;
  onClose: () => void;
}) {
  // POST para o token nunca ir para a URL nem logs de query string.
  const frameRequest = trpc.h2Ads.mobileRemoteFrame.useMutation();
  const [frameData, setFrameData] = useState<{ active: boolean; image: string | null; at: number | null; lastInput?: { id: number; kind: string; state: "queued" | "sent" | "blocked" | "failed"; reason: string | null } | null } | null>(null);
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
  const [text, setText] = useState("");
  const [zoom, setZoom] = useState(1);
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

  const pointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    pointerOrigin.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerUp = (event: React.PointerEvent<HTMLImageElement>) => {
    const start = pointerOrigin.current;
    pointerOrigin.current = null;
    if (!start || expired) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) >= 26 && Math.abs(dy) >= Math.abs(dx)) {
      void send({ kind: "scroll", deltaY: Math.max(-800, Math.min(800, -dy * 2)) });
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    void send({ kind: "tap", x, y });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Visualizacao remota de ${instanceName}`}
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#06070A] text-white">
      <div className="mx-auto w-full max-w-5xl space-y-3 p-3 pb-16">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300">H2ADS MOBILE • REMOTO</p>
            <h2 className="truncate text-lg font-black">{instanceName}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex min-h-11 items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 text-sm font-bold text-rose-100">
            <X className="h-4 w-4" /> Encerrar
          </button>
        </header>

        <div className="rounded-xl border border-blue-400/25 bg-blue-400/5 px-3 py-2 text-xs leading-5 text-slate-300">
          Previa da aba web, nao da janela Windows inteira. Conexao ADM temporaria.
          O Chrome e o proxy permanecem no computador. Atualizacao aproximada de 1 a 2 segundos.
        </div>

        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#141922] px-3 py-2">
          <span className="text-xs font-bold text-slate-300">{expired ? "Sessao expirada" : frameData?.image ? "Previa disponivel" : waitingTooLong ? "Sem imagem do Chrome" : "Aguardando imagem da aba..."}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setZoom(z => Math.max(1, Math.round((z - 0.25) * 100) / 100))} aria-label="Diminuir zoom" className="rounded-lg border border-white/15 p-2"><Minus className="h-4 w-4" /></button>
            <span className="text-xs font-bold">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom(z => Math.min(2, Math.round((z + 0.25) * 100) / 100))} aria-label="Aumentar zoom" className="rounded-lg border border-white/15 p-2"><Plus className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-white/15 bg-black">
          {frameData?.image ? (
            <img
              src={frameData.image} alt="Previa ao vivo da aba selecionada no computador"
              className="block w-full select-none"
              style={{ width: `${zoom * 100}%`, maxWidth: "none", touchAction: "none" }}
              draggable={false}
              onPointerDown={pointerDown}
              onPointerUp={pointerUp}
              onPointerCancel={() => { pointerOrigin.current = null; }}
            />
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-400">
              {frameRequest.isPending && <Loader2 className="h-6 w-6 animate-spin" />}
              {expired ? "A sessao terminou. Feche e inicie uma nova." :
                waitingTooLong
                  ? "Nenhuma imagem chegou. Use uma instancia de teste aberta depois de atualizar o agente Windows e ativar o controle remoto; instancias antigas nao recebem o recurso automaticamente. Confira tambem se ha apenas uma aba HTTP(S)."
                  : "Aguardando uma unica aba HTTP(S) aberta no Chrome. Se houver varias abas web, o piloto bloqueia o controle para evitar a pagina errada."}
            </div>
          )}
        </div>

        {frameData?.lastInput && <p role="status" className="rounded-xl border border-white/15 bg-[#141922] px-3 py-2 text-xs text-slate-200">
          Ultimo comando #{frameData.lastInput.id}: {frameData.lastInput.state === "queued" ? "Aguardando o Windows" :
            frameData.lastInput.state === "sent" ? "Enviado ao Chrome" :
            frameData.lastInput.state === "blocked" ? "Bloqueado: aba indisponivel ou alterada" :
            "Falhou no Chrome"}.
        </p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={expired} onClick={() => void send({ kind: "scroll", deltaY: -500 })} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-500/15 text-sm font-bold text-blue-200 disabled:opacity-40"><ArrowUp className="h-4 w-4" /> Subir</button>
          <button type="button" disabled={expired} onClick={() => void send({ kind: "scroll", deltaY: 500 })} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-500/15 text-sm font-bold text-blue-200 disabled:opacity-40"><ArrowDown className="h-4 w-4" /> Descer</button>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#141922] p-3">
          <label htmlFor="h2ads-mobile-remote-text" className="text-xs font-bold text-slate-300">Teclado do Android</label>
          <div className="mt-2 flex items-center gap-2">
            <input id="h2ads-mobile-remote-text" value={text} maxLength={180} onChange={e => setText(e.target.value)} autoComplete="off" className="min-w-0 flex-1 rounded-xl border border-white/20 bg-black/30 px-3 py-3 text-sm text-white outline-none" placeholder="Digite o texto para enviar..." />
            <button type="button" disabled={!text || expired} onClick={() => { void send({ kind: "text", text }); setText(""); }} className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-bold disabled:opacity-40"><Send className="h-4 w-4" /> Enviar</button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {(["Enter", "Backspace", "Tab", "Escape"] as const).map(key =>
              <button key={key} type="button" disabled={expired} onClick={() => void send({ kind: "key", key })} className="min-h-11 rounded-lg border border-white/15 bg-white/5 px-1 text-[11px] font-bold disabled:opacity-40">{key === "Backspace" ? "Apagar" : key === "Escape" ? "Esc" : key}</button>
            )}
          </div>
        </div>
        <p className="text-center text-xs leading-5 text-slate-500">Toque na imagem para clicar; deslize sobre ela para rolar. Por seguranca, o piloto controla apenas quando existe uma unica aba HTTP(S) na instancia.</p>
      </div>
    </div>
  );
}
