import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { VIP_INSTALLMENT_CHECKOUT_RESERVATION_MS, isVipInstallmentOrderInsideReservation, type VipInstallmentQuote } from "../shared/vipInstallments";
import { parseBrazilMoneyToCents } from "../shared/vipCheckoutPricing";
import type { VipResolvedCheckoutPricing } from "./vipInstallmentPricing";

function rowsOf<T>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function insertIdOf(result: any): number {
  const value = result?.[0]?.insertId ?? result?.insertId ?? result?.[0]?.[0]?.insertId;
  const id = Number(value || 0);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Não foi possível identificar o registro criado.");
  return id;
}

function normalizePhone(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

function sanitizeProofUrl(value: string) {
  const proofUrl = String(value || "").trim();
  if (!proofUrl || proofUrl.length > 4096) throw new TRPCError({ code: "BAD_REQUEST", message: "Comprovante inválido." });
  return proofUrl;
}

export async function assertOrderOwnership(input: {
  registrationId: number;
  customerPhone: string;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const result = await db.execute(sql`
    SELECT id, phone
    FROM accessCodePhones
    WHERE id=${input.registrationId}
    LIMIT 1
  `);
  const row = rowsOf<any>(result)[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
  if (normalizePhone(row.phone) !== normalizePhone(input.customerPhone)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este pedido não pertence à sua sessão." });
  }
  return { registrationId: Number(row.id), phone: normalizePhone(row.phone) };
}


export async function prepareVipInstallmentCheckoutIntent(input: {
  checkoutToken: string;
  customerId: number;
  membershipId: number;
  pricing: VipResolvedCheckoutPricing;
  quote: VipInstallmentQuote;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const checkoutToken = String(input.checkoutToken || "").trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(checkoutToken)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Identificador do checkout inválido." });
  }
  const now = Date.now();
  const expiresAtMs = now + VIP_INSTALLMENT_CHECKOUT_RESERVATION_MS;

  try {
    return await db.transaction(async (tx: any) => {
      const customerLock = await tx.execute(sql`SELECT id FROM customers WHERE id=${input.customerId} AND deletedAt IS NULL LIMIT 1 FOR UPDATE`);
      if (!rowsOf<any>(customerLock)[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });

      await tx.execute(sql`
        UPDATE vipInstallmentCheckoutIntents
        SET status='expired', activeCustomerId=NULL
        WHERE customerId=${input.customerId} AND status='prepared' AND expiresAtMs<=${now}
      `);

      const sameTokenResult = await tx.execute(sql`
        SELECT id, customerId, status, expiresAtMs, pricingJson, quoteJson, finalizedRegistrationId
        FROM vipInstallmentCheckoutIntents
        WHERE checkoutToken=${checkoutToken}
        LIMIT 1
        FOR UPDATE
      `);
      const sameToken = rowsOf<any>(sameTokenResult)[0];
      if (sameToken) {
        if (Number(sameToken.customerId) !== input.customerId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Checkout não pertence a este cliente." });
        }
        if (sameToken.finalizedRegistrationId && String(sameToken.status) !== 'finalized') {
          throw new TRPCError({ code: "CONFLICT", message: "Este checkout já possui um pedido criado. Retome a finalização do mesmo pedido." });
        }
        if (String(sameToken.status) === 'prepared' && Number(sameToken.expiresAtMs) > now) {
          return {
            checkoutToken,
            expiresAtMs: Number(sameToken.expiresAtMs),
            pricing: JSON.parse(String(sameToken.pricingJson)),
            quote: JSON.parse(String(sameToken.quoteJson)),
            reused: true,
          };
        }
        if (String(sameToken.status) === 'finalized') {
          throw new TRPCError({ code: "CONFLICT", message: "Este checkout já foi finalizado." });
        }
      }

      const activeResult = await tx.execute(sql`
        SELECT id, checkoutToken, expiresAtMs
        FROM vipInstallmentCheckoutIntents
        WHERE activeCustomerId=${input.customerId} AND status='prepared'
        LIMIT 1
        FOR UPDATE
      `);
      const active = rowsOf<any>(activeResult)[0];
      if (active) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe uma compra parcelada sendo finalizada neste cadastro. Conclua ou aguarde alguns minutos." });
      }

      const openPlanResult = await tx.execute(sql`
        SELECT id, balanceCents FROM vipInstallmentPlans
        WHERE openSlotCustomerId=${input.customerId}
        LIMIT 1 FOR UPDATE
      `);
      const openPlan = rowsOf<any>(openPlanResult)[0];
      if (openPlan && Number(openPlan.balanceCents || 0) > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Você já possui uma compra parcelada em andamento." });
      }

      if (sameToken) {
        await tx.execute(sql`
          UPDATE vipInstallmentCheckoutIntents
          SET membershipId=${input.membershipId}, pricingJson=${JSON.stringify(input.pricing)}, quoteJson=${JSON.stringify(input.quote)},
              status='prepared', activeCustomerId=${input.customerId}, expiresAtMs=${expiresAtMs}, finalizedPlanId=NULL, finalizedRegistrationId=NULL
          WHERE id=${Number(sameToken.id)}
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO vipInstallmentCheckoutIntents
            (checkoutToken, customerId, activeCustomerId, membershipId, pricingJson, quoteJson, status, expiresAtMs)
          VALUES
            (${checkoutToken}, ${input.customerId}, ${input.customerId}, ${input.membershipId},
             ${JSON.stringify(input.pricing)}, ${JSON.stringify(input.quote)}, 'prepared', ${expiresAtMs})
        `);
      }
      return { checkoutToken, expiresAtMs, pricing: input.pricing, quote: input.quote, reused: false };
    });
  } catch (error: any) {
    if (error instanceof TRPCError) throw error;
    if (String(error?.code || '') === 'ER_DUP_ENTRY' || String(error?.message || '').includes('Duplicate entry')) {
      throw new TRPCError({ code: "CONFLICT", message: "Já existe uma finalização de Parcelamento VIP em andamento neste cadastro." });
    }
    throw error;
  }
}


export async function bindVipInstallmentCheckoutOrder(input: {
  checkoutToken: string;
  registrationId: number;
  customerPhone: string;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const checkoutToken = String(input.checkoutToken || '').trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(checkoutToken)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Identificador do checkout inválido." });
  }

  return db.transaction(async (tx: any) => {
    const intentResult = await tx.execute(sql`
      SELECT id, customerId, pricingJson, status, expiresAtMs, finalizedPlanId, finalizedRegistrationId
      FROM vipInstallmentCheckoutIntents
      WHERE checkoutToken=${checkoutToken}
      LIMIT 1
      FOR UPDATE
    `);
    const intent = rowsOf<any>(intentResult)[0];
    if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Reserva de Parcelamento VIP não encontrada." });
    if (intent.finalizedRegistrationId && Number(intent.finalizedRegistrationId) !== input.registrationId) {
      throw new TRPCError({ code: "CONFLICT", message: "Esta reserva já está vinculada a outro pedido." });
    }

    const orderResult = await tx.execute(sql`
      SELECT orderNumber, customerPhone, serviceName, serviceOption, pricePaid,
             UNIX_TIMESTAMP(createdAt) * 1000 AS orderCreatedAtMs
      FROM orderStatusHistory
      WHERE registrationId=${input.registrationId}
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
    `);
    const order = rowsOf<any>(orderResult)[0];
    if (!order || normalizePhone(order.customerPhone) !== normalizePhone(input.customerPhone)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Pedido não pertence ao checkout autenticado." });
    }
    const orderCreatedAtMs = Math.trunc(Number(order.orderCreatedAtMs || 0));
    if (!isVipInstallmentOrderInsideReservation({ expiresAtMs: Number(intent.expiresAtMs || 0), orderCreatedAtMs })) {
      throw new TRPCError({ code: "CONFLICT", message: "Pedido criado fora da janela da reserva do Parcelamento VIP." });
    }

    let pricing: VipResolvedCheckoutPricing;
    try { pricing = JSON.parse(String(intent.pricingJson)); }
    catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reserva de parcelamento corrompida." }); }
    const item = pricing?.items?.[0];
    if (!item || String(order.serviceName || '').trim().toLowerCase() !== String(item.productName || '').trim().toLowerCase()) {
      throw new TRPCError({ code: "CONFLICT", message: "Produto do pedido não corresponde à reserva do Parcelamento VIP." });
    }
    let orderPriceCents = 0;
    try { orderPriceCents = parseBrazilMoneyToCents(String(order.pricePaid || '')); } catch { orderPriceCents = 0; }
    if (orderPriceCents !== Number(pricing.totalCents || 0)) {
      throw new TRPCError({ code: "CONFLICT", message: "Valor do pedido não corresponde ao valor congelado na reserva VIP." });
    }

    await tx.execute(sql`
      UPDATE vipInstallmentCheckoutIntents
      SET finalizedRegistrationId=${input.registrationId}
      WHERE id=${Number(intent.id)}
        AND (finalizedRegistrationId IS NULL OR finalizedRegistrationId=${input.registrationId})
    `);
    const verifyResult = await tx.execute(sql`
      SELECT finalizedRegistrationId FROM vipInstallmentCheckoutIntents WHERE id=${Number(intent.id)} LIMIT 1
    `);
    const verify = rowsOf<any>(verifyResult)[0];
    if (!verify || Number(verify.finalizedRegistrationId) !== input.registrationId) {
      throw new TRPCError({ code: "CONFLICT", message: "Não foi possível vincular o pedido à reserva VIP." });
    }
    return { success: true, registrationId: input.registrationId, status: String(intent.status || 'prepared') };
  });
}

export async function recoverVipInstallmentCheckoutOrder(input: {
  checkoutToken: string;
  customerId: number;
  customerPhone: string;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const checkoutToken = String(input.checkoutToken || '').trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(checkoutToken)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Identificador do checkout inválido." });
  }

  return db.transaction(async (tx: any) => {
    const intentResult = await tx.execute(sql`
      SELECT id, customerId, pricingJson, status, expiresAtMs, finalizedPlanId, finalizedRegistrationId
      FROM vipInstallmentCheckoutIntents
      WHERE checkoutToken=${checkoutToken}
      LIMIT 1
      FOR UPDATE
    `);
    const intent = rowsOf<any>(intentResult)[0];
    if (!intent || Number(intent.customerId) !== input.customerId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Reserva de Parcelamento VIP não encontrada." });
    }
    if (intent.finalizedRegistrationId) {
      return {
        found: true,
        registrationId: Number(intent.finalizedRegistrationId),
        planId: intent.finalizedPlanId == null ? null : Number(intent.finalizedPlanId),
        status: String(intent.status || ''),
      };
    }
    const status = String(intent.status || '');
    if (!['prepared', 'expired', 'cancelled'].includes(status)) {
      return { found: false, registrationId: null, planId: null, status };
    }

    let pricing: VipResolvedCheckoutPricing;
    try { pricing = JSON.parse(String(intent.pricingJson)); }
    catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reserva de parcelamento corrompida." }); }
    const item = pricing?.items?.[0];
    if (!item) return { found: false, registrationId: null, planId: null, status };

    const expiresAtMs = Number(intent.expiresAtMs || 0);
    const startMs = expiresAtMs - VIP_INSTALLMENT_CHECKOUT_RESERVATION_MS - 30_000;
    const endMs = expiresAtMs + 30_000;
    const phone = normalizePhone(input.customerPhone);
    const candidatesResult = await tx.execute(sql`
      SELECT registrationId, orderNumber, customerPhone, serviceName, serviceOption, pricePaid,
             MIN(UNIX_TIMESTAMP(createdAt) * 1000) AS orderCreatedAtMs
      FROM orderStatusHistory
      WHERE REGEXP_REPLACE(COALESCE(customerPhone, ''), '[^0-9]', '')=${phone}
        AND UNIX_TIMESTAMP(createdAt) * 1000 BETWEEN ${startMs} AND ${endMs}
      GROUP BY registrationId, orderNumber, customerPhone, serviceName, serviceOption, pricePaid
      ORDER BY orderCreatedAtMs ASC
      LIMIT 10
    `);
    const candidates = rowsOf<any>(candidatesResult).filter((row) => {
      const createdAtMs = Math.trunc(Number(row.orderCreatedAtMs || 0));
      if (!isVipInstallmentOrderInsideReservation({ expiresAtMs, orderCreatedAtMs: createdAtMs })) return false;
      if (String(row.serviceName || '').trim().toLowerCase() !== String(item.productName || '').trim().toLowerCase()) return false;
      const optionText = String(row.serviceOption || '').trim().toLowerCase();
      const optionName = String(item.optionName || '').trim().toLowerCase();
      if (optionName && !optionText.includes(optionName)) return false;
      let candidatePriceCents = 0;
      try { candidatePriceCents = parseBrazilMoneyToCents(String(row.pricePaid || '')); } catch { candidatePriceCents = 0; }
      if (candidatePriceCents !== Number(pricing.totalCents || 0)) return false;
      return true;
    });
    const uniqueRegistrationIds = [...new Set(candidates.map((row) => Number(row.registrationId)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (uniqueRegistrationIds.length != 1) {
      return { found: false, registrationId: null, planId: null, status, ambiguous: uniqueRegistrationIds.length > 1 };
    }
    const registrationId = uniqueRegistrationIds[0];
    await tx.execute(sql`
      UPDATE vipInstallmentCheckoutIntents
      SET finalizedRegistrationId=${registrationId}
      WHERE id=${Number(intent.id)} AND finalizedRegistrationId IS NULL
    `);
    return { found: true, registrationId, planId: null, status, recovered: true };
  });
}


export async function cancelVipInstallmentCheckoutIntent(input: {
  checkoutToken: string;
  customerId: number;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const checkoutToken = String(input.checkoutToken || '').trim();
  return db.transaction(async (tx: any) => {
    const result = await tx.execute(sql`
      SELECT id, customerId, status, finalizedPlanId, finalizedRegistrationId
      FROM vipInstallmentCheckoutIntents
      WHERE checkoutToken=${checkoutToken}
      LIMIT 1
      FOR UPDATE
    `);
    const row = rowsOf<any>(result)[0];
    if (!row) return { success: true, cancelled: false };
    if (Number(row.customerId) !== input.customerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Esta reserva não pertence ao cliente autenticado." });
    }
    if (String(row.status) === 'finalized' || row.finalizedPlanId) {
      return { success: true, cancelled: false, finalized: true };
    }
    if (row.finalizedRegistrationId) {
      return { success: true, cancelled: false, orderCreated: true, registrationId: Number(row.finalizedRegistrationId) };
    }
    await tx.execute(sql`
      UPDATE vipInstallmentCheckoutIntents
      SET status='cancelled', activeCustomerId=NULL
      WHERE id=${Number(row.id)} AND status='prepared'
    `);
    return { success: true, cancelled: String(row.status) === 'prepared' };
  });
}

export async function finalizeVipInstallmentCheckoutIntent(input: {
  checkoutToken: string;
  customerId: number;
  customerPhone: string;
  registrationId: number;
  proofUrl: string;
  proofMimeType?: string | null;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const now = Date.now();
  const checkoutToken = String(input.checkoutToken || '').trim();

  const intentResult = await db.execute(sql`
    SELECT id, customerId, membershipId, pricingJson, quoteJson, status, expiresAtMs, finalizedPlanId, finalizedRegistrationId
    FROM vipInstallmentCheckoutIntents
    WHERE checkoutToken=${checkoutToken}
    LIMIT 1
  `);
  const intent = rowsOf<any>(intentResult)[0];
  if (!intent || Number(intent.customerId) !== input.customerId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Reserva de Parcelamento VIP não encontrada." });
  }
  if (String(intent.status) === 'finalized' && intent.finalizedPlanId) {
    return { success: true, planId: Number(intent.finalizedPlanId), registrationId: Number(intent.finalizedRegistrationId || input.registrationId), alreadyFinalized: true };
  }
  const intentStatus = String(intent.status || '');
  if (intentStatus !== 'prepared' && intentStatus !== 'expired') {
    throw new TRPCError({ code: "CONFLICT", message: "Esta reserva de parcelamento não está disponível para finalização." });
  }

  const orderResult = await db.execute(sql`
    SELECT orderNumber, customerPhone, UNIX_TIMESTAMP(createdAt) * 1000 AS orderCreatedAtMs
    FROM orderStatusHistory
    WHERE registrationId=${input.registrationId}
    ORDER BY id ASC LIMIT 1
  `);
  const order = rowsOf<any>(orderResult)[0];
  if (!order || normalizePhone(order.customerPhone) !== normalizePhone(input.customerPhone)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Não foi possível confirmar que este pedido pertence à reserva do Parcelamento VIP." });
  }
  const expiresAtMs = Number(intent.expiresAtMs || 0);
  const orderCreatedAtMs = Math.trunc(Number(order.orderCreatedAtMs || 0));
  if (!isVipInstallmentOrderInsideReservation({ expiresAtMs, orderCreatedAtMs })) {
    if (intentStatus === 'prepared' && expiresAtMs <= now) {
      await db.execute(sql`UPDATE vipInstallmentCheckoutIntents SET status='expired', activeCustomerId=NULL WHERE id=${Number(intent.id)} AND status='prepared'`);
    }
    throw new TRPCError({ code: "CONFLICT", message: "Este pedido não foi criado dentro da reserva válida do Parcelamento VIP." });
  }
  if (intentStatus === 'prepared' && expiresAtMs <= now) {
    await db.execute(sql`UPDATE vipInstallmentCheckoutIntents SET status='expired', activeCustomerId=NULL WHERE id=${Number(intent.id)} AND status='prepared'`);
  }

  await db.execute(sql`
    UPDATE vipInstallmentCheckoutIntents
    SET finalizedRegistrationId=${input.registrationId}
    WHERE id=${Number(intent.id)}
      AND (finalizedRegistrationId IS NULL OR finalizedRegistrationId=${input.registrationId})
  `);
  const boundResult = await db.execute(sql`SELECT finalizedRegistrationId FROM vipInstallmentCheckoutIntents WHERE id=${Number(intent.id)} LIMIT 1`);
  const bound = rowsOf<any>(boundResult)[0];
  if (!bound || Number(bound.finalizedRegistrationId) !== input.registrationId) {
    throw new TRPCError({ code: "CONFLICT", message: "Esta reserva já está vinculada a outro pedido." });
  }

  const orderNumber = order.orderNumber == null ? String(input.registrationId) : String(order.orderNumber);

  const existingResult = await db.execute(sql`
    SELECT id FROM vipInstallmentPlans WHERE orderNumber=${orderNumber} LIMIT 1
  `);
  const existing = rowsOf<any>(existingResult)[0];
  if (existing) {
    await db.execute(sql`
      UPDATE vipInstallmentCheckoutIntents
      SET status='finalized', activeCustomerId=NULL, finalizedPlanId=${Number(existing.id)}, finalizedRegistrationId=${input.registrationId}
      WHERE id=${Number(intent.id)}
    `);
    return { success: true, planId: Number(existing.id), registrationId: input.registrationId, alreadyFinalized: true };
  }

  let pricing: VipResolvedCheckoutPricing;
  let quote: VipInstallmentQuote;
  try {
    pricing = JSON.parse(String(intent.pricingJson));
    quote = JSON.parse(String(intent.quoteJson));
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reserva de parcelamento corrompida." });
  }
  if (!pricing?.items?.length || !quote?.installments?.length || Number(quote.totalAmountCents || 0) <= 0) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reserva de parcelamento inválida." });
  }

  const customerResult = await db.execute(sql`SELECT name, phone FROM customers WHERE id=${input.customerId} AND deletedAt IS NULL LIMIT 1`);
  const customer = rowsOf<any>(customerResult)[0];
  if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });

  const created = await createVipInstallmentContract({
    customerId: input.customerId,
    membershipId: Number(intent.membershipId),
    customerName: String(customer.name || ''),
    customerPhone: input.customerPhone,
    registrationId: input.registrationId,
    orderNumber,
    pricing,
    quote,
    proofUrl: input.proofUrl,
    proofMimeType: input.proofMimeType,
    createdBy: `checkout:${checkoutToken}`,
  });

  await db.execute(sql`
    UPDATE vipInstallmentCheckoutIntents
    SET status='finalized', activeCustomerId=NULL, finalizedPlanId=${created.planId}, finalizedRegistrationId=${input.registrationId}
    WHERE id=${Number(intent.id)}
  `);
  return { ...created, registrationId: input.registrationId, alreadyFinalized: false };
}

export async function createVipInstallmentContract(input: {
  customerId: number;
  membershipId: number | null;
  customerName: string;
  customerPhone: string;
  registrationId: number;
  orderNumber: string | null;
  pricing: VipResolvedCheckoutPricing;
  quote: VipInstallmentQuote;
  proofUrl: string;
  proofMimeType?: string | null;
  createdBy?: string | null;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  if (input.pricing.items.length !== 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nesta versão, o parcelamento aceita um produto por contrato." });
  }
  const proofUrl = sanitizeProofUrl(input.proofUrl);
  const proofMimeType = String(input.proofMimeType || "").trim().slice(0, 128) || null;
  const item = input.pricing.items[0];
  const now = Date.now();

  try {
    return await db.transaction(async (tx: any) => {
      const openResult = await tx.execute(sql`
        SELECT id, balanceCents
        FROM vipInstallmentPlans
        WHERE openSlotCustomerId=${input.customerId}
        LIMIT 1
        FOR UPDATE
      `);
      const open = rowsOf<any>(openResult)[0];
      if (open && Number(open.balanceCents || 0) > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Você já possui uma compra parcelada em andamento. Quite o saldo atual antes de criar outra." });
      }

      const orderResult = await tx.execute(sql`
        SELECT id, phone
        FROM accessCodePhones
        WHERE id=${input.registrationId}
        LIMIT 1
        FOR UPDATE
      `);
      const order = rowsOf<any>(orderResult)[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      if (normalizePhone(order.phone) !== normalizePhone(input.customerPhone)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Este pedido não pertence à sua sessão." });
      }

      const duplicateResult = await tx.execute(sql`
        SELECT id
        FROM vipInstallmentPlans
        WHERE orderNumber=${input.orderNumber || String(input.registrationId)}
        LIMIT 1
        FOR UPDATE
      `);
      const duplicate = rowsOf<any>(duplicateResult)[0];
      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: "Este pedido já possui um contrato de Parcelamento VIP." });
      }

      const planInsert = await tx.execute(sql`
        INSERT INTO vipInstallmentPlans
          (customerId, membershipId, orderNumber, productId, optionId, productName,
           baseAmountCents, interestBps, interestAmountCents, totalAmountCents,
           paidAmountCents, balanceCents, installmentCount, frequency, dailyMode,
           status, openSlotCustomerId, createdBy)
        VALUES
          (${input.customerId}, ${input.membershipId}, ${input.orderNumber || String(input.registrationId)},
           ${item.productId}, ${item.optionId}, ${item.productName},
           ${input.quote.baseAmountCents}, ${input.quote.interestBps}, ${input.quote.interestAmountCents},
           ${input.quote.totalAmountCents}, 0, ${input.quote.totalAmountCents}, ${input.quote.installmentCount},
           ${input.quote.frequency}, ${input.quote.dailyMode}, 'active', ${input.customerId}, ${input.createdBy || "customer"})
      `);
      const planId = insertIdOf(planInsert);

      let firstInstallmentId = 0;
      for (const installment of input.quote.installments) {
        const isFirst = installment.installmentNumber === 1;
        const key = `VIP-PLAN-${planId}-PARCELA-${installment.installmentNumber}`;
        const result = await tx.execute(sql`
          INSERT INTO vipInstallments
            (planId, installmentNumber, amountCents, dueDate, paidAmountCents, status,
             proofUrl, proofMimeType, proofSubmittedAtMs, paymentIdempotencyKey)
          VALUES
            (${planId}, ${installment.installmentNumber}, ${installment.amountCents}, ${installment.dueDate}, 0,
             ${isFirst ? "awaiting_confirmation" : "pending"},
             ${isFirst ? proofUrl : null}, ${isFirst ? proofMimeType : null}, ${isFirst ? now : null}, ${key})
        `);
        if (isFirst) firstInstallmentId = insertIdOf(result);
      }

      await tx.execute(sql`
        INSERT INTO vipInstallmentHistory
          (planId, installmentId, action, actorType, actorId, newValue, notes)
        VALUES
          (${planId}, ${firstInstallmentId || null}, 'contract_created', 'customer', ${String(input.customerId)},
           ${JSON.stringify({ registrationId: input.registrationId, totalAmountCents: input.quote.totalAmountCents, firstInstallmentStatus: "awaiting_confirmation" })},
           'Contrato criado após envio do comprovante da primeira parcela.')
      `);

      // A venda automática do pedido comum representa o valor total. Em compra parcelada
      // ela não pode permanecer como recebível, pois cada parcela será lançada separadamente.
      await tx.execute(sql`
        UPDATE financialSales
        SET status='cancelado', receivedDate=NULL,
            notes=CONCAT(COALESCE(notes, ''), ${`\n[Parcelamento VIP] Venda integral substituída pelo plano #${planId}.`})
        WHERE registrationId=${input.registrationId} AND status <> 'cancelado'
      `);

      return {
        planId,
        firstInstallmentId,
        totalAmountCents: input.quote.totalAmountCents,
        balanceCents: input.quote.totalAmountCents,
        status: "active" as const,
        firstInstallmentStatus: "awaiting_confirmation" as const,
      };
    });
  } catch (error: any) {
    if (error instanceof TRPCError) throw error;
    if (String(error?.code || "") === "ER_DUP_ENTRY" || String(error?.message || "").includes("Duplicate entry")) {
      throw new TRPCError({ code: "CONFLICT", message: "Já existe uma compra parcelada em andamento para este cliente ou pedido." });
    }
    throw error;
  }
}

export async function submitVipInstallmentProof(input: {
  customerId: number;
  installmentId: number;
  proofUrl: string;
  proofMimeType?: string | null;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const proofUrl = sanitizeProofUrl(input.proofUrl);
  const mime = String(input.proofMimeType || "").trim().slice(0, 128) || null;
  const now = Date.now();

  return db.transaction(async (tx: any) => {
    const result = await tx.execute(sql`
      SELECT i.id, i.planId, i.installmentNumber, i.status, p.customerId
      FROM vipInstallments i
      INNER JOIN vipInstallmentPlans p ON p.id=i.planId
      WHERE i.id=${input.installmentId}
      LIMIT 1
      FOR UPDATE
    `);
    const row = rowsOf<any>(result)[0];
    if (!row || Number(row.customerId) !== input.customerId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada." });
    }
    const previousOpenResult = await tx.execute(sql`
      SELECT id, installmentNumber
      FROM vipInstallments
      WHERE planId=${Number(row.planId)} AND installmentNumber < ${Number(row.installmentNumber)} AND status <> 'paid'
      ORDER BY installmentNumber ASC
      LIMIT 1
    `);
    if (rowsOf<any>(previousOpenResult)[0]) {
      throw new TRPCError({ code: "CONFLICT", message: "Pague as parcelas anteriores antes de enviar o comprovante desta parcela." });
    }
    const status = String(row.status || "");
    if (status === "paid") throw new TRPCError({ code: "CONFLICT", message: "Esta parcela já está paga." });
    if (status === "awaiting_confirmation") {
      throw new TRPCError({ code: "CONFLICT", message: "Já existe um comprovante aguardando confirmação para esta parcela." });
    }
    if (status !== "pending" && status !== "overdue") {
      throw new TRPCError({ code: "CONFLICT", message: "Esta parcela não aceita novo comprovante no status atual." });
    }

    await tx.execute(sql`
      UPDATE vipInstallments
      SET proofUrl=${proofUrl}, proofMimeType=${mime}, proofSubmittedAtMs=${now}, status='awaiting_confirmation'
      WHERE id=${input.installmentId}
    `);
    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory
        (planId, installmentId, action, actorType, actorId, newValue, notes)
      VALUES
        (${Number(row.planId)}, ${input.installmentId}, 'proof_submitted', 'customer', ${String(input.customerId)},
         ${JSON.stringify({ status: "awaiting_confirmation", proofSubmittedAtMs: now })}, 'Comprovante enviado pelo cliente.')
    `);
    return { success: true, status: "awaiting_confirmation" as const, proofSubmittedAtMs: now };
  });
}

export async function confirmVipInstallmentPayment(input: {
  installmentId: number;
  actorId?: string | null;
  notes?: string | null;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const now = Date.now();

  return db.transaction(async (tx: any) => {
    const result = await tx.execute(sql`
      SELECT i.id, i.planId, i.installmentNumber, i.amountCents, i.status, i.financeSaleId,
             i.paymentIdempotencyKey, p.customerId, p.productName, p.orderNumber,
             p.totalAmountCents, p.paidAmountCents, p.balanceCents,
             c.name AS customerName, c.phone AS customerPhone
      FROM vipInstallments i
      INNER JOIN vipInstallmentPlans p ON p.id=i.planId
      INNER JOIN customers c ON c.id=p.customerId
      WHERE i.id=${input.installmentId}
      LIMIT 1
      FOR UPDATE
    `);
    const row = rowsOf<any>(result)[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada." });
    if (String(row.status) === "paid") {
      return {
        success: true,
        alreadyConfirmed: true,
        planId: Number(row.planId),
        installmentId: Number(row.id),
        financeSaleId: row.financeSaleId == null ? null : Number(row.financeSaleId),
      };
    }
    if (String(row.status) !== "awaiting_confirmation") {
      throw new TRPCError({ code: "CONFLICT", message: "Esta parcela não está aguardando confirmação de pagamento." });
    }

    const amountCents = Number(row.amountCents || 0);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Valor da parcela inválido." });
    }

    const financeInsert = await tx.execute(sql`
      INSERT INTO financialSales
        (registrationId, customerName, customerPhone, productName, productOption,
         saleValue, costValue, paymentMethod, status, saleDate, receivedDate, notes)
      VALUES
        (NULL, ${String(row.customerName || "")}, ${normalizePhone(row.customerPhone)},
         ${String(row.productName || "Parcelamento VIP")}, ${`Parcela ${Number(row.installmentNumber)}`},
         ${amountCents}, 0, 'pix', 'pago', ${now}, ${now},
         ${`[Parcelamento VIP] Plano #${Number(row.planId)} | Pedido ${String(row.orderNumber || "-")} | ${String(row.paymentIdempotencyKey)}`})
    `);
    const financeSaleId = insertIdOf(financeInsert);

    await tx.execute(sql`
      UPDATE vipInstallments
      SET paidAmountCents=amountCents, status='paid', paidAtMs=${now}, financeSaleId=${financeSaleId}
      WHERE id=${input.installmentId} AND status='awaiting_confirmation'
    `);

    const newPaid = Math.min(Number(row.totalAmountCents), Number(row.paidAmountCents || 0) + amountCents);
    const newBalance = Math.max(0, Number(row.totalAmountCents) - newPaid);
    const planStatus = newBalance === 0 ? "paid" : "active";
    await tx.execute(sql`
      UPDATE vipInstallmentPlans
      SET paidAmountCents=${newPaid}, balanceCents=${newBalance}, status=${planStatus},
          openSlotCustomerId=${newBalance === 0 ? null : Number(row.customerId)}
      WHERE id=${Number(row.planId)}
    `);

    await tx.execute(sql`
      INSERT INTO vipInstallmentHistory
        (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      VALUES
        (${Number(row.planId)}, ${input.installmentId}, 'payment_confirmed', 'admin', ${input.actorId || "admin"},
         ${JSON.stringify({ balanceCents: Number(row.balanceCents || 0), status: "awaiting_confirmation" })},
         ${JSON.stringify({ balanceCents: newBalance, status: "paid", financeSaleId })}, ${input.notes || null})
    `);

    return {
      success: true,
      alreadyConfirmed: false,
      planId: Number(row.planId),
      installmentId: Number(row.id),
      financeSaleId,
      paidAmountCents: newPaid,
      balanceCents: newBalance,
      planStatus,
      releasedForNewInstallment: newBalance === 0,
    };
  });
}


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
