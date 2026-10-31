import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { resolveLegacyCommissionValue, type CommissionCandidate } from "./commissionResolver";
import { resolveReferralCommissionState } from "../shared/referralCommissionPolicy";

export type H2AutoReferralItem = {
  registrationId: number;
  orderNumber: number | null;
  customerName: string;
  orderStatus: string;
  commissionValue: number;
  commissionState: string;
  commissionLabel: string;
  promotionNoCommission?: boolean;
};

function itemFromLegacy(row: any, candidates: CommissionCandidate[]): H2AutoReferralItem {
  const resolved = resolveLegacyCommissionValue({
    serviceName: row.serviceName, serviceOption: row.serviceOption, candidates,
  });
  const status = resolveReferralCommissionState({
    paid: Number(row.commissionPaid || 0) === 1,
    invalid: Number(row.referralInvalid || 0) === 1,
    appointmentStatus: row.appointmentStatus,
    appointmentConfirmedAt: row.appointmentConfirmedAt,
    latestOrderStatus: row.latestOrderStatus,
    latestOrderStatusLabel: row.latestOrderStatusLabel,
  });
  return {
    registrationId: Number(row.registrationId),
    orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
    customerName: String(row.referredName || "Cliente").slice(0, 90),
    orderStatus: String(row.latestOrderStatusLabel || row.latestOrderStatus || "Pedido recebido").slice(0, 100),
    commissionValue: Math.max(0, resolved.value),
    commissionState: status.state,
    commissionLabel: status.label,
  };
}

/** Frozen records always take precedence. Legacy orders can be shown without
 * inventing a frozen commission or changing its payment state.
 */
export function mergeH2AutoReferralItems(
  frozen: H2AutoReferralItem[], legacy: H2AutoReferralItem[],
): H2AutoReferralItem[] {
  const ids = new Set<number>();
  const merged: H2AutoReferralItem[] = [];
  for (const item of [...frozen, ...legacy]) {
    if (!Number.isSafeInteger(item.registrationId) || item.registrationId <= 0 ||
        ids.has(item.registrationId)) continue;
    ids.add(item.registrationId);
    merged.push(item);
  }
  return merged;
}

/** Match the administrative commission panel's legacy eligibility: referred
 * customer has referrerPhone and the registration is the FIRST with an order.
 * Only returns referrals of the currently OTP-authenticated referrer phone.
 */
export async function loadH2AutoLegacyReferrals(
  verifiedReferrerPhone: string,
): Promise<H2AutoReferralItem[]> {
  const phone = String(verifiedReferrerPhone).replace(/\D/g, "").slice(-11);
  if (!/^\d{11}$/.test(phone)) return [];
  const db = await getDb();
  if (!db) throw new Error("db_unavailable");
  const [referralsResult, candidatesResult] = await Promise.all([
    db.execute(sql`SELECT acp.id AS registrationId,c.name AS referredName,
      (SELECT h.orderNumber FROM orderStatusHistory h WHERE h.registrationId=acp.id
        AND h.orderNumber IS NOT NULL ORDER BY h.createdAt ASC,h.id ASC LIMIT 1) AS orderNumber,
      (SELECT h.status FROM orderStatusHistory h WHERE h.registrationId=acp.id
        ORDER BY h.createdAt DESC,h.id DESC LIMIT 1) AS latestOrderStatus,
      (SELECT st.label FROM orderStatusHistory h
        LEFT JOIN orderStatusTypes st ON st.${sql.identifier("key")}=h.status
        WHERE h.registrationId=acp.id ORDER BY h.createdAt DESC,h.id DESC LIMIT 1) AS latestOrderStatusLabel,
      (SELECT h.serviceName FROM orderStatusHistory h WHERE h.registrationId=acp.id
        AND h.serviceName IS NOT NULL AND h.serviceName!=''
        ORDER BY h.createdAt ASC,h.id ASC LIMIT 1) AS serviceName,
      (SELECT h.serviceOption FROM orderStatusHistory h WHERE h.registrationId=acp.id
        AND h.serviceOption IS NOT NULL AND h.serviceOption!=''
        ORDER BY h.createdAt ASC,h.id ASC LIMIT 1) AS serviceOption,
      COALESCE((SELECT MAX(h.commissionPaid) FROM orderStatusHistory h
        WHERE h.registrationId=acp.id),0) AS commissionPaid,
      COALESCE((SELECT MAX(h.referralInvalid) FROM orderStatusHistory h
        WHERE h.registrationId=acp.id),0) AS referralInvalid,
      (SELECT sa.status FROM scheduleAppointments sa WHERE sa.registrationId=acp.id
        AND sa.subOrderIndex=0 ORDER BY sa.id DESC LIMIT 1) AS appointmentStatus,
      (SELECT sa.confirmedAt FROM scheduleAppointments sa WHERE sa.registrationId=acp.id
        AND sa.subOrderIndex=0 ORDER BY sa.id DESC LIMIT 1) AS appointmentConfirmedAt
      FROM customers c INNER JOIN accessCodePhones acp
        ON RIGHT(REGEXP_REPLACE(c.phone,'[^0-9]',''),11)=
           RIGHT(REGEXP_REPLACE(acp.phone,'[^0-9]',''),11)
      WHERE c.referredByPhone IS NOT NULL AND TRIM(c.referredByPhone)!=''
        AND RIGHT(REGEXP_REPLACE(c.referredByPhone,'[^0-9]',''),11)=${phone}
        AND EXISTS (SELECT 1 FROM orderStatusHistory h WHERE h.registrationId=acp.id)
        AND acp.id=(SELECT MIN(other.id) FROM accessCodePhones other
          WHERE RIGHT(REGEXP_REPLACE(other.phone,'[^0-9]',''),11)=
                RIGHT(REGEXP_REPLACE(acp.phone,'[^0-9]',''),11)
            AND EXISTS (SELECT 1 FROM orderStatusHistory h WHERE h.registrationId=other.id))
        AND NOT EXISTS (SELECT 1 FROM referralCommissionAttributions frozen
          WHERE frozen.registrationId=acp.id)
      ORDER BY acp.id DESC LIMIT 500`),
    db.execute(sql`SELECT po.id,po.productId,p.name AS productName,
      po.label AS optionLabel,po.commissionValue
      FROM productOptions po LEFT JOIN products p ON p.id=po.productId
      WHERE po.commissionValue>0`),
  ]);
  const referrals = (referralsResult[0] || []) as unknown as any[];
  const candidates = ((candidatesResult[0] || []) as unknown as any[]).map(row => ({
    id: Number(row.id),
    productId: Number(row.productId),
    productName: row.productName ? String(row.productName) : null,
    optionLabel: row.optionLabel ? String(row.optionLabel) : null,
    commissionValue: Number(row.commissionValue || 0),
  }));
  return referrals.map(row => itemFromLegacy(row, candidates));
}
