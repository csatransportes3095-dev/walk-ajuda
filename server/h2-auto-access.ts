import type { Express, Request, Response } from "express";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { normalizeCustomerPhone } from "./customerAccess";
import { isOwnSiteEmailAuthorized, generateOwnSiteCode } from "./siteAccessOwnCodes";
import { resolveReferralDeclaration } from "./referral";
import { sendH2AutoOrderCode } from "./h2-auto-order-email";

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
const initialMessage = "⚡ *H2 COLOMBIANO* 🇨🇴\n🤖 *CENTRAL DE ATENDIMENTO*\n\n👋 Olá! Seja bem-vindo!\n\n🔐 Para sua segurança,\nprecisamos identificar\nse você já é nosso cliente.\n\n1️⃣ *SIM, JÁ SOU CLIENTE*\n2️⃣ *NÃO SOU CLIENTE*\n\n⌨️ Digite *1* ou *2*.\n━━━━━━━━━━━━━━━━\n🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴";
const phoneMessage = "✅ *JÁ SOU CLIENTE*\n\n📱 Informe o telefone\ncadastrado no H2 Colombiano,\ncom DDD, para confirmar\nsua identidade.";
const referrerMessage = "🆕 *NOVO CLIENTE*\n\n🇨🇴 Atendemos somente\npor indicação.\n\n📱 Informe o telefone\ncom DDD de quem\nindicou você.";
const invalidReferral = "⚠️ *INDICAÇÃO NÃO VALIDADA*\n\n❌ Não foi possível validar\no telefone informado.\n\n📱 Informe outro número\nde indicador autorizado.\n\n👨‍💻 Digite *6* para falar\ncom um atendente.";
const noReferral = "🔐 *INDICAÇÃO OBRIGATÓRIA*\n\nPara continuar, informe\no telefone de um indicador\ncadastrado e autorizado.\n\n👨‍💻 Digite *6* para ajuda.";
const anonymousCustomerFailure = "⚠️ Não foi possível confirmar\num cadastro autorizado\ncom esse telefone.\n\n📱 Confira o número com DDD\nou solicite atendimento.";
const minute = 60_000;
const hour = 60 * minute;
const accessLifetime = 24 * hour;
const otpLifetime = 10 * minute;
type Stage = "choice" | "customer_phone" | "customer_code" | "referral_phone" | "customer" | "new";
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
  const found = await rows(sql`SELECT id,phone,email,blocked FROM customers
    WHERE deletedAt IS NULL AND COALESCE(blocked,0)=0
    AND RIGHT(REGEXP_REPLACE(phone,'[^0-9]',''),11)=${normalized.slice(-11)} LIMIT 2`);
  if (found.length !== 1 || !found[0].email || Number(found[0].blocked) !== 0) return null;
  return { id: Number(found[0].id), phone: String(found[0].phone), email: String(found[0].email) };
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
const grant = (audience: "customer" | "new") => ({ state: "granted", audience });
const verified = (audience: "customer" | "new") => ({ state: "authorized", audience });

export function registerH2AutoAccessRoutes(app: Express): void {
  app.post("/api/h2-auto/access/step", async (req: Request, res: Response) => {
    try {
      await ensure();
      const deviceId = await deviceFor(req);
      if (!deviceId) return respond(res, 401, { error: "unauthorized" });
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

      if (!s || now - Number(s.updated_at) >= accessLifetime || Number(s.updated_at) > now) {
        const db = await getDb();
        if (!db) throw new Error("db_unavailable");
        await db.execute(sql`INSERT INTO h2_auto_access_sessions
          (id,device_id,stage,updated_at) VALUES (${sessionId},${deviceId},'choice',${now})
          ON DUPLICATE KEY UPDATE stage='choice',customer_id=NULL,referrer_id=NULL,
            customer_phone_hash=NULL,customer_email_hash=NULL,code_hash=NULL,code_expires=NULL,
            code_attempts=0,resend_after=0,expires_at=0,updated_at=VALUES(updated_at)`);
        return respond(res, 200, { state: "choice", message: initialMessage });
      }

      if (s.stage === "customer" || s.stage === "new") {
        const allowed = s.stage === "customer" ? await activeCustomerBinding(s) : await activeReferralBinding(s);
        if (Number(s.expires_at) > now && allowed) return respond(res, 200, verified(s.stage));
        await update(sessionId, sql`stage='choice',customer_id=NULL,referrer_id=NULL,
          customer_phone_hash=NULL,customer_email_hash=NULL,code_hash=NULL,code_expires=NULL,
          expires_at=0,updated_at=${now}`);
        return respond(res, 200, { state: "choice", message: initialMessage });
      }

      if (s.stage === "choice") {
        if (normalized === "1") {
          await update(sessionId, sql`stage='customer_phone',updated_at=${now}`);
          return respond(res, 200, { state: "customer_phone", message: phoneMessage });
        }
        if (normalized === "2") {
          await update(sessionId, sql`stage='referral_phone',updated_at=${now}`);
          return respond(res, 200, { state: "referral_phone", message: referrerMessage });
        }
        return respond(res, 200, { state: "choice", message: initialMessage });
      }

      if (normalized === "menu" || normalized === "inicio") {
        await update(sessionId, sql`stage='choice',code_hash=NULL,code_expires=NULL,updated_at=${now}`);
        return respond(res, 200, { state: "choice", message: initialMessage });
      }

      if (s.stage === "customer_phone") {
        const phone = normalizeCustomerPhone(input);
        if (!phone) return respond(res, 200, { state: "customer_phone", message: "📱 Informe um telefone válido com DDD." });
        if (Number(s.resend_after) > now)
          return respond(res, 200, { state: "customer_phone", message: "⏳ Aguarde um minuto para solicitar outro código." });
        if (await limited("device:" + deviceId, 400, hour, now) ||
            await limited("phone:" + phone, 5, hour, now))
          return respond(res, 200, { state: "customer_phone", message: "⏳ Limite de tentativas atingido. Tente mais tarde." });
        const customer = await customerFor(phone);
        const db = await getDb();
        if (!customer || !db || !(await isOwnSiteEmailAuthorized(db, customer.email)))
          return respond(res, 200, { state: "customer_phone", message: anonymousCustomerFailure });
        const code = generateOwnSiteCode();
        const codeHash = otpHash(sessionId, code);
        const changed: any = await db.execute(sql`UPDATE h2_auto_access_sessions SET
          stage='customer_code',customer_id=${customer.id},referrer_id=NULL,
          customer_phone_hash=${digest(String(normalizeCustomerPhone(customer.phone) || ""))},
          customer_email_hash=${digest(customer.email.trim().toLowerCase())},
          code_hash=${codeHash},code_expires=${now+otpLifetime},code_attempts=0,
          resend_after=${now+minute},updated_at=${now}
          WHERE id=${sessionId} AND stage='customer_phone' AND resend_after<=${now}`);
        if (!changed[0]?.affectedRows)
          return respond(res, 200, { state: "customer_phone", message: "⏳ Aguarde e tente novamente." });
        try {
          await sendH2AutoOrderCode(customer.email, code, 10, "access");
        } catch {
          await db.execute(sql`UPDATE h2_auto_access_sessions SET stage='customer_phone',
            code_hash=NULL,code_expires=NULL,updated_at=${Date.now()}
            WHERE id=${sessionId} AND code_hash=${codeHash}`);
          return respond(res, 200, { state: "customer_phone", message: "⚠️ Não foi possível enviar o código agora. Tente novamente." });
        }
        return respond(res, 200, { state: "customer_code",
          message: "📧 *CONFIRMAÇÃO DE E-MAIL*\n\n✅ Enviamos um código ao\ne-mail do seu cadastro.\n\n🔢 Digite os *6 números*.\n⏳ Validade: *10 minutos*." });
      }

      if (s.stage === "customer_code") {
        if (normalized === "0" || normalized === "voltar") {
          await update(sessionId, sql`stage='customer_phone',code_hash=NULL,code_expires=NULL,updated_at=${now}`);
          return respond(res, 200, { state: "customer_phone", message: phoneMessage });
        }
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
            WHERE id=${sessionId} AND stage='customer_code'`);
          return respond(res, 200, { state: "customer_code",
            message: "⚠️ Código inválido ou expirado.\nConfira o e-mail.\n\nDigite *0* para voltar." });
        }
        const db = await getDb();
        if (!db) throw new Error("db_unavailable");
        const changed: any = await db.execute(sql`UPDATE h2_auto_access_sessions SET
          stage='customer',code_hash=NULL,code_expires=NULL,code_attempts=0,
          expires_at=${now+accessLifetime},updated_at=${now}
          WHERE id=${sessionId} AND stage='customer_code' AND code_hash=${expected}
            AND code_expires>${now} AND code_attempts<5`);
        if (!changed[0]?.affectedRows)
          return respond(res, 200, { state: "customer_code", message: "⚠️ Código inválido ou expirado." });
        return respond(res, 200, grant("customer"));
      }

      if (s.stage === "referral_phone") {
        if (normalized === "6") return respond(res, 200, { state: "human",
          message: "👨‍💻 *ATENDIMENTO HUMANO*\n\nSua solicitação foi encaminhada.\n⏳ Tempo médio: 5 minutos.\n\nDigite *MENU* para voltar." });
        if (normalized === "nao" || normalized === "não" || normalized.includes("nao tenho") || normalized.includes("não tenho") || normalized.includes("sem indicador"))
          return respond(res, 200, { state: "referral_phone", message: noReferral });
        if (await limited("referral:" + sessionId, 30, hour, now))
          return respond(res, 200, { state: "referral_phone", message: "⏳ Muitas tentativas. Aguarde e tente novamente." });
        const found = await resolveReferralDeclaration({ customerPhone: "", referrerPhone: input });
        if (found.issue || !found.linkedReferrer)
          return respond(res, 200, { state: "referral_phone", message: invalidReferral });
        const db = await getDb();
        if (!db) throw new Error("db_unavailable");
        await db.execute(sql`UPDATE h2_auto_access_sessions SET stage='new',
          referrer_id=${found.linkedReferrer.id},customer_id=NULL,
          customer_phone_hash=NULL,customer_email_hash=NULL,
          code_hash=NULL,code_expires=NULL,expires_at=${now+accessLifetime},
          updated_at=${now} WHERE id=${sessionId} AND stage='referral_phone'`);
        return respond(res, 200, grant("new"));
      }
      return respond(res, 200, { state: "choice", message: initialMessage });
    } catch {
      return respond(res, 503, { error: "temporarily_unavailable" });
    }
  });
}
