import { useState } from "react";
import { trpc } from "@/lib/trpc";

const PHASES = ["Serviço", "Garantia / preço", "Dados", "Documentos", "Cupom", "Pagamento", "Finalizar"];

export function ColombiaBotDiagnosticsPanel() {
  const [opened, setOpened] = useState(false);
  const { data, isFetching, refetch } = trpc.colombiaBotDiagnostics.overview.useQuery(undefined, {
    enabled: opened,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  return (
    <div className="rounded-2xl border border-cyan-400/30 bg-zinc-950/60 p-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">Diagnóstico de atendimento</h3>
          <p className="mt-1 text-xs text-zinc-400">Somente etapas e erros dos últimos 7 dias. Sem CPF, telefone, OTP, textos ou documentos.</p>
        </div>
        <button type="button" onClick={() => setOpened(x => !x)} className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-bold text-cyan-100">
          {opened ? "Fechar diagnóstico" : "Ver diagnóstico"}
        </button>
      </div>
      {opened && (
        <div className="mt-4 space-y-4">
          <div className="flex justify-end">
            <button type="button" disabled={isFetching} onClick={() => refetch()} className="rounded-lg border border-zinc-500 px-3 py-2 text-xs font-semibold disabled:opacity-50">
              {isFetching ? "Atualizando..." : "Atualizar dados"}
            </button>
          </div>
          {!data && <p role="status" className="text-sm text-zinc-300">Carregando informações...</p>}
          {data?.available === false && <p role="alert" className="text-sm text-amber-300">{data.message}</p>}
          {data?.available === true && (
            <>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-zinc-400">Sessões observadas</p>
                <p className="text-2xl font-black text-cyan-200">{data.totalSessions}</p>
                <p className="mt-1 text-xs text-zinc-500">Eventos são limitados; o painel não representa todas as visitas ao site.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PHASES.map(phase => (
                  <div key={phase} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-xs text-zinc-300">{phase}</p>
                    <p className="text-xl font-black text-white">{data.phases[phase] || 0}</p>
                  </div>
                ))}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-bold">Tentativas que exigem conferência</h4>
                {data.pendingOrders.length === 0 ? <p className="text-xs text-zinc-400">Nenhuma tentativa pendente registrada.</p> :
                  <div className="max-h-52 space-y-2 overflow-y-auto">
                    {data.pendingOrders.map(item => (
                      <div key={item.request} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-2 text-xs">
                        <span className="text-amber-200">{item.state === "needs_review" ? "Conferir pedido" : "Processando"} • {item.request}</span>
                        <span className="text-zinc-300">{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                      </div>
                    ))}
                  </div>}
                <p className="mt-2 text-xs text-zinc-500">Conferir no histórico de pedidos antes de autorizar outra tentativa. Este painel não aprova ou cancela pedidos.</p>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-bold">Últimas sessões</h4>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {data.lastSessions.map(item => (
                    <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white/5 p-2 text-xs text-zinc-300">
                      <span className="text-cyan-200">{item.phase}</span>
                      <span>{item.event.replaceAll("_", " ")}</span>
                      <span>{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                  {data.lastSessions.length === 0 && <p className="text-xs text-zinc-400">Sem dados recentes.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
