export type LoanInstallmentFocusCandidate = {
  id: number;
  loanId: number;
  installmentNumber: number;
  status: string;
  dueDate?: string | null;
  [key: string]: unknown;
};

function dueDateOf(value: unknown) {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "9999-12-31";
}

function byInstallmentNumber(a: LoanInstallmentFocusCandidate, b: LoanInstallmentFocusCandidate) {
  return Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0);
}

export type LoanInstallmentFocusReason =
  | "proof_review"
  | "overdue"
  | "due_today"
  | "next_pending"
  | "last_paid";

export type LoanInstallmentFocusResult = {
  installment: LoanInstallmentFocusCandidate;
  reason: LoanInstallmentFocusReason;
} | null;

/**
 * Escolhe a parcela mais importante para o ADM sem mudar nenhuma regra financeira.
 * Prioridade:
 * 1) comprovante aguardando análise;
 * 2) parcela vencida;
 * 3) parcela que vence hoje;
 * 4) próxima pendente;
 * 5) última paga apenas como referência.
 */
export function selectLoanInstallmentFocus(
  installments: LoanInstallmentFocusCandidate[],
  today: string,
): LoanInstallmentFocusResult {
  if (!Array.isArray(installments) || installments.length === 0) return null;

  const review = installments
    .filter((item) => item.status === "em_analise")
    .sort(byInstallmentNumber)[0];
  if (review) return { installment: review, reason: "proof_review" };

  const unpaid = installments.filter((item) =>
    item.status === "pendente" || item.status === "atrasado",
  );

  const overdue = unpaid
    .filter((item) => dueDateOf(item.dueDate) < today)
    .sort((a, b) => dueDateOf(a.dueDate).localeCompare(dueDateOf(b.dueDate)) || byInstallmentNumber(a, b))[0];
  if (overdue) return { installment: overdue, reason: "overdue" };

  const dueToday = unpaid
    .filter((item) => dueDateOf(item.dueDate) === today)
    .sort(byInstallmentNumber)[0];
  if (dueToday) return { installment: dueToday, reason: "due_today" };

  const nextPending = unpaid
    .sort((a, b) => dueDateOf(a.dueDate).localeCompare(dueDateOf(b.dueDate)) || byInstallmentNumber(a, b))[0];
  if (nextPending) return { installment: nextPending, reason: "next_pending" };

  const lastPaid = installments
    .filter((item) => item.status === "pago" || item.status === "pago_juros")
    .sort((a, b) => Number(b.installmentNumber || 0) - Number(a.installmentNumber || 0))[0];
  if (lastPaid) return { installment: lastPaid, reason: "last_paid" };

  return null;
}
