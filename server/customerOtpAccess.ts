import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { getRegistrationReviewStatus } from "./customerRegistrationReview";
import { normalizeCustomerPhone, normalizeCustomerEmail } from "./customerAccess";
import { emailBelongsToAnotherCustomer } from "./customerEmailOwnership";
import { deliverOwnSiteCode } from "./siteAccessCodeDelivery";
import { enqueueIncomingWhatsappOtp, ensureIncomingWhatsappOtpQueue } from "./h2-auto-incoming-otp";
import { isH2AutoApkOtpReady } from "./h2-auto-otp-apk";
import { generateOwnSiteCode } from "./siteAccessOwnCodes";
import { getMissingCustomerProfileFields } from "./customerProfileRequirements";
import { assertLoginEmailProof } from "./customerLoginEmailProof";
import { getAdminJwtSecret } from "./adminJwt";
import { recordCustomerOtpLogin } from "./customerLoginHistory";
import { resolveCustomerOtpRequestSource } from "./customerOtpRequestSource";
import { readCustomerSessionPolicy } from "./customerSessionPolicy";
import { CUSTOMER_SESSION_HOUR_MS, DEFAULT_CUSTOMER_SESSION_HOURS } from "../shared/customerSessionPolicy";

/**
 * Customer authentication v2: registered phone + one-time email code.
 * This module never trusts a phone, email, proof or session from the browser
 * without checking its current, unique and unblocked owner in the database.
 * Admin passwords, product codes and H2 AUTO device authentication are separate.
 */
// Compatibility constant for the default; issuance reads the current ADM policy.
export const CUSTOMER_SESSION_MS = DEFAULT_CUSTOMER_SESSION_HOURS * CUSTOMER_SESSION_HOUR_MS;
export const CUSTOMER_CODE_MS = 10 * 60 * 1000;

/** Never expose draft authentication in production before every customer
 * route and legacy password endpoint has passed the migration checklist.
 */
export function isCustomerOtpModeEnabled(): boolean {
  return process.env.H2_CUSTOMER_OTP_V2_ENABLED === "true";
}

export function requireOtpMigrationEnabled(): void {
  if (!isCustomerOtpModeEnabled()) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "O novo acesso por código ainda não está disponível.",
    });
  }
}
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const OTP_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const GENERIC = "Se o telefone estiver cadastrado, enviaremos um código ao e-mail registrado.";
const isToken = (v: string) => /^h2otp_[0-9a-f]{64}$/.test(v);

function secret(): string {
  // Dedicated key preferred; existing server signing secret is an isolated
  // fallback so the Zoho email-code flow does not depend on a new credential.
  const key = process.env.H2_SITE_ACCESS_SECRET || getAdminJwtSecret() || "";
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

type IneligibleReason = "phone_invalid" | "customer_not_found" | "phone_not_unique" | "blocked" | "email_invalid" | "email_shared";
async function uniqueCustomer(db: any, normalized: string, onIneligible?: (reason: IneligibleReason) => void): Promise<any | null> {
  const reject = (reason: IneligibleReason) => { onIneligible?.(reason); return null; };
  if (!/^\d{11}$/.test(normalized)) return reject("phone_invalid");
  const found = await rows(db, sql`SELECT id, phone, email, blocked, deletedAt, name, cpf,
    cep, street, addressNumber, neighborhood, city, uf, profilePhotoUrl
    FROM customers WHERE deletedAt IS NULL
    AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''),11) = ${normalized}
    LIMIT 3`);
  if (found.length !== 1) return reject(found.length === 0 ? "customer_not_found" : "phone_not_unique");
  const c = found[0];
  const email = normalizeCustomerEmail(c.email);
  if (!email) return reject("email_invalid");
  if (normalizeCustomerPhone(c.phone) !== normalized) return reject("phone_invalid");
  if (Number(c.blocked || 0) !== 0) return reject("blocked");
  if (await emailBelongsToAnotherCustomer(db, email, Number(c.id))) return reject("email_shared");
  return c;
}

async function takeAttemptLimits(db: any, limits: Array<{scope:string;maximum:number}>, now: number): Promise<number> {
  // Attempt protection commits independently of delivery: failed/cooldown
  // attempts still count against abuse limits, never the six successful sends.
  return db.transaction(async (tx: any) => {
    let retryAfterSeconds = 0;
    for (const limit of limits) {
      const key = digest("limit", limit.scope);
      await tx.execute(sql`INSERT INTO customerOtpLimits (limitKey,windowStart,hits)
        VALUES (${key},${now},1)
        ON DUPLICATE KEY UPDATE
          hits=IF(windowStart+${OTP_LIMIT_WINDOW_MS}<=${now},1,LEAST(hits+1,1000000)),
          windowStart=IF(windowStart+${OTP_LIMIT_WINDOW_MS}<=${now},${now},windowStart)`);
      const [current] = await rows(tx, sql`SELECT hits,windowStart FROM customerOtpLimits
        WHERE limitKey=${key} FOR UPDATE`);
      if (!current) throw new Error("OTP_ATTEMPT_LIMIT_UNAVAILABLE");
      if (Number(current.hits) > limit.maximum) retryAfterSeconds = Math.max(retryAfterSeconds,
        Math.max(1,Math.ceil((Number(current.windowStart)+OTP_LIMIT_WINDOW_MS-now)/1000)));
    }
    return retryAfterSeconds;
  });
}

async function issueSession(tx: any, customer: any, now: number) {
  const phone = normalizeCustomerPhone(customer.phone);
  const email = normalizeCustomerEmail(customer.email);
  if (!phone || !email) throw new TRPCError({ code: "UNAUTHORIZED", message: "Cadastro inválido." });
  const sessionPolicy = await readCustomerSessionPolicy(tx);
  const token = "h2otp_" + randomBytes(32).toString("hex");
  // The existing TIMESTAMP column has second precision. Store one absolute
  // expiry in both tables, independent of the connection/driver time zone.
  const expiresAtMs = Math.floor(now / 1000) * 1000 + sessionPolicy.hours * CUSTOMER_SESSION_HOUR_MS;
  const phoneKey = digest("phone", phone), emailKey = digest("email", email);
  await tx.execute(sql`INSERT INTO customerPasswordSessions (phone,token,expiresAt,createdAt,lastAccessAt)
    VALUES (${phone},${token},FROM_UNIXTIME(${expiresAtMs} / 1000),FROM_UNIXTIME(FLOOR(${now} / 1000)),FROM_UNIXTIME(FLOOR(${now} / 1000)))`);
  await tx.execute(sql`INSERT INTO customerOtpSessions (tokenHash,customerId,phoneKey,emailKey,expiresAt)
    VALUES (${digest("session",token)},${Number(customer.id)},${phoneKey},${emailKey},${expiresAtMs})`);
  await recordCustomerOtpLogin(tx, { customerId: Number(customer.id), phone, token, loggedInAtMs: now });
  const profileUpdateFields = getMissingCustomerProfileFields(customer);
  return { success: true as const, token, profileUpdateRequired: profileUpdateFields.length > 0, profileUpdateFields };
}

export async function requestCustomerCode(phoneInput: string, request: Request, channel: "email" | "whatsapp" | "both" = "email"): Promise<{
  success: true; message: string; resendBlocked?: boolean; retryAfterSeconds?: number; cooldownScope?: "all" | "channel"; whatsappPrepared?: boolean;
}> {
  requireOtpMigrationEnabled();
  const phone = normalizeCustomerPhone(phoneInput);
  const source = resolveCustomerOtpRequestSource(request);
  const log = (state: string, reason?: IneligibleReason) => console.info(
    `[CustomerOtp] state=${state} channel=${channel} ipSource=${source.source}${reason ? " reason="+reason : ""}`
  );
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code:"SERVICE_UNAVAILABLE", message:"Serviço indisponível." });
  await ensureCustomerOtpTables(db);
  const attemptLimits = [{scope:"ip:"+source.ip, maximum:40}];
  if (phone && phone.length === 11) attemptLimits.push({scope:"phone-attempt:"+phone, maximum:30});
  const attemptWait = await takeAttemptLimits(db, attemptLimits, Date.now());
  if (attemptWait > 0) {
    log("attempt_limited");
    return {success:true,message:"Limite de tentativas atingido. Aguarde o tempo indicado para solicitar outro código.",
      resendBlocked:true,retryAfterSeconds:attemptWait,cooldownScope:"all"};
  }
  if (!phone || phone.length !== 11) { log("customer_ineligible","phone_invalid"); return {success:true,message:GENERIC}; }
  let queueWhatsapp = channel !== "email" && await isH2AutoApkOtpReady();
  if (channel === "whatsapp" && !queueWhatsapp) {
    log("whatsapp_unavailable");
    throw new TRPCError({code:"SERVICE_UNAVAILABLE",message:"WhatsApp temporariamente indisponível. Tente receber o código por e-mail."});
  }
  const customer = await uniqueCustomer(db, phone, reason => log("customer_ineligible",reason));
  if (!customer) return { success:true, message:GENERIC };
  const email = normalizeCustomerEmail(customer.email);
  const phoneKey = digest("phone",phone), emailKey = digest("email",email);
  // A combined request consumes both existing channel cooldowns so one click
  // cannot be used to bypass the 60-second resend policy.
  const channelKeys = (channel === "both" ? ["email", "whatsapp"] : [channel])
    .map(value => digest("otp-resend:" + value, phone));
  // Preserve the existing six-per-hour namespace and all already stored limits.
  const deliveryKey = digest("limit", "phone:"+phone);
  type IssueResult = {state:"issued"} | {state:"channel_cooldown"|"delivery_limited";retryAfterSeconds:number};
  let result: IssueResult;
  let whatsappPrepared = false;
  try {
    if (queueWhatsapp) {
      try { await ensureIncomingWhatsappOtpQueue(db); }
      catch (error) {
        if (channel === "whatsapp") throw error;
        queueWhatsapp = false;
        log("whatsapp_queue_unavailable");
      }
    }
    result = await db.transaction(async (tx: any): Promise<IssueResult> => {
      // Lock the challenge first, as verification and both sending channels do.
      await tx.execute(sql`INSERT INTO customerOtpChallenges
        (phoneKey,customerId,emailKey,codeDigest,expiresAt,resendAfter,attempts,createdAt)
        VALUES (${phoneKey},${Number(customer.id)},${emailKey},'',0,0,0,0)
        ON DUPLICATE KEY UPDATE phoneKey=phoneKey`);
      await rows(tx,sql`SELECT resendAfter FROM customerOtpChallenges WHERE phoneKey=${phoneKey} FOR UPDATE`);
      for (const key of [...channelKeys,deliveryKey]) {
        await tx.execute(sql`INSERT INTO customerOtpLimits (limitKey,windowStart,hits)
          VALUES (${key},0,0) ON DUPLICATE KEY UPDATE limitKey=limitKey`);
      }
      const channelCooldowns = [];
      for (const key of channelKeys) {
        const [cooldown] = await rows(tx,sql`SELECT windowStart FROM customerOtpLimits
          WHERE limitKey=${key} FOR UPDATE`);
        if (!cooldown) throw new Error("OTP_DELIVERY_LIMIT_UNAVAILABLE");
        channelCooldowns.push(cooldown);
      }
      const [deliveryLimit] = await rows(tx,sql`SELECT windowStart,hits FROM customerOtpLimits
        WHERE limitKey=${deliveryKey} FOR UPDATE`);
      if (!deliveryLimit) throw new Error("OTP_DELIVERY_LIMIT_UNAVAILABLE");
      const now = Date.now();
      const cooldownWait = Math.max(0,...channelCooldowns.map(item =>
        Math.ceil((Number(item.windowStart)+RESEND_MS-now)/1000)));
      if (cooldownWait > 0) return {state:"channel_cooldown",retryAfterSeconds:cooldownWait};
      const resetWindow = Number(deliveryLimit.windowStart) <= 0 || Number(deliveryLimit.windowStart)+OTP_LIMIT_WINDOW_MS <= now;
      const deliveryHits = resetWindow ? 0 : Number(deliveryLimit.hits);
      if (deliveryHits >= 6) return {state:"delivery_limited",retryAfterSeconds:Math.max(1,
        Math.ceil((Number(deliveryLimit.windowStart)+OTP_LIMIT_WINDOW_MS-now)/1000))};

      const code = generateOwnSiteCode();
      const codeHash = digest("code:"+phoneKey,code);
      await tx.execute(sql`UPDATE customerOtpChallenges
        SET customerId=${Number(customer.id)},emailKey=${emailKey},codeDigest=${codeHash},
          expiresAt=${now+CUSTOMER_CODE_MS},resendAfter=${now+RESEND_MS},attempts=0,usedAt=NULL,createdAt=${now}
        WHERE phoneKey=${phoneKey}`);
      // ONE generated code and ONE challenge for both delivery paths.
      // WhatsApp stays customer-initiated: the APK receives it only after a
      // matching incoming message. Queue failure never prevents email login.
      if (queueWhatsapp) {
        try {
          await enqueueIncomingWhatsappOtp({customerPhone:phone,code,phoneKey,
            codeDigest:codeHash,expiresAt:now+CUSTOMER_CODE_MS},tx);
          whatsappPrepared = true;
        } catch (error) {
          if (channel === "whatsapp") throw error;
          log("whatsapp_queue_failed");
        }
      }
      if (channel !== "whatsapp") await deliverOwnSiteCode(email,code,"customer-login");
      // Failed delivery/queue insert rolls back the challenge, queue, cooldown
      // and delivery count together. Attempt protection remains committed.
      await tx.execute(sql`UPDATE customerOtpLimits SET windowStart=${resetWindow ? now : Number(deliveryLimit.windowStart)},hits=${deliveryHits+1}
        WHERE limitKey=${deliveryKey}`);
      for (const key of channelKeys) {
        await tx.execute(sql`UPDATE customerOtpLimits SET windowStart=${now},hits=hits+1
          WHERE limitKey=${key}`);
      }
      return {state:"issued"};
    });
  } catch {
    log("delivery_failed");
    throw new TRPCError({code:"SERVICE_UNAVAILABLE",message:channel === "whatsapp"
      ? "Não foi possível preparar o código pelo WhatsApp. Tente novamente ou use o e-mail."
      : "Não foi possível enviar o código por e-mail. Tente novamente."});
  }
  if (result.state !== "issued") {
    log(result.state);
    return {success:true,message:result.state === "channel_cooldown"
      ? "Aguarde para solicitar outro código."
      : "Limite de envios atingido. Aguarde o tempo indicado para solicitar outro código.",
      resendBlocked:true,retryAfterSeconds:result.retryAfterSeconds,
      cooldownScope:result.state === "channel_cooldown" ? "channel" : "all"};
  }
  log(channel === "email" ? "delivery_accepted" : channel === "whatsapp" ? "whatsapp_queued" : "dual_delivery_accepted");
  return {success:true,message:GENERIC,resendBlocked:false,retryAfterSeconds:60,
    cooldownScope:channel === "both" ? "all" : "channel",whatsappPrepared};
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
    if (await getRegistrationReviewStatus(tx,Number(customer.id)) !== "approved")
      return { success:false as const,message:"Seu cadastro está aguardando aprovação do administrador." };
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
    if (await getRegistrationReviewStatus(tx,Number(customer.id)) !== "approved")
      return { success:false as const, pendingApproval:true as const, message:"Cadastro recebido. Aguarde a aprovação do administrador." };
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
      UNIX_TIMESTAMP(s.expiresAt) * 1000 AS sessionExpiresAtMs,
      b.customerId,b.phoneKey,b.emailKey,b.expiresAt AS bindingExpires,
      c.id,c.phone,c.email,c.blocked,c.deletedAt,c.name,c.cpf,c.cep,c.street,
      c.addressNumber,c.neighborhood,c.city,c.uf,c.profilePhotoUrl
    FROM customerPasswordSessions s
    INNER JOIN customerOtpSessions b ON b.tokenHash=${tokenHash}
    INNER JOIN customers c ON c.id=b.customerId
    WHERE s.token=${token} AND b.expiresAt>${now} AND s.expiresAt>NOW()
    LIMIT 1`);
  if (!session || session.deletedAt || Number(session.blocked||0)!==0) return null;
  if (await getRegistrationReviewStatus(db,Number(session.customerId)) !== "approved") return null;
  const phone=normalizeCustomerPhone(session.phone), email=normalizeCustomerEmail(session.email);
  if (!phone || !email ||
      phone!==normalizeCustomerPhone(session.sessionPhone) ||
      session.phoneKey!==digest("phone",phone) || session.emailKey!==digest("email",email))
    return null;
  return { ...session, rawSessionCustomerPhone: session.phone, rawSessionCustomerEmail: session.email, phone, email };
}

/**
 * Refresh only a session which is currently valid, never revive an expired or
 * revoked token. The current ADM duration is the inactivity window. Keep both
 * durable expiry records synchronized in a single conditional SQL statement.
 * Normal authentication and derived-session reads remain read-only.
 */
export async function renewVerifiedCustomerOtpSession(db:any, tokenInput:string) {
  const token = String(tokenInput || "").trim();
  const verified = await getVerifiedCustomerOtpSession(db, token);
  if (!verified) return null;
  // Limit refresh writes to approximately one quarter of the configured
  // interval (at most one hour). Short policies must also be renewable.
  const { hours } = await readCustomerSessionPolicy(db);
  const durationMs = hours * CUSTOMER_SESSION_HOUR_MS;
  const now = Date.now();
  const currentExpiry = Math.min(Number(verified.bindingExpires), Number(verified.sessionExpiresAtMs));
  if (!Number.isFinite(currentExpiry) || currentExpiry <= now) return null;
  const expiresAtMs = Math.floor(now / 1000) * 1000 + durationMs;
  const threshold = Math.min(CUSTOMER_SESSION_HOUR_MS, durationMs / 4);
  if (expiresAtMs - currentExpiry < threshold) return verified;
  const tokenHash = digest("session", token);
  // An existing token is only updated, never inserted. The JOIN protects
  // against concurrent logout and a missing/expired record on either side.
  await db.execute(sql`UPDATE customerPasswordSessions s
    INNER JOIN customerOtpSessions b ON b.tokenHash=${tokenHash}
    INNER JOIN customers c ON c.id=b.customerId
    SET s.expiresAt=FROM_UNIXTIME(${expiresAtMs} / 1000),
        s.lastAccessAt=NOW(), b.expiresAt=${expiresAtMs}
    WHERE s.token=${token} AND b.expiresAt>${now} AND s.expiresAt>NOW()
      AND b.customerId=${Number(verified.customerId)}
      AND b.phoneKey=${verified.phoneKey} AND b.emailKey=${verified.emailKey}
      AND s.phone=${verified.sessionPhone}
      AND c.phone=${verified.rawSessionCustomerPhone}
      AND c.email=${verified.rawSessionCustomerEmail}
      AND c.deletedAt IS NULL AND COALESCE(c.blocked,0)=0
      AND LEAST(b.expiresAt,UNIX_TIMESTAMP(s.expiresAt)*1000)<=${expiresAtMs-threshold}
      AND GREATEST(b.expiresAt,UNIX_TIMESTAMP(s.expiresAt)*1000)<=${expiresAtMs}`);
  return getVerifiedCustomerOtpSession(db, token);
}

export async function revokeCustomerOtpSession(db:any, tokenInput:string) {
  const token=String(tokenInput||"").trim();
  if (!isToken(token)) return;
  await ensureCustomerOtpTables(db);
  await db.execute(sql`DELETE FROM customerOtpSessions WHERE tokenHash=${digest("session",token)}`);
  await db.execute(sql`DELETE FROM customerPasswordSessions WHERE token=${token}`);
}
