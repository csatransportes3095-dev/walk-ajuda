from pathlib import Path


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)


# Backend transactional admin actions.
p = Path("server/vipInstallmentContracts.ts")
text = p.read_text(encoding="utf-8")
append = r'''

function brazilTodayForAdminAction() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function assertIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TRPCError({ code: "BAD_REQUEST", message: "Data inválida." });
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Data inválida." });
  }
}

export async function changeVipInstallmentDueDate(input: {
  installmentId: number;
  newDueDate: string;
  actorId?: string | null;
  notes?: string | null;
}) {
  assertIsoDate(input.newDueDate);
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const today = brazilTodayForAdminAction();
  return db.transaction(async (tx: any) => {
    const result = await tx.execute(sql`
      SELECT i.id, i.planId, i.installmentNumber, i.dueDate, i.status, p.status AS planStatus
      FROM vipInstallments i
      INNER JOIN vipInstallmentPlans p ON p.id=i.planId
      WHERE i.id=${input.installmentId}
      LIMIT 1 FOR UPDATE
    `);
    const row = rowsOf<any>(result)[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada." });
    const status = String(row.status || "");
    if (status === "paid" || status === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "Não é possível alterar o vencimento de uma parcela encerrada." });
    if (status === "awaiting_confirmation") throw new TRPCError({ code: "CONFLICT", message: "Confirme ou rejeite o comprovante antes de alterar o vencimento." });
    if (String(row.planStatus || "") === "cancelled" || String(row.planStatus || "") === "paid") {
      throw new TRPCError({ code: "CONFLICT", message: "Este plano já está encerrado." });
    }
    const oldDueDate = row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate).slice(0, 10);
    const newStatus = input.newDueDate < today ? "overdue" : "pending";
    await tx.execute(sql`
      UPDATE vipInstallments SET dueDate=${input.newDueDate}, status=${newStatus}
      WHERE id=${input.installmentId}
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory
        (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES
        (${Number(row.planId)}, ${input.installmentId}, 'due_date_changed', 'admin', ${input.actorId || "admin"},
         ${JSON.stringify({ dueDate: oldDueDate, status })},
         ${JSON.stringify({ dueDate: input.newDueDate, status: newStatus })}, ${input.notes || null})
    `);
    return { success: true, dueDate: input.newDueDate, status: newStatus };
  });
}

export async function addVipInstallmentAdminNote(input: {
  planId: number;
  notes: string;
  actorId?: string | null;
}) {
  const notes = String(input.notes || "").trim();
  if (!notes) throw new TRPCError({ code: "BAD_REQUEST", message: "Digite uma observação." });
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const result = await db.execute(sql`SELECT id FROM vipInstallmentPlans WHERE id=${input.planId} LIMIT 1`);
  if (!rowsOf<any>(result)[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado." });
  await db.execute(sql`
    INSERT INTO vipInstallmentHistory (planId, installmentId, action, actorType, actorId, notes)
    VALUES (${input.planId}, NULL, 'admin_note', 'admin', ${input.actorId || "admin"}, ${notes})
  `);
  return { success: true };
}

export async function cancelVipInstallmentPlan(input: {
  planId: number;
  actorId?: string | null;
  notes: string;
}) {
  const notes = String(input.notes || "").trim();
  if (!notes) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo do cancelamento." });
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  return db.transaction(async (tx: any) => {
    const result = await tx.execute(sql`
      SELECT id, customerId, status, totalAmountCents, paidAmountCents, balanceCents
      FROM vipInstallmentPlans WHERE id=${input.planId} LIMIT 1 FOR UPDATE
    `);
    const plan = rowsOf<any>(result)[0];
    if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado." });
    if (String(plan.status) === "cancelled") return { success: true, alreadyCancelled: true };
    if (String(plan.status) === "paid" || Number(plan.balanceCents || 0) <= 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Plano quitado não pode ser cancelado." });
    }
    const pendingProof = await tx.execute(sql`
      SELECT id FROM vipInstallments WHERE planId=${input.planId} AND status='awaiting_confirmation' LIMIT 1 FOR UPDATE
    `);
    if (rowsOf<any>(pendingProof)[0]) {
      throw new TRPCError({ code: "CONFLICT", message: "Existe comprovante aguardando confirmação. Resolva esse pagamento antes de cancelar o plano." });
    }
    const previousBalance = Number(plan.balanceCents || 0);
    await tx.execute(sql`
      UPDATE vipInstallments SET status='cancelled'
      WHERE planId=${input.planId} AND status IN ('pending','overdue')
    `);
    await tx.execute(sql`
      UPDATE vipInstallmentPlans SET status='cancelled', balanceCents=0, openSlotCustomerId=NULL
      WHERE id=${input.planId}
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory
        (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES
        (${input.planId}, NULL, 'plan_cancelled', 'admin', ${input.actorId || "admin"},
         ${JSON.stringify({ status: String(plan.status), balanceCents: previousBalance })},
         ${JSON.stringify({ status: "cancelled", balanceCents: 0 })}, ${notes})
    `);
    return { success: true, alreadyCancelled: false, cancelledBalanceCents: previousBalance };
  });
}

export async function payoffVipInstallmentPlan(input: {
  planId: number;
  actorId?: string | null;
  notes?: string | null;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const now = Date.now();
  return db.transaction(async (tx: any) => {
    const result = await tx.execute(sql`
      SELECT p.id, p.customerId, p.status, p.productName, p.orderNumber, p.totalAmountCents,
             p.paidAmountCents, p.balanceCents, c.name AS customerName, c.phone AS customerPhone
      FROM vipInstallmentPlans p
      INNER JOIN customers c ON c.id=p.customerId
      WHERE p.id=${input.planId}
      LIMIT 1 FOR UPDATE
    `);
    const plan = rowsOf<any>(result)[0];
    if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado." });
    if (String(plan.status) === "paid" || Number(plan.balanceCents || 0) <= 0) {
      return { success: true, alreadyPaid: true, balanceCents: 0 };
    }
    if (String(plan.status) === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "Plano cancelado não pode ser quitado." });
    const pendingProof = await tx.execute(sql`
      SELECT id FROM vipInstallments WHERE planId=${input.planId} AND status='awaiting_confirmation' LIMIT 1 FOR UPDATE
    `);
    if (rowsOf<any>(pendingProof)[0]) {
      throw new TRPCError({ code: "CONFLICT", message: "Existe comprovante aguardando confirmação. Resolva esse pagamento antes da quitação antecipada." });
    }
    const balanceCents = Number(plan.balanceCents || 0);
    if (!Number.isSafeInteger(balanceCents) || balanceCents <= 0 || balanceCents > 2_000_000_000) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Saldo inválido para lançamento no Financeiro." });
    }
    const financeInsert = await tx.execute(sql`
      INSERT INTO financialSales
        (registrationId, customerName, customerPhone, productName, productOption,
         saleValue, costValue, paymentMethod, status, saleDate, receivedDate, notes)
      VALUES
        (NULL, ${String(plan.customerName || "")}, ${normalizePhone(plan.customerPhone)},
         ${String(plan.productName || "Parcelamento VIP")}, 'Quitação antecipada',
         ${balanceCents}, 0, 'pix', 'pago', ${now}, ${now},
         ${`[Parcelamento VIP] Quitação antecipada do plano #${input.planId} | Pedido ${String(plan.orderNumber || "-")}`})
    `);
    const financeSaleId = insertIdOf(financeInsert);
    await tx.execute(sql`
      UPDATE vipInstallments
      SET paidAmountCents=amountCents, status='paid', paidAtMs=${now}, financeSaleId=${financeSaleId}
      WHERE planId=${input.planId} AND status IN ('pending','overdue')
    `);
    await tx.execute(sql`
      UPDATE vipInstallmentPlans
      SET paidAmountCents=totalAmountCents, balanceCents=0, status='paid', openSlotCustomerId=NULL
      WHERE id=${input.planId}
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory
        (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES
        (${input.planId}, NULL, 'plan_payoff', 'admin', ${input.actorId || "admin"},
         ${JSON.stringify({ balanceCents, paidAmountCents: Number(plan.paidAmountCents || 0) })},
         ${JSON.stringify({ balanceCents: 0, paidAmountCents: Number(plan.totalAmountCents || 0), financeSaleId })}, ${input.notes || null})
    `);
    return { success: true, alreadyPaid: false, paidCents: balanceCents, balanceCents: 0, financeSaleId };
  });
}
'''
if "export async function changeVipInstallmentDueDate" in text:
    raise SystemExit("admin contract actions already present")
p.write_text(text + append, encoding="utf-8")


# Router endpoints + history.
p = Path("server/routers/vipInstallments.ts")
text = p.read_text(encoding="utf-8")
old_import = 'import { prepareVipInstallmentCheckoutIntent, cancelVipInstallmentCheckoutIntent, finalizeVipInstallmentCheckoutIntent, submitVipInstallmentProof, confirmVipInstallmentPayment, recoverVipInstallmentCheckoutOrder } from "../vipInstallmentContracts";'
new_import = 'import { prepareVipInstallmentCheckoutIntent, cancelVipInstallmentCheckoutIntent, finalizeVipInstallmentCheckoutIntent, submitVipInstallmentProof, confirmVipInstallmentPayment, recoverVipInstallmentCheckoutOrder, changeVipInstallmentDueDate, addVipInstallmentAdminNote, cancelVipInstallmentPlan, payoffVipInstallmentPlan } from "../vipInstallmentContracts";'
text = one(text, old_import, new_import, "router admin imports")
anchor = '''  adminReceivables: adminProcedure.query(async () => {'''
endpoints = '''  adminChangeDueDate: adminProcedure
    .input(z.object({
      installmentId: z.number().int().positive(),
      newDueDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
      notes: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ input }) => changeVipInstallmentDueDate({ ...input, actorId: 'admin' })),

  adminAddNote: adminProcedure
    .input(z.object({ planId: z.number().int().positive(), notes: z.string().trim().min(1).max(500) }))
    .mutation(async ({ input }) => addVipInstallmentAdminNote({ ...input, actorId: 'admin' })),

  adminCancelPlan: adminProcedure
    .input(z.object({ planId: z.number().int().positive(), notes: z.string().trim().min(1).max(500) }))
    .mutation(async ({ input }) => cancelVipInstallmentPlan({ ...input, actorId: 'admin' })),

  adminPayoffPlan: adminProcedure
    .input(z.object({ planId: z.number().int().positive(), notes: z.string().max(500).nullable().optional() }))
    .mutation(async ({ input }) => payoffVipInstallmentPlan({ ...input, actorId: 'admin' })),

  adminPlanHistory: adminProcedure
    .input(z.object({ planId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await ensureVipInstallmentInfrastructure();
      const db = (await getDb()) as any;
      const result = await db.execute(sql`
        SELECT id, planId, installmentId, action, actorType, actorId, previousValue, newValue, notes, createdAt
        FROM vipInstallmentHistory
        WHERE planId=${input.planId}
        ORDER BY id DESC
        LIMIT 200
      `);
      return rowsOf<any>(result).map((row) => ({
        id: Number(row.id),
        planId: Number(row.planId),
        installmentId: row.installmentId == null ? null : Number(row.installmentId),
        action: String(row.action || ''),
        actorType: String(row.actorType || ''),
        actorId: row.actorId == null ? null : String(row.actorId),
        previousValue: row.previousValue == null ? null : String(row.previousValue),
        newValue: row.newValue == null ? null : String(row.newValue),
        notes: row.notes == null ? null : String(row.notes),
        createdAt: row.createdAt ? new Date(row.createdAt).getTime() : null,
      }));
    }),

'''
text = one(text, anchor, endpoints + anchor, "router admin endpoints")
p.write_text(text, encoding="utf-8")


# Admin UI actions.
p = Path("client/src/components/AdminVipReceivablesPanel.tsx")
text = p.read_text(encoding="utf-8")
text = one(
    text,
    'import { CheckCircle2, Clock3, Eye, Loader2, RefreshCw, Search, TriangleAlert } from "lucide-react";',
    'import { Ban, CalendarDays, CheckCircle2, Clock3, Eye, FileText, History, Loader2, RefreshCw, Search, TriangleAlert, WalletCards } from "lucide-react";',
    "ui icon import",
)
confirm_block = '''  const confirm = trpc.vipInstallments.adminConfirmPayment.useMutation({
    onSuccess: async (data: any) => {
      toast.success(data.releasedForNewInstallment ? "Pagamento confirmado. Compra quitada e novo parcelamento liberado." : data.alreadyConfirmed ? "Esta parcela já estava confirmada." : "Pagamento confirmado e lançado no Financeiro.");
      await Promise.all([
        utils.vipInstallments.adminReceivables.invalidate(),
        utils.vipInstallments.adminDirectory.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message || "Não foi possível confirmar o pagamento."),
  });'''
mutations = confirm_block + '''
  const refreshAdmin = async () => Promise.all([
    utils.vipInstallments.adminReceivables.invalidate(),
    utils.vipInstallments.adminDirectory.invalidate(),
  ]);
  const dueDate = trpc.vipInstallments.adminChangeDueDate.useMutation({ onSuccess: async () => { toast.success("Vencimento atualizado."); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });
  const note = trpc.vipInstallments.adminAddNote.useMutation({ onSuccess: async () => { toast.success("Observação registrada no histórico."); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });
  const cancelPlan = trpc.vipInstallments.adminCancelPlan.useMutation({ onSuccess: async () => { toast.success("Plano cancelado e novo parcelamento liberado."); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });
  const payoff = trpc.vipInstallments.adminPayoffPlan.useMutation({ onSuccess: async (data: any) => { toast.success(data.alreadyPaid ? "Plano já estava quitado." : `Quitação registrada: ${money(data.paidCents)}`); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });
  const [historyPlanId, setHistoryPlanId] = useState<number | null>(null);
  const historyQuery = trpc.vipInstallments.adminPlanHistory.useQuery({ planId: historyPlanId || 1 }, { enabled: historyPlanId != null, staleTime: 2_000 });'''
text = one(text, confirm_block, mutations, "ui mutations")
state_anchor = '''  const [filter, setFilter] = useState<"open" | "awaiting" | "overdue" | "paid" | "all">("open");
  const [search, setSearch] = useState("");'''
actions = state_anchor + '''

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
  };'''
text = one(text, state_anchor, actions, "ui action handlers")
old_tail = '''            {row.status === 'awaiting_confirmation' ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{row.proofUrl ? <a href={row.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-200"><Eye className="h-4 w-4" /> VER COMPROVANTE</a> : <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-center text-xs font-black text-red-200">SEM COMPROVANTE</div>}<button type="button" disabled={confirm.isPending || !row.proofUrl} onClick={() => confirmPayment(row)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-emerald-950 disabled:opacity-50">{confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} CONFIRMAR PAGAMENTO</button></div> : null}
          </article>)}'''
new_tail = '''            {row.status === 'awaiting_confirmation' ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{row.proofUrl ? <a href={row.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-200"><Eye className="h-4 w-4" /> VER COMPROVANTE</a> : <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-center text-xs font-black text-red-200">SEM COMPROVANTE</div>}<button type="button" disabled={confirm.isPending || !row.proofUrl} onClick={() => confirmPayment(row)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-emerald-950 disabled:opacity-50">{confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} CONFIRMAR PAGAMENTO</button></div> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {["pending", "overdue"].includes(row.status) ? <button type="button" onClick={() => changeDueDate(row)} disabled={dueDate.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[10px] font-black text-slate-300 disabled:opacity-50"><CalendarDays className="h-3.5 w-3.5" /> VENCIMENTO</button> : null}
              <button type="button" onClick={() => addNote(row)} disabled={note.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[10px] font-black text-slate-300 disabled:opacity-50"><FileText className="h-3.5 w-3.5" /> OBSERVAÇÃO</button>
              <button type="button" onClick={() => setHistoryPlanId(historyPlanId === Number(row.planId) ? null : Number(row.planId))} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[10px] font-black text-slate-300"><History className="h-3.5 w-3.5" /> HISTÓRICO</button>
              {Number(row.balanceCents || 0) > 0 ? <button type="button" onClick={() => payoffCurrentPlan(row)} disabled={payoff.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-black text-emerald-300 disabled:opacity-50"><WalletCards className="h-3.5 w-3.5" /> QUITAR SALDO</button> : null}
              {Number(row.balanceCents || 0) > 0 ? <button type="button" onClick={() => cancelCurrentPlan(row)} disabled={cancelPlan.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-[10px] font-black text-red-300 disabled:opacity-50"><Ban className="h-3.5 w-3.5" /> CANCELAR PLANO</button> : null}
            </div>
            {historyPlanId === Number(row.planId) ? <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/70 p-3">
              <p className="mb-2 text-[10px] font-black uppercase text-slate-400">Histórico do plano #{row.planId}</p>
              {historyQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : null}
              {!historyQuery.isLoading && (historyQuery.data || []).length === 0 ? <p className="text-xs text-slate-500">Sem eventos.</p> : null}
              <div className="space-y-2">{(historyQuery.data || []).slice(0, 30).map((event: any) => <div key={event.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px] text-slate-400"><span className="font-black text-slate-200">{String(event.action || '').replaceAll('_', ' ').toUpperCase()}</span>{event.notes ? ` • ${event.notes}` : ''}{event.createdAt ? ` • ${new Date(event.createdAt).toLocaleString('pt-BR')}` : ''}</div>)}</div>
            </div> : null}
          </article>)}'''
text = one(text, old_tail, new_tail, "ui action buttons")
p.write_text(text, encoding="utf-8")
