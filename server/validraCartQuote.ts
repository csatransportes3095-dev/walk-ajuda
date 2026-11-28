import { and, eq } from "drizzle-orm";
import { customers, products, productOptions } from "../drizzle/schema";
import { getDb, getSetting, listWarrantyTiers, validateCoupon } from "./db";
import { requireCustomerSession } from "./customerSession";
import { getActiveOptionPriceModelsForPromotion } from "./routers/optionPriceModels";
import { isVipMemberByPhone } from "./routers/vipMemberships";
import { parseGlobalPromotionConfig, globalPromotionOverridesIndividual, globalPromotionPrice } from "../shared/globalPromotion";
import { applyVipBenefitToPrice, isVipOnlyLocked } from "../shared/vipPricing";
import { hasActiveProductPromotion } from "../shared/referralPromotionPolicy";
import { parseBrazilMoneyToCents } from "../shared/vipCheckoutPricing";
import { calculateValidraCartTotals } from "./validraCartTotals";

export type CartSelection = { productId: number; optionId: number; priceModelId?: number; warrantyTierId?: number };
export type ValidraCouponQuote = { id: number; code: string; type: "percentage"|"fixed"; value: number; productId: number|null; optionId: number|null };
export type ValidraCartQuote = Awaited<ReturnType<typeof resolveValidraCartQuote>>;

/** All prices and commercial identity are resolved on the server. Caller
 * must also validate documents, questions, referrals and product access. */
export async function resolveValidraCartQuote(input: { cpToken: string; phone?: string; items: CartSelection[]; couponCode?: string }) {
  if (!input.items.length || input.items.length>30) throw new Error("validra_invalid_cart");
  const { phone } = await requireCustomerSession(input.cpToken,input.phone);
  const db = await getDb();
  if (!db) throw new Error("validra_database_unavailable");
  const [customer] = await db.select().from(customers).where(eq(customers.phone,phone)).limit(1);
  if (!customer || customer.blocked || customer.deletedAt) throw new Error("validra_customer_not_eligible");
  const vip = await isVipMemberByPhone(phone);
  const promo = parseGlobalPromotionConfig(await getSetting("global_promotion_config_v1"));
  const now = Date.now();
  const globalPromotion = globalPromotionOverridesIndividual(promo,now);
  const items = [];
  for (const selection of input.items) {
    if (![selection.productId,selection.optionId,...[selection.priceModelId,selection.warrantyTierId].filter(v=>v!==undefined)].every(v=>Number.isSafeInteger(v)&&Number(v)>0)) throw new Error("validra_invalid_cart");
    const [product] = await db.select().from(products).where(and(eq(products.id,selection.productId),eq(products.isActive,1))).limit(1);
    const [option] = await db.select().from(productOptions).where(and(eq(productOptions.id,selection.optionId),eq(productOptions.productId,selection.productId),eq(productOptions.isActive,1))).limit(1);
    if (!product || !option) throw new Error("validra_selection_unavailable");
    const models=await getActiveOptionPriceModelsForPromotion([option.id]);
    const tiers=(await listWarrantyTiers(option.id)).filter(t=>t.isActive===1);
    const model=models.find(m=>m.id===selection.priceModelId), tier=tiers.find(t=>t.id===selection.warrantyTierId);
    if ((selection.priceModelId&&!model)||(selection.warrantyTierId&&!tier)||(models.length&&!model)||(!model&&tiers.length&&!tier)||(model&&tier)||isVipOnlyLocked(model,vip)) throw new Error("validra_selection_unavailable");
    const source=model||tier||option;
    const baseCents=parseBrazilMoneyToCents(model&&!globalPromotion?applyVipBenefitToPrice(model.price,model,vip):globalPromotionPrice(source,promo,now));
    const productPercent=Number(product.resellerDiscount||0);
    const resellerEligible=Boolean(customer.isReseller&&!globalPromotion&&!hasActiveProductPromotion(source,now));
    const resellerPercent=resellerEligible ? productPercent>0?productPercent:customer.resellerDiscountType==="percent"?Number(customer.resellerDiscountValue||0):0 : 0;
    const serviceOption=option.label+(model?" — "+model.label:"")+(tier?" - Garantia: "+(tier.warrantyValue>0?tier.warrantyValue+" "+tier.warrantyType+(tier.warrantyLabel?" "+tier.warrantyLabel:""):tier.warrantyLabel||tier.warrantyType):"");
    items.push({...selection,serviceName:product.name,serviceOption,baseCents,resellerEligible,resellerPercent,promotional:globalPromotion||hasActiveProductPromotion(source,now)});
  }
  let coupon: ValidraCouponQuote|null=null;
  if (!globalPromotion&&input.couponCode?.trim()) {
    const checked=await validateCoupon(input.couponCode.trim().toUpperCase(),items.map(i=>i.productId),items.map(i=>i.optionId));
    if (!checked.valid||!checked.coupon||!checked.discountType||checked.discountValue==null) throw new Error("validra_coupon_unavailable");
    coupon={id:checked.coupon.id,code:checked.coupon.code,type:checked.discountType,value:checked.discountValue,productId:checked.productId??null,optionId:checked.optionId??null};
  }
  const totals=calculateValidraCartTotals(items,{globalPromotion,coupon,resellerFixedCents:customer.isReseller&&customer.resellerDiscountType==="fixed"?parseBrazilMoneyToCents(customer.resellerDiscountValue):0});
  return {customerId:customer.id,phone,coupon,globalPromotion,subtotalCents:totals.subtotalCents,couponCents:totals.couponCents,resellerCents:totals.resellerCents,amountCents:totals.amountCents,items:items.map((item,i)=>({...item,...totals.lines[i],promotional:item.promotional||Boolean(coupon)}))};
}
