import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateRegistrationOptions, verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { getVerifiedCustomerOtpSession, isCustomerOtpModeEnabled, uniqueCustomer } from "./customerOtpAccess";
import { normalizeCustomerPhone, normalizeCustomerEmail } from "./customerAccess";
import { CUSTOMER_PASSKEY_PERMISSION_KEY, readCustomerPasskeyPermission } from "./customerPasskeyPolicy";

const TTL_MS = 5 * 60_000;
const MAX_CREDENTIALS = 10;
const schemaPromises = new WeakMap<object, Promise<void>>();
const origins = new Map([
  ["https://h2colombiano.com", "h2colombiano.com"],
  ["https://www.h2colombiano.com", "h2colombiano.com"],
  ["https://walk-ajuda.onrender.com", "walk-ajuda.onrender.com"],
]);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const encoded = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/);
export const registrationProofSchema = z.object({
  id: encoded(1400), rawId: encoded(1400), type: z.literal("public-key"),
  response: z.object({ clientDataJSON: encoded(8192), attestationObject: encoded(32768) }),
  clientExtensionResults: z.object({}),
});
export function trustedEnrollmentOrigin(value: unknown) {
  const rpID = typeof value === "string" ? origins.get(value) : undefined;
  return typeof value === "string" && rpID ? {origin:value,rpID} : null;
}
export async function canEnrollCustomerPasskey(db: any) {
  if (!isCustomerOtpModeEnabled() || process.env.H2_CUSTOMER_PASSKEY_ENROLLMENT_ENABLED !== "true") return false;
  try { return (await readCustomerPasskeyPermission(db)).allowed; } catch { return false; }
}
async function rows(db: any, query: any): Promise<any[]> {
  return (await db.execute(query))?.[0] || [];
}
export async function ensureCustomerPasskeyEnrollmentTables(db: any) {
  let pending = schemaPromises.get(db);
  if (!pending) {
    pending = (async () => {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS customerPasskeyEnrollments (
        tokenHash CHAR(64) PRIMARY KEY, challengeId CHAR(64) NOT NULL UNIQUE,
        challenge VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        customerId INT NOT NULL, userHandle VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        origin VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        rpID VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        expiresAt BIGINT NOT NULL, KEY idx_passkey_enroll_expiry (expiresAt)
      ) ENGINE=InnoDB`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS customerPasskeyCredentials (
        credentialKey CHAR(64) PRIMARY KEY,
        credentialId VARCHAR(1400) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        customerId INT NOT NULL,
        userHandle VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        rpID VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        publicKey TEXT CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        signCount BIGINT UNSIGNED NOT NULL, createdAt BIGINT NOT NULL,
        KEY idx_passkey_customer_rp (customerId,rpID)
      ) ENGINE=InnoDB`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS customerPasskeyRevocations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, customerId INT NOT NULL,
        administrator VARCHAR(120) NOT NULL, revokedAt BIGINT NOT NULL,
        credentialsRevoked INT NOT NULL, sessionsRevoked INT NOT NULL,
        KEY idx_passkey_revoked_customer (customerId,id)
      ) ENGINE=InnoDB`);
    })();
    schemaPromises.set(db, pending);
  }
  try { await pending; } catch (error) { schemaPromises.delete(db); throw error; }
}

// No personal information in the WebAuthn user handle. Bind to the same
// keyed phone and email digests already verified by the OTP session.
export function customerPasskeyUserHandle(session: any, rpID: string) {
  return createHash("sha256").update(JSON.stringify(["h2-passkey-v1",rpID,Number(session.customerId),session.phoneKey,session.emailKey])).digest();
}
async function currentAccount(tx: any, token: string, rpID: string) {
  const session = await getVerifiedCustomerOtpSession(tx, token);
  if (!session) return null;
  const [locked] = await rows(tx,sql`SELECT id,phone,email,blocked,deletedAt FROM customers WHERE id=${Number(session.customerId)} FOR UPDATE`);
  if (!locked || locked.deletedAt || Number(locked.blocked || 0) !== 0 ||
      normalizeCustomerPhone(locked.phone) !== session.phone || normalizeCustomerEmail(locked.email) !== session.email) return null;
  const current = await uniqueCustomer(tx,session.phone);
  if (!current || Number(current.id) !== Number(session.customerId)) return null;
  // Revocation serializes against this customer lock. An OTP session created
  // before the last revocation cannot be used to prepare another enrollment.
  const [lastRevocation] = await rows(tx,sql`SELECT revokedAt FROM customerPasskeyRevocations
    WHERE customerId=${Number(session.customerId)} ORDER BY id DESC LIMIT 1 FOR SHARE`);
  const [central] = await rows(tx,sql`SELECT UNIX_TIMESTAMP(createdAt)*1000 AS createdMs
    FROM customerPasswordSessions WHERE token=${token} AND expiresAt>NOW() FOR SHARE`);
  if (!central || (lastRevocation && Number(central.createdMs) <= Number(lastRevocation.revokedAt))) return null;
  return { id:Number(session.customerId), handle:customerPasskeyUserHandle(session,rpID) };
}

async function enrollmentStillAllowed(tx: any) {
  if (!isCustomerOtpModeEnabled() || process.env.H2_CUSTOMER_PASSKEY_ENROLLMENT_ENABLED !== "true") return false;
  const [permission] = await rows(tx,sql`SELECT value FROM appSettings WHERE \`key\`=${CUSTOMER_PASSKEY_PERMISSION_KEY} FOR SHARE`);
  return !permission || permission.value === "1";
}

/** Only called by the OTP-verification procedure immediately after successful
 * code consumption and explicit opt-in. No public challenge-creation endpoint. */
export async function preparePasskeyEnrollmentAfterOtp(db: any, token: string, requestOrigin: unknown) {
  const site = trustedEnrollmentOrigin(requestOrigin);
  if (!site || !await canEnrollCustomerPasskey(db)) return null;
  await ensureCustomerPasskeyEnrollmentTables(db);
  return db.transaction(async (tx: any) => {
    if (!await canEnrollCustomerPasskey(tx)) return null;
    const account = await currentAccount(tx,token,site.rpID);
    if (!account || !await enrollmentStillAllowed(tx)) return null;
    const existing = await rows(tx,sql`SELECT credentialId FROM customerPasskeyCredentials
      WHERE customerId=${account.id} AND rpID=${site.rpID} LIMIT ${MAX_CREDENTIALS}`);
    if (existing.length >= MAX_CREDENTIALS) return null;
    const options = await generateRegistrationOptions({
      rpName:"H2 Colombiano", rpID:site.rpID,
      userName:"h2-" + account.handle.toString("base64url"), userDisplayName:"Conta H2 Colombiano",
      userID:new Uint8Array(account.handle), timeout:60_000, attestationType:"none",
      supportedAlgorithmIDs:[-7,-257],
      excludeCredentials:existing.map(row => ({id:String(row.credentialId)})),
      authenticatorSelection:{authenticatorAttachment:"platform",residentKey:"required",userVerification:"required"},
    });
    const challengeId = randomBytes(32).toString("hex");
    const now = Date.now();
    await tx.execute(sql`DELETE FROM customerPasskeyEnrollments WHERE expiresAt<=${now} LIMIT 100`);
    const inserted = await tx.execute(sql`INSERT IGNORE INTO customerPasskeyEnrollments
      (tokenHash,challengeId,challenge,customerId,userHandle,origin,rpID,expiresAt)
      VALUES (${hash(token)},${challengeId},${options.challenge},${account.id},${account.handle.toString("base64url")},${site.origin},${site.rpID},${now+TTL_MS})`);
    if (Number(inserted?.[0]?.affectedRows) !== 1) return null;
    return {challengeId,options};
  });
}

/** Stores only the public credential, never issues a login session. */
export async function finishCustomerPasskeyEnrollment(db: any, token: string, challengeId: string, response: RegistrationResponseJSON, requestOrigin: unknown) {
  const failure = () => new TRPCError({code:"BAD_REQUEST",message:"Não foi possível cadastrar a chave. Confirme um novo código para tentar novamente."});
  const site = trustedEnrollmentOrigin(requestOrigin);
  if (!site || !await canEnrollCustomerPasskey(db)) throw failure();
  await ensureCustomerPasskeyEnrollmentTables(db);
  const stored = await db.transaction(async (tx: any) => {
    // Keep the customer lock through consumption and storage. A concurrent
    // revocation either deletes the pending challenge first or removes the
    // newly stored key after this transaction. Invalid proofs consume the
    // challenge too: return false instead of rolling back the DELETE.
    const account = await currentAccount(tx,token,site.rpID);
    if (!account) return false;
    const [challenge] = await rows(tx,sql`SELECT * FROM customerPasskeyEnrollments
      WHERE tokenHash=${hash(token)} AND challengeId=${challengeId} FOR UPDATE`);
    if (!challenge || challenge.origin !== site.origin || challenge.rpID !== site.rpID) return false;
    await tx.execute(sql`DELETE FROM customerPasskeyEnrollments WHERE tokenHash=${hash(token)} AND challengeId=${challengeId}`);
    if (Number(challenge.expiresAt) <= Date.now() || response.id !== response.rawId ||
        account.id !== Number(challenge.customerId) || account.handle.toString("base64url") !== challenge.userHandle) return false;
    const credential = await verifyRegistrationResponse({
      response, expectedChallenge:String(challenge.challenge), expectedOrigin:site.origin, expectedRPID:site.rpID,
      requireUserVerification:true, supportedAlgorithmIDs:[-7,-257],
    }).then(result => result.verified ? result.registrationInfo?.credential : undefined, () => undefined);
    if (!credential || credential.id !== response.id || Number(challenge.expiresAt) <= Date.now() ||
        !await enrollmentStillAllowed(tx)) return false;
    const existing = await rows(tx,sql`SELECT credentialId FROM customerPasskeyCredentials WHERE customerId=${account.id} AND rpID=${site.rpID} LIMIT ${MAX_CREDENTIALS}`);
    if (existing.length >= MAX_CREDENTIALS) return false;
    const inserted = await tx.execute(sql`INSERT IGNORE INTO customerPasskeyCredentials
      (credentialKey,credentialId,customerId,userHandle,rpID,publicKey,signCount,createdAt)
      VALUES (${hash(JSON.stringify([site.rpID,credential.id]))},${credential.id},${account.id},${challenge.userHandle},${site.rpID},${Buffer.from(credential.publicKey).toString("base64url")},${credential.counter},${Date.now()})`);
    return Number(inserted?.[0]?.affectedRows) === 1;
  });
  if (!stored) throw failure();
  return {enrolled:true as const};
}
