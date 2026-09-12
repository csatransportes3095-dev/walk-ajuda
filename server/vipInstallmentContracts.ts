import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import type { VipInstallmentQuote } from "../shared/vipInstallments";
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
  const expiresAtMs = now + 15 * 60 * 1000;

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
        SELECT id, customerId, status, expiresAtMs, pricingJson, quoteJson
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


export async function cancelVipInstallmentCheckoutIntent(input: {
  checkoutToken: string;
  customerId: number;
}) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const checkoutToken = String(input.checkoutToken || '').trim();
  return db.transaction(async (tx: any) => {
    const result = await tx.execute(sql`
      SELECT id, customerId, status, finalizedPlanId
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
  if (String(intent.status) !== 'prepared') {
    throw new TRPCError({ code: "CONFLICT", message: "Esta reserva de parcelamento não está disponível para finalização." });
  }
  if (Number(intent.expiresAtMs || 0) <= now) {
    await db.execute(sql`UPDATE vipInstallmentCheckoutIntents SET status='expired', activeCustomerId=NULL WHERE id=${Number(intent.id)} AND status='prepared'`);
    throw new TRPCError({ code: "CONFLICT", message: "A reserva do parcelamento expirou. Refaça a simulação antes de finalizar." });
  }

  const orderResult = await db.execute(sql`
    SELECT orderNumber, customerPhone
    FROM orderStatusHistory
    WHERE registrationId=${input.registrationId}
    ORDER BY id DESC LIMIT 1
  `);
  const order = rowsOf<any>(orderResult)[0];
  if (!order || normalizePhone(order.customerPhone) !== normalizePhone(input.customerPhone)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Não foi possível confirmar que este pedido pertence à reserva do Parcelamento VIP." });
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
         ${amountCents}, 0, 'pix', 'recebido', ${now}, ${now},
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
