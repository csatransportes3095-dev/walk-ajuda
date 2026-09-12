import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { calculateVipInstallmentQuote, type VipInstallmentFrequency } from "../shared/vipInstallments";
import { requireCustomerSession } from "./customerSession";
import { getDb } from "./db";
import { ensureVipInstallmentInfrastructure, getVipInstallmentConfig, resolveVipInstallmentEligibility } from "./routers/vipInstallments";
import { getVipInstallmentProductRule } from "./vipInstallmentProductRules";
import { resolveVipInstallmentCheckoutPricing, type VipCheckoutItemReference, type VipResolvedCheckoutPricing } from "./vipInstallmentPricing";

export type VipInstallmentOffer = {
  customerId: number;
  customerPhone: string;
  pricing: VipResolvedCheckoutPricing;
  minInstallments: number;
  maxInstallments: number;
  allowedFrequencies: VipInstallmentFrequency[];
  interestBps: number;
  dailyMode: "all_days" | "mon_sat";
  productRuleId: number | null;
};

export type PreparedVipInstallmentOrder = VipInstallmentOffer & {
  installmentCount: number;
  frequency: VipInstallmentFrequency;
  quote: ReturnType<typeof calculateVipInstallmentQuote>;
  paymentProofUrl: string;
  paymentProofMime: string | null;
};

const MAX_FINANCIAL_INT_CENTS = 2_000_000_000;
let contractInfrastructurePromise: Promise<void> | null = null;

function rowsOf<T>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function insertIdOf(result: any): number {
  const packet = Array.isArray(result) ? result[0] : result;
  return Number(packet?.insertId || result?.insertId || 0);
}

function normalizePhone(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
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

function allowedByTriState(globalValue: boolean, customerValue: boolean | null | undefined, productValue: boolean | null | undefined) {
  return (customerValue ?? globalValue) && (productValue ?? true);
}

function effectiveMaxInstallments(config: Awaited<ReturnType<typeof getVipInstallmentConfig>>, permission: any, productRule: any) {
  const customerMax = permission.maxInstallments == null ? config.maxInstallments : Number(permission.maxInstallments);
  return Math.max(
    config.minInstallments,
    Math.min(config.maxInstallments, customerMax, productRule.maxInstallments ?? config.maxInstallments),
  );
}

function effectiveFrequencies(config: Awaited<ReturnType<typeof getVipInstallmentConfig>>, permission: any, productRule: any): VipInstallmentFrequency[] {
  const result: VipInstallmentFrequency[] = [];
  if (allowedByTriState(config.allowDaily, permission.allowDaily, productRule.allowDaily)) result.push("daily");
  if (allowedByTriState(config.allowWeekly, permission.allowWeekly, productRule.allowWeekly)) result.push("weekly");
  if (allowedByTriState(config.allowMonthly, permission.allowMonthly, productRule.allowMonthly)) result.push("monthly");
  return result;
}

async function addColumnIfMissing(db: any, table: string, column: string, definition: string) {
  try {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`));
  } catch (error: any) {
    if (!/duplicate column|already exists|exists/i.test(String(error?.message || ""))) throw error;
  }
}

async function addIndexIfMissing(db: any, statement: string) {
  try {
    await db.execute(sql.raw(statement));
  } catch (error: any) {
    if (!/duplicate key|duplicate index|already exists|exists/i.test(String(error?.message || ""))) throw error;
  }
}

export async function ensureVipInstallmentContractInfrastructure() {
  if (!contractInfrastructurePromise) {
    contractInfrastructurePromise = (async () => {
      await ensureVipInstallmentInfrastructure();
      const db = (await getDb()) as any;
      if (!db) throw new Error("Banco de dados indisponível para contratos VIP.");
      await addColumnIfMissing(db, "vipInstallmentPlans", "registrationId", "INT NULL AFTER customerId");
      await addColumnIfMissing(db, "vipInstallmentPlans", "priceModelId", "INT NULL AFTER optionId");
      await addColumnIfMissing(db, "vipInstallmentPlans", "warrantyTierId", "INT NULL AFTER priceModelId");
      await addColumnIfMissing(db, "vipInstallmentPlans", "couponCode", "VARCHAR(64) NULL AFTER warrantyTierId");
      await addColumnIfMissing(db, "vipInstallmentPlans", "termsSnapshot", "LONGTEXT NULL AFTER couponCode");
      await addIndexIfMissing(db, "ALTER TABLE vipInstallmentPlans ADD UNIQUE KEY uq_vipInstallmentPlans_registration (registrationId)");
    })().catch((error) => {
      contractInfrastructurePromise = null;
      throw error;
    });
  }
  await contractInfrastructurePromise;
}

export async function resolveVipInstallmentOffer(input: {
  cpToken: string;
  phone?: string | null;
  item: VipCheckoutItemReference;
  couponCode?: string | null;
}): Promise<VipInstallmentOffer> {
  const session = await requireCustomerSession(input.cpToken, input.phone || undefined);
  const eligibility = await resolveVipInstallmentEligibility(session.phone);
  if (!eligibility.eligible) {
    throw new TRPCError({ code: "FORBIDDEN", message: eligibility.reason || "Parcelamento VIP indisponível." });
  }

  const pricing = await resolveVipInstallmentCheckoutPricing({
    items: [input.item],
    isVipCustomer: true,
    couponCode: input.couponCode || undefined,
  });
  const item = pricing.items[0];
  const productRule = await getVipInstallmentProductRule(item.productId);
  if (!productRule.enabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este produto não está liberado para Parcelamento VIP." });
  }
  if (productRule.minOrderCents != null && pricing.totalCents < Number(productRule.minOrderCents)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Valor abaixo do mínimo liberado para parcelamento deste produto." });
  }
  if (eligibility.permission.creditLimitCents != null && pricing.totalCents > Number(eligibility.permission.creditLimitCents)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Valor da compra acima do limite de parcelamento liberado pelo ADM." });
  }
  if (pricing.totalCents > MAX_FINANCIAL_INT_CENTS) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Valor acima do limite suportado pelo módulo financeiro atual." });
  }

  const maxInstallments = effectiveMaxInstallments(eligibility.config, eligibility.permission, productRule);
  if (maxInstallments < eligibility.config.minInstallments) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este produto não possui quantidade de parcelas compatível com as regras atuais." });
  }
  const allowedFrequencies = effectiveFrequencies(eligibility.config, eligibility.permission, productRule);
  if (allowedFrequencies.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Nenhuma periodicidade está disponível para este produto e cliente." });
  }

  const interestBps = eligibility.permission.interestBps ?? productRule.interestBps ?? eligibility.config.defaultInterestBps;
  return {
    customerId: Number(eligibility.customer.id),
    customerPhone: normalizePhone(eligibility.customer.phone),
    pricing,
    minInstallments: eligibility.config.minInstallments,
    maxInstallments,
    allowedFrequencies,
    interestBps: Number(interestBps || 0),
    dailyMode: eligibility.config.dailyMode,
    productRuleId: productRule.id == null ? null : Number(productRule.id),
  };
}

export async function quoteVipInstallmentOffer(input: {
  cpToken: string;
  phone?: string | null;
  item: VipCheckoutItemReference;
  couponCode?: string | null;
  installmentCount: number;
  frequency: VipInstallmentFrequency;
}) {
  const offer = await resolveVipInstallmentOffer(input);
  if (!Number.isSafeInteger(input.installmentCount) || input.installmentCount < offer.minInstallments || input.installmentCount > offer.maxInstallments) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Escolha entre ${offer.minInstallments} e ${offer.maxInstallments} parcelas.` });
  }
  if (!offer.allowedFrequencies.includes(input.frequency)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Periodicidade não permitida para este produto ou cliente." });
  }
  const quote = calculateVipInstallmentQuote({
    baseAmountCents: offer.pricing.totalCents,
    installmentCount: input.installmentCount,
    interestBps: offer.interestBps,
    firstDueDate: brazilToday(),
    frequency: input.frequency,
    dailyMode: offer.dailyMode,
  });
  return { offer, quote };
}

export async function prepareVipInstallmentOrder(input: {
  cpToken: string;
  phone?: string | null;
  item: VipCheckoutItemReference;
  couponCode?: string | null;
  installmentCount: number;
  frequency: VipInstallmentFrequency;
  paymentProofUrl: string;
  paymentProofMime?: string | null;
}): Promise<PreparedVipInstallmentOrder> {
  const paymentProofUrl = String(input.paymentProofUrl || "").trim();
  if (!paymentProofUrl) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Envie o comprovante da primeira parcela antes de finalizar." });
  }
  const { offer, quote } = await quoteVipInstallmentOffer(input);
  return {
    ...offer,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
    quote,
    paymentProofUrl,
    paymentProofMime: input.paymentProofMime ? String(input.paymentProofMime).slice(0, 128) : null,
  };
}

export async function createVipInstallmentPlanForOrder(input: {
  prepared: PreparedVipInstallmentOrder;
  registrationId: number;
  createdBy?: string | null;
}) {
  await ensureVipInstallmentContractInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const registrationId = Number(input.registrationId);
  if (!Number.isSafeInteger(registrationId) || registrationId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Pedido inválido para parcelamento." });
  }

  return db.transaction(async (tx: any) => {
    const existingRegistration = rowsOf<any>(await tx.execute(sql`
      SELECT id, customerId, balanceCents, status
      FROM vipInstallmentPlans
      WHERE registrationId=${registrationId}
      LIMIT 1
      FOR UPDATE
    `))[0];
    if (existingRegistration) {
      if (Number(existingRegistration.customerId) !== input.prepared.customerId) {
        throw new TRPCError({ code: "CONFLICT", message: "Este pedido já está relacionado a outro parcelamento." });
      }
      return {
        success: true,
        alreadyCreated: true,
        planId: Number(existingRegistration.id),
        balanceCents: Number(existingRegistration.balanceCents || 0),
        status: String(existingRegistration.status || "active"),
      };
    }

    const customerLock = rowsOf<any>(await tx.execute(sql`
      SELECT id FROM customers WHERE id=${input.prepared.customerId} AND deletedAt IS NULL LIMIT 1 FOR UPDATE
    `))[0];
    if (!customerLock) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });

    const registration = rowsOf<any>(await tx.execute(sql`
      SELECT id, phone FROM accessCodePhones WHERE id=${registrationId} LIMIT 1 FOR UPDATE
    `))[0];
    if (!registration) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado para criar o parcelamento." });
    if (normalizePhone(registration.phone) !== input.prepared.customerPhone) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Este pedido não pertence ao cliente autenticado." });
    }

    const openPlan = rowsOf<any>(await tx.execute(sql`
      SELECT id, balanceCents FROM vipInstallmentPlans
      WHERE openSlotCustomerId=${input.prepared.customerId}
      LIMIT 1
      FOR UPDATE
    `))[0];
    if (openPlan && Number(openPlan.balanceCents || 0) > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Já existe uma compra parcelada em aberto. Quite o saldo antes de criar outra." });
    }

    const membership = rowsOf<any>(await tx.execute(sql`
      SELECT id FROM vipMemberships
      WHERE customerId=${input.prepared.customerId} AND status='active' AND expiresAtMs>${Date.now()}
      ORDER BY id DESC LIMIT 1
    `))[0];
    if (!membership) {
      throw new TRPCError({ code: "FORBIDDEN", message: "O VIP precisa estar ativo no momento da compra parcelada." });
    }

    const resolvedItem = input.prepared.pricing.items[0];
    const snapshot = JSON.stringify({
      version: 1,
      pricing: input.prepared.pricing,
      quote: input.prepared.quote,
      createdAtMs: Date.now(),
    });
    const planInsert = await tx.execute(sql`
      INSERT INTO vipInstallmentPlans
        (customerId, registrationId, membershipId, orderNumber, productId, optionId, priceModelId, warrantyTierId,
         couponCode, termsSnapshot, productName, baseAmountCents, interestBps, interestAmountCents,
         totalAmountCents, paidAmountCents, balanceCents, installmentCount, frequency, dailyMode,
         status, openSlotCustomerId, createdBy)
      VALUES
        (${input.prepared.customerId}, ${registrationId}, ${Number(membership.id)}, ${null}, ${resolvedItem.productId}, ${resolvedItem.optionId},
         ${resolvedItem.priceModelId}, ${resolvedItem.warrantyTierId}, ${input.prepared.pricing.couponCode}, ${snapshot}, ${resolvedItem.productName},
         ${input.prepared.quote.baseAmountCents}, ${input.prepared.quote.interestBps}, ${input.prepared.quote.interestAmountCents},
         ${input.prepared.quote.totalAmountCents}, 0, ${input.prepared.quote.totalAmountCents}, ${input.prepared.quote.installmentCount},
         ${input.prepared.quote.frequency}, ${input.prepared.quote.dailyMode}, 'active', ${input.prepared.customerId}, ${input.createdBy || 'customer_checkout'})
    `);
    let planId = insertIdOf(planInsert);
    if (!planId) {
      const lastId = rowsOf<any>(await tx.execute(sql`SELECT LAST_INSERT_ID() AS id`))[0];
      planId = Number(lastId?.id || 0);
    }
    if (!planId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível identificar o contrato criado." });

    const now = Date.now();
    for (const installment of input.prepared.quote.installments) {
      const isFirst = installment.installmentNumber === 1;
      await tx.execute(sql`
        INSERT INTO vipInstallments
          (planId, installmentNumber, amountCents, dueDate, paidAmountCents, status, proofUrl, proofMimeType,
           proofSubmittedAtMs, paidAtMs, financeSaleId, paymentIdempotencyKey)
        VALUES
          (${planId}, ${installment.installmentNumber}, ${installment.amountCents}, ${installment.dueDate}, 0,
           ${isFirst ? 'awaiting_confirmation' : 'pending'}, ${isFirst ? input.prepared.paymentProofUrl : null},
           ${isFirst ? input.prepared.paymentProofMime : null}, ${isFirst ? now : null}, ${null}, ${null},
           ${`VIPPLAN-${planId}-INSTALLMENT-${installment.installmentNumber}`})
      `);
    }

    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES (${planId}, ${null}, 'plan_created', 'customer', ${String(input.prepared.customerId)}, ${null}, ${snapshot}, 'Contrato criado no fechamento do pedido')
    `);
    const firstInstallment = rowsOf<any>(await tx.execute(sql`
      SELECT id FROM vipInstallments WHERE planId=${planId} AND installmentNumber=1 LIMIT 1
    `))[0];
    if (firstInstallment) {
      await tx.execute(sql`
        INSERT INTO vipInstallmentHistory (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
        VALUES (${planId}, ${Number(firstInstallment.id)}, 'proof_submitted', 'customer', ${String(input.prepared.customerId)}, ${null}, ${input.prepared.paymentProofUrl}, 'Comprovante da primeira parcela enviado no checkout')
      `);
    }

    return {
      success: true,
      alreadyCreated: false,
      planId,
      balanceCents: input.prepared.quote.totalAmountCents,
      status: "active",
    };
  });
}

export async function getVipInstallmentCustomerPlans(input: { cpToken: string; phone?: string | null }) {
  const session = await requireCustomerSession(input.cpToken, input.phone || undefined);
  await ensureVipInstallmentContractInfrastructure();
  const db = (await getDb()) as any;
  const customer = rowsOf<any>(await db.execute(sql`
    SELECT id, name, phone FROM customers
    WHERE deletedAt IS NULL AND REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '')=${normalizePhone(session.phone)}
    LIMIT 1
  `))[0];
  if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });

  const plans = rowsOf<any>(await db.execute(sql`
    SELECT id, registrationId, productName, baseAmountCents, interestBps, interestAmountCents,
           totalAmountCents, paidAmountCents, balanceCents, installmentCount, frequency, dailyMode, status, createdAt
    FROM vipInstallmentPlans
    WHERE customerId=${Number(customer.id)}
    ORDER BY id DESC
    LIMIT 50
  `));
  if (!plans.length) return [];
  const today = brazilToday();
  const output = [];
  for (const plan of plans) {
    const installments = rowsOf<any>(await db.execute(sql`
      SELECT id, installmentNumber, amountCents, dueDate, paidAmountCents, status, proofSubmittedAtMs, paidAtMs
      FROM vipInstallments
      WHERE planId=${Number(plan.id)}
      ORDER BY installmentNumber ASC
    `)).map((row) => {
      const dueDate = row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate).slice(0, 10);
      const storedStatus = String(row.status || "pending");
      const status = storedStatus === "pending" && dueDate < today ? "overdue" : storedStatus;
      return {
        id: Number(row.id),
        installmentNumber: Number(row.installmentNumber),
        amountCents: Number(row.amountCents),
        dueDate,
        paidAmountCents: Number(row.paidAmountCents || 0),
        status,
        proofSubmittedAtMs: row.proofSubmittedAtMs == null ? null : Number(row.proofSubmittedAtMs),
        paidAtMs: row.paidAtMs == null ? null : Number(row.paidAtMs),
      };
    });
    output.push({
      id: Number(plan.id),
      registrationId: plan.registrationId == null ? null : Number(plan.registrationId),
      productName: String(plan.productName || ""),
      baseAmountCents: Number(plan.baseAmountCents || 0),
      interestBps: Number(plan.interestBps || 0),
      interestAmountCents: Number(plan.interestAmountCents || 0),
      totalAmountCents: Number(plan.totalAmountCents || 0),
      paidAmountCents: Number(plan.paidAmountCents || 0),
      balanceCents: Number(plan.balanceCents || 0),
      installmentCount: Number(plan.installmentCount || 0),
      frequency: String(plan.frequency || ""),
      dailyMode: String(plan.dailyMode || ""),
      status: String(plan.status || ""),
      createdAt: plan.createdAt ? new Date(plan.createdAt).getTime() : null,
      installments,
    });
  }
  return output;
}

export async function submitVipInstallmentProof(input: {
  cpToken: string;
  phone?: string | null;
  installmentId: number;
  proofUrl: string;
  proofMimeType?: string | null;
}) {
  const session = await requireCustomerSession(input.cpToken, input.phone || undefined);
  const proofUrl = String(input.proofUrl || "").trim();
  if (!proofUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Comprovante inválido." });
  await ensureVipInstallmentContractInfrastructure();
  const db = (await getDb()) as any;
  const customerPhone = normalizePhone(session.phone);

  return db.transaction(async (tx: any) => {
    const row = rowsOf<any>(await tx.execute(sql`
      SELECT i.id, i.planId, i.installmentNumber, i.status, i.proofUrl,
             p.customerId, p.status AS planStatus, c.phone
      FROM vipInstallments i
      JOIN vipInstallmentPlans p ON p.id=i.planId
      JOIN customers c ON c.id=p.customerId
      WHERE i.id=${input.installmentId}
      LIMIT 1
      FOR UPDATE
    `))[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada." });
    if (normalizePhone(row.phone) !== customerPhone) throw new TRPCError({ code: "FORBIDDEN", message: "Esta parcela não pertence ao seu cadastro." });
    if (String(row.planStatus) === "paid" || String(row.planStatus) === "cancelled") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Este contrato não aceita novos pagamentos." });
    }
    if (String(row.status) === "paid") return { success: true, alreadyPaid: true };
    if (String(row.status) === "awaiting_confirmation") {
      return { success: true, alreadySubmitted: true };
    }

    const earlier = rowsOf<any>(await tx.execute(sql`
      SELECT COUNT(*) AS total
      FROM vipInstallments
      WHERE planId=${Number(row.planId)} AND installmentNumber<${Number(row.installmentNumber)} AND status<>'paid'
    `))[0];
    if (Number(earlier?.total || 0) > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Pague e aguarde a confirmação da parcela anterior antes de enviar esta." });
    }

    const now = Date.now();
    await tx.execute(sql`
      UPDATE vipInstallments
      SET proofUrl=${proofUrl}, proofMimeType=${input.proofMimeType || null}, proofSubmittedAtMs=${now}, status='awaiting_confirmation'
      WHERE id=${input.installmentId}
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES (${Number(row.planId)}, ${input.installmentId}, 'proof_submitted', 'customer', ${String(row.customerId)}, ${row.proofUrl || null}, ${proofUrl}, 'Comprovante enviado pelo cliente')
    `);
    return { success: true, alreadySubmitted: false };
  });
}

export async function listVipInstallmentReceivables() {
  await ensureVipInstallmentContractInfrastructure();
  const db = (await getDb()) as any;
  const today = brazilToday();
  const rows = rowsOf<any>(await db.execute(sql`
    SELECT i.id AS installmentId, i.planId, i.installmentNumber, i.amountCents, i.dueDate,
           i.paidAmountCents, i.status, i.proofUrl, i.proofMimeType, i.proofSubmittedAtMs, i.paidAtMs,
           i.financeSaleId, p.registrationId, p.productName, p.totalAmountCents, p.paidAmountCents AS planPaidAmountCents,
           p.balanceCents, p.installmentCount, p.frequency, p.status AS planStatus,
           c.id AS customerId, c.name AS customerName, c.phone AS customerPhone, c.customerNumber
    FROM vipInstallments i
    JOIN vipInstallmentPlans p ON p.id=i.planId
    JOIN customers c ON c.id=p.customerId
    ORDER BY CASE WHEN i.status='awaiting_confirmation' THEN 0 WHEN i.status='pending' THEN 1 ELSE 2 END,
             i.dueDate ASC, i.id ASC
    LIMIT 2000
  `));
  return rows.map((row) => {
    const dueDate = row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate).slice(0, 10);
    const storedStatus = String(row.status || "pending");
    const status = storedStatus === "pending" && dueDate < today ? "overdue" : storedStatus;
    return {
      installmentId: Number(row.installmentId),
      planId: Number(row.planId),
      installmentNumber: Number(row.installmentNumber),
      amountCents: Number(row.amountCents || 0),
      dueDate,
      paidAmountCents: Number(row.paidAmountCents || 0),
      status,
      proofUrl: row.proofUrl == null ? null : String(row.proofUrl),
      proofMimeType: row.proofMimeType == null ? null : String(row.proofMimeType),
      proofSubmittedAtMs: row.proofSubmittedAtMs == null ? null : Number(row.proofSubmittedAtMs),
      paidAtMs: row.paidAtMs == null ? null : Number(row.paidAtMs),
      financeSaleId: row.financeSaleId == null ? null : Number(row.financeSaleId),
      registrationId: row.registrationId == null ? null : Number(row.registrationId),
      productName: String(row.productName || ""),
      totalAmountCents: Number(row.totalAmountCents || 0),
      planPaidAmountCents: Number(row.planPaidAmountCents || 0),
      balanceCents: Number(row.balanceCents || 0),
      installmentCount: Number(row.installmentCount || 0),
      frequency: String(row.frequency || ""),
      planStatus: String(row.planStatus || ""),
      customerId: Number(row.customerId),
      customerName: String(row.customerName || ""),
      customerPhone: normalizePhone(row.customerPhone),
      customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
    };
  });
}

export async function confirmVipInstallmentPayment(input: { installmentId: number; actorId?: string | null }) {
  await ensureVipInstallmentContractInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

  return db.transaction(async (tx: any) => {
    const row = rowsOf<any>(await tx.execute(sql`
      SELECT i.id, i.planId, i.installmentNumber, i.amountCents, i.paidAmountCents, i.status, i.proofUrl, i.financeSaleId,
             p.customerId, p.registrationId, p.productName, p.totalAmountCents, p.paidAmountCents AS planPaidAmountCents,
             p.installmentCount, p.status AS planStatus, c.name AS customerName, c.phone AS customerPhone
      FROM vipInstallments i
      JOIN vipInstallmentPlans p ON p.id=i.planId
      JOIN customers c ON c.id=p.customerId
      WHERE i.id=${input.installmentId}
      LIMIT 1
      FOR UPDATE
    `))[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada." });
    if (String(row.status) === "paid") {
      return { success: true, alreadyPaid: true, planPaid: String(row.planStatus) === "paid", financeSaleId: row.financeSaleId == null ? null : Number(row.financeSaleId) };
    }
    if (String(row.status) !== "awaiting_confirmation" || !String(row.proofUrl || "").trim()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Esta parcela ainda não possui comprovante aguardando confirmação." });
    }

    const amountCents = Number(row.amountCents || 0);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_FINANCIAL_INT_CENTS) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Valor da parcela inválido para o Financeiro." });
    }
    const now = Date.now();
    const financeInsert = await tx.execute(sql`
      INSERT INTO financialSales
        (registrationId, customerName, customerPhone, productName, productOption, saleValue, costValue,
         paymentMethod, status, saleDate, receivedDate, notes)
      VALUES
        (${row.registrationId == null ? null : Number(row.registrationId)}, ${String(row.customerName || '')}, ${normalizePhone(row.customerPhone)},
         ${String(row.productName || '')}, ${`Parcela ${Number(row.installmentNumber)}/${Number(row.installmentCount)}`}, ${amountCents}, 0,
         'pix', 'pago', ${now}, ${now}, ${`Parcelamento VIP plano #${Number(row.planId)} parcela ${Number(row.installmentNumber)}/${Number(row.installmentCount)}`})
    `);
    let financeSaleId = insertIdOf(financeInsert);
    if (!financeSaleId) {
      const lastId = rowsOf<any>(await tx.execute(sql`SELECT LAST_INSERT_ID() AS id`))[0];
      financeSaleId = Number(lastId?.id || 0);
    }
    if (!financeSaleId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível registrar o recebimento no Financeiro." });

    await tx.execute(sql`
      UPDATE vipInstallments
      SET paidAmountCents=amountCents, status='paid', paidAtMs=${now}, financeSaleId=${financeSaleId}
      WHERE id=${input.installmentId}
    `);
    const paidRow = rowsOf<any>(await tx.execute(sql`
      SELECT COALESCE(SUM(paidAmountCents),0) AS paid
      FROM vipInstallments WHERE planId=${Number(row.planId)}
    `))[0];
    const paidAmountCents = Number(paidRow?.paid || 0);
    const totalAmountCents = Number(row.totalAmountCents || 0);
    const balanceCents = Math.max(0, totalAmountCents - paidAmountCents);
    const planPaid = balanceCents === 0;
    await tx.execute(sql`
      UPDATE vipInstallmentPlans
      SET paidAmountCents=${paidAmountCents}, balanceCents=${balanceCents}, status=${planPaid ? 'paid' : 'active'}, openSlotCustomerId=${planPaid ? null : Number(row.customerId)}
      WHERE id=${Number(row.planId)}
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES (${Number(row.planId)}, ${input.installmentId}, 'payment_confirmed', 'admin', ${input.actorId || 'admin'},
              ${String(row.status)}, 'paid', ${`Recebimento R$ ${(amountCents / 100).toFixed(2)} lançado no Financeiro #${financeSaleId}`})
    `);
    if (planPaid) {
      await tx.execute(sql`
        INSERT INTO vipInstallmentHistory (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
        VALUES (${Number(row.planId)}, ${null}, 'plan_paid', 'admin', ${input.actorId || 'admin'}, 'active', 'paid', 'Saldo zerado; novo parcelamento liberado conforme regras vigentes')
      `);
    }
    return { success: true, alreadyPaid: false, planPaid, financeSaleId, paidAmountCents, balanceCents };
  });
}

export async function rejectVipInstallmentProof(input: { installmentId: number; actorId?: string | null; reason: string }) {
  await ensureVipInstallmentContractInfrastructure();
  const db = (await getDb()) as any;
  return db.transaction(async (tx: any) => {
    const row = rowsOf<any>(await tx.execute(sql`
      SELECT i.id, i.planId, i.status, i.proofUrl, i.dueDate
      FROM vipInstallments i WHERE i.id=${input.installmentId} LIMIT 1 FOR UPDATE
    `))[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada." });
    if (String(row.status) === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Pagamento já confirmado não pode ter comprovante rejeitado." });
    if (String(row.status) !== "awaiting_confirmation") throw new TRPCError({ code: "BAD_REQUEST", message: "Não há comprovante aguardando confirmação nesta parcela." });
    const dueDate = row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate).slice(0, 10);
    const nextStatus = dueDate < brazilToday() ? "pending" : "pending";
    await tx.execute(sql`
      UPDATE vipInstallments
      SET status=${nextStatus}, proofUrl=NULL, proofMimeType=NULL, proofSubmittedAtMs=NULL
      WHERE id=${input.installmentId}
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES (${Number(row.planId)}, ${input.installmentId}, 'proof_rejected', 'admin', ${input.actorId || 'admin'}, ${row.proofUrl || null}, ${null}, ${input.reason})
    `);
    return { success: true };
  });
}
