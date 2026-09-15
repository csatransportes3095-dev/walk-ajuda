import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

const MAX_FINANCIAL_SALE_CENTS = 2_000_000_000;
let payoffInfrastructurePromise: Promise<void> | null = null;

function rowsOf<T>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function insertIdOf(result: any): number {
  const value = result?.[0]?.insertId ?? result?.insertId ?? result?.[0]?.[0]?.insertId;
  const id = Number(value || 0);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Não foi possível identificar o registro financeiro criado.");
  return id;
}

function normalizePhone(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

function sanitizeProofUrl(value: string) {
  const proofUrl = String(value || "").trim();
  if (!proofUrl || proofUrl.length > 4096) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Comprovante inválido." });
  }
  return proofUrl;
}

function brazilToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function ensureVipInstallmentPayoffInfrastructure() {
  if (!payoffInfrastructurePromise) {
    payoffInfrastructurePromise = (async () => {
      const db = (await getDb()) as any;
      if (!db) throw new Error("Banco de dados indisponível para quitação de parcelas.");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vipInstallmentPayoffProofs (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          planId INT NOT NULL,
          customerId INT NOT NULL,
          carrierInstallmentId INT NOT NULL,
          amountCents BIGINT NOT NULL,
          proofUrl TEXT NOT NULL,
          proofMimeType VARCHAR(128) NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'awaiting_confirmation',
          submittedAtMs BIGINT NOT NULL,
          reviewedAtMs BIGINT NULL,
          rejectionReason VARCHAR(500) NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_vipInstallmentPayoffProofs_plan (planId),
          KEY idx_vipInstallmentPayoffProofs_customer (customerId),
          KEY idx_vipInstallmentPayoffProofs_status (status),
          KEY idx_vipInstallmentPayoffProofs_carrier (carrierInstallmentId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      payoffInfrastructurePromise = null;
      throw error;
    });
  }
  await payoffInfrastructurePromise;
}

export async function submitVipInstallmentPayoffProof(input: {
  customerId: number;
  planId: number;
  proofUrl: string;
  proofMimeType?: string | null;
}) {
  await ensureVipInstallmentPayoffInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const proofUrl = sanitizeProofUrl(input.proofUrl);
  const mime = String(input.proofMimeType || "").trim().slice(0, 128) || null;
  const now = Date.now();

  return db.transaction(async (tx: any) => {
    const planResult = await tx.execute(sql`
      SELECT id, customerId, status, balanceCents
      FROM vipInstallmentPlans
      WHERE id=${input.planId}
      LIMIT 1 FOR UPDATE
    `);
    const plan = rowsOf<any>(planResult)[0];
    if (!plan || Number(plan.customerId) !== input.customerId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Parcelamento não encontrado." });
    }
    const balanceCents = Number(plan.balanceCents || 0);
    if (String(plan.status) === "cancelled") {
      throw new TRPCError({ code: "CONFLICT", message: "Este parcelamento foi cancelado." });
    }
    if (String(plan.status) === "paid" || balanceCents <= 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Este parcelamento já está quitado." });
    }
    if (!Number.isSafeInteger(balanceCents) || balanceCents > MAX_FINANCIAL_SALE_CENTS) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Saldo inválido para quitação." });
    }

    const awaitingResult = await tx.execute(sql`
      SELECT id
      FROM vipInstallments
      WHERE planId=${input.planId} AND status='awaiting_confirmation'
      LIMIT 1 FOR UPDATE
    `);
    if (rowsOf<any>(awaitingResult)[0]) {
      throw new TRPCError({ code: "CONFLICT", message: "Já existe um comprovante aguardando conferência do ADM." });
    }

    const carrierResult = await tx.execute(sql`
      SELECT id, installmentNumber, dueDate, status
      FROM vipInstallments
      WHERE planId=${input.planId} AND status IN ('pending','overdue')
      ORDER BY installmentNumber ASC
      LIMIT 1 FOR UPDATE
    `);
    const carrier = rowsOf<any>(carrierResult)[0];
    if (!carrier) {
      throw new TRPCError({ code: "CONFLICT", message: "Nenhuma parcela disponível para receber a quitação." });
    }

    const existingResult = await tx.execute(sql`
      SELECT id, status
      FROM vipInstallmentPayoffProofs
      WHERE planId=${input.planId}
      LIMIT 1 FOR UPDATE
    `);
    const existing = rowsOf<any>(existingResult)[0];
    if (existing && String(existing.status) === "awaiting_confirmation") {
      throw new TRPCError({ code: "CONFLICT", message: "A quitação já está aguardando conferência do ADM." });
    }
    if (existing && String(existing.status) === "approved") {
      throw new TRPCError({ code: "CONFLICT", message: "Esta quitação já foi aprovada." });
    }

    await tx.execute(sql`
      UPDATE vipInstallments
      SET proofUrl=${proofUrl}, proofMimeType=${mime}, proofSubmittedAtMs=${now}, status='awaiting_confirmation'
      WHERE id=${Number(carrier.id)} AND status IN ('pending','overdue')
    `);

    await tx.execute(sql`
      INSERT INTO vipInstallmentPayoffProofs
        (planId, customerId, carrierInstallmentId, amountCents, proofUrl, proofMimeType, status, submittedAtMs, reviewedAtMs, rejectionReason)
      VALUES
        (${input.planId}, ${input.customerId}, ${Number(carrier.id)}, ${balanceCents}, ${proofUrl}, ${mime}, 'awaiting_confirmation', ${now}, NULL, NULL)
      ON DUPLICATE KEY UPDATE
        customerId=VALUES(customerId), carrierInstallmentId=VALUES(carrierInstallmentId), amountCents=VALUES(amountCents),
        proofUrl=VALUES(proofUrl), proofMimeType=VALUES(proofMimeType), status='awaiting_confirmation',
        submittedAtMs=VALUES(submittedAtMs), reviewedAtMs=NULL, rejectionReason=NULL
    `);

    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory
        (planId, installmentId, action, actorType, actorId, newValue, notes)
      VALUES
        (${input.planId}, ${Number(carrier.id)}, 'payoff_proof_submitted', 'customer', ${String(input.customerId)},
         ${JSON.stringify({ amountCents: balanceCents, status: "awaiting_confirmation", proofSubmittedAtMs: now })},
         'Cliente enviou comprovante para quitar todo o saldo pendente.')
    `);

    return {
      success: true,
      planId: input.planId,
      carrierInstallmentId: Number(carrier.id),
      amountCents: balanceCents,
      status: "awaiting_confirmation" as const,
      submittedAtMs: now,
    };
  });
}

export async function listCustomerVipInstallmentPayoffProofs(customerId: number) {
  await ensureVipInstallmentPayoffInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const result = await db.execute(sql`
    SELECT id, planId, carrierInstallmentId, amountCents, status, submittedAtMs, reviewedAtMs, rejectionReason
    FROM vipInstallmentPayoffProofs
    WHERE customerId=${customerId}
    ORDER BY id DESC
    LIMIT 50
  `);
  return rowsOf<any>(result).map((row) => ({
    id: Number(row.id),
    planId: Number(row.planId),
    carrierInstallmentId: Number(row.carrierInstallmentId),
    amountCents: Number(row.amountCents || 0),
    status: String(row.status || ""),
    submittedAtMs: row.submittedAtMs == null ? null : Number(row.submittedAtMs),
    reviewedAtMs: row.reviewedAtMs == null ? null : Number(row.reviewedAtMs),
    rejectionReason: row.rejectionReason == null ? null : String(row.rejectionReason),
  }));
}

export async function listPendingVipInstallmentPayoffProofs() {
  await ensureVipInstallmentPayoffInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const result = await db.execute(sql`
    SELECT q.id, q.planId, q.customerId, q.carrierInstallmentId, q.amountCents, q.proofUrl, q.proofMimeType,
           q.status, q.submittedAtMs,
           p.orderNumber, p.productName, p.totalAmountCents, p.paidAmountCents, p.balanceCents, p.installmentCount,
           c.name AS customerName, c.phone AS customerPhone, c.customerNumber
    FROM vipInstallmentPayoffProofs q
    INNER JOIN vipInstallmentPlans p ON p.id=q.planId
    INNER JOIN customers c ON c.id=q.customerId
    WHERE q.status='awaiting_confirmation'
    ORDER BY q.submittedAtMs ASC, q.id ASC
    LIMIT 500
  `);
  return rowsOf<any>(result).map((row) => ({
    id: Number(row.id),
    planId: Number(row.planId),
    customerId: Number(row.customerId),
    carrierInstallmentId: Number(row.carrierInstallmentId),
    amountCents: Number(row.amountCents || 0),
    proofUrl: String(row.proofUrl || ""),
    proofMimeType: row.proofMimeType == null ? null : String(row.proofMimeType),
    status: String(row.status || ""),
    submittedAtMs: row.submittedAtMs == null ? null : Number(row.submittedAtMs),
    orderNumber: row.orderNumber == null ? null : String(row.orderNumber),
    productName: String(row.productName || ""),
    totalAmountCents: Number(row.totalAmountCents || 0),
    paidAmountCents: Number(row.paidAmountCents || 0),
    balanceCents: Number(row.balanceCents || 0),
    installmentCount: Number(row.installmentCount || 0),
    customerName: String(row.customerName || ""),
    customerPhone: normalizePhone(row.customerPhone),
    customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
  }));
}

export async function confirmVipInstallmentPayoffProof(input: {
  planId: number;
  actorId?: string | null;
  notes?: string | null;
}) {
  await ensureVipInstallmentPayoffInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const now = Date.now();

  return db.transaction(async (tx: any) => {
    const requestResult = await tx.execute(sql`
      SELECT q.id AS requestId, q.planId, q.customerId, q.carrierInstallmentId, q.amountCents AS requestedAmountCents,
             q.proofUrl, q.status AS requestStatus,
             p.status AS planStatus, p.productName, p.orderNumber, p.totalAmountCents, p.paidAmountCents, p.balanceCents,
             c.name AS customerName, c.phone AS customerPhone
      FROM vipInstallmentPayoffProofs q
      INNER JOIN vipInstallmentPlans p ON p.id=q.planId
      INNER JOIN customers c ON c.id=q.customerId
      WHERE q.planId=${input.planId}
      LIMIT 1 FOR UPDATE
    `);
    const request = rowsOf<any>(requestResult)[0];
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação de quitação não encontrada." });
    if (String(request.requestStatus) === "approved" || String(request.planStatus) === "paid" || Number(request.balanceCents || 0) <= 0) {
      await tx.execute(sql`
        UPDATE vipInstallmentPayoffProofs
        SET status='approved', reviewedAtMs=${now}, rejectionReason=NULL
        WHERE planId=${input.planId}
      `);
      return { success: true, alreadyPaid: true, paidCents: 0, balanceCents: 0 };
    }
    if (String(request.requestStatus) !== "awaiting_confirmation") {
      throw new TRPCError({ code: "CONFLICT", message: "Esta quitação não está aguardando conferência." });
    }
    if (String(request.planStatus) === "cancelled") {
      throw new TRPCError({ code: "CONFLICT", message: "Plano cancelado não pode ser quitado." });
    }

    const balanceCents = Number(request.balanceCents || 0);
    if (!Number.isSafeInteger(balanceCents) || balanceCents <= 0 || balanceCents > MAX_FINANCIAL_SALE_CENTS) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Saldo inválido para lançamento no Financeiro." });
    }
    if (Number(request.requestedAmountCents || 0) !== balanceCents) {
      throw new TRPCError({ code: "CONFLICT", message: "O saldo mudou após o envio do comprovante. Rejeite e peça um novo comprovante com o valor atualizado." });
    }

    const awaitingResult = await tx.execute(sql`
      SELECT id, proofUrl
      FROM vipInstallments
      WHERE planId=${input.planId} AND status='awaiting_confirmation'
      ORDER BY id ASC FOR UPDATE
    `);
    const awaiting = rowsOf<any>(awaitingResult);
    if (awaiting.length !== 1 || Number(awaiting[0].id) !== Number(request.carrierInstallmentId)) {
      throw new TRPCError({ code: "CONFLICT", message: "Existem comprovantes individuais em conferência. Resolva-os antes da quitação total." });
    }
    if (String(awaiting[0].proofUrl || "") !== String(request.proofUrl || "")) {
      throw new TRPCError({ code: "CONFLICT", message: "O comprovante da quitação não confere com o registro da parcela." });
    }

    const financeInsert = await tx.execute(sql`
      INSERT INTO financialSales
        (registrationId, customerName, customerPhone, productName, productOption,
         saleValue, costValue, paymentMethod, status, saleDate, receivedDate, notes)
      VALUES
        (NULL, ${String(request.customerName || "")}, ${normalizePhone(request.customerPhone)},
         ${String(request.productName || "Parcelamento VIP")}, 'Quitação antecipada',
         ${balanceCents}, 0, 'pix', 'pago', ${now}, ${now},
         ${`[Parcelamento VIP] Quitação por comprovante do plano #${input.planId} | Pedido ${String(request.orderNumber || "-")} | Solicitação #${Number(request.requestId)}`})
    `);
    const financeSaleId = insertIdOf(financeInsert);

    await tx.execute(sql`
      UPDATE vipInstallments
      SET paidAmountCents=amountCents, status='paid', paidAtMs=${now}, financeSaleId=${financeSaleId}
      WHERE planId=${input.planId} AND status IN ('pending','overdue','awaiting_confirmation')
    `);
    await tx.execute(sql`
      UPDATE vipInstallmentPlans
      SET paidAmountCents=totalAmountCents, balanceCents=0, status='paid', openSlotCustomerId=NULL
      WHERE id=${input.planId}
    `);
    await tx.execute(sql`
      UPDATE vipInstallmentPayoffProofs
      SET status='approved', reviewedAtMs=${now}, rejectionReason=NULL
      WHERE planId=${input.planId} AND status='awaiting_confirmation'
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory
        (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES
        (${input.planId}, ${Number(request.carrierInstallmentId)}, 'payoff_proof_confirmed', 'admin', ${input.actorId || "admin"},
         ${JSON.stringify({ balanceCents, status: "awaiting_confirmation", requestId: Number(request.requestId) })},
         ${JSON.stringify({ balanceCents: 0, status: "paid", financeSaleId })}, ${input.notes || null})
    `);

    return { success: true, alreadyPaid: false, paidCents: balanceCents, balanceCents: 0, financeSaleId };
  });
}

export async function rejectVipInstallmentPayoffProof(input: {
  planId: number;
  actorId?: string | null;
  notes: string;
}) {
  const notes = String(input.notes || "").trim();
  if (!notes) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo da rejeição." });
  await ensureVipInstallmentPayoffInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const now = Date.now();
  const today = brazilToday();

  return db.transaction(async (tx: any) => {
    const requestResult = await tx.execute(sql`
      SELECT q.id AS requestId, q.carrierInstallmentId, q.status AS requestStatus,
             i.dueDate, i.status AS installmentStatus
      FROM vipInstallmentPayoffProofs q
      INNER JOIN vipInstallments i ON i.id=q.carrierInstallmentId
      WHERE q.planId=${input.planId}
      LIMIT 1 FOR UPDATE
    `);
    const request = rowsOf<any>(requestResult)[0];
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação de quitação não encontrada." });
    if (String(request.requestStatus) !== "awaiting_confirmation") {
      throw new TRPCError({ code: "CONFLICT", message: "Esta quitação não está aguardando conferência." });
    }
    if (String(request.installmentStatus) !== "awaiting_confirmation") {
      throw new TRPCError({ code: "CONFLICT", message: "A parcela vinculada à quitação não está aguardando conferência." });
    }

    const dueDate = request.dueDate instanceof Date ? request.dueDate.toISOString().slice(0, 10) : String(request.dueDate).slice(0, 10);
    const restoredStatus = dueDate < today ? "overdue" : "pending";
    await tx.execute(sql`
      UPDATE vipInstallments
      SET status=${restoredStatus}, proofUrl=NULL, proofMimeType=NULL, proofSubmittedAtMs=NULL
      WHERE id=${Number(request.carrierInstallmentId)} AND status='awaiting_confirmation'
    `);
    await tx.execute(sql`
      UPDATE vipInstallmentPayoffProofs
      SET status='rejected', reviewedAtMs=${now}, rejectionReason=${notes}
      WHERE planId=${input.planId} AND status='awaiting_confirmation'
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory
        (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES
        (${input.planId}, ${Number(request.carrierInstallmentId)}, 'payoff_proof_rejected', 'admin', ${input.actorId || "admin"},
         ${JSON.stringify({ status: "awaiting_confirmation", requestId: Number(request.requestId) })},
         ${JSON.stringify({ status: restoredStatus })}, ${notes})
    `);
    return { success: true, status: restoredStatus };
  });
}
