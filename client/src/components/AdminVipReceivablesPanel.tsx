import { useMemo, useState } from "react";
import { Ban, CalendarDays, CheckCircle2, Clock3, Eye, FileText, History, Loader2, RefreshCw, Search, TriangleAlert, WalletCards } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const PAYOFF_PROOF_PREFIX = "h2-payoff:";

function money(cents: number | null | undefined) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day).toLocaleDateString("pt-BR") : String(value);
}

function isPayoffProof(row: any) {
  return String(row?.proofMimeType || "").startsWith(PAYOFF_PROOF_PREFIX);
}

function installmentLabel(row: any) {
  return Number(row?.installmentNumber) === 0 ? "Entrada" : `Parcela ${row.installmentNumber}/${row.installmentCount}`;
}

export default function AdminVipReceivablesPanel() {
  const utils = trpc.useUtils();
  const query = trpc.system.adminInstallmentReceivables.useQuery(undefined, { staleTime: 3_000, refetchOnWindowFocus: true, refetchInterval: 15_000 });
  const refreshAdmin = async () => Promise.all([
    utils.system.adminInstallmentReceivables.invalidate(),
    utils.vipInstallments.adminDirectory.invalidate(),
  ]);

  const confirm = trpc.vipInstallments.adminConfirmPayment.useMutation({
    onSuccess: async (data: any) => {
      toast.success(data.releasedForNewInstallment ? "Pagamento confirmado. Compra quitada e novo parcelamento liberado." : data.alreadyConfirmed ? "Esta parcela já estava confirmada." : "Pagamento confirmado e lançado no Financeiro.");
      await refreshAdmin();
    },
    onError: (error) => toast.error(error.message || "Não foi possível confirmar o pagamento."),
  });
  const confirmPayoffCarrier = trpc.vipInstallments.adminConfirmPayment.useMutation();
  const confirmPayoffBalance = trpc.vipInstallments.adminPayoffPlan.useMutation();
  const rejectProof = trpc.vipInstallments.adminRejectProof.useMutation({ onSuccess: async () => { toast.success("Comprovante rejeitado. Cliente pode enviar outro."); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });
  const dueDate = trpc.vipInstallments.adminChangeDueDate.useMutation({ onSuccess: async () => { toast.success("Vencimento atualizado."); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });
  const note = trpc.vipInstallments.adminAddNote.useMutation({ onSuccess: async () => { toast.success("Observação registrada no histórico."); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });
  const cancelPlan = trpc.vipInstallments.adminCancelPlan.useMutation({ onSuccess: async () => { toast.success("Plano cancelado e novo parcelamento liberado."); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });
  const payoff = trpc.vipInstallments.adminPayoffPlan.useMutation({ onSuccess: async (data: any) => { toast.success(data.alreadyPaid ? "Plano já estava quitado." : `Quitação registrada: ${money(data.paidCents)}`); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });
  const [historyPlanId, setHistoryPlanId] = useState<number | null>(null);
  const historyQuery = trpc.vipInstallments.adminPlanHistory.useQuery({ planId: historyPlanId || 1 }, { enabled: historyPlanId != null, staleTime: 2_000 });
  const [filter, setFilter] = useState<"open" | "awaiting" | "overdue" | "paid" | "all">("open");
  const [search, setSearch] = useState("");
  const [confirmingPayoffPlanId, setConfirmingPayoffPlanId] = useState<number | null>(null);

  const rejectPaymentProof = (row: any) => {
    if (row.status !== "awaiting_confirmation") return;
    const payoffProof = isPayoffProof(row);
    const reason = window.prompt(payoffProof
      ? `Rejeitar comprovante de QUITAÇÃO do plano #${row.planId}. Informe o motivo:`
      : `Rejeitar comprovante de ${installmentLabel(row)}. Informe o motivo:`);
    if (!reason?.trim()) return;
    if (!window.confirm(payoffProof ? "Confirma a rejeição da quitação? O cliente poderá enviar outro comprovante." : "Confirma a rejeição? O cliente poderá enviar um novo comprovante.")) return;
    rejectProof.mutate({ installmentId: Number(row.installmentId), notes: reason.trim() });
  };

  const changeDueDate = (row: any) => {
    if (!["pending", "overdue"].includes(row.status)) return toast.error("Só parcelas pendentes ou vencidas podem mudar de vencimento.");
    const value = window.prompt("Novo vencimento (AAAA-MM-DD):", String(row.dueDate || "").slice(0, 10));
    if (!value) return;
    dueDate.mutate({ installmentId: Number(row.installmentId), newDueDate: value.trim() });
  };

  const addNote = (row: any) => {
    const value = window.prompt(`Observação interna do plano #${row.planId}:`);
    if (!value?.trim()) return;
    note.mutate({ planId: Number(row.planId), notes: value.trim() });
  };

  const cancelCurrentPlan = (row: any) => {
    if (Number(row.balanceCents || 0) <= 0) return;
    const reason = window.prompt(`CANCELAR o plano #${row.planId} com saldo ${money(row.balanceCents)}? Informe o motivo:`);
    if (!reason?.trim()) return;
    if (!window.confirm("Confirma o cancelamento? O saldo restante será encerrado sem lançamento de recebimento.")) return;
    cancelPlan.mutate({ planId: Number(row.planId), notes: reason.trim() });
  };

  const payoffCurrentPlan = (row: any) => {
    if (Number(row.balanceCents || 0) <= 0) return;
    if (!window.confirm(`Confirmar QUITAÇÃO ANTECIPADA do plano #${row.planId} no valor de ${money(row.balanceCents)}? Esse valor será lançado como recebido no Financeiro.`)) return;
    payoff.mutate({ planId: Number(row.planId) });
  };

  const confirmCustomerPayoff = async (row: any) => {
    if (row.status !== "awaiting_confirmation" || !isPayoffProof(row) || confirmingPayoffPlanId != null) return;
    if (!row.proofUrl) return toast.error("A quitação não possui comprovante anexado.");
    const accepted = window.confirm(`CONFIRMAR QUITAÇÃO TOTAL de ${row.customerName}?\n\nSaldo informado pelo sistema: ${money(row.balanceCents)}\n\nConfirme somente depois de conferir no comprovante que o PIX corresponde ao saldo total.`);
    if (!accepted) return;

    setConfirmingPayoffPlanId(Number(row.planId));
    try {
      const first = await confirmPayoffCarrier.mutateAsync({ installmentId: Number(row.installmentId), notes: "Comprovante de quitação total conferido pelo ADM." });
      if (Number((first as any)?.balanceCents || 0) > 0) {
        await confirmPayoffBalance.mutateAsync({ planId: Number(row.planId), notes: "Quitação total solicitada pelo cliente e comprovante conferido pelo ADM." });
      }
      toast.success("Quitação confirmada. Saldo zerado e novos pedidos liberados.");
      await refreshAdmin();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível concluir a quitação.");
      await refreshAdmin();
    } finally {
      setConfirmingPayoffPlanId(null);
    }
  };

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
        || String(row.orderNumber || "").includes(q);
    });
  }, [query.data, filter, search]);

  const stats = useMemo(() => {
    const all = (query.data || []) as any[];
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const dayOf = (ms: number | null | undefined) => ms ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Number(ms))) : "";
    const awaiting = all.filter((row) => row.status === "awaiting_confirmation" && Boolean(row.proofUrl));
    const overdue = all.filter((row) => row.status === "overdue");
    const dueToday = all.filter((row) => ["pending", "overdue", "awaiting_confirmation"].includes(row.status) && String(row.dueDate).slice(0, 10) === today);
    const receivedToday = all.filter((row) => row.status === "paid" && dayOf(row.paidAtMs) === today).reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
    const openPlans = new Map<number, number>();
    const planStates = new Map<number, string>();
    for (const row of all) {
      planStates.set(Number(row.planId), String(row.planStatus || ""));
      if (Number(row.balanceCents || 0) > 0) openPlans.set(Number(row.planId), Number(row.balanceCents || 0));
    }
    return {
      awaiting: awaiting.length,
      payoffAwaiting: awaiting.filter(isPayoffProof).length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      receivedToday,
      receivable: Array.from(openPlans.values()).reduce((sum, value) => sum + value, 0),
      debtors: new Set(all.filter((row) => Number(row.balanceCents || 0) > 0).map((row) => row.customerId)).size,
      activePlans: Array.from(planStates.values()).filter((status) => status === "active" || status === "pending").length,
      paidPlans: Array.from(planStates.values()).filter((status) => status === "paid").length,
    };
  }, [query.data]);

  const confirmPayment = (row: any) => {
    if (row.status !== "awaiting_confirmation" || confirm.isPending) return;
    if (isPayoffProof(row)) {
      toast.error("Este comprovante é de quitação total. Use CONFIRMAR QUITAÇÃO.");
      return;
    }
    if (!row.proofUrl) {
      toast.error("Esta parcela não possui comprovante anexado.");
      return;
    }
    const accepted = window.confirm(`Confirmar pagamento de ${installmentLabel(row)} de ${row.customerName} no valor de ${money(row.amountCents)}?`);
    if (!accepted) return;
    confirm.mutate({ installmentId: Number(row.installmentId) });
  };

  return (
    <section id="controle-parcelas" className="mt-10 overflow-hidden rounded-[28px] border border-cyan-400/25 bg-[linear-gradient(180deg,rgba(8,145,178,.10),rgba(2,6,23,.94))]">
      <div className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-400">Financeiro do parcelamento</p><h2 className="mt-1 text-2xl font-black text-cyan-200">CONTROLE DE PARCELAS E COMPROVANTES</h2><p className="mt-1 text-sm text-slate-400">Aqui o ADM confere comprovantes, aprova ou rejeita pagamentos, altera vencimento e acompanha parcelas pagas e pendentes.</p></div>
          <button type="button" onClick={() => query.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-200"><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar</button>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {stats.awaiting > 0 ? <button type="button" onClick={() => setFilter("awaiting")} className="w-full rounded-2xl border border-yellow-400/35 bg-yellow-500/10 p-4 text-left text-sm font-black text-yellow-100"><Clock3 className="mr-2 inline h-5 w-5 text-yellow-300" />{stats.awaiting} COMPROVANTE(S) PARA CONFERIR — TOQUE AQUI</button> : null}
        {stats.payoffAwaiting > 0 ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100"><WalletCards className="mr-2 inline h-5 w-5" />{stats.payoffAwaiting} quitação(ões) total(is) aguardando conferência do ADM.</div> : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-cyan-300">A receber</p><p className="mt-1 text-xl font-black">{money(stats.receivable)}</p></div>
          <div className="rounded-2xl border border-yellow-400/15 bg-yellow-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-yellow-300">Vence hoje</p><p className="mt-1 text-xl font-black">{stats.dueToday}</p></div>
          <div className="rounded-2xl border border-red-400/15 bg-red-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-red-300">Vencidas</p><p className="mt-1 text-xl font-black">{stats.overdue}</p></div>
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-emerald-300">Recebido hoje</p><p className="mt-1 text-xl font-black">{money(stats.receivedToday)}</p></div>
          <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-amber-300">Aguardando confirmação</p><p className="mt-1 text-xl font-black">{stats.awaiting}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase text-slate-400">Clientes com saldo</p><p className="mt-1 text-xl font-black">{stats.debtors}</p></div>
          <div className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-violet-300">Planos ativos</p><p className="mt-1 text-xl font-black">{stats.activePlans}</p></div>
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-emerald-300">Planos quitados</p><p className="mt-1 text-xl font-black">{stats.paidPlans}</p></div>
        </div>

        <div className="flex flex-wrap gap-2">{([['open','Em aberto'],['awaiting','COMPROVANTES'],['overdue','Vencidas'],['paid','Pagas'],['all','Todas']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-black ${filter === value ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-white/5 text-slate-300"}`}>{label}</button>)}</div>
        <div className="relative"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, telefone, produto ou pedido" className="w-full rounded-2xl border border-white/10 bg-slate-950/80 py-3 pl-11 pr-4 text-sm font-semibold text-white outline-none focus:border-cyan-300/50" /></div>

        {query.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-cyan-300" /></div> : null}
        {query.error ? <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{query.error.message}</div> : null}
        {!query.isLoading && !query.error && rows.length === 0 ? <div className="rounded-xl border border-white/10 p-6 text-center text-sm text-slate-500">Nenhuma parcela neste filtro.</div> : null}

        <div className="grid gap-3">
          {rows.map((row) => {
            const payoffProof = isPayoffProof(row);
            const confirmingThisPayoff = confirmingPayoffPlanId === Number(row.planId);
            return <article key={row.installmentId} className={`rounded-2xl border p-4 ${row.status === 'awaiting_confirmation' ? 'border-yellow-400/35 bg-yellow-500/[0.06]' : 'border-white/10 bg-black/20'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-white">{row.customerName}</p><p className="text-xs text-slate-500">{row.customerPhone} • Pedido #{row.orderNumber || "—"} • {row.productName}</p></div><div className="text-right">{payoffProof && row.status === 'awaiting_confirmation' ? <><p className="text-[10px] font-black uppercase text-emerald-300">QUITAR SALDO</p><p className="font-black text-emerald-200">{money(row.balanceCents)}</p></> : <><p className="font-black text-cyan-200">{money(row.amountCents)}</p><p className="text-xs font-bold text-slate-400">{installmentLabel(row)}</p></>}</div></div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {payoffProof && row.status === 'awaiting_confirmation' ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 font-black text-emerald-300"><WalletCards className="h-3.5 w-3.5" /> QUITAÇÃO TOTAL — CONFERIR COMPROVANTE</span> : <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-black ${row.status === 'paid' ? 'bg-emerald-500/15 text-emerald-300' : row.status === 'awaiting_confirmation' ? 'bg-yellow-500/15 text-yellow-300' : row.status === 'overdue' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>{row.status === 'paid' ? <CheckCircle2 className="h-3.5 w-3.5" /> : row.status === 'overdue' ? <TriangleAlert className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{row.status === 'paid' ? 'PAGA' : row.status === 'awaiting_confirmation' ? 'COMPROVANTE PARA CONFERIR' : row.status === 'overdue' ? 'VENCIDA' : 'PENDENTE'}</span>}
                <span className="text-slate-400">Vence {dateLabel(row.dueDate)}</span><span className="text-slate-400">Saldo {money(row.balanceCents)}</span>
              </div>

              {row.status === 'awaiting_confirmation' ? <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {row.proofUrl ? <a href={row.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-200"><Eye className="h-4 w-4" /> VER COMPROVANTE</a> : <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-center text-xs font-black text-red-200">SEM COMPROVANTE</div>}
                <button type="button" disabled={rejectProof.isPending || confirmingThisPayoff} onClick={() => rejectPaymentProof(row)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-3 text-xs font-black text-red-300 disabled:opacity-50"><Ban className="h-4 w-4" /> REJEITAR</button>
                {payoffProof ? <button type="button" disabled={confirmingThisPayoff || !row.proofUrl} onClick={() => void confirmCustomerPayoff(row)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-emerald-950 disabled:opacity-50">{confirmingThisPayoff ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />} CONFIRMAR QUITAÇÃO</button> : <button type="button" disabled={confirm.isPending || !row.proofUrl} onClick={() => confirmPayment(row)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-emerald-950 disabled:opacity-50">{confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} CONFIRMAR PAGAMENTO</button>}
              </div> : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {["pending", "overdue"].includes(row.status) ? <button type="button" onClick={() => changeDueDate(row)} disabled={dueDate.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[10px] font-black text-slate-300 disabled:opacity-50"><CalendarDays className="h-3.5 w-3.5" /> VENCIMENTO</button> : null}
                <button type="button" onClick={() => addNote(row)} disabled={note.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[10px] font-black text-slate-300 disabled:opacity-50"><FileText className="h-3.5 w-3.5" /> OBSERVAÇÃO</button>
                <button type="button" onClick={() => setHistoryPlanId(historyPlanId === Number(row.planId) ? null : Number(row.planId))} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[10px] font-black text-slate-300"><History className="h-3.5 w-3.5" /> HISTÓRICO</button>
                {Number(row.balanceCents || 0) > 0 && !payoffProof ? <button type="button" onClick={() => payoffCurrentPlan(row)} disabled={payoff.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-black text-emerald-300 disabled:opacity-50"><WalletCards className="h-3.5 w-3.5" /> QUITAR SALDO</button> : null}
                {Number(row.balanceCents || 0) > 0 && !payoffProof ? <button type="button" onClick={() => cancelCurrentPlan(row)} disabled={cancelPlan.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-[10px] font-black text-red-300 disabled:opacity-50"><Ban className="h-3.5 w-3.5" /> CANCELAR PLANO</button> : null}
              </div>
              {historyPlanId === Number(row.planId) ? <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/70 p-3">
                <p className="mb-2 text-[10px] font-black uppercase text-slate-400">Histórico do plano #{row.planId}</p>
                {historyQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : null}
                {!historyQuery.isLoading && (historyQuery.data || []).length === 0 ? <p className="text-xs text-slate-500">Sem eventos.</p> : null}
                <div className="space-y-2">{(historyQuery.data || []).slice(0, 30).map((event: any) => <div key={event.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px] text-slate-400"><span className="font-black text-slate-200">{String(event.action || '').replaceAll('_', ' ').toUpperCase()}</span>{event.notes ? ` • ${event.notes}` : ''}{event.createdAt ? ` • ${new Date(event.createdAt).toLocaleString('pt-BR')}` : ''}</div>)}</div>
              </div> : null}
            </article>;
          })}
        </div>
      </div>
    </section>
  );
}
