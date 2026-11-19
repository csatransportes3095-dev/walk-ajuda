import { useId, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, ShieldX } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatCPF } from "@shared/cpf";
import { OrderLoginCopyButton } from "@/components/OrderLoginCopyButton";

type Props = { registrationId?: number; subOrderIndex?: number; orderNumber?: number | null; orderRootId?: number | null };

export default function CpfVaultRecords({ registrationId, subOrderIndex = 0, orderNumber, orderRootId }: Props) {
  const inputId = useId();
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<Array<number | undefined>>([undefined]);
  const records = trpc.cpfVault.list.useQuery({
    query, limit: 20, cursor: pages[pages.length - 1],
    ...(registrationId ? { registrationId, subOrderIndex } : {}),
    ...(registrationId && orderRootId ? { expectedOrderRootId: orderRootId } : {}),
    ...(registrationId && orderNumber && orderNumber > 0 ? { expectedOrderNumber: orderNumber } : {}),
  }, { enabled: !registrationId || Boolean(orderRootId && orderRootId > 0), staleTime: 0, retry: false, refetchOnWindowFocus: true });

  return <section className="space-y-4" aria-label={registrationId ? "CPFs deste pedido" : "CPFs usados no cofre"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-black text-slate-100">{registrationId ? "CPFs registrados neste pedido" : "CPFs usados no cofre"}</h2>
      <button type="button" onClick={() => void records.refetch()} disabled={records.isFetching}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50">
        <RefreshCw className={`h-3.5 w-3.5 ${records.isFetching ? "animate-spin" : ""}`} />Atualizar
      </button>
    </div>
    {!registrationId && <form className="flex gap-2" onSubmit={event => {
      event.preventDefault();
      const nextQuery = queryDraft.trim();
      if (nextQuery === query && pages.length === 1) void records.refetch();
      else { setQuery(nextQuery); setPages([undefined]); }
    }}>
      <label htmlFor={inputId} className="sr-only">Buscar CPF, cliente ou pedido</label>
      <input id={inputId} value={queryDraft} maxLength={120} onChange={event => setQueryDraft(event.target.value)}
        placeholder="CPF, cliente ou pedido" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300" />
      <button type="submit" aria-label="Buscar registros" className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 p-3 text-cyan-200"><Search className="h-4 w-4" /></button>
    </form>}

    {records.isLoading ? <p role="status" className="flex items-center gap-2 py-4 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando registros...</p>
      : records.isError ? <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{records.error.message || "Não foi possível carregar o cofre."}</p>
      : records.data && <>
        <p className="text-xs text-slate-400">{records.data.total} {records.data.total === 1 ? "CPF registrado" : "CPFs registrados"}{query ? " nesta busca" : ""}.</p>
        {records.data.items.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-5 text-center text-sm text-slate-400">{registrationId ? "Nenhum CPF registrado neste pedido." : "Nenhum registro encontrado."}</p>
          : <div className="space-y-2">{records.data.items.map(entry => <article key={entry.id} className="rounded-xl border border-red-400/20 bg-red-500/[0.05] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><ShieldX className="h-4 w-4 shrink-0 text-red-300" /><span className="font-mono text-sm font-bold text-slate-100">{formatCPF(entry.normalizedCpf)}</span></div>
              <div className="flex items-center gap-2"><span className="text-[10px] font-black text-red-300">USADO</span><OrderLoginCopyButton value={entry.normalizedCpf} label="CPF" /></div>
            </div>
            <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-400">
              {entry.customerName && <p className="break-words">{entry.customerNumber ? `*${entry.customerNumber} · ` : ""}{entry.customerName}</p>}
              {entry.registrationId ? <p>Pedido #{entry.orderNumber ?? entry.registrationId}{entry.subOrderIndex > 0 ? ` · item ${entry.subOrderIndex + 1}` : ""}</p> : <p>Registro direto no cofre</p>}
              {entry.note && <p className="whitespace-pre-wrap break-words text-slate-300">{entry.note}</p>}
              {entry.createdAt && <p>{new Date(entry.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</p>}
            </div>
          </article>)}</div>}
        {(pages.length > 1 || records.data.nextCursor !== null) && <div className="flex items-center justify-between gap-2 pt-1">
          <button type="button" disabled={pages.length === 1 || records.isFetching} onClick={() => setPages(previous => previous.slice(0, -1))}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 disabled:opacity-30"><ChevronLeft className="h-4 w-4" />Anterior</button>
          <span className="text-xs text-slate-400">Página {pages.length}</span>
          <button type="button" disabled={records.data.nextCursor === null || records.isFetching}
            onClick={() => { const next = records.data?.nextCursor; if (next !== null && next !== undefined) setPages(previous => [...previous, next]); }}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 disabled:opacity-30">Próxima<ChevronRight className="h-4 w-4" /></button>
        </div>}
      </>}
  </section>;
}
