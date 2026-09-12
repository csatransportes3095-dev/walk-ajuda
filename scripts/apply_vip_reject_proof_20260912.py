from pathlib import Path


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)


p = Path("server/vipInstallmentContracts.ts")
text = p.read_text(encoding="utf-8")
anchor = "\nexport async function changeVipInstallmentDueDate(input: {"
function = r'''

export async function rejectVipInstallmentProof(input: {
  installmentId: number;
  actorId?: string | null;
  notes: string;
}) {
  const notes = String(input.notes || "").trim();
  if (!notes) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo da rejeição." });
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const today = brazilTodayForAdminAction();
  return db.transaction(async (tx: any) => {
    const result = await tx.execute(sql`
      SELECT i.id, i.planId, i.installmentNumber, i.dueDate, i.status, i.proofUrl,
             i.proofMimeType, i.proofSubmittedAtMs, p.status AS planStatus
      FROM vipInstallments i
      INNER JOIN vipInstallmentPlans p ON p.id=i.planId
      WHERE i.id=${input.installmentId}
      LIMIT 1 FOR UPDATE
    `);
    const row = rowsOf<any>(result)[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada." });
    if (String(row.status) !== "awaiting_confirmation") {
      throw new TRPCError({ code: "CONFLICT", message: "Esta parcela não possui comprovante aguardando confirmação." });
    }
    if (String(row.planStatus) === "paid" || String(row.planStatus) === "cancelled") {
      throw new TRPCError({ code: "CONFLICT", message: "Este plano já está encerrado." });
    }
    const dueDate = row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate).slice(0, 10);
    const newStatus = dueDate < today ? "overdue" : "pending";
    await tx.execute(sql`
      UPDATE vipInstallments
      SET status=${newStatus}, proofUrl=NULL, proofMimeType=NULL, proofSubmittedAtMs=NULL
      WHERE id=${input.installmentId} AND status='awaiting_confirmation'
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory
        (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES
        (${Number(row.planId)}, ${input.installmentId}, 'proof_rejected', 'admin', ${input.actorId || "admin"},
         ${JSON.stringify({ status: "awaiting_confirmation", proofUrl: row.proofUrl == null ? null : String(row.proofUrl), proofSubmittedAtMs: row.proofSubmittedAtMs == null ? null : Number(row.proofSubmittedAtMs) })},
         ${JSON.stringify({ status: newStatus, proofUrl: null })}, ${notes})
    `);
    return { success: true, status: newStatus };
  });
}
'''
text = one(text, anchor, function + anchor, "reject proof function")
p.write_text(text, encoding="utf-8")

p = Path("server/routers/vipInstallments.ts")
text = p.read_text(encoding="utf-8")
old_import = 'import { prepareVipInstallmentCheckoutIntent, cancelVipInstallmentCheckoutIntent, finalizeVipInstallmentCheckoutIntent, submitVipInstallmentProof, confirmVipInstallmentPayment, recoverVipInstallmentCheckoutOrder, changeVipInstallmentDueDate, addVipInstallmentAdminNote, cancelVipInstallmentPlan, payoffVipInstallmentPlan } from "../vipInstallmentContracts";'
new_import = 'import { prepareVipInstallmentCheckoutIntent, cancelVipInstallmentCheckoutIntent, finalizeVipInstallmentCheckoutIntent, submitVipInstallmentProof, confirmVipInstallmentPayment, recoverVipInstallmentCheckoutOrder, changeVipInstallmentDueDate, addVipInstallmentAdminNote, cancelVipInstallmentPlan, payoffVipInstallmentPlan, rejectVipInstallmentProof } from "../vipInstallmentContracts";'
text = one(text, old_import, new_import, "reject import")
anchor = '''  adminChangeDueDate: adminProcedure'''
endpoint = '''  adminRejectProof: adminProcedure
    .input(z.object({ installmentId: z.number().int().positive(), notes: z.string().trim().min(1).max(500) }))
    .mutation(async ({ input }) => rejectVipInstallmentProof({ ...input, actorId: 'admin' })),

'''
text = one(text, anchor, endpoint + anchor, "reject endpoint")
p.write_text(text, encoding="utf-8")

p = Path("client/src/components/AdminVipReceivablesPanel.tsx")
text = p.read_text(encoding="utf-8")
confirm_anchor = '''  const dueDate = trpc.vipInstallments.adminChangeDueDate.useMutation({ onSuccess: async () => { toast.success("Vencimento atualizado."); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });'''
mut = '''  const rejectProof = trpc.vipInstallments.adminRejectProof.useMutation({ onSuccess: async () => { toast.success("Comprovante rejeitado. Cliente pode enviar outro."); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });
  const dueDate = trpc.vipInstallments.adminChangeDueDate.useMutation({ onSuccess: async () => { toast.success("Vencimento atualizado."); await refreshAdmin(); }, onError: (error) => toast.error(error.message) });'''
text = one(text, confirm_anchor, mut, "ui reject mutation")
handler_anchor = '''  const changeDueDate = (row: any) => {'''
handler = '''  const rejectPaymentProof = (row: any) => {
    if (row.status !== "awaiting_confirmation") return;
    const reason = window.prompt(`Rejeitar comprovante da parcela ${row.installmentNumber}/${row.installmentCount}. Informe o motivo:`);
    if (!reason?.trim()) return;
    if (!window.confirm("Confirma a rejeição? O cliente poderá enviar um novo comprovante.")) return;
    rejectProof.mutate({ installmentId: Number(row.installmentId), notes: reason.trim() });
  };

'''
text = one(text, handler_anchor, handler + handler_anchor, "ui reject handler")
old_payment = '''{row.status === 'awaiting_confirmation' ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{row.proofUrl ? <a href={row.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-200"><Eye className="h-4 w-4" /> VER COMPROVANTE</a> : <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-center text-xs font-black text-red-200">SEM COMPROVANTE</div>}<button type="button" disabled={confirm.isPending || !row.proofUrl} onClick={() => confirmPayment(row)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-emerald-950 disabled:opacity-50">{confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} CONFIRMAR PAGAMENTO</button></div> : null}'''
new_payment = '''{row.status === 'awaiting_confirmation' ? <div className="mt-4 grid gap-2 sm:grid-cols-3">{row.proofUrl ? <a href={row.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-200"><Eye className="h-4 w-4" /> VER COMPROVANTE</a> : <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-center text-xs font-black text-red-200">SEM COMPROVANTE</div>}<button type="button" disabled={rejectProof.isPending} onClick={() => rejectPaymentProof(row)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-3 text-xs font-black text-red-300 disabled:opacity-50"><Ban className="h-4 w-4" /> REJEITAR COMPROVANTE</button><button type="button" disabled={confirm.isPending || !row.proofUrl} onClick={() => confirmPayment(row)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-emerald-950 disabled:opacity-50">{confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} CONFIRMAR PAGAMENTO</button></div> : null}'''
text = one(text, old_payment, new_payment, "ui reject button")
p.write_text(text, encoding="utf-8")
