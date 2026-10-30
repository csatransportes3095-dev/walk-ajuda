import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { normalizeCustomerPhone, normalizeCustomerEmail } from "./customerAccess";
import { emailBelongsToAnotherCustomer } from "./customerEmailOwnership";
import { deliverOwnSiteCode } from "./siteAccessCodeDelivery";
import { getMissingCustomerProfileFields } from "./customerProfileRequirements";
import { assertLoginEmailProof } from "./customerLoginEmailProof";

/**
 * Customer authentication v2: registered phone + one-time email code.
 * This module never trusts a phone, email, proof or session from the browser
 * without checking its current, unique and unblocked owner in the database.
 * Admin passwords, product codes and H2 AUTO device authentication are separate.
 */
export const CUSTOMER_SESSION_MS = 24 * 60 * 60 * 1000;
export const CUSTOMER_CODE_MS = 10 * 60 * 1000;

/** Never expose draft authentication in production before every customer
 * route and legacy password endpoint has passed the migration checklist.
 */
export function requireOtpMigrationEnabled(): void {
  if (process.env.H2_CUSTOMER_OTP_V2_ENABLED !== "true") {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "O novo acesso por código ainda não está disponível.",
    });
  }
}
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const GENERIC = "Se o telefone estiver cadastrado, enviaremos um código ao e-mail registrado.";
const isToken = (v: string) => /^h2otp_[0-9a-f]{64}$/.test(v);

function secret(): string {
  const key = process.env.H2_SITE_ACCESS_SECRET || "";
  if (key.length < 32) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Autenticação temporariamente indisponível." });
  return key;
}
function digest(scope: string, value: string): string {
  return createHmac("sha256", secret()).update("customer-otp-v2:" + scope + ":" + value).digest("hex");
}
function equalDigest(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
async function rows(db: any, q: any): Promise<any[]> {
  const result = await db.execute(q);
  return (result?.[0] || []) as any[];
}

let schemaPromise: Promise<void> | null = null;
export async function ensureCustomerOtpTables(db: any): Promise<void> {
  if (!schemaPromise) schemaPromise = (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS customerOtpChallenges (
      phoneKey CHAR(64) NOT NULL PRIMARY KEY,
      customerId INT NOT NULL, emailKey CHAR(64) NOT NULL,
      codeDigest CHAR(64) NOT NULL, expiresAt BIGINT NOT NULL,
      resendAfter BIGINT NOT NULL, attempts INT NOT NULL DEFAULT 0,
      usedAt BIGINT NULL, createdAt BIGINT NOT NULL
    ) ENGINE=InnoDB`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS customerOtpLimits (
      limitKey CHAR(64) NOT NULL PRIMARY KEY,
      windowStart BIGINT NOT NULL, hits INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS customerOtpSessions (
      tokenHash CHAR(64) NOT NULL PRIMARY KEY,
      customerId INT NOT NULL,
      phoneKey CHAR(64) NOT NULL, emailKey CHAR(64) NOT NULL,
      expiresAt BIGINT NOT NULL,
      KEY idx_customerOtpSessions_exp (expiresAt)
    ) ENGINE=InnoDB`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS customerOtpUsedProofs (
      nonceKey CHAR(64) NOT NULL PRIMARY KEY, usedAt BIGINT NOT NULL
    ) ENGINE=InnoDB`);
  })();
  try { await schemaPromise; }
  catch (error) { schemaPromise = null; throw error; }
}

async function uniqueCustomer(db: any, normalized: string): Promise<any | null> {
  if (!/^\d{11}$/.test(normalized)) return null;
  const found = await rows(db, sql`SELECT id, phone, email, blocked, deletedAt, name, cpf,
    cep, street, addressNumber, neighborhood, city, uf, profilePhotoUrl
    FROM customers WHERE deletedAt IS NULL
    AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''),11) = ${normalized}
    LIMIT 3`);
  if (found.length !== 1) return null;
  const c = found[0];
  const email = normalizeCustomerEmail(c.email);
  if (!email || normalizeCustomerPhone(c.phone) !== normalized || Number(c.blocked || 0) !== 0) return null;
  if (await emailBelongsToAnotherCustomer(db, email, Number(c.id))) return null;
  return c;
}

async function takeLimit(db: any, scope: string, maximum: number, now: number): Promise<boolean> {
  const key = digest("limit", scope);
  const span = 60 * 60 * 1000;
  await db.execute(sql`INSERT INTO customerOtpLimits (limitKey,windowStart,hits)
    VALUES (${key},${now},1)
    ON DUPLICATE KEY UPDATE
      hits=IF(windowStart+${span}<${now},1,hits+1),
      windowStart=IF(windowStart+${span}<${now},${now},windowStart)`);
  const [limit] = await rows(db, sql`SELECT hits FROM customerOtpLimits WHERE limitKey=${key} LIMIT 1`);
  return Number(limit?.hits || 0) <= maximum;
}

async function issueSession(tx: any, customer: any, now: number) {
  const phone = normalizeCustomerPhone(customer.phone);
  const email = normalizeCustomerEmail(customer.email);
  if (!phone || !email) throw new TRPCError({ code: "UNAUTHORIZED", message: "Cadastro inválido." });
  const token = "h2otp_" + randomBytes(32).toString("hex");
  const expiry = new Date(now + CUSTOMER_SESSION_MS);
  const phoneKey = digest("phone", phone), emailKey = digest("email", email);
  await tx.execute(sql`INSERT INTO customerPasswordSessions (phone,token,expiresAt,createdAt,lastAccessAt)
    VALUES (${phone},${token},${expiry},NOW(),NOW())`);
  await tx.execute(sql`INSERT INTO customerOtpSessions (tokenHash,customerId,phoneKey,emailKey,expiresAt)
    VALUES (${digest("session",token)},${Number(customer.id)},${phoneKey},${emailKey},${now+CUSTOMER_SESSION_MS})`);
  const profileUpdateFields = getMissingCustomerProfileFields(customer);
  return { success: true as const, token, profileUpdateRequired: profileUpdateFields.length > 0, profileUpdateFields };
}

export async function requestCustomerCode(phoneInput: string, request: Request): Promise<{success:true;message:string}> {
  requireOtpMigrationEnabled();
  const phone = normalizeCustomerPhone(phoneInput);
  if (!phone || phone.length !== 11) return { success:true, message:GENERIC };
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code:"SERVICE_UNAVAILABLE", message:"Serviço indisponível." });
  await ensureCustomerOtpTables(db);
  const now = Date.now();
  const ip = String(request.ip || request.socket?.remoteAddress || "unknown").slice(0,100);
  // Persistent atomic per-number and per-source counters, including unknown phones.
  const phoneAllowed = await takeLimit(db, "phone:"+phone, 6, now);
  const ipAllowed = await takeLimit(db, "ip:"+ip, 40, now);
  if (!phoneAllowed || !ipAllowed) return { success:true, message:GENERIC };
  const customer = await uniqueCustomer(db, phone);
  if (!customer) return { success:true, message:GENERIC };
  const email = normalizeCustomerEmail(customer.email);
  const phoneKey = digest("phone",phone), emailKey = digest("email",email);
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`INSERT IGNORE INTO customerOtpChallenges
      (phoneKey,customerId,emailKey,codeDigest,expiresAt,resendAfter,attempts,createdAt)
      VALUES (${phoneKey},${Number(customer.id)},${emailKey},'',0,0,0,${now})`);
    const [current] = await rows(tx,sql`SELECT resendAfter FROM customerOtpChallenges WHERE phoneKey=${phoneKey} FOR UPDATE`);
    if (Number(current?.resendAfter || 0) > now) return;
    const code = String(randomInt(0,1000000)).padStart(6,"0");
    const codeHash = digest("code:"+phoneKey,code);
    await tx.execute(sql`UPDATE customerOtpChallenges
      SET customerId=${Number(customer.id)},emailKey=${emailKey},codeDigest=${codeHash},
      expiresAt=${now+CUSTOMER_CODE_MS},resendAfter=${now+RESEND_MS},
      attempts=0,usedAt=NULL,createdAt=${now}
      WHERE phoneKey=${phoneKey}`);
    // Delivery inside the transaction: delivery failure rolls the challenge back.
    await deliverOwnSiteCode(email,code);
  });
  return { success:true, message:GENERIC };
}

export async function verifyCustomerCode(phoneInput: string, code: string) {
  requireOtpMigrationEnabled();
  const phone = normalizeCustomerPhone(phoneInput);
  if (!phone || phone.length !== 11 || !/^\d{6}$/.test(code)) {
    return { success: false as const, message:"Código inválido ou expirado." };
  }
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code:"SERVICE_UNAVAILABLE",message:"Serviço indisponível." });
  await ensureCustomerOtpTables(db);
  const key=digest("phone",phone), now=Date.now();
  return db.transaction(async (tx: any) => {
    const [challenge] = await rows(tx,sql`SELECT * FROM customerOtpChallenges WHERE phoneKey=${key} FOR UPDATE`);
    if (!challenge || challenge.usedAt || Number(challenge.expiresAt)<=now || Number(challenge.attempts)>=MAX_ATTEMPTS)
      return { success:false as const,message:"Código inválido ou expirado. Solicite outro." };
    await tx.execute(sql`UPDATE customerOtpChallenges SET attempts=attempts+1 WHERE phoneKey=${key}`);
    if (!equalDigest(String(challenge.codeDigest||""),digest("code:"+key,code)))
      return { success:false as const,message:"Código inválido ou expirado." };
    const customer = await uniqueCustomer(tx,phone);
    if (!customer || Number(challenge.customerId)!==Number(customer.id) ||
        String(challenge.emailKey)!==digest("email",normalizeCustomerEmail(customer.email)))
      return { success:false as const,message:"Cadastro alterado. Solicite outro código." };
    await tx.execute(sql`UPDATE customerOtpChallenges SET usedAt=${now},
      codeDigest='',expiresAt=0 WHERE phoneKey=${key}`);
    return issueSession(tx,customer,now);
  });
}

/** Proof previously generated by the existing new-registration email verifier. */
export async function redeemNewRegistrationProof(phoneInput:string,proofToken:string) {
  requireOtpMigrationEnabled();
  const phone=normalizeCustomerPhone(phoneInput);
  if (!phone || phone.length!==11) throw new TRPCError({code:"UNAUTHORIZED",message:"Confirme o e-mail novamente."});
  const proof=assertLoginEmailProof(phone,proofToken);
  const db=await getDb() as any;
  if(!db) throw new TRPCError({code:"SERVICE_UNAVAILABLE",message:"Serviço indisponível."});
  await ensureCustomerOtpTables(db);
  const now=Date.now();
  return db.transaction(async (tx:any)=>{
    const customer=await uniqueCustomer(tx,phone);
    if (!customer || normalizeCustomerEmail(customer.email)!==proof.email)
      throw new TRPCError({code:"UNAUTHORIZED",message:"Confirme o e-mail cadastrado novamente."});
    const nonceKey=digest("proof",proof.nonce);
    const consumed=await tx.execute(sql`INSERT IGNORE INTO customerOtpUsedProofs (nonceKey,usedAt)
      VALUES (${nonceKey},${now})`);
    if (Number(consumed?.[0]?.affectedRows || 0)!==1)
      throw new TRPCError({code:"UNAUTHORIZED",message:"Código já utilizado. Confirme novamente."});
    return issueSession(tx,customer,now);
  });
}

export async function getVerifiedCustomerOtpSession(db:any, tokenInput:string) {
  const token=String(tokenInput || "").trim();
  if (!isToken(token)) return null;
  await ensureCustomerOtpTables(db);
  const now=Date.now(),tokenHash=digest("session",token);
  const [session]=await rows(db,sql`SELECT
      s.phone AS sessionPhone,s.expiresAt AS sessionExpires,
      b.customerId,b.phoneKey,b.emailKey,b.expiresAt AS bindingExpires,
      c.id,c.phone,c.email,c.blocked,c.deletedAt,c.name,c.cpf,c.cep,c.street,
      c.addressNumber,c.neighborhood,c.city,c.uf,c.profilePhotoUrl
    FROM customerPasswordSessions s
    INNER JOIN customerOtpSessions b ON b.tokenHash=${tokenHash}
    INNER JOIN customers c ON c.id=b.customerId
    WHERE s.token=${token} AND b.expiresAt>${now} AND s.expiresAt>NOW()
    LIMIT 1`);
  if (!session || session.deletedAt || Number(session.blocked||0)!==0) return null;
  const phone=normalizeCustomerPhone(session.phone), email=normalizeCustomerEmail(session.email);
  if (!phone || !email ||
      phone!==normalizeCustomerPhone(session.sessionPhone) ||
      session.phoneKey!==digest("phone",phone) || session.emailKey!==digest("email",email))
    return null;
  return { ...session, phone, email };
}

export async function revokeCustomerOtpSession(db:any, tokenInput:string) {
  const token=String(tokenInput||"").trim();
  if (!isToken(token)) return;
  await ensureCustomerOtpTables(db);
  await db.execute(sql`DELETE FROM customerOtpSessions WHERE tokenHash=${digest("session",token)}`);
  await db.execute(sql`DELETE FROM customerPasswordSessions WHERE token=${token}`);
}
