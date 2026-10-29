import type { Express, Request, Response } from "express";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { normalizeCustomerPhone } from "./customerAccess";
import { isOwnSiteEmailAuthorized, generateOwnSiteCode } from "./siteAccessOwnCodes";
import { resolveReferralDeclaration } from "./referral";
import { sendH2AutoOrderCode } from "./h2-auto-order-email";
import { recordH2AutoPhoneFailure, clearH2AutoPhoneFailures, type PhoneStage } from "./h2-auto-validation-blocks";
import { h2AutoPhoneFailureMessage, type H2AutoPhoneKind, type H2AutoPhoneFailure } from "./h2-auto-phone-attempt-message";
import { invalidH2AutoPhoneStageAnswer, h2AutoNavigationCommand } from "./h2-auto-validation-policy";
import { manualSilencedPhones, normalizeSilencedPhone } from "./h2-auto-silenced-contacts";
import { h2AutoCustomerNeedsProfileUpdate, selectH2AutoCustomerByPhone, H2_AUTO_CUSTOMER_PROFILE_UPDATE_MESSAGE, H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE } from "./h2-auto-customer-profile-guidance";

/**
 * WhatsApp first-contact gate. State is server-side and bound to a paired device
 * and an opaque, stable WhatsApp conversation ID. No raw chat IDs, chat messages,
 * e-mail addresses or plaintext verification codes are stored.
 *
 * This gate is separate from the authenticated order-consultation workflow.
 */
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const otpHash = (session: string, code: string) => {
  const secret = process.env.H2_SITE_ACCESS_SECRET || "";
  if (secret.length < 32) throw new Error("otp_secret_unavailable");
  return createHmac("sha256", secret).update("h2-auto-access:" + session + ":" + code).digest("hex");
};
const respond = (res: Response, status: number, body: object) =>
  res.status(status).set("Cache-Control", "no-store").json(body);
const initialMessage = "⚡ *H2 COLOMBIANO* 🇨🇴\n🤖 *CENTRAL DE ATENDIMENTO*\n\n👋 Olá! Seja bem-vindo!\n\n🔐 Para sua segurança,\nprecisamos identificar\nse você já é nosso cliente.\n\n1️⃣ *SIM, JÁ SOU CLIENTE*\n2️⃣ *NÃO SOU CLIENTE*\n3️⃣ *CONSULTAR MINHAS INDICAÇÕES*\n\n⌨️ Digite *1*, *2* ou *3*.\n🔙 *MENU* para início.\n━━━━━━━━━━━━━━━━\n🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴";
const navigationFooter = "\n\n🔙 Digite *0* para voltar.\n🏠 Digite *MENU* para início.";
const phoneMessage = "✅ *JÁ SOU CLIENTE*\n\n📱 Informe o telefone\ncadastrado no H2 Colombiano,\ncom DDD, para confirmar\nsua identidade.\n\n⌨️ Envie 11 números com DDD." + navigationFooter;
const referrerMessage = "🆕 *NOVO CLIENTE*\n\n🇨🇴 Atendemos somente\npor indicação.\n\n📱 Informe o telefone\ncom DDD de quem\nindicou você.\n\n⌨️ Envie 11 números com DDD." + navigationFooter;
const invalidReferral = "⚠️ *INDICAÇÃO NÃO VALIDADA*\n\n❌ Não foi possível validar\no telefone informado.\n\n📱 Informe outro número\nde indicador autorizado.\n\n👨‍💻 Digite *6* para falar\ncom um atendente.";
const noReferral = "🔐 *INDICAÇÃO OBRIGATÓRIA*\n\nPara continuar, informe\no telefone de um indicador\ncadastrado e autorizado.\n\n👨‍💻 Digite *6* para ajuda.";
const anonymousCustomerFailure = "⚠️ Não foi possível confirmar\num cadastro autorizado\ncom esse telefone.\n\n📱 Confira o número com DDD\nou solicite atendimento.";
const minute = 60_000;
const hour = 60 * minute;
const defaultAccessHours = 24;
const otpLifetime = 10 * minute;
type Stage = "choice" | "referrals_phone" | "referrals_code" | "customer_phone" | "customer_code" | "referral_phone" | "customer" | "new" | "customer_menu" | "new_menu" | "blocked" | "released_customer_phone" | "released_referral_phone" | "released_referrals_phone";
type Session = {
  id: string; device_id: string; stage: Stage; customer_id: number | null; referrer_id: number | null;
  customer_phone_hash: string | null; customer_email_hash: string | null;
  code_hash: string | null; code_expires: number | null; code_attempts: number;
  resend_after: number; expires_at: number; updated_at: number;
};
let ready: Promise<void> | undefined;
async function ensure() {
  if (!ready) ready = (async () => {
    const db = await getDb();
    if (!db) throw new Error("db_unavailable");
    await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_access_sessions (
      id CHAR(64) PRIMARY KEY,
      device_id VARCHAR(32) NOT NULL,
      stage VARCHAR(32) NOT NULL,
      customer_id INT NULL,
      referrer_id INT NULL,
      customer_phone_hash CHAR(64) NULL,
      customer_email_hash CHAR(64) NULL,
      code_hash CHAR(64) NULL,
      code_expires BIGINT NULL,
      code_attempts INT NOT NULL DEFAULT 0,
      resend_after BIGINT NOT NULL DEFAULT 0,
      expires_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      INDEX idx_h2auto_access_expiry (expires_at)
    ) ENGINE=InnoDB`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_access_limits (
      limit_key CHAR(64) PRIMARY KEY,
      window_started_at BIGINT NOT NULL,
      hits INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB`);
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
async function rows(statement: ReturnType<typeof sql>): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("db_unavailable");
  const result = await db.execute(statement);
  return (result[0] || []) as unknown as any[];
}
async function update(sessionId: string, changes: ReturnType<typeof sql>) {
  const db = await getDb();
  if (!db) throw new Error("db_unavailable");
  await db.execute(sql`UPDATE h2_auto_access_sessions SET ${changes} WHERE id=${sessionId}`);
}
async function limited(key: string, max: number, windowMs: number, now: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("db_unavailable");
  const limitKey = digest("access-limit:" + key);
  await db.execute(sql`INSERT INTO h2_auto_access_limits (limit_key,window_started_at,hits)
    VALUES (${limitKey},${now},1)
    ON DUPLICATE KEY UPDATE hits=IF(window_started_at<=${now-windowMs},1,LEAST(hits+1,1000000)),
      window_started_at=IF(window_started_at<=${now-windowMs},${now},window_started_at)`);
  const found = await rows(sql`SELECT hits FROM h2_auto_access_limits WHERE limit_key=${limitKey} LIMIT 1`);
  return Number(found[0]?.hits || 0) > max;
}
async function deviceFor(req: Request): Promise<string | null> {
  const id = String(req.header("x-h2-device-id") || "");
  const token = String(req.header("x-h2-device-token") || "");
  if (!/^[a-f0-9]{24}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) return null;
  const found = await rows(sql`SELECT token_hash FROM h2_auto_devices WHERE id=${id} LIMIT 1`);
  const expected = String(found[0]?.token_hash || "");
  if (!/^[a-f0-9]{64}$/.test(expected)) return null;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(digest(token), "hex")) ? id : null;
}
async function customerFor(phone: string) {
  const normalized = normalizeCustomerPhone(phone);
  if (!normalized) return null;
  // Prefilter by DDD and final 8 digits to include legacy mobiles with/without
  // the ninth digit. The helper confirms the full DDD/phone equivalence.
  // Ambiguous matches must not receive an OTP.
  const found = await rows(sql`SELECT id,phone,email,blocked,name,cpf,cep,street,addressNumber,neighborhood,city,uf,profilePhotoUrl FROM customers
    WHERE deletedAt IS NULL AND COALESCE(blocked,0)=0
    AND RIGHT(REGEXP_REPLACE(phone,'[^0-9]',''),8)=${normalized.slice(-8)}
    AND LEFT(RIGHT(REGEXP_REPLACE(phone,'[^0-9]',''),11),2)=${normalized.slice(0,2)} LIMIT 50`);
  const customer = selectH2AutoCustomerByPhone(found, normalized);
  if (!customer || Number(customer.blocked) !== 0) return null;
  return { ...customer, id: Number(customer.id), phone: String(customer.phone), email: String(customer.email || "") };
}
async function activeCustomerBinding(s: Session) {
  if (!s.customer_id || !s.customer_email_hash || !s.customer_phone_hash) return false;
  const customers = await rows(sql`SELECT id,phone,email FROM customers WHERE id=${s.customer_id}
    AND deletedAt IS NULL AND COALESCE(blocked,0)=0 LIMIT 1`);
  const c = customers[0];
  if (!c || digest(String(c.email).trim().toLowerCase()) !== s.customer_email_hash ||
      digest(String(normalizeCustomerPhone(c.phone) || "")) !== s.customer_phone_hash) return false;
  const db = await getDb();
  return !!db && await isOwnSiteEmailAuthorized(db, String(c.email));
}
async function activeReferralBinding(s: Session) {
  if (!s.referrer_id) return false;
  const customer = await rows(sql`SELECT phone FROM customers WHERE id=${s.referrer_id}
    AND deletedAt IS NULL AND COALESCE(blocked,0)=0 LIMIT 1`);
  if (customer.length !== 1) return false;
  const found = await resolveReferralDeclaration({ customerPhone: "", referrerPhone: customer[0].phone });
  return found.issue === null && found.linkedReferrer?.id === Number(s.referrer_id);
}
const grant = (audience: "customer" | "new" | "referrals") => ({ state: "granted", audience });
const verified = (audience: "customer" | "new") => ({ state: "authorized", audience });

export function registerH2AutoAccessRoutes(app: Express): void {
  app.post("/api/h2-auto/access/step", async (req: Request, res: Response) => {
    try {
      await ensure();
      const deviceId = await deviceFor(req);
      let identificationDisabled = false;
      if (deviceId) {
        const live = await rows(sql`SELECT JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.enabled')) AS bot_on,
          CAST(JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.identificationSessionHours')) AS UNSIGNED) AS session_hours,
          JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.identificationEnabled')) AS identity_on,
          JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.blocked')) AS blocked_phones
          FROM h2_auto_devices WHERE id=${deviceId} LIMIT 1`);
        if (live[0]?.bot_on !== "true") return respond(res,200,{state:"disabled"});
        identificationDisabled = live[0]?.identity_on === "false";
      }
      if (!deviceId) return respond(res, 401, { error: "unauthorized" });
      const rawHours=Number((await rows(sql`SELECT JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.identificationSessionHours')) AS hours FROM h2_auto_devices WHERE id=${deviceId} LIMIT 1`))[0]?.hours);
      const configuredHours=Number.isInteger(rawHours) && rawHours>=1 && rawHours<=720 ? rawHours : defaultAccessHours;
      const accessLifetime=configuredHours*hour;
      const conversation = req.body?.conversationId;
      const input = req.body?.input;
      // The Android client hashes the stable WhatsApp shortcut; never send raw contact identifiers.
      if (typeof conversation !== "string" || !/^[a-f0-9]{64}$/.test(conversation) ||
          typeof input !== "string" || input.length > 4000)
        return respond(res, 400, { error: "invalid_request" });
      const normalized = input.trim().toLowerCase();
      const sessionId = digest(deviceId + "|" + conversation);
      const now = Date.now();
      const existing = await rows(sql`SELECT * FROM h2_auto_access_sessions WHERE id=${sessionId} AND device_id=${deviceId} LIMIT 1`);
      const s = existing[0] as Session | undefined;

      // Verified customers are identified by the phone from their existing OTP
      // session, even if WhatsApp displays only a saved name. No chat identity
      // is inferred from a name, and blocked clients receive no automatic reply.
      const blockedPhones = manualSilencedPhones(String((await rows(sql`SELECT
        JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.blocked')) AS blocked_phones
        FROM h2_auto_devices WHERE id=${deviceId} LIMIT 1`))[0]?.blocked_phones || ""));
      // If WhatsApp exposes the actual number in the notification label, stop
      // even on first contact before the phone challenge or a config sync.
      const labelPhone=typeof req.body?.contactLabel === "string" ?
        normalizeSilencedPhone(req.body.contactLabel) : null;
      if (labelPhone && blockedPhones.includes(labelPhone))
        return respond(res,200,{state:"disabled"});
      if (blockedPhones.length && s?.customer_phone_hash &&
          blockedPhones.some(number => digest(number) === s.customer_phone_hash))
        return respond(res, 200, {state:"disabled"});
      if (blockedPhones.length && (s?.stage === "customer_phone" || s?.stage === "referrals_phone") &&
          blockedPhones.includes(normalizeCustomerPhone(input) || ""))
        return respond(res, 200, {state:"disabled"});
      if (s?.stage === "blocked") return respond(res, 200, { state: "blocked", message: "" });
      const phoneError = async (stage: PhoneStage, kind: H2AutoPhoneKind,
        reason: H2AutoPhoneFailure) => {
        const result = await recordH2AutoPhoneFailure({deviceId,sessionId,conversationId:conversation,
          contactLabel:String(req.body?.contactLabel || ""),invalidAnswer:input,
          stage,reason:reason === "formato" ? "Telefone fora do formato" : "Telefone não confirmado"});
        if (!result.accepted) return {state:"blocked",message:""};
        return {state:result.blocked ? "blocked" : stage,
          message:h2AutoPhoneFailureMessage(kind,reason,result.attempts)};
      };
      if (identificationDisabled) return respond(res,200,{state:"identification_disabled"});
      if (s?.stage === "released_customer_phone" || s?.stage === "released_referral_phone" || s?.stage === "released_referrals_phone") {
        const stage = s.stage === "released_customer_phone" ? "customer_phone" :
          s.stage === "released_referrals_phone" ? "referrals_phone" : "referral_phone";
        await update(sessionId, sql`stage=${stage},updated_at=${now}`);
        return respond(res, 200, { state: stage, message: stage === "referral_phone" ? referrerMessage : phoneMessage });
      }

      if (!s || now - Number(s.updated_at) >= accessLifetime || Number(s.updated_at) > now) {
        const db = await getDb();
        if (!db) throw new Error("db_unavailable");
        await db.execute(sql`INSERT INTO h2_auto_access_sessions
          (id,device_id,stage,updated_at) VALUES (${sessionId},${deviceId},'choice',${now})
          ON DUPLICATE KEY UPDATE stage='choice',customer_id=NULL,referrer_id=NULL,
            customer_phone_hash=NULL,customer_email_hash=NULL,code_hash=NULL,code_expires=NULL,
            code_attempts=0,resend_after=0,expires_at=0,updated_at=VALUES(updated_at)`);
        await clearH2AutoPhoneFailures(deviceId,sessionId);
        return respond(res, 200, { state: "choice", message: initialMessage });
      }

      // Navigation commands must be handled BEFORE the strict phone validator.
      // Persistent validation blocks and ADM contact silencing already took precedence.
      const navigation = h2AutoNavigationCommand(input);
      const isMenu = navigation === "home";
      const isBack = navigation === "back";
      // MENU returns to the first question without extending a verified session.
      const authorizedAudience: "customer" | "new" | null =
        s.stage === "customer" || s.stage === "customer_menu" ? "customer" :
        s.stage === "new" || s.stage === "new_menu" ? "new" : null;
      if (authorizedAudience) {
        const allowed = authorizedAudience === "customer"
          ? await activeCustomerBinding(s) : await activeReferralBinding(s);
        const valid = allowed && Number(s.expires_at) > 0 &&
          Number(s.updated_at) <= now && now - Number(s.updated_at) < accessLifetime;
        if (!valid) {
          await update(sessionId, sql`stage='choice',customer_id=NULL,referrer_id=NULL,
            customer_phone_hash=NULL,customer_email_hash=NULL,code_hash=NULL,code_expires=NULL,
            code_attempts=0,expires_at=0,updated_at=${now}`);
          return respond(res, 200, { state: "choice", message: initialMessage });
        }
        if (isMenu) {
          // Only MENU resets the audience choice. Zero stays local to the tree back stack.
          const menuStage = authorizedAudience === "customer" ? "customer_menu" : "new_menu";
          // Do not touch updated_at: MENU must not extend the authorized window.
          if (s.stage !== menuStage) await update(sessionId, sql`stage=${menuStage}`);
          return respond(res, 200, { state: "choice", message: initialMessage });
        }
        if (s.stage === "customer_menu" || s.stage === "new_menu") {
          if (isBack) return respond(res, 200, {state: "choice", message: initialMessage});
          // Selecting the already verified audience restores service access
          // without another code or indicator check.
          if (authorizedAudience === "customer" && normalized === "3") {
            await update(sessionId, sql`stage='customer'`);
            return respond(res, 200, grant("referrals"));
          }
          if ((authorizedAudience === "customer" && normalized === "1") ||
              (authorizedAudience === "new" && normalized === "2")) {
            await update(sessionId, sql`stage=${authorizedAudience}`);
            return respond(res, 200, grant(authorizedAudience));
          }
          // Switching audiences requires validating the other audience.
          if (normalized === "1" || normalized === "2") {
            const destination = normalized === "1" ? "customer_phone" : "referral_phone";
            await update(sessionId, sql`stage=${destination},
              customer_id=NULL,referrer_id=NULL,customer_phone_hash=NULL,
              customer_email_hash=NULL,code_hash=NULL,code_expires=NULL,
              code_attempts=0,resend_after=0,expires_at=0,updated_at=${now}`);
            return respond(res, 200, { state: destination,
              message: destination === "customer_phone" ? phoneMessage : referrerMessage });
          }
          return respond(res, 200, { state: "choice", message: initialMessage });
        }
        // Existing normal service navigation remains authorized.
        return respond(res, 200, verified(authorizedAudience));
      }

      // MENU = home; 0 = previous step. In phone and code stages these are
      // navigation, never failed phone answers or OTP attempts.
      // Do not allow these commands to release a previously blocked session.
      if (isMenu || (isBack && s.stage !== "choice")) {
        const destination = isBack && (s.stage === "customer_code" || s.stage === "referrals_code")
          ? (s.stage === "referrals_code" ? "referrals_phone" : "customer_phone") : "choice";
        await update(sessionId, sql`stage=${destination},customer_id=NULL,referrer_id=NULL,
          customer_phone_hash=NULL,customer_email_hash=NULL,code_hash=NULL,code_expires=NULL,
          code_attempts=0,resend_after=0,expires_at=0,updated_at=${now}`);
        return respond(res, 200, {state: destination,
          message: destination === "customer_phone" || destination === "referrals_phone" ? phoneMessage : initialMessage});
      }

      if (s.stage === "choice") {
        if (normalized === "1") {
          await update(sessionId, sql`stage='customer_phone',updated_at=${now}`);
          return respond(res, 200, { state: "customer_phone", message: phoneMessage });
        }
        if (normalized === "3") {
          await update(sessionId, sql`stage='referrals_phone',updated_at=${now}`);
          return respond(res, 200, { state: "referrals_phone", message: phoneMessage });
        }
        if (normalized === "2") {
          await update(sessionId, sql`stage='referral_phone',updated_at=${now}`);
          return respond(res, 200, { state: "referral_phone", message: referrerMessage });
        }
        return respond(res, 200, { state: "choice", message: initialMessage });
      }

      if (s.stage === "customer_phone" || s.stage === "referrals_phone") {
        const phone = normalizeCustomerPhone(input);
        const referralEntry = s.stage === "referrals_phone";
        if (invalidH2AutoPhoneStageAnswer(s.stage, input) || !phone)
          return respond(res,200,await phoneError(
            referralEntry ? "referrals_phone" : "customer_phone",
            referralEntry ? "indicacoes" : "cadastro","formato"));
        if (Number(s.resend_after) > now)
          return respond(res, 200, { state: "customer_phone", message: "⏳ Aguarde um minuto para solicitar outro código.\n\n🔙 *0* ou *MENU* para voltar." });
        if (await limited("device:" + deviceId, 400, hour, now) ||
            await limited("phone:" + phone, 5, hour, now))
          return respond(res, 200, { state: "customer_phone", message: "⏳ Limite de tentativas atingido. Tente mais tarde." });
        const customer = await customerFor(phone);
        const db = await getDb();
        // Never tell a fully completed customer to update the profile because
        // the phone lookup or site-email authorization could not be confirmed.
        if (!db) throw Error("db_unavailable");
        if (!customer) return respond(res,200,await phoneError(
          referralEntry ? "referrals_phone" : "customer_phone",
          referralEntry ? "indicacoes" : "cadastro","nao_confirmado"));
        if (h2AutoCustomerNeedsProfileUpdate(customer))
          return respond(res, 200, { state: "customer_phone", message: H2_AUTO_CUSTOMER_PROFILE_UPDATE_MESSAGE });
        if (!(await isOwnSiteEmailAuthorized(db, customer.email)))
          return respond(res, 200, { state: "customer_phone", message: H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE });
        const code = generateOwnSiteCode();
        const codeHash = otpHash(sessionId, code);
        const changed: any = await db.execute(sql`UPDATE h2_auto_access_sessions SET
          stage=${referralEntry ? "referrals_code" : "customer_code"},customer_id=${customer.id},referrer_id=NULL,
          customer_phone_hash=${digest(String(normalizeCustomerPhone(customer.phone) || ""))},
          customer_email_hash=${digest(customer.email.trim().toLowerCase())},
          code_hash=${codeHash},code_expires=${now+otpLifetime},code_attempts=0,
          resend_after=${now+minute},updated_at=${now}
          WHERE id=${sessionId} AND stage=${referralEntry ? 'referrals_phone' : 'customer_phone'} AND resend_after<=${now}`);
        if (!changed[0]?.affectedRows)
          return respond(res, 200, { state: "customer_phone", message: "⏳ Aguarde e tente novamente." });
        try {
          await sendH2AutoOrderCode(customer.email, code, 10, "access");
        } catch {
          await db.execute(sql`UPDATE h2_auto_access_sessions SET stage=${referralEntry ? 'referrals_phone' : 'customer_phone'},
            code_hash=NULL,code_expires=NULL,updated_at=${Date.now()}
            WHERE id=${sessionId} AND code_hash=${codeHash}`);
          return respond(res, 200, { state: "customer_phone", message: "⚠️ Não foi possível enviar o código agora. Tente novamente." });
        }
        await clearH2AutoPhoneFailures(deviceId,sessionId);
        return respond(res, 200, { state: referralEntry ? "referrals_code" : "customer_code",
          message: "📧 *CONFIRMAÇÃO DE E-MAIL*\n\n✅ Enviamos um código ao\ne-mail do seu cadastro.\n\n🔢 Digite os *6 números*.\n⏳ Validade: *10 minutos*.\n\n🔙 *0* para voltar.\nDigite *MENU* para início." });
      }

      if (s.stage === "customer_code" || s.stage === "referrals_code") {
        const referralEntry = s.stage === "referrals_code";
        const actual = /^[0-9]{6}$/.test(input.trim()) ? otpHash(sessionId, input.trim()) : "";
        const expected = String(s.code_hash || "");
        const same = /^[a-f0-9]{64}$/.test(expected) && /^[a-f0-9]{64}$/.test(actual) &&
          timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
        const valid = same && Number(s.code_expires) > now && Number(s.code_attempts) < 5 &&
          await activeCustomerBinding(s);
        if (!valid) {
          const db = await getDb();
          if (!db) throw new Error("db_unavailable");
          await db.execute(sql`UPDATE h2_auto_access_sessions SET code_attempts=LEAST(code_attempts+1,5)
            WHERE id=${sessionId} AND stage=${referralEntry ? 'referrals_code' : 'customer_code'}`);
          return respond(res, 200, { state: referralEntry ? "referrals_code" : "customer_code",
            message: "⚠️ Código inválido ou expirado.\nConfira o e-mail.\n\nDigite *0* para voltar.\nDigite *MENU* para início." });
        }
        const db = await getDb();
        if (!db) throw new Error("db_unavailable");
        const changed: any = await db.execute(sql`UPDATE h2_auto_access_sessions SET
          stage='customer',code_hash=NULL,code_expires=NULL,code_attempts=0,
          expires_at=${now+accessLifetime},updated_at=${now}
          WHERE id=${sessionId} AND stage=${referralEntry ? 'referrals_code' : 'customer_code'} AND code_hash=${expected}
            AND code_expires>${now} AND code_attempts<5`);
        if (!changed[0]?.affectedRows)
          return respond(res, 200, { state: referralEntry ? "referrals_code" : "customer_code", message: "⚠️ Código inválido ou expirado." });
        return respond(res, 200, grant(referralEntry ? "referrals" : "customer"));
      }

      if (s.stage === "referral_phone") {
        if (invalidH2AutoPhoneStageAnswer(s.stage, input) || !normalizeCustomerPhone(input))
          return respond(res,200,await phoneError("referral_phone","indicador","formato"));
        if (normalized === "6") return respond(res, 200, { state: "human",
          message: "👨‍💻 *ATENDIMENTO HUMANO*\n\nSua solicitação foi encaminhada.\n⏳ Tempo médio: 5 minutos.\n\nDigite *MENU* para voltar." });
        if (normalized === "nao" || normalized === "não" || normalized.includes("nao tenho") || normalized.includes("não tenho") || normalized.includes("sem indicador"))
          return respond(res, 200, { state: "referral_phone", message: noReferral });
        if (await limited("referral:" + sessionId, 30, hour, now))
          return respond(res, 200, { state: "referral_phone", message: "⏳ Muitas tentativas. Aguarde e tente novamente." });
        const found = await resolveReferralDeclaration({ customerPhone: "", referrerPhone: input });
        if (found.issue || !found.linkedReferrer)
          return respond(res,200,await phoneError("referral_phone","indicador","nao_confirmado"));
        const db = await getDb();
        if (!db) throw new Error("db_unavailable");
        await db.execute(sql`UPDATE h2_auto_access_sessions SET stage='new',
          referrer_id=${found.linkedReferrer.id},customer_id=NULL,
          customer_phone_hash=NULL,customer_email_hash=NULL,
          code_hash=NULL,code_expires=NULL,expires_at=${now+accessLifetime},
          updated_at=${now} WHERE id=${sessionId} AND stage='referral_phone'`);
        await clearH2AutoPhoneFailures(deviceId,sessionId);
        return respond(res, 200, grant("new"));
      }
      return respond(res, 200, { state: "choice", message: initialMessage });
    } catch {
      return respond(res, 503, { error: "temporarily_unavailable" });
    }
  });
}
