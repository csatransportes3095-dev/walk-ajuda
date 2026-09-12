import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Eye, Loader2, RefreshCw, Search, TriangleAlert, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function money(cents: number | null | undefined) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day).toLocaleDateString("pt-BR") : value;
}

export default function AdminVipReceivablesPanel() {
  const utils = trpc.useUtils();
  const query = trpc.vipInstallmentPayments.adminReceivables.useQuery(undefined, { staleTime: 5_000, refetchOnWindowFocus: true });
  const confirm = trpc.vipInstallmentPayments.confirmPayment.useMutation({
    onSuccess: async (data) => {
      toast.success(data.planPaid ? "Pagamento confirmado. Compra quitada." : "Pagamento confirmado.");
      await Promise.all([
        utils.vipInstallmentPayments.adminReceivables.invalidate(),
        utils.vipInstallments.adminDirectory.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message || "Não foi possível confirmar o pagamento."),
  });
  const reject = trpc.vipInstallmentPayments.rejectProof.useMutation({
    onSuccess: async () => {
      toast.success("Comprovante rejeitado. A parcela voltou para pendente.");
      await utils.vipInstallmentPayments.adminReceivables.invalidate();
    },
    onError: (error) => toast.error(error.message || "Não foi possível rejeitar o comprovante."),
  });
  const [filter, setFilter] = useState<"open" | "awaiting" | "overdue" | "paid" | "all">("open");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return ((query.data || []) as any[]).filter((row) => {
      if (filter === "open" && !["pending", "overdue", "awaiting_confirmation"].includes(row.status)) return false;
      if (filter === "awaiting" && row.status !== "awaiting_confirmation") return false;
      if (filter === "overdue" && row.status !== "overdue") return false;
      if (filter === "paid" && row.status !== "paid") return false;
      if (!q) return true;
      return String(row.customerName || "").toLowerCase().includes(q)
        || String(row.customerPhone || "").replace(/\D/g, "").includes(digits)
        || String(row.productName || "").toLowerCase().includes(q)
        || String(row.registrationId || "").includes(q);
    });
  }, [query.data, filter, search]);

  const stats = useMemo(() => {
    const all = (query.data || []) as any[];
    const awaiting = all.filter((row) => row.status === "awaiting_confirmation");
    const overdue = all.filter((row) => row.status === "overdue");
    const activePlans = new Map<number, number>();
    for (const row of all) if (Number(row.balanceCents || 0) > 0) activePlans.set(Number(row.planId), Number(row.balanceCents || 0));
    return {
      awaiting: awaiting.length,
      overdue: overdue.length,
      receivable: Array.from(activePlans.values()).reduce((sum, value) => sum + value, 0),
      debtors: new Set(all.filter((row) => Number(row.balanceCents || 0) > 0).map((row) => row.customerId)).size,
    };
  }, [query.data]);

  const rejectProof = (row: any) => {
    const reason = window.prompt("Motivo da rejeição do comprovante:", "Comprovante não confirmado");
    if (!reason?.trim()) return;
    reject.mutate({ installmentId: Number(row.installmentId), reason: reason.trim() });
  };

  return (
    <section className="mt-10 overflow-hidden rounded-[28px] border border-cyan-400/25 bg-[linear-gradient(180deg,rgba(8,145,178,.10),rgba(2,6,23,.94))]">
      <div className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-black text-cyan-200">Recebíveis VIP</h2><p className="mt-1 text-sm text-slate-400">Parcelas, comprovantes e saldo das compras parceladas.</p></div><button type="button" onClick={() => query.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-200"><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar</button></div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-cyan-300">A receber</p><p className="mt-1 text-xl font-black">{money(stats.receivable)}</p></div><div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-amber-300">Aguardando confirmação</p><p className="mt-1 text-xl font-black">{stats.awaiting}</p></div><div className="rounded-2xl border border-red-400/15 bg-red-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-red-300">Vencidas</p><p className="mt-1 text-xl font-black">{stats.overdue}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase text-slate-400">Clientes com saldo</p><p className="mt-1 text-xl font-black">{stats.debtors}</p></div></div>

        <div className="flex flex-wrap gap-2">{([['open','Em aberto'],['awaiting','Confirmar'],['overdue','Vencidas'],['paid','Pagas'],['all','Todas']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-black ${filter === value ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-white/5 text-slate-300"}`}>{label}</button>)}</div>
        <div className="relative"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, telefone, produto ou pedido" className="w-full rounded-2xl border border-white/10 bg-slate-950/80 py-3 pl-11 pr-4 text-sm font-semibold text-white outline-none focus:border-cyan-300/50" /></div>

        {query.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-cyan-300" /></div> : null}
        {query.error ? <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{query.error.message}</div> : null}
        {!query.isLoading && !query.error && rows.length === 0 ? <div className="rounded-xl border border-white/10 p-6 text-center text-sm text-slate-500">Nenhuma parcela neste filtro.</div> : null}

        <div className="grid gap-3">
          {rows.map((row) => <article key={row.installmentId} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-white">{row.customerName}</p><p className="text-xs text-slate-500">{row.customerPhone} • Pedido {row.registrationId || "—"} • {row.productName}</p></div><div className="text-right"><p className="font-black text-cyan-200">{money(row.amountCents)}</p><p className="text-xs text-slate-500">Parcela {row.installmentNumber}/{row.installmentCount}</p></div></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-black ${row.status === 'paid' ? 'bg-emerald-500/15 text-emerald-300' : row.status === 'awaiting_confirmation' ? 'bg-cyan-500/15 text-cyan-300' : row.status === 'overdue' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>{row.status === 'paid' ? <CheckCircle2 className="h-3.5 w-3.5" /> : row.status === 'overdue' ? <TriangleAlert className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{row.status === 'paid' ? 'PAGA' : row.status === 'awaiting_confirmation' ? 'AGUARDANDO CONFIRMAÇÃO' : row.status === 'overdue' ? 'VENCIDA' : 'PENDENTE'}</span><span className="text-slate-400">Vence {dateLabel(row.dueDate)}</span><span className="text-slate-400">Saldo do contrato {money(row.balanceCents)}</span></div>{row.status === 'awaiting_confirmation' ? <div className="mt-4 grid gap-2 sm:grid-cols-3">{row.proofUrl ? <a href={row.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-200"><Eye className="h-4 w-4" /> VER COMPROVANTE</a> : null}<button type="button" disabled={confirm.isPending || reject.isPending} onClick={() => confirm.mutate({ installmentId: Number(row.installmentId) })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-emerald-950 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> CONFIRMAR</button><button type="button" disabled={confirm.isPending || reject.isPending} onClick={() => rejectProof(row)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-3 text-xs font-black text-red-200 disabled:opacity-50"><XCircle className="h-4 w-4" /> REJEITAR</button></div> : null}</article>)}
        </div>
      </div>
    </section>
  );
}
