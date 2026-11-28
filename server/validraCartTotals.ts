import { applyCouponDiscountToCents, type CheckoutCouponDiscount } from "../shared/vipCheckoutPricing";
import { validraAmount } from "./validraPay";

export type CartPriceLine = { baseCents: number; resellerEligible?: boolean; resellerPercent?: number };
export type CartDiscountRules = { globalPromotion: boolean; coupon?: CheckoutCouponDiscount | null; resellerFixedCents?: number };

function sum(values: number[]) { return values.reduce((a,b) => a+b, 0); }

/** Largest remainder allocation: exact centavo totals, stable ties by cart order. */
export function allocateValidraDiscount(weights: number[], discount: number): number[] {
  if (!weights.length || weights.some(n => !Number.isSafeInteger(n) || n < 0) || !Number.isSafeInteger(discount) || discount < 0) throw new Error("validra_invalid_discount");
  const total = sum(weights);
  if (!Number.isSafeInteger(total) || discount > total) throw new Error("validra_invalid_discount");
  if (total === 0) return weights.map(() => 0);
  const parts = weights.map((weight, index) => {
    const numerator = BigInt(weight) * BigInt(discount);
    return { index, cents: Number(numerator / BigInt(total)), remainder: numerator % BigInt(total) };
  });
  const remaining = discount - sum(parts.map(p => p.cents));
  const ranked = [...parts].sort((a,b) => a.remainder === b.remainder ? a.index-b.index : a.remainder > b.remainder ? -1 : 1);
  for (let i=0;i<remaining;i++) ranked[i].cents++;
  return parts.map(p => p.cents);
}

export function calculateValidraCartTotals(items: CartPriceLine[], rules: CartDiscountRules) {
  if (!items.length || items.length > 30 || items.some(i => !Number.isSafeInteger(i.baseCents) || i.baseCents <= 0)) throw new Error("validra_invalid_cart");
  const subtotalCents = sum(items.map(i => i.baseCents));
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 100_000_000_000) throw new Error("validra_invalid_cart");
  const couponCents = !rules.globalPromotion && rules.coupon
    ? applyCouponDiscountToCents(subtotalCents, rules.coupon).discountCents : 0;
  const couponParts = allocateValidraDiscount(items.map(i => i.baseCents), couponCents);
  const percentParts = items.map((item,index) => {
    if (rules.globalPromotion || !item.resellerEligible) return 0;
    const pct = Number(item.resellerPercent || 0);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("validra_invalid_discount");
    return Math.min(item.baseCents-couponParts[index], applyCouponDiscountToCents(item.baseCents,{type:"percentage",value:pct}).discountCents);
  });
  // A global fixed reseller discount is applied once per cart, and only to
  // eligible items without a product-specific percentage.
  const weights = items.map((item,index) => !rules.globalPromotion && item.resellerEligible && !item.resellerPercent
    ? item.baseCents-couponParts[index]-percentParts[index] : 0);
  const fixed = rules.globalPromotion ? 0 : Number(rules.resellerFixedCents || 0);
  if (!Number.isSafeInteger(fixed) || fixed < 0) throw new Error("validra_invalid_discount");
  const fixedParts = allocateValidraDiscount(weights, Math.min(fixed,sum(weights)));
  const lines = items.map((item,index) => ({
    baseCents: item.baseCents, couponCents: couponParts[index],
    resellerCents: percentParts[index]+fixedParts[index],
    amountCents: item.baseCents-couponParts[index]-percentParts[index]-fixedParts[index],
  }));
  const resellerCents = sum(lines.map(l=>l.resellerCents));
  const amountCents = sum(lines.map(l=>l.amountCents));
  validraAmount(amountCents); // A zero/under-minimum cart must not create a charge.
  return { subtotalCents, couponCents, resellerCents, amountCents, lines };
}
