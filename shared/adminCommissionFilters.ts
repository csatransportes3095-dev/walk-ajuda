/** Exclusivamente apresentação do painel ADM; não modifica pagamentos. */
export type AdminCommissionFilter = "all" | "a_liberar" | "liberado" | "paid" | "invalid";
export type AdminCommissionRow = {
  commissionPaid?: number | boolean | null;
  referralInvalid?: boolean | number | null;
  commissionStatus?: string | null;
  frozenCommissionRule?: string | null;
  promotionNoCommission?: boolean | null;
  paymentState?: string | null;
  manualStatus?: string | null;
  commissionValue?: number | null;
};
/** Uma e apenas uma categoria por indicação. */
export function classifyAdminCommission(row: AdminCommissionRow): Exclude<AdminCommissionFilter,"all"> {
  if (row.promotionNoCommission || row.frozenCommissionRule === "promotion_no_commission" ||
      Boolean(row.referralInvalid) || ["nao_elegivel","cancelada"].includes(String(row.commissionStatus||"")))
    return "invalid";
  if (row.commissionPaid === 1 || row.commissionPaid === true || row.commissionStatus === "paga")
    return "paid";
  if (row.manualStatus === "liberado" || (row.manualStatus !== "a_liberar" && row.paymentState === "liberada"))
    return "liberado";
  return "a_liberar";
}
export const ADMIN_COMMISSION_FILTER_LABELS: Record<AdminCommissionFilter,string> = {
 all:"Todas",a_liberar:"A liberar",liberado:"Liberado",paid:"Já pagas",invalid:"Inválidas / Promoção",
};
export function adminCommissionTotals<T extends AdminCommissionRow>(rows: readonly T[]) {
  const counts={all:rows.length,a_liberar:0,liberado:0,paid:0,invalid:0};
  const values={a_liberar:0,liberado:0,paid:0,invalid:0};
  for(const row of rows) {
    const category=classifyAdminCommission(row);
    counts[category]++;
    if(category!=="invalid") values[category]+=Math.max(0,Number(row.commissionValue)||0);
  }
  return {counts,values};
}
