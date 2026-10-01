export type InvoiceHistorySnapshot = {
  competencia?: string | null;
  status?: string | null;
  paidAt?: string | null;
  dueDate?: string | null;
};

export function historicalPaidInvoice<T extends InvoiceHistorySnapshot>(
  invoices: T[],
  currentCompetence: string,
  targetCompetence: string,
): T | null {
  if (targetCompetence >= currentCompetence) return null;
  return invoices.find((invoice) =>
    String(invoice.competencia ?? "") === targetCompetence &&
    String(invoice.status ?? "").toUpperCase() === "PAGA"
  ) ?? null;
}

export function historicalPaymentDate(invoice: InvoiceHistorySnapshot, fallbackDate: string): string {
  const paidAt = String(invoice?.paidAt ?? "").replace("T", " ").slice(0, 19);
  if (/^\d{4}-\d{2}-\d{2}/.test(paidAt)) return paidAt;
  const dueDate = String(invoice?.dueDate ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate + " 12:00:00" : fallbackDate + " 12:00:00";
}
