export type VipAccessMode = "all" | "benefit" | "vip_only";
export type VipDiscountType = "percentage" | "fixed";

export type VipPriceModelLike = {
  vipAccessMode?: VipAccessMode | string | null;
  vipDiscountType?: VipDiscountType | string | null;
  vipDiscountValue?: number | string | null;
  vipHighlight?: number | boolean | null;
  vipHighlightText?: string | null;
};

export function normalizeVipAccessMode(value: unknown): VipAccessMode {
  return value === "benefit" || value === "vip_only" ? value : "all";
}

export function isVipOnlyLocked(model: VipPriceModelLike | null | undefined, isVipCustomer: boolean): boolean {
  return normalizeVipAccessMode(model?.vipAccessMode) === "vip_only" && !isVipCustomer;
}

export function hasVipBenefit(model: VipPriceModelLike | null | undefined): boolean {
  const mode = normalizeVipAccessMode(model?.vipAccessMode);
  const value = Number(model?.vipDiscountValue || 0);
  return (mode === "benefit" || mode === "vip_only") && Number.isFinite(value) && value > 0;
}

export function isVipHighlighted(model: VipPriceModelLike | null | undefined): boolean {
  return Boolean(model?.vipHighlight) && normalizeVipAccessMode(model?.vipAccessMode) !== "all";
}

export function parseBrazilMoney(value: string | null | undefined): number {
  const raw = String(value || "").trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!raw) return 0;
  if (raw.includes(",")) {
    const normalized = raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
    return Number(normalized) || 0;
  }
  return Number(raw.replace(/[^0-9.-]/g, "")) || 0;
}

export function formatBrazilMoney(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `R$ ${safe.toFixed(2).replace(".", ",")}`;
}

export function applyVipBenefitToPrice(price: string | null | undefined, model: VipPriceModelLike | null | undefined, isVipCustomer: boolean): string {
  const original = String(price || "").trim();
  if (!original || !isVipCustomer || !hasVipBenefit(model)) return original;
  const numeric = parseBrazilMoney(original);
  if (numeric <= 0) return original;
  const discountValue = Number(model?.vipDiscountValue || 0);
  const discountType = model?.vipDiscountType === "fixed" ? "fixed" : "percentage";
  const finalValue = discountType === "fixed"
    ? numeric - discountValue
    : numeric - (numeric * discountValue / 100);
  return formatBrazilMoney(finalValue);
}

export function vipBenefitText(model: VipPriceModelLike | null | undefined): string {
  if (!hasVipBenefit(model)) return "";
  const value = Number(model?.vipDiscountValue || 0);
  return model?.vipDiscountType === "fixed"
    ? `${formatBrazilMoney(value)} OFF VIP`
    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% OFF VIP`;
}
