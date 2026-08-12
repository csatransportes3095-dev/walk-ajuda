import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type InvoiceStatus = "ABERTA" | "A_VENCER" | "VENCE_HOJE" | "VENCIDA" | "PAGA";

export type CardBillingConfig = {
  id: number;
  fechamentoDia: number | null;
  vencimentoDia: number;
};

let infrastructureReady = false;
let bootstrapRunning: Promise<void> | null = null;

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function exec(query: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco indisponível para cartões");
  const result = await db.execute(sql.raw(query));
  return (result[0] as any[]) || [];
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function clampDay(year: number, monthIndex: number, day: number) {
  return Math.min(Math.max(1, day), new Date(year, monthIndex + 1, 0).getDate());
}

export function competenceForDate(referenceDate: Date, fechamentoDia: number | null) {
  const day = referenceDate.getDate();
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const competenceDate = fechamentoDia && day > fechamentoDia
    ? new Date(year, month + 1, 1)
    : new Date(year, month, 1);
  return `${competenceDate.getFullYear()}-${String(competenceDate.getMonth() + 1).padStart(2, "0")}`;
}

export function getCardBillingCycle(card: CardBillingConfig, competence: string) {
  const [year, month] = competence.split("-").map(Number);
  const monthIndex = month - 1;
  const closingDay = card.fechamentoDia ?? new Date(year, month, 0).getDate();
  const cycleEnd = new Date(year, monthIndex, clampDay(year, monthIndex, closingDay), 12);
  const previousMonth = new Date(year, monthIndex - 1, 1);
  const previousClosingDay = card.fechamentoDia
    ? clampDay(previousMonth.getFullYear(), previousMonth.getMonth(), card.fechamentoDia)
    : 0;
  const cycleStart = card.fechamentoDia
    ? new Date(previousMonth.getFullYear(), previousMonth.getMonth(), previousClosingDay + 1, 12)
    : new Date(year, monthIndex, 1, 12);

  // Sem dia de fechamento, a competência do mês vence no mês seguinte.
  // Com fechamento, vence no mesmo mês apenas quando o vencimento ocorre após o fechamento.
  const dueMonthOffset = !card.fechamentoDia || card.vencimentoDia <= card.fechamentoDia ? 1 : 0;
  const dueMonth = new Date(year, monthIndex + dueMonthOffset, 1);
  const dueDate = new Date(
    dueMonth.getFullYear(),
    dueMonth.getMonth(),
    clampDay(dueMonth.getFullYear(), dueMonth.getMonth(), card.vencimentoDia),
    12,
  );

  return {
    competence,
    cycleStart: dateOnly(cycleStart),
    cycleEnd: dateOnly(cycleEnd),
    closingDate: dateOnly(cycleEnd),
    dueDate: dateOnly(dueDate),
  };
}

export function getInvoiceStatus(invoice: { remainingAmount: number; closingDate: string; dueDate: string }, now = new Date()): InvoiceStatus {
  const remaining = Number(invoice.remainingAmount || 0);
  if (remaining <= 0.005) return "PAGA";
  const today = dateOnly(now);
  if (today <= invoice.closingDate) return "ABERTA";
  if (today < invoice.dueDate) return "A_VENCER";
  if (today === invoice.dueDate) return "VENCE_HOJE";
  return "VENCIDA";
}

async function tryExecute(query: string) {
  try { await exec(query); } catch { /* compatibility with older MySQL/TiDB syntax */ }
}

export async function ensureCardInvoiceInfrastructure() {
  if (infrastructureReady) return;

  // Backup lógico não destrutivo. Os dados são copiados uma única vez, antes de qualquer reconciliação.
  await tryExecute("CREATE TABLE IF NOT EXISTS cc_backup_20260812_cartoes AS SELECT * FROM cc_cartoes");
  await tryExecute("CREATE TABLE IF NOT EXISTS cc_backup_20260812_gastos AS SELECT * FROM cc_gastos");
  await tryExecute("CREATE TABLE IF NOT EXISTS cc_backup_20260812_pagamentos AS SELECT * FROM cc_pagamentos");
  await tryExecute("CREATE TABLE IF NOT EXISTS cc_backup_20260812_parcelamentos AS SELECT * FROM cc_parcelamentos");

  await exec(`CREATE TABLE IF NOT EXISTS cc_faturas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cartaoId INT NOT NULL,
    competencia VARCHAR(7) NOT NULL,
    cycleStart DATE NOT NULL,
    cycleEnd DATE NOT NULL,
    closingDate DATE NOT NULL,
    dueDate DATE NOT NULL,
    originalAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
    paidAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
    legacyPaidAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
    remainingAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
    paidAt DATETIME NULL,
    requiresReview TINYINT NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY cc_faturas_cartao_cycle_end_uq (cartaoId, cycleEnd),
    KEY cc_faturas_cartao_comp_idx (cartaoId, competencia),
    KEY cc_faturas_status_idx (status)
  )`);

  await tryExecute("ALTER TABLE cc_pagamentos ADD COLUMN invoiceId INT NULL");
  await tryExecute("ALTER TABLE cc_gastos ADD COLUMN invoiceId INT NULL");
  await tryExecute("CREATE INDEX cc_pagamentos_invoice_idx ON cc_pagamentos (invoiceId)");
  await tryExecute("CREATE INDEX cc_gastos_invoice_idx ON cc_gastos (invoiceId)");
  infrastructureReady = true;
}

async function ensureInvoiceForCycle(card: CardBillingConfig, competence: string) {
  const cycle = getCardBillingCycle(card, competence);
  await exec(`INSERT IGNORE INTO cc_faturas (cartaoId, competencia, cycleStart, cycleEnd, closingDate, dueDate)
    VALUES (${card.id}, ${sqlValue(cycle.competence)}, ${sqlValue(cycle.cycleStart)}, ${sqlValue(cycle.cycleEnd)}, ${sqlValue(cycle.closingDate)}, ${sqlValue(cycle.dueDate)})`);
  const invoices = await exec(`SELECT * FROM cc_faturas WHERE cartaoId = ${card.id} AND cycleEnd = ${sqlValue(cycle.cycleEnd)} LIMIT 1`);
  return invoices[0] as any;
}

async function linkLegacyPayments(invoice: any) {
  const groups = await exec(`SELECT DATE_FORMAT(data, '%Y-%m-%d %H:%i') AS paidMinute, ROUND(SUM(valor), 2) AS amount
    FROM cc_gastos
    WHERE invoiceId = ${invoice.id} AND paga = 1 AND dataOriginal IS NOT NULL
    GROUP BY DATE_FORMAT(data, '%Y-%m-%d %H:%i')`);

  for (const group of groups) {
    const matchingPayments = await exec(`SELECT id FROM cc_pagamentos
      WHERE cartaoId = ${invoice.cartaoId} AND invoiceId IS NULL
        AND ROUND(valorPago, 2) = ${Number(group.amount || 0)}
        AND DATE_FORMAT(dataPagamento, '%Y-%m-%d %H:%i') = ${sqlValue(group.paidMinute)}
      ORDER BY id ASC LIMIT 2`);
    if (matchingPayments.length === 1) {
      await exec(`UPDATE cc_pagamentos SET invoiceId = ${invoice.id} WHERE id = ${matchingPayments[0].id}`);
    }
  }
}

export async function refreshInvoice(invoiceId: number) {
  const rows = await exec(`SELECT * FROM cc_faturas WHERE id = ${invoiceId} LIMIT 1`);
  const invoice = rows[0] as any;
  if (!invoice) throw new Error("Fatura não encontrada");

  const expenseTotals = await exec(`SELECT
      ROUND(COALESCE(SUM(valor), 0), 2) AS originalAmount,
      ROUND(COALESCE(SUM(CASE WHEN paga = 1 THEN valor ELSE 0 END), 0), 2) AS paidExpenseAmount
    FROM cc_gastos WHERE invoiceId = ${invoiceId}`);
  const originalAmount = Number(expenseTotals[0]?.originalAmount || 0);
  const paidExpenseAmount = Number(expenseTotals[0]?.paidExpenseAmount || 0);

  await linkLegacyPayments(invoice);
  const paymentTotals = await exec(`SELECT ROUND(COALESCE(SUM(valorPago), 0), 2) AS paidAmount, MAX(dataPagamento) AS lastPaidAt
    FROM cc_pagamentos WHERE invoiceId = ${invoiceId}`);
  const paidAmount = Number(paymentTotals[0]?.paidAmount || 0);
  const legacyPaidAmount = Math.max(0, Math.min(originalAmount - paidAmount, paidExpenseAmount - paidAmount));
  const remainingAmount = Math.max(0, Math.round((originalAmount - paidAmount - legacyPaidAmount) * 100) / 100);
  const status = getInvoiceStatus({ remainingAmount, closingDate: invoice.closingDate, dueDate: invoice.dueDate });
  const requiresReview = paidExpenseAmount > 0 && paidAmount === 0 ? 1 : 0;
  const paidAt = status === "PAGA" ? (paymentTotals[0]?.lastPaidAt || invoice.paidAt || new Date().toISOString().slice(0, 19).replace("T", " ")) : null;

  await exec(`UPDATE cc_faturas SET
      originalAmount = ${originalAmount}, paidAmount = ${paidAmount}, legacyPaidAmount = ${legacyPaidAmount},
      remainingAmount = ${remainingAmount}, status = ${sqlValue(status)}, paidAt = ${sqlValue(paidAt)}, requiresReview = ${requiresReview}
    WHERE id = ${invoiceId}`);
  const refreshed = await exec(`SELECT * FROM cc_faturas WHERE id = ${invoiceId} LIMIT 1`);
  return refreshed[0] as any;
}

export async function bootstrapCardInvoices() {
  if (bootstrapRunning) return bootstrapRunning;
  bootstrapRunning = (async () => {
    await ensureCardInvoiceInfrastructure();
    const cards = await exec("SELECT id, fechamentoDia, vencimentoDia FROM cc_cartoes");
    for (const rawCard of cards) {
      const card: CardBillingConfig = {
        id: Number(rawCard.id),
        fechamentoDia: rawCard.fechamentoDia ? Number(rawCard.fechamentoDia) : null,
        vencimentoDia: Number(rawCard.vencimentoDia),
      };
      const competences = await exec(`SELECT DISTINCT cicloFatura AS competencia FROM cc_gastos
        WHERE cartaoId = ${card.id} AND cicloFatura IS NOT NULL ORDER BY cicloFatura`);
      for (const row of competences) {
        const invoice = await ensureInvoiceForCycle(card, String(row.competencia));
        await exec(`UPDATE cc_gastos SET invoiceId = ${invoice.id}
          WHERE cartaoId = ${card.id} AND cicloFatura = ${sqlValue(row.competencia)} AND (invoiceId IS NULL OR invoiceId <> ${invoice.id})`);
        await refreshInvoice(invoice.id);
      }
    }
  })();
  try {
    await bootstrapRunning;
  } finally {
    bootstrapRunning = null;
  }
}

export async function getCardInvoices(card: CardBillingConfig) {
  await bootstrapCardInvoices();
  const rows = await exec(`SELECT * FROM cc_faturas WHERE cartaoId = ${card.id} ORDER BY cycleEnd DESC`);
  const refreshed: any[] = [];
  for (const row of rows) refreshed.push(await refreshInvoice(Number(row.id)));
  return refreshed;
}

export async function getCurrentInvoice(card: CardBillingConfig, referenceDate = new Date()) {
  await bootstrapCardInvoices();
  const competence = competenceForDate(referenceDate, card.fechamentoDia);
  const invoice = await ensureInvoiceForCycle(card, competence);
  return refreshInvoice(Number(invoice.id));
}

export async function getNextInvoice(card: CardBillingConfig, referenceDate = new Date()) {
  const competence = competenceForDate(referenceDate, card.fechamentoDia);
  const [year, month] = competence.split("-").map(Number);
  const next = new Date(year, month, 1);
  const nextCompetence = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  const invoice = await ensureInvoiceForCycle(card, nextCompetence);
  return refreshInvoice(Number(invoice.id));
}

export async function getOverdueInvoices(cardId: number) {
  await bootstrapCardInvoices();
  const rows = await exec(`SELECT * FROM cc_faturas WHERE cartaoId = ${cardId} ORDER BY dueDate ASC`);
  const overdue: any[] = [];
  for (const row of rows) {
    const invoice = await refreshInvoice(Number(row.id));
    if (invoice.status === "VENCIDA" && Number(invoice.remainingAmount) > 0) overdue.push(invoice);
  }
  return overdue;
}

export async function markInvoiceAsPaid(invoiceId: number, cartaoId: number, amount: number, observacao?: string) {
  const invoiceRows = await exec(`SELECT * FROM cc_faturas WHERE id = ${invoiceId} AND cartaoId = ${cartaoId} LIMIT 1`);
  const invoice = invoiceRows[0] as any;
  if (!invoice) throw new Error("Fatura não encontrada para este cartão");
  const refreshed = await refreshInvoice(invoiceId);
  const remaining = Number(refreshed.remainingAmount || 0);
  if (remaining <= 0) throw new Error("Esta fatura já está paga");
  if (Math.round(amount * 100) > Math.round(remaining * 100)) throw new Error("O pagamento não pode ser maior que o saldo da fatura");

  await exec(`INSERT INTO cc_pagamentos (cartaoId, invoiceId, valorPago, observacao) VALUES (${cartaoId}, ${invoiceId}, ${amount}, ${sqlValue(observacao || null)})`);
  const updated = await refreshInvoice(invoiceId);
  if (updated.status === "PAGA") {
    await exec(`UPDATE cc_gastos SET paga = 1, dataOriginal = COALESCE(dataOriginal, data), data = NOW() WHERE invoiceId = ${invoiceId}`);
    return refreshInvoice(invoiceId);
  }
  return updated;
}

export async function reverseInvoicePayment(paymentId: number, cartaoId: number) {
  const rows = await exec(`SELECT * FROM cc_pagamentos WHERE id = ${paymentId} AND cartaoId = ${cartaoId} LIMIT 1`);
  const payment = rows[0] as any;
  if (!payment) throw new Error("Pagamento não encontrado");
  if (!payment.invoiceId) throw new Error("Pagamento antigo sem fatura vinculada: requer revisão antes de reverter");
  const invoiceId = Number(payment.invoiceId);
  await exec(`DELETE FROM cc_pagamentos WHERE id = ${paymentId} AND cartaoId = ${cartaoId}`);
  const refreshed = await refreshInvoice(invoiceId);
  // A reversão atua somente na fatura vinculada. Se outros pagamentos ainda a quitarem,
  // os lançamentos permanecem quitados; caso contrário retornam ao estado pendente.
  if (refreshed.status === "PAGA") {
    await exec(`UPDATE cc_gastos SET paga = 1, dataOriginal = COALESCE(dataOriginal, data), data = NOW() WHERE invoiceId = ${invoiceId}`);
  } else {
    await exec(`UPDATE cc_gastos SET paga = 0, data = COALESCE(dataOriginal, data), dataOriginal = NULL WHERE invoiceId = ${invoiceId}`);
  }
  return refreshInvoice(invoiceId);
}

export async function createExpenseInvoiceLink(card: CardBillingConfig, competence: string, expenseId: number) {
  const invoice = await ensureInvoiceForCycle(card, competence);
  await exec(`UPDATE cc_gastos SET invoiceId = ${invoice.id} WHERE id = ${expenseId} AND cartaoId = ${card.id}`);
  return refreshInvoice(invoice.id);
}

export async function reconcileCardInvoices(card: CardBillingConfig) {
  const invoices = await getCardInvoices(card);
  return invoices.map((invoice: any) => ({
    ...invoice,
    needsReview: Boolean(invoice.requiresReview),
  }));
}

export async function reconcileAllCardInvoices() {
  await bootstrapCardInvoices();
  const cards = await exec("SELECT id, fechamentoDia, vencimentoDia FROM cc_cartoes ORDER BY id");
  const result: any[] = [];
  for (const raw of cards) {
    const card: CardBillingConfig = { id: Number(raw.id), fechamentoDia: raw.fechamentoDia ? Number(raw.fechamentoDia) : null, vencimentoDia: Number(raw.vencimentoDia) };
    const invoices = await reconcileCardInvoices(card);
    result.push({ cardId: card.id, invoices });
  }
  return result;
}
