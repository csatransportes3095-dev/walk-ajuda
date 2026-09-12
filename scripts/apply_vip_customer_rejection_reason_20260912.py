from pathlib import Path


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)


p = Path("server/routers/vipInstallments.ts")
text = p.read_text(encoding="utf-8")
old_select = '''        SELECT id, planId, installmentNumber, amountCents, dueDate, paidAmountCents, status,
               proofSubmittedAtMs, paidAtMs
        FROM vipInstallments
        WHERE planId IN (${sql.join(planIds.map((id) => sql`${id}`), sql`, `)})
        ORDER BY planId DESC, installmentNumber ASC'''
new_select = '''        SELECT i.id, i.planId, i.installmentNumber, i.amountCents, i.dueDate, i.paidAmountCents, i.status,
               i.proofSubmittedAtMs, i.paidAtMs,
               (
                 SELECT h.notes
                 FROM vipInstallmentHistory h
                 WHERE h.installmentId=i.id AND h.action='proof_rejected'
                 ORDER BY h.id DESC LIMIT 1
               ) AS lastRejectionReason,
               (
                 SELECT UNIX_TIMESTAMP(h.createdAt) * 1000
                 FROM vipInstallmentHistory h
                 WHERE h.installmentId=i.id AND h.action='proof_rejected'
                 ORDER BY h.id DESC LIMIT 1
               ) AS lastRejectionAtMs
        FROM vipInstallments i
        WHERE i.planId IN (${sql.join(planIds.map((id) => sql`${id}`), sql`, `)})
        ORDER BY i.planId DESC, i.installmentNumber ASC'''
text = one(text, old_select, new_select, "customer installments select")
old_map = '''          proofSubmittedAtMs: row.proofSubmittedAtMs == null ? null : Number(row.proofSubmittedAtMs),
          paidAtMs: row.paidAtMs == null ? null : Number(row.paidAtMs),
        });'''
new_map = '''          proofSubmittedAtMs: row.proofSubmittedAtMs == null ? null : Number(row.proofSubmittedAtMs),
          paidAtMs: row.paidAtMs == null ? null : Number(row.paidAtMs),
          lastRejectionReason: row.lastRejectionReason == null ? null : String(row.lastRejectionReason),
          lastRejectionAtMs: row.lastRejectionAtMs == null ? null : Number(row.lastRejectionAtMs),
        });'''
# This exact map exists in myPlans and not adminReceivables because admin map contains proofUrl in between.
text = one(text, old_map, new_map, "customer rejection mapping")
p.write_text(text, encoding="utf-8")


p = Path("client/src/pages/VipInstallmentPayments.tsx")
text = p.read_text(encoding="utf-8")
text = one(
    text,
    'import { ArrowLeft, CheckCircle2, Clock3, Copy, CreditCard, FileUp, Loader2, LockKeyhole, ReceiptText } from "lucide-react";',
    'import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Copy, CreditCard, FileUp, Loader2, LockKeyhole, ReceiptText } from "lucide-react";',
    "rejection alert icon",
)
anchor = '''                          {isCurrent && !paid && (
                            <div className="mt-3 border-t border-white/10 pt-3">
                              {awaiting ? ('''
replacement = '''                          {isCurrent && !paid && (
                            <div className="mt-3 border-t border-white/10 pt-3">
                              {installment.lastRejectionReason && !awaiting ? <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" /><div><p className="font-black">Comprovante anterior rejeitado</p><p className="mt-1 text-xs text-red-200">Motivo: {installment.lastRejectionReason}</p><p className="mt-1 text-[11px] text-red-300/80">Envie um novo comprovante para esta parcela.</p></div></div> : null}
                              {awaiting ? ('''
text = one(text, anchor, replacement, "customer rejection alert")
p.write_text(text, encoding="utf-8")
