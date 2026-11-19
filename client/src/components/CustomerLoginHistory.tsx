import { Clock, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Props = {
  phone: string;
  formatDate: (timestamp: number) => string;
};

const ACTIVITY_LABELS = {
  login: "Entrada no site",
  session: "Sessão ativa",
  loan_request: "Pedido de empréstimo",
} as const;

export default function CustomerLoginHistory({ phone, formatDate }: Props) {
  const cleanPhone = phone.replace(/\D/g, "");
  const canQuery = cleanPhone.length >= 10;
  const history = trpc.customerPassword.adminGetLoginHistory.useQuery(
    { phone: cleanPhone },
    {
      enabled: canQuery,
      staleTime: 0,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    }
  );

  return (
    <section className="w-full min-w-0 rounded-xl border border-sky-400/25 bg-slate-950/40 p-3" aria-label="Histórico de acessos do cliente">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-blue-400 flex-shrink-0" />
          <span className="text-sm font-black text-sky-300">Últimos 5 acessos</span>
        </div>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            void history.refetch();
          }}
          disabled={!canQuery || history.isFetching}
          aria-label="Atualizar histórico de acessos"
          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-sky-400/20 px-2 py-1 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-400/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${history.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {!canQuery ? (
        <p className="text-xs text-muted-foreground">Telefone indisponível para consultar os acessos.</p>
      ) : history.isLoading ? (
        <div className="space-y-1" role="status" aria-label="Carregando histórico de acessos">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-3 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {history.isError && (
            <p role="alert" className="mb-2 text-xs leading-relaxed text-amber-300">
              {history.data
                ? "Não foi possível atualizar. Exibindo o último histórico recebido."
                : "Não foi possível carregar os acessos. Toque em Atualizar para tentar novamente."}
            </p>
          )}
          {history.data && (
            <>
              {history.data.lastActivity && (
                <div className="mb-2 border-b border-white/10 pb-2 text-[11px] leading-relaxed">
                  <span className="block text-[10px] text-muted-foreground">Última atividade confirmada</span>
                  <span className="font-semibold text-sky-200">{formatDate(history.data.lastActivity.at)}</span>
                  <span className="text-muted-foreground"> · {ACTIVITY_LABELS[history.data.lastActivity.source]}</span>
                </div>
              )}
              <div className="text-[11px] font-bold text-foreground mb-1.5">
                <span className="text-blue-400">{history.data.total}</span>
                <span className="text-muted-foreground font-normal"> total</span>
              </div>
              {history.data.recent.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {history.data.recent.slice(0, 5).map((timestamp: number, i: number) => (
                    <div key={`${timestamp}-${i}`} className={`min-w-0 rounded-lg border px-2.5 py-3 text-xs font-semibold leading-snug ${[
                      "border-cyan-400/40 bg-cyan-500/10 text-cyan-200",
                      "border-violet-400/40 bg-violet-500/10 text-violet-200",
                      "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
                      "border-amber-400/40 bg-amber-500/10 text-amber-200",
                      "border-pink-400/40 bg-pink-500/10 text-pink-200",
                    ][i]}`}>
                      <span className="block text-[10px] opacity-75">Acesso {i + 1}</span>
                      {formatDate(timestamp)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[9px] text-muted-foreground/60 italic">Nenhum acesso registrado</p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
