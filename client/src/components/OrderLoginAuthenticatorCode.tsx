import { useEffect, useState } from "react";
import { Copy, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function OrderLoginAuthenticatorCode({ registrationId }: { registrationId: number }) {
  const [isPageVisible, setIsPageVisible] = useState(() => typeof document === "undefined" ? true : !document.hidden);
  const [copiedEntryId, setCopiedEntryId] = useState<number | null>(null);
  const codeQuery = trpc.adminAuthenticator.getCodeForOrder.useQuery(
    { registrationId },
    { enabled: isPageVisible, staleTime: 0, gcTime: 0, refetchInterval: isPageVisible ? 5000 : false },
  );

  useEffect(() => {
    const onVisibilityChange = () => setIsPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

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
        {codeQuery.data.map((entry) => (
          <button key={entry.entryId} onClick={() => entry.code && copy(entry.entryId, entry.code)} disabled={!entry.code} className="flex w-full items-center justify-between gap-3 rounded-lg border border-cyan-300/20 bg-slate-950/70 px-3 py-2 text-left hover:bg-slate-900 disabled:cursor-default">
            <span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-100">{entry.label}</span><span className="block truncate text-[10px] text-slate-400">{entry.issuer || "Conta direcionada"}</span></span>
            {entry.code ? <span className="flex items-center gap-2 font-mono text-xl font-black tracking-[0.18em] text-cyan-100"><span>{entry.code}</span><Copy className="h-4 w-4 text-cyan-300" />{copiedEntryId === entry.entryId && <span className="text-[10px] font-sans tracking-normal text-emerald-300">Copiado</span>}</span> : <span className="text-xs text-red-300">Erro ao gerar</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
