/** Um cupom antigo (sem productId) continua valendo para todos os produtos. */
export function couponAppliesToProductIds(
  couponProductId: number | null | undefined,
  selectedProductIds: readonly number[] | null | undefined,
): boolean {
  if (couponProductId == null) return true;
  return !!selectedProductIds?.length && selectedProductIds.every(id => id === couponProductId);
}

export function couponAppliesToOptionIds(
  couponOptionId: number | null | undefined,
  selectedOptionIds: readonly number[] | null | undefined,
): boolean {
  if (couponOptionId == null) return true;
  return !!selectedOptionIds?.length && selectedOptionIds.every(id => id === couponOptionId);
}

export function couponScopeLabel(productName: string | null | undefined, optionName?: string | null): string {
  if (!productName) return "Válido para todos os produtos";
  return optionName
    ? `Válido exclusivamente para: ${productName} — ${optionName}`
    : `Válido para: ${productName} (todas as opções)`;
}
