from pathlib import Path


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)


# Checkout/customer access: make debt page discoverable.
p = Path("client/src/components/VipInstallmentCheckoutBox.tsx")
text = p.read_text(encoding="utf-8")
text = one(
    text,
    'import { trpc } from "@/lib/trpc";',
    'import { trpc } from "@/lib/trpc";\nimport { useLocation } from "wouter";',
    "checkout location import",
)
text = one(
    text,
    '''}) {
  const [mode, setMode] = useState<"cash" | "vip_installment">("cash");''',
    '''}) {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"cash" | "vip_installment">("cash");''',
    "checkout navigate hook",
)
old_block = '''      {blockReason && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs font-bold text-amber-200"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><span>{blockReason}{eligibility.data?.openPlan?.balanceCents ? ` Saldo pendente: ${money(eligibility.data.openPlan.balanceCents)}.` : ""}</span></div>}'''
new_block = '''      {blockReason && <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs font-bold text-amber-200"><div className="flex items-start gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><span>{blockReason}{eligibility.data?.openPlan?.balanceCents ? ` Saldo pendente: ${money(eligibility.data.openPlan.balanceCents)}.` : ""}</span></div>{Number(eligibility.data?.openPlan?.balanceCents || 0) > 0 ? <button type="button" onClick={() => navigate("/parcelas-vip")} className="mt-3 w-full rounded-lg bg-amber-300 px-3 py-2 text-[11px] font-black text-amber-950">VER MINHAS PARCELAS VIP</button> : null}</div>}'''
text = one(text, old_block, new_block, "debt button")
end_anchor = '''          <div className="flex items-start gap-2 text-[11px] text-slate-400"><CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Após a compra, as próximas parcelas ficam disponíveis em <strong className="text-violet-200">Minhas Parcelas VIP</strong>.</span></div>
        </div>
      )}
    </div>'''
end_new = '''          <div className="flex items-start gap-2 text-[11px] text-slate-400"><CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Após a compra, as próximas parcelas ficam disponíveis em <strong className="text-violet-200">Minhas Parcelas VIP</strong>.</span></div>
        </div>
      )}
      {sessionReady ? <button type="button" onClick={() => navigate("/parcelas-vip")} className="mt-3 w-full rounded-xl border border-violet-300/20 bg-violet-500/10 px-3 py-2.5 text-xs font-black text-violet-200">MINHAS PARCELAS VIP</button> : null}
    </div>'''
text = one(text, end_anchor, end_new, "persistent installments link")
p.write_text(text, encoding="utf-8")


# Admin receivable dashboard: complete operational metrics.
p = Path("client/src/components/AdminVipReceivablesPanel.tsx")
text = p.read_text(encoding="utf-8")
old_stats = '''  const stats = useMemo(() => {
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
  }, [query.data]);'''
new_stats = '''  const stats = useMemo(() => {
    const all = (query.data || []) as any[];
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const dayOf = (ms: number | null | undefined) => ms ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Number(ms))) : "";
    const awaiting = all.filter((row) => row.status === "awaiting_confirmation");
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
      overdue: overdue.length,
      dueToday: dueToday.length,
      receivedToday,
      receivable: Array.from(openPlans.values()).reduce((sum, value) => sum + value, 0),
      debtors: new Set(all.filter((row) => Number(row.balanceCents || 0) > 0).map((row) => row.customerId)).size,
      activePlans: Array.from(planStates.values()).filter((status) => status === "active" || status === "pending").length,
      paidPlans: Array.from(planStates.values()).filter((status) => status === "paid").length,
    };
  }, [query.data]);'''
text = one(text, old_stats, new_stats, "stats computation")
old_cards = '''        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-cyan-300">A receber</p><p className="mt-1 text-xl font-black">{money(stats.receivable)}</p></div>
          <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-amber-300">Aguardando confirmação</p><p className="mt-1 text-xl font-black">{stats.awaiting}</p></div>
          <div className="rounded-2xl border border-red-400/15 bg-red-500/10 p-4"><p className="text-[10px] font-black uppercase text-red-300">Vencidas</p><p className="mt-1 text-xl font-black">{stats.overdue}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase text-slate-400">Clientes com saldo</p><p className="mt-1 text-xl font-black">{stats.debtors}</p></div>
        </div>'''
new_cards = '''        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-cyan-300">A receber</p><p className="mt-1 text-xl font-black">{money(stats.receivable)}</p></div>
          <div className="rounded-2xl border border-yellow-400/15 bg-yellow-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-yellow-300">Vence hoje</p><p className="mt-1 text-xl font-black">{stats.dueToday}</p></div>
          <div className="rounded-2xl border border-red-400/15 bg-red-500/10 p-4"><p className="text-[10px] font-black uppercase text-red-300">Vencidas</p><p className="mt-1 text-xl font-black">{stats.overdue}</p></div>
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-emerald-300">Recebido hoje</p><p className="mt-1 text-xl font-black">{money(stats.receivedToday)}</p></div>
          <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-amber-300">Aguardando confirmação</p><p className="mt-1 text-xl font-black">{stats.awaiting}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase text-slate-400">Clientes com saldo</p><p className="mt-1 text-xl font-black">{stats.debtors}</p></div>
          <div className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-violet-300">Planos ativos</p><p className="mt-1 text-xl font-black">{stats.activePlans}</p></div>
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-emerald-300">Planos quitados</p><p className="mt-1 text-xl font-black">{stats.paidPlans}</p></div>
        </div>'''
text = one(text, old_cards, new_cards, "dashboard cards")
p.write_text(text, encoding="utf-8")
