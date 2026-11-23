/** Um cupom antigo (sem productId) continua valendo para todos os produtos. */
export function couponAppliesToProductIds(
  couponProductId: number | null | undefined,
  selectedProductIds: readonly number[] | null | undefined,
): boolean {
  if (couponProductId == null) return true;
  return !!selectedProductIds?.length && selectedProductIds.every(id => id === couponProductId);
}

export function couponScopeLabel(productName: string | null | undefined): string {
  return productName ? `Válido exclusivamente para: ${productName}` : "Válido para todos os produtos";
}
