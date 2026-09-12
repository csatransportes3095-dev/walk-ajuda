from pathlib import Path

router = Path('server/routers/vipInstallments.ts')
s = router.read_text(encoding='utf-8')

old_import = 'import { createVipInstallmentContract, submitVipInstallmentProof, confirmVipInstallmentPayment } from "../vipInstallmentContracts";'
new_import = 'import { prepareVipInstallmentCheckoutIntent, finalizeVipInstallmentCheckoutIntent, submitVipInstallmentProof, confirmVipInstallmentPayment } from "../vipInstallmentContracts";'
if old_import in s:
    s = s.replace(old_import, new_import, 1)
elif new_import not in s:
    raise SystemExit('checkout contracts import not found')

intent_table_marker = 'CREATE TABLE IF NOT EXISTS vipInstallmentCheckoutIntents'
if intent_table_marker not in s:
    anchor = '''      await db.execute(sql`\n        CREATE TABLE IF NOT EXISTS vipInstallmentPlans ('''
    if s.count(anchor) != 1:
        raise SystemExit('intent table anchor mismatch')
    table = '''      await db.execute(sql`\n        CREATE TABLE IF NOT EXISTS vipInstallmentCheckoutIntents (\n          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,\n          checkoutToken VARCHAR(80) NOT NULL,\n          customerId INT NOT NULL,\n          activeCustomerId INT NULL,\n          membershipId INT NOT NULL,\n          pricingJson LONGTEXT NOT NULL,\n          quoteJson LONGTEXT NOT NULL,\n          status VARCHAR(24) NOT NULL DEFAULT 'prepared',\n          expiresAtMs BIGINT NOT NULL,\n          finalizedPlanId INT NULL,\n          finalizedRegistrationId INT NULL,\n          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n          UNIQUE KEY uq_vipInstallmentCheckoutIntents_token (checkoutToken),\n          UNIQUE KEY uq_vipInstallmentCheckoutIntents_active_customer (activeCustomerId),\n          KEY idx_vipInstallmentCheckoutIntents_customer_status (customerId, status),\n          KEY idx_vipInstallmentCheckoutIntents_expiry (expiresAtMs)\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n      `);\n\n'''
    s = s.replace(anchor, table + anchor, 1)

create_start = s.index('  createContract: publicProcedure')
submit_proof_start = s.index('\n\n  submitProof: publicProcedure', create_start)
replacement = r'''  prepareCheckout: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
      checkoutToken: z.string().min(16).max(80),
      items: z.array(z.object({
        productId: z.number().int().positive(),
        optionId: z.number().int().positive(),
        priceModelId: z.number().int().positive().nullable().optional(),
        warrantyTierId: z.number().int().positive().nullable().optional(),
      })).length(1, "Nesta primeira versão, parcele um produto por vez."),
      couponCode: z.string().trim().max(64).optional(),
      installmentCount: z.number().int().min(2).max(120),
      frequency: z.enum(["daily", "weekly", "monthly"]),
    }))
    .mutation(async ({ input }) => {
      const session = await requireCustomerSession(input.cpToken, input.phone);
      const validated = await buildValidatedVipCheckout({
        phone: session.phone,
        items: input.items,
        couponCode: input.couponCode,
        installmentCount: input.installmentCount,
        frequency: input.frequency,
      });
      await ensureVipInstallmentInfrastructure();
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const membershipResult = await db.execute(sql`
        SELECT id FROM vipMemberships
        WHERE customerId=${validated.eligibility.customer.id} AND status='active' AND expiresAtMs>${Date.now()}
        ORDER BY id DESC LIMIT 1
      `);
      const membership = rowsOf<any>(membershipResult)[0];
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "VIP ativo não encontrado para esta compra." });

      return prepareVipInstallmentCheckoutIntent({
        checkoutToken: input.checkoutToken,
        customerId: validated.eligibility.customer.id,
        membershipId: Number(membership.id),
        pricing: validated.pricing,
        quote: validated.quote,
      });
    }),

  finalizeCheckout: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
      checkoutToken: z.string().min(16).max(80),
      registrationId: z.number().int().positive(),
      paymentProofUrl: z.string().min(1).max(4096),
      paymentProofMime: z.string().max(128).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await requireCustomerSession(input.cpToken, input.phone);
      const customer = await customerByPhone(session.phone);
      return finalizeVipInstallmentCheckoutIntent({
        checkoutToken: input.checkoutToken,
        customerId: customer.id,
        customerPhone: session.phone,
        registrationId: input.registrationId,
        proofUrl: input.paymentProofUrl,
        proofMimeType: input.paymentProofMime,
      });
    }),'''
s = s[:create_start] + replacement + s[submit_proof_start:]
router.write_text(s, encoding='utf-8')

contracts = Path('server/vipInstallmentContracts.ts')
c = contracts.read_text(encoding='utf-8')
marker = 'export async function prepareVipInstallmentCheckoutIntent('
if marker not in c:
    insert_anchor = '\nexport async function createVipInstallmentContract(input: {'
    if c.count(insert_anchor) != 1:
        raise SystemExit('intent functions anchor mismatch')
    funcs = r'''
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
'''
    c = c.replace(insert_anchor, '\n' + funcs + insert_anchor, 1)
contracts.write_text(c, encoding='utf-8')
