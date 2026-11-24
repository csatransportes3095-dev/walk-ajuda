import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getVerifiedCustomerOtpSession } from "./customerOtpAccess";
import { normalizeCustomerPhone } from "./customerAccess";

const fingerprint = (value:string) => createHash("sha256").update(value).digest("hex");
function missingTable(error:unknown): boolean {
  const e = error as {code?:string;cause?:{code?:string}} | null;
  return e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE";
}

/** Only biometric logins have provenance rows. Before Passkey rollout the
 * table may not exist. Other database errors must not downgrade a biometric
 * card login to a non-revocable legacy cookie. */
export async function biometricBridgeBinding(db:any, token:string, customerId:number): Promise<string|null> {
  const binding = fingerprint(token);
  let result:any;
  try {
    result = await db.execute(sql`SELECT p.customerId FROM customerPasskeySessions p
      WHERE p.tokenFingerprint=${binding} LIMIT 1`);
  } catch (error) {
    if (missingTable(error) && process.env.H2_CUSTOMER_PASSKEY_LOGIN_ENABLED !== "true") return null;
    throw error;
  }
  const row = result?.[0]?.[0];
  if (!row) return null;
  if (Number(row.customerId) !== customerId) throw new Error("Biometric session identity mismatch");
  return binding;
}

/** A signed card cookie carries an opaque SHA-256 fingerprint, never the
 * central bearer token. Revocation deletes its provenance and both central
 * session records. Validate on every use, including after rollout is disabled. */
export async function isBiometricBridgeActive(db:any, binding:unknown, phoneInput:unknown): Promise<boolean> {
  if (!db || typeof binding !== "string" || !/^[a-f0-9]{64}$/.test(binding)) return false;
  const phone = normalizeCustomerPhone(phoneInput);
  if (!phone) return false;
  try {
    const result = await db.execute(sql`SELECT p.customerId,s.token
      FROM customerPasskeySessions p
      INNER JOIN customerPasswordSessions s ON s.id=p.sessionId AND SHA2(s.token,256)=p.tokenFingerprint
      INNER JOIN customerOtpSessions o ON o.tokenHash=p.tokenHash AND o.customerId=p.customerId
      WHERE p.tokenFingerprint=${binding} AND p.expiresAt>${Date.now()} LIMIT 1`);
    const row = result?.[0]?.[0];
    if (!row || fingerprint(String(row.token)) !== binding) return false;
    const central = await getVerifiedCustomerOtpSession(db,String(row.token));
    return !!central && Number(central.customerId) === Number(row.customerId) && central.phone === phone;
  } catch {
    return false;
  }
}
