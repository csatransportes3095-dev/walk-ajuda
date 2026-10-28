import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { normalizeCustomerPhone } from "./customerAccess";
import { isOwnSiteEmailAuthorized } from "./siteAccessOwnCodes";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const hour = 60 * 60 * 1000;

/**
 * Reuse the *already verified* initial H2 AUTO customer session for read-only
 * order/referral queries. Both endpoints use the same paired device and the
 * exact same opaque conversationId as the initial access gate.
 *
 * No phone, account ID or 'verified=true' from an Android request is trusted.
 * A session must remain active, match the customer still on file, and retain
 * the approved email/phone bindings. Invalid sessions never expose data.
 */
export async function getH2AutoVerifiedAccessCustomer(
  deviceId: string, conversationId: string, now = Date.now(),
): Promise<{
  customer_id: number;
  customer_phone: string;
  customer_created: Date | string;
  current_email: string;
} | null> {
  if (!/^[a-f0-9]{24}$/.test(deviceId) || !/^[a-f0-9]{64}$/.test(conversationId))
    return null;

  const db = await getDb();
  if (!db) throw new Error("db_unavailable");
  const sessionId = sha256(deviceId + "|" + conversationId);
  const result: any = await db.execute(sql`SELECT a.customer_id, a.customer_phone_hash,
    a.customer_email_hash, a.updated_at, a.expires_at,
    c.phone AS customer_phone, c.email AS current_email,
    c.createdAt AS customer_created,
    CAST(JSON_UNQUOTE(JSON_EXTRACT(d.config_json,'$.identificationSessionHours'))
      AS UNSIGNED) AS session_hours
    FROM h2_auto_access_sessions a
    INNER JOIN customers c ON c.id=a.customer_id
    INNER JOIN h2_auto_devices d ON d.id=a.device_id
    WHERE a.id=${sessionId} AND a.device_id=${deviceId}
      AND a.stage IN ('customer','customer_menu')
      AND a.expires_at>${now}
      AND a.updated_at<=${now}
      AND c.deletedAt IS NULL AND COALESCE(c.blocked,0)=0
      LIMIT 1`);
  const found = (result[0] || [])[0] as any;
  if (!found?.customer_id || !found.current_email || !found.customer_phone) return null;
  const configured = Number(found.session_hours);
  const lifetimeHours = Number.isInteger(configured) && configured >= 1 && configured <= 720
    ? configured : 24;
  const issued = Number(found.updated_at);
  if (!Number.isFinite(issued) || now - issued < 0 || now - issued >= lifetimeHours * hour)
    return null;
  const currentEmail = String(found.current_email);
  const currentPhone = normalizeCustomerPhone(String(found.customer_phone));
  if (!currentPhone ||
    sha256(currentEmail.trim().toLowerCase()) !== String(found.customer_email_hash) ||
    sha256(String(currentPhone)) !== String(found.customer_phone_hash)) return null;
  if (!(await isOwnSiteEmailAuthorized(db, currentEmail))) return null;
  return {
    customer_id: Number(found.customer_id),
    customer_phone: String(found.customer_phone),
    customer_created: found.customer_created,
    current_email: currentEmail,
  };
}
