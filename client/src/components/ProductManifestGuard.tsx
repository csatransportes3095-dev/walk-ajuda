import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import type { ProductManifestRequest } from "@/lib/productManifest";

type Config = { enabled: boolean; title: string; body: string; acceptLabel: string; buttonLabel: string };
type Pending = ProductManifestRequest & { config: Config };

function parse(raw: unknown): Config | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw);
    if (v?.enabled !== true || !String(v?.body || "").trim()) return null;
    return {
      enabled: true,
      title: String(v?.title || "Antes de continuar"),
      body: String(v?.body || ""),
      acceptLabel: String(v?.acceptLabel || "Li, entendi e aceito as condicoes acima."),
      buttonLabel: String(v?.buttonLabel || "ACEITAR E CONTINUAR"),
    };
  } catch { return null; }
}

export default function ProductManifestGuard() {
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const settingsRef = useRef(settings);
  const queueRef = useRef<ProductManifestRequest[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const process = (req: ProductManifestRequest) => {
    const current = settingsRef.current as Record<string, string> | undefined;
    if (!current) { queueRef.current.push(req); return; }
    const cfg = req.manifestKeys.map(key => parse(current[key])).find(Boolean) || null;
    if (!cfg) { req.resolve(true); return; }
    setChecked(false);
    setPending({ ...req, config: cfg });
  };

  useEffect(() => {
    if (!settings || queueRef.current.length === 0) return;
    const queued = [...queueRef.current];
    queueRef.current = [];
    queued.forEach(process);
  }, [settings]);

  useEffect(() => {
    const handler = (event: Event) => process((event as CustomEvent<ProductManifestRequest>).detail);
    window.addEventListener("h2:product-manifest-request", handler as EventListener);
    return () => window.removeEventListener("h2:product-manifest-request", handler as EventListener);
  }, []);

  const modal = useMemo(() => {
    if (!pending) return null;
    return (
      <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-[#060914] text-white shadow-[0_30px_100px_rgba(0,0,0,.8)]">
          <div className="border-b border-amber-400/20 bg-amber-500/10 px-5 py-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">LEITURA OBRIGATORIA</p>
            <h3 className="mt-1 text-xl font-black">{pending.config.title}</h3>
            <p className="mt-2 text-xs font-semibold text-white/60">Selecionado: <span className="text-cyan-300">{pending.actionLabel}</span></p>
          </div>
          <div className="space-y-4 p-5">
            <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-200">{pending.config.body}</div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-sm font-semibold"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-1 h-4 w-4" /><span>{pending.config.acceptLabel}</span></label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { pending.resolve(false); setPending(null); setChecked(false); }} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black text-white/80">VOLTAR</button>
              <button type="button" disabled={!checked} onClick={() => { pending.resolve(true); setPending(null); setChecked(false); }} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-35">{pending.config.buttonLabel}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [pending, checked]);

  return modal ? createPortal(modal, document.body) : null;
}
