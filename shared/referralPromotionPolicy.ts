import { parseBrazilMoney } from "./vipPricing";

/** Regra congelada no primeiro pedido, independente de promoções futuras. */
export const REFERRAL_PROMOTION_RULE = "promotion_no_commission" as const;
export const REFERRAL_PROMOTION_LABEL = "🏷️ PROMOÇÃO — SEM COMISSÃO" as const;

export type PromotionalPriceSnapshot = {
  price?: string | null;
  originalPrice?: string | null;
  promoEndsAt?: number | null;
};

/** Somente preço promocional oficial ativo, nunca preço fornecido pelo cliente. */
export function hasActiveProductPromotion(
  item: PromotionalPriceSnapshot | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!item) return false;
  const finalPrice = parseBrazilMoney(item.price);
  const originalPrice = parseBrazilMoney(item.originalPrice);
  const expiry = Number(item.promoEndsAt || 0);
  return Number.isFinite(finalPrice) && Number.isFinite(originalPrice)
    && originalPrice > 0 && finalPrice >= 0 && finalPrice < originalPrice
    && (!expiry || (Number.isFinite(expiry) && expiry > nowMs));
}

/** Uma compra congelada como promoção nunca gera uma comissão posterior. */
export function isPromotionWithoutCommission(
  commissionRule: unknown,
): boolean {
  return String(commissionRule || "") === REFERRAL_PROMOTION_RULE;
}
