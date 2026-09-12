from pathlib import Path

router = Path('server/routers/vipInstallments.ts')
s = router.read_text(encoding='utf-8')

contracts_import = 'import { createVipInstallmentContract, submitVipInstallmentProof, confirmVipInstallmentPayment } from "../vipInstallmentContracts";'
import_anchor = 'import { getVipInstallmentProductRule, listVipInstallmentProductRules, saveVipInstallmentProductRule } from "../vipInstallmentProductRules";'
if contracts_import not in s:
    if s.count(import_anchor) != 1:
        raise SystemExit('contract import anchor mismatch')
    s = s.replace(import_anchor, import_anchor + '\n' + contracts_import, 1)

# New tables have never been deployed; make order identity unique from day one.
s = s.replace('          KEY idx_vipInstallmentPlans_order (orderNumber)', '          UNIQUE KEY uq_vipInstallmentPlans_order (orderNumber)')

helper_marker = 'async function buildValidatedVipCheckout('
router_export = '\n\nexport const vipInstallmentsRouter = router({'
if helper_marker not in s:
    if s.count(router_export) != 1:
        raise SystemExit('router export anchor mismatch')
    helper = r'''
async function buildValidatedVipCheckout(input: {
  phone: string;
  items: Array<{ productId: number; optionId: number; priceModelId?: number | null; warrantyTierId?: number | null }>;
  couponCode?: string | null;
  installmentCount: number;
  frequency: VipInstallmentFrequency;
}) {
  const eligibility = await resolveEligibility(input.phone);
  if (!eligibility.eligible) {
    throw new TRPCError({ code: "FORBIDDEN", message: eligibility.reason || "Parcelamento VIP indisponível." });
  }

  let pricing: Awaited<ReturnType<typeof resolveVipInstallmentCheckoutPricing>>;
  try {
    pricing = await resolveVipInstallmentCheckoutPricing({
      items: input.items,
      isVipCustomer: true,
      couponCode: input.couponCode,
    });
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message || "Não foi possível validar o valor da compra." });
  }

  const productRule = await getVipInstallmentProductRule(pricing.items[0].productId);
  if (!productRule.enabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este produto não está liberado para Parcelamento VIP." });
  }
  if (productRule.minOrderCents != null && pricing.totalCents < productRule.minOrderCents) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Valor abaixo do mínimo liberado para parcelamento deste produto." });
  }

  const customerMax = effectiveMaxInstallments(eligibility.config, eligibility.permission);
  const maxInstallments = Math.min(customerMax, productRule.maxInstallments ?? customerMax);
  if (maxInstallments < eligibility.config.minInstallments) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este produto não possui uma quantidade de parcelas compatível com as regras atuais." });
  }
  if (input.installmentCount < eligibility.config.minInstallments || input.installmentCount > maxInstallments) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Escolha entre ${eligibility.config.minInstallments} e ${maxInstallments} parcelas.` });
  }
  if (!effectiveFrequencyAllowed(eligibility.config, eligibility.permission, input.frequency) || !productFrequencyAllowed(productRule, input.frequency)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Periodicidade não permitida para este produto ou cliente." });
  }
  if (eligibility.permission.creditLimitCents != null && pricing.totalCents > eligibility.permission.creditLimitCents) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Valor da compra acima do limite de parcelamento liberado pelo ADM." });
  }

  const interestBps = eligibility.permission.interestBps ?? productRule.interestBps ?? eligibility.config.defaultInterestBps;
  let quote;
  try {
    quote = calculateVipInstallmentQuote({
      baseAmountCents: pricing.totalCents,
      installmentCount: input.installmentCount,
      interestBps,
      firstDueDate: getBrazilTodayForVipInstallments(),
      frequency: input.frequency,
      dailyMode: eligibility.config.dailyMode,
    });
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message || "Não foi possível calcular o parcelamento." });
  }

  return { eligibility, pricing, quote, productRule, maxInstallments, interestBps };
}
'''
    s = s.replace(router_export, '\n' + helper + router_export, 1)

quote_start = s.index('  quote: publicProcedure')
myplans_start = s.index('\n\n  myPlans: publicProcedure', quote_start)
new_block = r'''  quote: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
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
    .query(async ({ input }) => {
      const session = await requireCustomerSession(input.cpToken, input.phone);
      const validated = await buildValidatedVipCheckout({
        phone: session.phone,
        items: input.items,
        couponCode: input.couponCode,
        installmentCount: input.installmentCount,
        frequency: input.frequency,
      });
      return {
        pricing: validated.pricing,
        quote: validated.quote,
        appliedRule: {
          productId: validated.productRule.productId,
          maxInstallments: validated.maxInstallments,
          interestBps: validated.interestBps,
        },
      };
    }),

  createContract: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
      registrationId: z.number().int().positive(),
      items: z.array(z.object({
        productId: z.number().int().positive(),
        optionId: z.number().int().positive(),
        priceModelId: z.number().int().positive().nullable().optional(),
        warrantyTierId: z.number().int().positive().nullable().optional(),
      })).length(1, "Nesta primeira versão, parcele um produto por vez."),
      couponCode: z.string().trim().max(64).optional(),
      installmentCount: z.number().int().min(2).max(120),
      frequency: z.enum(["daily", "weekly", "monthly"]),
      paymentProofUrl: z.string().min(1).max(4096),
      paymentProofMime: z.string().max(128).nullable().optional(),
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

      const orderResult = await db.execute(sql`
        SELECT orderNumber, customerPhone
        FROM orderStatusHistory
        WHERE registrationId=${input.registrationId}
        ORDER BY id DESC
        LIMIT 1
      `);
      const orderRow = rowsOf<any>(orderResult)[0];
      if (!orderRow) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado para criar o Parcelamento VIP." });
      if (normalizePhone(orderRow.customerPhone) !== normalizePhone(session.phone)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Este pedido não pertence à sua sessão." });
      }
      const membershipResult = await db.execute(sql`
        SELECT id FROM vipMemberships
        WHERE customerId=${validated.eligibility.customer.id} AND status='active' AND expiresAtMs>${Date.now()}
        ORDER BY id DESC LIMIT 1
      `);
      const membership = rowsOf<any>(membershipResult)[0];
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "VIP ativo não encontrado para este contrato." });

      return createVipInstallmentContract({
        customerId: validated.eligibility.customer.id,
        membershipId: Number(membership.id),
        customerName: validated.eligibility.customer.name,
        customerPhone: session.phone,
        registrationId: input.registrationId,
        orderNumber: orderRow.orderNumber == null ? String(input.registrationId) : String(orderRow.orderNumber),
        pricing: validated.pricing,
        quote: validated.quote,
        proofUrl: input.paymentProofUrl,
        proofMimeType: input.paymentProofMime,
        createdBy: `customer:${validated.eligibility.customer.id}`,
      });
    }),

  submitProof: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
      installmentId: z.number().int().positive(),
      paymentProofUrl: z.string().min(1).max(4096),
      paymentProofMime: z.string().max(128).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await requireCustomerSession(input.cpToken, input.phone);
      const customer = await customerByPhone(session.phone);
      return submitVipInstallmentProof({
        customerId: customer.id,
        installmentId: input.installmentId,
        proofUrl: input.paymentProofUrl,
        proofMimeType: input.paymentProofMime,
      });
    }),

  adminConfirmPayment: adminProcedure
    .input(z.object({ installmentId: z.number().int().positive(), notes: z.string().max(500).nullable().optional() }))
    .mutation(async ({ input }) => confirmVipInstallmentPayment({
      installmentId: input.installmentId,
      actorId: 'admin',
      notes: input.notes,
    })),

  adminReceivables: adminProcedure.query(async () => {
    await ensureVipInstallmentInfrastructure();
    const db = (await getDb()) as any;
    const result = await db.execute(sql`
      SELECT i.id AS installmentId, i.planId, i.installmentNumber, i.amountCents, i.dueDate,
             i.paidAmountCents, i.status, i.proofUrl, i.proofMimeType, i.proofSubmittedAtMs, i.paidAtMs,
             p.orderNumber, p.productName, p.totalAmountCents, p.paidAmountCents AS planPaidAmountCents,
             p.balanceCents, p.installmentCount, p.frequency, p.status AS planStatus,
             c.id AS customerId, c.name AS customerName, c.phone AS customerPhone, c.customerNumber
      FROM vipInstallments i
      INNER JOIN vipInstallmentPlans p ON p.id=i.planId
      INNER JOIN customers c ON c.id=p.customerId
      ORDER BY FIELD(i.status, 'awaiting_confirmation', 'overdue', 'pending', 'paid'), i.dueDate ASC, i.id ASC
      LIMIT 1000
    `);
    return rowsOf<any>(result).map((row) => ({
      installmentId: Number(row.installmentId),
      planId: Number(row.planId),
      installmentNumber: Number(row.installmentNumber),
      amountCents: Number(row.amountCents || 0),
      dueDate: row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate).slice(0, 10),
      paidAmountCents: Number(row.paidAmountCents || 0),
      status: String(row.status || 'pending'),
      proofUrl: row.proofUrl == null ? null : String(row.proofUrl),
      proofMimeType: row.proofMimeType == null ? null : String(row.proofMimeType),
      proofSubmittedAtMs: row.proofSubmittedAtMs == null ? null : Number(row.proofSubmittedAtMs),
      paidAtMs: row.paidAtMs == null ? null : Number(row.paidAtMs),
      orderNumber: row.orderNumber == null ? null : String(row.orderNumber),
      productName: String(row.productName || ''),
      totalAmountCents: Number(row.totalAmountCents || 0),
      planPaidAmountCents: Number(row.planPaidAmountCents || 0),
      balanceCents: Number(row.balanceCents || 0),
      installmentCount: Number(row.installmentCount || 0),
      frequency: String(row.frequency || ''),
      planStatus: String(row.planStatus || ''),
      customerId: Number(row.customerId),
      customerName: String(row.customerName || ''),
      customerPhone: normalizePhone(row.customerPhone),
      customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
    }));
  }),'''
s = s[:quote_start] + new_block + s[myplans_start:]
router.write_text(s, encoding='utf-8')

contracts = Path('server/vipInstallmentContracts.ts')
c = contracts.read_text(encoding='utf-8')
sequence_marker = 'Pague as parcelas anteriores antes de enviar o comprovante desta parcela.'
if sequence_marker not in c:
    anchor = '    const status = String(row.status || "");\n'
    if c.count(anchor) != 1:
        raise SystemExit('proof sequence anchor mismatch')
    guard = '''    const previousOpenResult = await tx.execute(sql`\n      SELECT id, installmentNumber\n      FROM vipInstallments\n      WHERE planId=${Number(row.planId)} AND installmentNumber < ${Number(row.installmentNumber)} AND status <> 'paid'\n      ORDER BY installmentNumber ASC\n      LIMIT 1\n    `);\n    if (rowsOf<any>(previousOpenResult)[0]) {\n      throw new TRPCError({ code: "CONFLICT", message: "Pague as parcelas anteriores antes de enviar o comprovante desta parcela." });\n    }\n'''
    c = c.replace(anchor, guard + anchor, 1)
contracts.write_text(c, encoding='utf-8')
