import { useEffect, useRef, useState } from "react";
import { Clock3, Copy, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function OrderLoginAuthenticatorCode({ registrationId }: { registrationId: number }) {
  const [isPageVisible, setIsPageVisible] = useState(() => typeof document === "undefined" ? true : !document.hidden);
  const [copiedEntryId, setCopiedEntryId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const refreshedExpiryRef = useRef<number | null>(null);
  const codeQuery = trpc.adminAuthenticator.getCodeForOrder.useQuery(
    { registrationId },
    { enabled: isPageVisible, staleTime: 0, gcTime: 0, refetchInterval: isPageVisible ? 5000 : false },
  );

  useEffect(() => {
    const onVisibilityChange = () => setIsPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Atualiza apenas o cronometro visual, sem recalcular o TOTP no navegador.
  useEffect(() => {
    if (!isPageVisible) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isPageVisible]);

  // Consulta o servidor na virada do codigo; mantem o polling de 5s como garantia.
  // Cada validade dispara no maximo uma consulta adicional.
  useEffect(() => {
    if (!isPageVisible || !codeQuery.data?.length) return;
    const expiresAt = Math.min(...codeQuery.data.map((entry) => entry.expiresAt ?? Infinity));
    if (!Number.isFinite(expiresAt) || refreshedExpiryRef.current === expiresAt) return;
    const timer = window.setTimeout(() => {
      refreshedExpiryRef.current = expiresAt;
      setNow(Date.now());
      void codeQuery.refetch();
    }, Math.max(0, expiresAt - Date.now() + 150));
    return () => window.clearTimeout(timer);
  }, [isPageVisible, codeQuery.data, codeQuery.refetch]);

  const copy = async (entryId: number, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedEntryId(entryId);
      toast.success("Código copiado.");
      window.setTimeout(() => setCopiedEntryId(null), 1600);
    } catch {
      toast.error("Não foi possível copiar o código.");
    }
  };

  if (!codeQuery.data?.length) return null;

  return (
    <section className="rounded-xl border border-cyan-300/30 bg-cyan-400/[0.07] p-3">
      <div className="flex items-start gap-2">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-cyan-100">AUTENTICADOR PRIVADO DO ADM</p>
          <p className="mt-0.5 text-[11px] text-cyan-100/70">Código renovado automaticamente. Nunca é mostrado ao cliente nem entra no WhatsApp.</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {codeQuery.data.map((entry) => {
          const remainingSeconds = entry.expiresAt
            ? Math.max(0, Math.ceil((entry.expiresAt - now) / 1000))
            : 0;
          const expired = Boolean(entry.code && entry.expiresAt && remainingSeconds === 0);
          const progress = Math.max(0, Math.min(100, (remainingSeconds / 30) * 100));

          return (
            <button
              type="button"
              key={entry.entryId}
              onClick={() => { if (entry.code && !expired) void copy(entry.entryId, entry.code); }}
              disabled={!entry.code || expired}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-cyan-300/20 bg-slate-950/70 px-3 py-2 text-left hover:bg-slate-900 disabled:cursor-default"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-slate-100">{entry.label}</span>
                <span className="block truncate text-[10px] text-slate-400">{entry.issuer || "Conta direcionada"}</span>
              </span>
              {entry.code ? (
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="flex items-center gap-2 font-mono text-xl font-black tracking-[0.18em] text-cyan-100">
                    <span>{expired ? "------" : entry.code}</span>
                    <Copy className="h-4 w-4 text-cyan-300" />
                    {copiedEntryId === entry.entryId && <span className="text-[10px] font-sans tracking-normal text-emerald-300">Copiado</span>}
                  </span>
                  <span
                    role="timer"
                    aria-label={expired ? "Atualizando código do autenticador" : "Código troca em " + remainingSeconds + " segundos"}
                    className={"inline-flex items-center gap-1 text-[11px] font-bold tracking-normal " + (expired || remainingSeconds <= 5 ? "text-amber-300" : "text-cyan-300")}
                  >
                    <Clock3 className="h-3 w-3" />
                    {expired ? "Atualizando código..." : "Troca em 00:" + String(remainingSeconds).padStart(2, "0")}
                  </span>
                  <span className="h-1 w-32 max-w-full overflow-hidden rounded-full bg-slate-700/80" aria-hidden="true">
                    <span
                      className={"block h-full rounded-full transition-[width] duration-500 " + (remainingSeconds <= 5 ? "bg-amber-400" : "bg-cyan-400")}
                      style={{ width: String(progress) + "%" }}
                    />
                  </span>
                </span>
              ) : <span className="text-xs text-red-300">Erro ao gerar</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
