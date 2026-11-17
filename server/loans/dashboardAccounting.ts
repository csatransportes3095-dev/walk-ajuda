/**
 * Read-only accounting for the ADM loan dashboard.
 * Loan interest is allocated by each contract's saved principal / total ratio;
 * historical payment and rollover records are never changed here.
 */
export interface LoanDashboardLedgerRow {
  loanId: number | string;
  loanStatus: string;
  loanPrincipal: number | string | null;
  loanTotal: number | string | null;
  pixSentAt: string | Date | null;
  installmentId: number | string | null;
  installmentAmount: number | string | null;
  installmentStatus: string | null;
  installmentFee: number | string | null;
  installmentOriginalAmount: number | string | null;
}

export interface LoanDashboardReceivables {
  valorEmAberto: number;
  capitalAReceber: number;
  lucroAReceber: number;
  taxasAReceber: number;
  semPixConfirmado: number;
  semPixValorPendente: number;
  inconsistencias: number;
}

const OPEN_STATUSES = new Set([
  'pendente', 'atrasado', 'em_analise', 'aguardando_confirmacao',
]);
const SETTLED_STATUSES = new Set(['pago', 'pago_juros']);

function toCents(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return null;
  const cents = Math.round(number * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * `pago_juros` represents an already paid interest cycle. Its original amount
 * must NOT remain outstanding; only the new rolled installment is collectible.
 * An installment in `em_analise` is still outstanding until its proof is approved.
 */
export function summarizeLoanDashboard(rows: LoanDashboardLedgerRow[]): LoanDashboardReceivables {
  type LoanGroup = {
    status: string;
    pixConfirmed: boolean;
    paymentRecorded: boolean;
    open: LoanDashboardLedgerRow[];
  };
  const byLoan = new Map<string, LoanGroup>();
  let inconsistencias = 0;

  for (const row of rows) {
    const key = String(row.loanId);
    let group = byLoan.get(key);
    if (!group) {
      group = {
        status: String(row.loanStatus || ''),
        pixConfirmed: Boolean(row.pixSentAt),
        paymentRecorded: false,
        open: [],
      };
      byLoan.set(key, group);
    }
    if (row.installmentId == null) continue;
    const status = String(row.installmentStatus || '');
    if (SETTLED_STATUSES.has(status)) group.paymentRecorded = true;
    else if (OPEN_STATUSES.has(status)) group.open.push(row);
    else if (status !== 'cancelado' && status !== 'reprovado') inconsistencias++;
  }

  let capitalCents = 0;
  let interestCents = 0;
  let feesCents = 0;
  let semPixConfirmado = 0;
  let semPixValueCents = 0;

  for (const group of byLoan.values()) {
    if (['pendente', 'cancelado', 'reprovado'].includes(group.status) || !group.open.length) continue;
    if (group.status === 'pago') {
      // An alleged paid-off loan still has collectible installments: reconcile manually.
      inconsistencias++;
      continue;
    }
    if (!group.pixConfirmed && !group.paymentRecorded) {
      // An approved request is not money lent until PIX is confirmed.
      // A paid installment is evidence for older, pre-PIX-confirmation contracts.
      semPixConfirmado++;
      for (const row of group.open) {
        const amount = toCents(row.installmentAmount);
        if (amount == null) inconsistencias++;
        else semPixValueCents += amount;
      }
      continue;
    }

    for (const row of group.open) {
      const amount = toCents(row.installmentAmount);
      const contractPrincipal = toCents(row.loanPrincipal);
      const contractTotal = toCents(row.loanTotal);
      if (amount == null || contractPrincipal == null || contractTotal == null || contractTotal === 0 || contractPrincipal > contractTotal) {
        inconsistencias++;
        continue;
      }

      // Late fees are not the contract's interest. Keep them as a separate amount.
      const recordedFee = toCents(row.installmentFee) ?? 0;
      const original = toCents(row.installmentOriginalAmount);
      const inferredFee = original == null ? 0 : Math.max(0, amount - original);
      const fee = Math.min(amount, Math.max(recordedFee, inferredFee));
      const base = amount - fee;
      const principal = Math.round(base * (contractPrincipal / contractTotal));

      capitalCents += principal;
      interestCents += base - principal;
      feesCents += fee;
    }
  }

  return {
    valorEmAberto: (capitalCents + interestCents + feesCents) / 100,
    capitalAReceber: capitalCents / 100,
    lucroAReceber: interestCents / 100,
    taxasAReceber: feesCents / 100,
    semPixConfirmado,
    semPixValorPendente: semPixValueCents / 100,
    inconsistencias,
  };
}
