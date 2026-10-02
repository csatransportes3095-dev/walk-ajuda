export type AdminOrderedHomeButton = {
  vipOnly?: number | boolean | null;
};

/**
 * The backend already returns homeButtons ordered by sortOrder.
 * Keep that exact order; only remove VIP-only entries from the public home.
 */
export function keepAdminHomeButtonOrder<T extends AdminOrderedHomeButton>(buttons: readonly T[]): T[] {
  return buttons.filter((button) => Number(button.vipOnly || 0) !== 1);
}
