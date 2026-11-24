import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { digest, ensureCustomerOtpTables, isCustomerOtpModeEnabled, issueSession, takeAttemptLimits, uniqueCustomer } from "./customerOtpAccess";
import { normalizeCustomerEmail, normalizeCustomerPhone } from "./customerAccess";
import { ensureRegistrationReviewSchema, getRegistrationReviewStatus } from "./customerRegistrationReview";
import { resolveCustomerOtpRequestSource } from "./customerOtpRequestSource";
import { CUSTOMER_PASSKEY_PERMISSION_KEY, readCustomerPasskeyPermission } from "./customerPasskeyPolicy";
import { customerPasskeyUserHandle, ensureCustomerPasskeyEnrollmentTables, trustedEnrollmentOrigin } from "./customerPasskeyEnrollment";

const CHALLENGE_MS = 5 * 60_000;
const initialized = new WeakMap<object, Promise<void>>();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const encoded = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/);
export const authenticationProofSchema = z.object({
  id: encoded(1400), rawId: encoded(1400), type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: encoded(8192), authenticatorData: encoded(8192),
    signature: encoded(4096), userHandle: encoded(64),
  }),
  clientExtensionResults: z.object({}),
});
const rejected = () => new TRPCError({code:"UNAUTHORIZED",message:"Não foi possível entrar com biometria. Utilize o código."});
const rollout = () => isCustomerOtpModeEnabled() && process.env.H2_CUSTOMER_PASSKEY_LOGIN_ENABLED === "true";

export async function canLoginWithCustomerPasskey(db: any) {
  if (!rollout()) return false;
  try { return (await readCustomerPasskeyPermission(db)).allowed; } catch { return false; }
}
async function rows(db: any, statement: any): Promise<any[]> {
  return (await db.execute(statement))?.[0] || [];
}
async function ensureLoginTables(db: any) {
  await ensureCustomerOtpTables(db);
  await ensureCustomerPasskeyEnrollmentTables(db);
  await ensureRegistrationReviewSchema(db);
  let pending = initialized.get(db);
  if (!pending) {
    pending = db.execute(sql`CREATE TABLE IF NOT EXISTS customerPasskeyLoginChallenges (
      challengeId CHAR(64) PRIMARY KEY,
      challenge VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      phoneKey CHAR(64) NOT NULL,
      origin VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      rpID VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      rememberSession TINYINT NOT NULL, expiresAt BIGINT NOT NULL,
      KEY idx_passkey_login_expiry (expiresAt), KEY idx_passkey_login_phone (phoneKey)
    ) ENGINE=InnoDB`).then(() => undefined);
    initialized.set(db, pending!);
  }
  try { await pending; } catch (error) { initialized.delete(db); throw error; }
}
async function limit(db: any, req: Request, phone: string, operation: "begin" | "finish") {
  const {ip} = resolveCustomerOtpRequestSource(req);
  const wait = await takeAttemptLimits(db, [
    {scope:"passkey:"+operation+":ip:"+ip, maximum:100},
    {scope:"passkey:"+operation+":phone:"+phone, maximum:20},
  ], Date.now());
  if (wait > 0) throw new TRPCError({code:"TOO_MANY_REQUESTS",message:"Limite temporário de biometria. Utilize o código."});
}
export async function beginCustomerPasskeyLogin(db: any, phoneInput: string, remember: boolean, req: Request) {
  const phone = normalizeCustomerPhone(phoneInput);
  const site = trustedEnrollmentOrigin(req.headers.origin);
  if (!site || !/^\d{11}$/.test(phone) || !await canLoginWithCustomerPasskey(db)) throw rejected();
  await ensureLoginTables(db);
  await limit(db,req,phone,"begin");
  // Discoverable credential: no account lookup or credential list on this
  // endpoint, preventing it from exposing whether a phone has a Passkey.
  const options = await generateAuthenticationOptions({
    rpID:site.rpID, userVerification:"required", timeout:60_000,
  });
  const challengeId = randomBytes(32).toString("hex"), now = Date.now();
  await db.execute(sql`DELETE FROM customerPasskeyLoginChallenges WHERE expiresAt<=${now} LIMIT 100`);
  await db.execute(sql`INSERT INTO customerPasskeyLoginChallenges
    (challengeId,challenge,phoneKey,origin,rpID,rememberSession,expiresAt)
    VALUES (${hash(challengeId)},${options.challenge},${digest("phone",phone)},${site.origin},${site.rpID},${remember ? 1 : 0},${now+CHALLENGE_MS})`);
  return {challengeId,options};
}

export async function finishCustomerPasskeyLogin(db: any, phoneInput: string, challengeId: string, response: AuthenticationResponseJSON, req: Request) {
  const phone = normalizeCustomerPhone(phoneInput);
  const site = trustedEnrollmentOrigin(req.headers.origin);
  if (!site || !/^\d{11}$/.test(phone) || !await canLoginWithCustomerPasskey(db)) throw rejected();
  await ensureLoginTables(db);
  await limit(db,req,phone,"finish");
  const challenge = await db.transaction(async (tx: any) => {
    const key = hash(challengeId);
    const [row] = await rows(tx,sql`SELECT * FROM customerPasskeyLoginChallenges WHERE challengeId=${key} FOR UPDATE`);
    if (!row || row.origin !== site.origin || row.rpID !== site.rpID || row.phoneKey !== digest("phone",phone)) return null;
    // Commit consumption separately: every matched challenge is single-use,
    // even if signature verification or session issuance subsequently fails.
    await tx.execute(sql`DELETE FROM customerPasskeyLoginChallenges WHERE challengeId=${key}`);
    return Number(row.expiresAt) > Date.now() ? row : null;
  });
  if (!challenge || response.id !== response.rawId || !response.response.userHandle) throw rejected();
  const credentialKey = hash(JSON.stringify([site.rpID,response.id]));
  const [reference] = await rows(db,sql`SELECT customerId FROM customerPasskeyCredentials WHERE credentialKey=${credentialKey}`);
  if (!reference) throw rejected();
  const customerId = Number(reference.customerId);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw rejected();

  return db.transaction(async (tx: any) => {
    // Account first, then credential: consistent lock order for enrollment
    // and the upcoming administrative revocation transaction.
    const [locked] = await rows(tx,sql`SELECT id,phone,email,blocked,deletedAt FROM customers WHERE id=${customerId} FOR UPDATE`);
    if (!locked || locked.deletedAt || Number(locked.blocked || 0) !== 0 || normalizeCustomerPhone(locked.phone) !== phone) throw rejected();
    const email = normalizeCustomerEmail(locked.email);
    if (!email) throw rejected();
    const [credential] = await rows(tx,sql`SELECT * FROM customerPasskeyCredentials WHERE credentialKey=${credentialKey} FOR UPDATE`);
    if (!credential || Number(credential.customerId) !== customerId || credential.rpID !== site.rpID || credential.credentialId !== response.id) throw rejected();
    const expectedHandle = customerPasskeyUserHandle({
      customerId, phoneKey:digest("phone",phone), emailKey:digest("email",email),
    },site.rpID).toString("base64url");
    if (credential.userHandle !== expectedHandle || response.response.userHandle !== expectedHandle) throw rejected();
    const customer = await uniqueCustomer(tx,phone);
    if (!customer || Number(customer.id) !== customerId || normalizeCustomerEmail(customer.email) !== email ||
        await getRegistrationReviewStatus(tx,customerId) !== "approved") throw rejected();
    const counter = Number(credential.signCount);
    if (!Number.isSafeInteger(counter) || counter < 0 || counter > 0xffffffff) throw rejected();
    const verification = await verifyAuthenticationResponse({
      response, expectedChallenge:String(challenge.challenge),
      expectedOrigin:site.origin, expectedRPID:site.rpID, requireUserVerification:true,
      credential:{id:String(credential.credentialId),publicKey:new Uint8Array(Buffer.from(String(credential.publicKey),"base64url")),counter},
    }).catch(() => null);
    if (!verification?.verified) throw rejected();
    const nextCounter = verification.authenticationInfo.newCounter;
    if (!Number.isSafeInteger(nextCounter) || nextCounter < 0 || nextCounter > 0xffffffff ||
        ((counter !== 0 || nextCounter !== 0) && nextCounter <= counter)) throw rejected();
    // Recheck the live ADM permission with a locking read immediately before
    // issuing the session. Disabled or malformed settings fail closed.
    const [permission] = await rows(tx,sql`SELECT value FROM appSettings WHERE \`key\`=${CUSTOMER_PASSKEY_PERMISSION_KEY} FOR SHARE`);
    if (!rollout() || (permission && permission.value !== "1") || Number(challenge.expiresAt) <= Date.now()) throw rejected();
    await tx.execute(sql`UPDATE customerPasskeyCredentials SET signCount=${nextCounter} WHERE credentialKey=${credentialKey}`);
    const session = await issueSession(tx,customer,Date.now(),Number(challenge.rememberSession)===1);
    return {...session,phone};
  });
}
