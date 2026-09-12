from pathlib import Path

path = Path("server/routers/vipInstallments.ts")
text = path.read_text(encoding="utf-8")

import_anchor = 'import { isVipMemberByPhone } from "./vipMemberships";'
pricing_import = 'import { resolveVipInstallmentCheckoutPricing } from "../vipInstallmentPricing";'
rules_import = 'import { getVipInstallmentProductRule, listVipInstallmentProductRules, saveVipInstallmentProductRule } from "../vipInstallmentProductRules";'

if pricing_import not in text:
    if text.count(import_anchor) != 1:
        raise SystemExit(f"Unexpected VIP import anchor count: {text.count(import_anchor)}")
    text = text.replace(import_anchor, import_anchor + "\n" + pricing_import + "\n" + rules_import, 1)

if text.count(pricing_import) != 1 or text.count(rules_import) != 1:
    raise SystemExit("VIP pricing/product-rule imports are not unique")

helper_marker = "function getBrazilTodayForVipInstallments()"
if helper_marker not in text:
    router_anchor = "\n\nexport const vipInstallmentsRouter = router({"
    if text.count(router_anchor) != 1:
        raise SystemExit(f"Unexpected router export anchor count: {text.count(router_anchor)}")
    helpers = r'''
function getBrazilTodayForVipInstallments() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function productFrequencyAllowed(
  rule: Awaited<ReturnType<typeof getVipInstallmentProductRule>>,
  frequency: VipInstallmentFrequency,
) {
  if (frequency === "daily") return rule.allowDaily ?? true;
  if (frequency === "weekly") return rule.allowWeekly ?? true;
  return rule.allowMonthly ?? true;
}
'''
    text = text.replace(router_anchor, "\n" + helpers + router_anchor, 1)

product_endpoint_marker = "  adminProductRules: adminProcedure.query"
if product_endpoint_marker not in text:
    config_anchor = "  adminConfig: adminProcedure.query(async () => getVipInstallmentConfig()),\n"
    if text.count(config_anchor) != 1:
        raise SystemExit(f"Unexpected adminConfig anchor count: {text.count(config_anchor)}")
    product_endpoints = r'''

  adminProductRules: adminProcedure.query(async () => listVipInstallmentProductRules()),

  setProductRule: adminProcedure
    .input(z.object({
      productId: z.number().int().positive(),
      enabled: z.boolean(),
      minOrderCents: z.number().int().positive().max(100_000_000_000).nullable().optional(),
      maxInstallments: z.number().int().min(2).max(120).nullable().optional(),
      interestBps: z.number().int().min(0).max(100_000).nullable().optional(),
      allowDaily: z.boolean().nullable().optional(),
      allowWeekly: z.boolean().nullable().optional(),
      allowMonthly: z.boolean().nullable().optional(),
      notes: z.string().max(255).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await saveVipInstallmentProductRule({
          productId: input.productId,
          enabled: input.enabled,
          minOrderCents: input.minOrderCents ?? null,
          maxInstallments: input.maxInstallments ?? null,
          interestBps: input.interestBps ?? null,
          allowDaily: input.allowDaily ?? null,
          allowWeekly: input.allowWeekly ?? null,
          allowMonthly: input.allowMonthly ?? null,
          notes: input.notes ?? null,
        });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message || "Não foi possível salvar a regra do produto." });
      }
    }),
'''
    text = text.replace(config_anchor, config_anchor + product_endpoints, 1)

quote_start = text.index("  quote: publicProcedure")
myplans_start = text.index("\n\n  myPlans: publicProcedure", quote_start)
new_quote = r'''  quote: publicProcedure
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
      const eligibility = await resolveEligibility(session.phone);
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
      try {
        const quote = calculateVipInstallmentQuote({
          baseAmountCents: pricing.totalCents,
          installmentCount: input.installmentCount,
          interestBps,
          firstDueDate: getBrazilTodayForVipInstallments(),
          frequency: input.frequency,
          dailyMode: eligibility.config.dailyMode,
        });
        return {
          pricing,
          quote,
          appliedRule: {
            productId: productRule.productId,
            maxInstallments,
            interestBps,
          },
        };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message || "Não foi possível calcular o parcelamento." });
      }
    }),'''

current_quote = text[quote_start:myplans_start]
if "baseAmountCents: z.number()" in current_quote or "items: z.array" not in current_quote:
    text = text[:quote_start] + new_quote + text[myplans_start:]
elif current_quote.strip() != new_quote.strip():
    raise SystemExit("Quote endpoint already changed in an unexpected way")

if "baseAmountCents: z.number().int().positive()" in text[text.index("  quote: publicProcedure"):text.index("\n\n  myPlans: publicProcedure")]:
    raise SystemExit("Unsafe browser-provided baseAmountCents remains in quote endpoint")

path.write_text(text, encoding="utf-8")
print("VIP product rules and server-side quote hardening applied")
