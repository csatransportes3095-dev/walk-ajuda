import { and, eq } from "drizzle-orm";
import { customers, products, productOptions } from "../drizzle/schema";
import { getDb, getSetting, listWarrantyTiers } from "./db";
import { requireCustomerSession } from "./customerSession";
import { getActiveOptionPriceModelsForPromotion, checkOptionPriceModelCheckoutAccess } from "./routers/optionPriceModels";
import { parseGlobalPromotionConfig, globalPromotionOverridesIndividual, calculateGlobalPromotionPrice, globalPromotionPrice } from "../shared/globalPromotion";
import { parseBrazilMoneyToCents } from "../shared/vipCheckoutPricing";
import { validraAmount } from "./validraPay";

type Selection = { cpToken?: string; phone?: string; productId?: number; optionId?: number; priceModelId?: number; warrantyTierId?: number; couponCode?: string; cartGroupId?: string; cartItems?: string; cartTotal?: number; cartCouponCode?: string; cartCouponDiscount?: number; cartItemCount?: number; resellerDiscountApplied?: number; thirdPartyName?: string; thirdPartyPhone?: string; vipInstallmentCheckoutToken?: string; botSubmissionKey?: string };
export function assertSupportedValidraSelection(input: Selection) {
  // Fail closed until grouped/cart consumption, coupon reservation,
  // reseller accounting and installment settlement are integrated.
  if (input.couponCode || input.cartGroupId || input.cartItems || input.cartTotal != null || input.cartCouponCode || input.cartCouponDiscount != null || (input.cartItemCount ?? 1) > 1 ||
      input.resellerDiscountApplied || input.thirdPartyName || input.thirdPartyPhone || input.vipInstallmentCheckoutToken || input.botSubmissionKey) {
    throw new Error("validra_checkout_type_not_ready");
  }
  if (!input.productId || !input.optionId) throw new Error("validra_selection_required");
}

export async function resolveValidraSingleCheckout(input: Selection, vip: boolean) {
  assertSupportedValidraSelection(input);
  const session = await requireCustomerSession(input.cpToken, input.phone);
  const db = await getDb();
  if (!db) throw new Error("validra_database_unavailable");
  const [customer] = await db.select().from(customers).where(eq(customers.phone, session.phone)).limit(1);
  if (!customer || customer.blocked || customer.deletedAt || customer.isReseller) throw new Error("validra_customer_not_eligible");
  const [product] = await db.select().from(products).where(and(eq(products.id, input.productId!), eq(products.isActive, 1))).limit(1);
  const [option] = await db.select().from(productOptions).where(and(eq(productOptions.id, input.optionId!), eq(productOptions.productId, input.productId!), eq(productOptions.isActive, 1))).limit(1);
  if (!product || !option) throw new Error("validra_selection_unavailable");
  const models = await getActiveOptionPriceModelsForPromotion([option.id]);
  const tiers = (await listWarrantyTiers(option.id)).filter(row => row.isActive === 1);
  const model = models.find(row => row.id === input.priceModelId);
  const tier = tiers.find(row => row.id === input.warrantyTierId);
  if ((input.priceModelId && !model) || (input.warrantyTierId && !tier) || (models.length && !model) || (!model && tiers.length && !tier) || (model && tier)) throw new Error("validra_selection_unavailable");
  const promo = parseGlobalPromotionConfig(await getSetting("global_promotion_config_v1"));
  const source = model || tier || option;
  let price = globalPromotionPrice(source, promo);
  if (model) {
    const access = await checkOptionPriceModelCheckoutAccess(model.id, vip);
    if (!access.allowed || !access.effectivePrice) throw new Error("validra_selection_unavailable");
    price = globalPromotionOverridesIndividual(promo) ? calculateGlobalPromotionPrice(model, promo).final : access.effectivePrice;
  }
  const amountCents = parseBrazilMoneyToCents(price);
  validraAmount(amountCents);
  if(amountCents>2147483647)throw new Error("validra_checkout_type_not_ready");
  const optionLabel = option.label + (model ? " — " + model.label : "") + (tier ? " - Garantia: " + (tier.warrantyValue > 0 ? tier.warrantyValue + " " + tier.warrantyType + (tier.warrantyLabel ? " " + tier.warrantyLabel : "") : tier.warrantyLabel || tier.warrantyType) : "");
  return { customerId: customer.id, phone: session.phone, amountCents, service: product.name, nameOption: optionLabel, price: "R$ " + validraAmount(amountCents).replace(".", ",") };
}
