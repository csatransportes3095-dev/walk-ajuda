import {
  applyVipBenefitToPrice,
  formatBrazilMoney,
  hasVipBenefit,
  normalizeVipAccessMode,
  parseBrazilMoney,
  vipBenefitText,
  type VipPriceModelLike,
} from "@shared/vipPricing";

type BotVipPriceModel = VipPriceModelLike & { price: string };

export type ColombiaBotVipComparison = {
  normalPrice: string | null;
  vipPrice: string;
  normalAvailable: boolean;
  isVipCustomer: boolean;
  vipOnly: boolean;
  hasVipDiscount: boolean;
  savingText: string | null;
  benefitText: string;
  promoOverrides: boolean;
  vipHighlightText: string;
};

/**
 * A vitrine do ColombiaBot apenas exibe os valores definidos no ADM.
 * O preço cobrado continua sendo calculado pelo fluxo existente e validado no servidor.
 */
export function getColombiaBotVipComparison(
  model: BotVipPriceModel,
  isVipCustomer: boolean,
  promoOverrides: boolean,
  effectivePrice: string,
): ColombiaBotVipComparison | null {
  const base = String(model.price || "").trim();
  if (!base || parseBrazilMoney(base) <= 0) return null;

  const mode = normalizeVipAccessMode(model.vipAccessMode);
  const vipOnly = mode === "vip_only";
  const normalAvailable = !vipOnly;
  // Uma promoção global que substitui os descontos individuais vale igualmente
  // para clientes normais e VIP, sem mostrar economia VIP inexistente.
  const normalPrice = promoOverrides ? String(effectivePrice || base) : base;
  const vipPrice = promoOverrides ? String(effectivePrice || base) : applyVipBenefitToPrice(base, model, true);
  const saving = promoOverrides || !hasVipBenefit(model)
    ? 0
    : Math.max(0, parseBrazilMoney(normalPrice) - parseBrazilMoney(vipPrice));

  return {
    normalPrice: normalAvailable ? normalPrice : null,
    vipPrice,
    normalAvailable,
    isVipCustomer,
    vipOnly,
    hasVipDiscount: saving > 0,
    savingText: saving > 0 ? formatBrazilMoney(saving) : null,
    benefitText: promoOverrides ? "" : vipBenefitText(model),
    promoOverrides,
    vipHighlightText: String(model.vipHighlightText || "").trim() || "VIP",
  };
}
