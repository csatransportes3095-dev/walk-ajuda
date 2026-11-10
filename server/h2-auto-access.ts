import type { Express, Request, Response } from "express";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { normalizeCustomerPhone, normalizeCustomerEmail } from "./customerAccess";
import { generateOwnSiteCode } from "./siteAccessOwnCodes";
import { resolveReferralDeclaration } from "./referral";
import { sendH2AutoOrderCode } from "./h2-auto-order-email";
import { recordH2AutoPhoneFailure, clearH2AutoPhoneFailures, type PhoneStage } from "./h2-auto-validation-blocks";
import { h2AutoPhoneFailureMessage, type H2AutoPhoneKind, type H2AutoPhoneFailure } from "./h2-auto-phone-attempt-message";
import { invalidH2AutoPhoneStageAnswer, normalizeH2AutoPhone11, h2AutoNavigationCommand, initialH2AutoChoiceStage, repeatedH2AutoChoice, isH2AutoHelpRequest, isH2AutoFreeTextDuringPhoneStage, isH2AutoGreeting, h2AutoNaturalNewCustomerIntent, h2AutoNaturalExistingCustomerIntent, h2AutoNaturalReferralsIntent, h2AutoGreetingWelcome, h2AutoGreetingPrefix } from "./h2-auto-validation-policy";
import { manualSilencedPhones, normalizeSilencedPhone } from "./h2-auto-silenced-contacts";
import { h2AutoConfirmationSchema } from "../shared/h2AutoConfirmation";
import { h2AutoPersonalizationSchema, H2_AUTO_PERSONALIZATION_DEFAULT, getH2AutoPersonalizedReply } from "../shared/h2AutoPersonalization";
import { h2AutoCustomerNeedsProfileUpdate, selectH2AutoCustomerByPhone } from "./h2-auto-customer-profile-guidance";
import { recordH2AutoUnknownQuestion, safeH2AutoUnknownQuestion } from "./h2-auto-learning";

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
    // O usuário autorizou a captura em 05/11. Migração única por aparelho,
    // preservando futuras desativações feitas manualmente no ADM.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_learning_optin_20261105 (
      device_id VARCHAR(32) PRIMARY KEY,
      enabled_at BIGINT NOT NULL
    ) ENGINE=InnoDB`);
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
const learningOptInApplied = new Set<string>();
async function enableLearningOnce(deviceId: string): Promise<void> {
  if (learningOptInApplied.has(deviceId)) return;
  const db = await getDb();
  if (!db) throw new Error("db_unavailable");
  // Uma transação por aparelho: não sobrescreve configurações de outros módulos.
  await db.transaction(async tx => {
    const selected = await tx.execute(sql`SELECT
      JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.questionCollectionEnabled')) AS active
      FROM h2_auto_devices WHERE id=${deviceId} LIMIT 1 FOR UPDATE`);
    const row = (selected[0] as any[])[0];
    if (!row) return;
    const migrated = await tx.execute(sql`SELECT device_id FROM h2_auto_learning_optin_20261105
      WHERE device_id=${deviceId} LIMIT 1`);
    if ((migrated[0] as any[]).length) return;
    if (String(row.active) !== "true") {
      await tx.execute(sql`UPDATE h2_auto_devices SET
        config_json=JSON_SET(config_json,'$.questionCollectionEnabled',
          CAST(${JSON.stringify(true)} AS JSON)),
        revision=revision+1 WHERE id=${deviceId}`);
    }
    await tx.execute(sql`INSERT INTO h2_auto_learning_optin_20261105
      (device_id, enabled_at) VALUES (${deviceId},${Date.now()})`);
  });
  learningOptInApplied.add(deviceId);
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
  // Authorization here is the existing customer's verified phone + registered e-mail,
  // NOT a membership in the unrelated restricted-site e-mail allowlist.
  const email = normalizeCustomerEmail(c?.email);
  return !!c && !!email && digest(email) === s.customer_email_hash &&
    digest(String(normalizeCustomerPhone(c.phone) || "")) === s.customer_phone_hash;
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
      let liveConfig: any = null;
      // A árvore tem uma chave própria. Desligá-la não pode desligar as
      // respostas personalizadas, que são independentes e opcionais.
      // A árvore foi desativada definitivamente nesta reformulação.
      const treeEnabled = false;
      let questionCollectionEnabled = false;
      let confirmation = h2AutoConfirmationSchema.parse({});
      let personalization = { ...H2_AUTO_PERSONALIZATION_DEFAULT };
      if (deviceId) {
        // Ativar uma única vez a coleta pedida, sem reativar após desligar no ADM.
        try { await enableLearningOnce(deviceId); }
        catch (error) { console.error("[H2Auto] ativação da coleta indisponível",error); }
        const live = await rows(sql`SELECT JSON_EXTRACT(config_json,'$.confirmation') AS confirmation_json, JSON_EXTRACT(config_json,'$.personalization') AS personalization_json, JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.tree.enabled')) AS tree_on, JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.questionCollectionEnabled')) AS collection_on, JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.enabled')) AS bot_on,
          CAST(JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.identificationSessionHours')) AS UNSIGNED) AS session_hours,
          JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.identificationEnabled')) AS identity_on,
          JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.blocked')) AS blocked_phones
          FROM h2_auto_devices WHERE id=${deviceId} LIMIT 1`);
        liveConfig = live[0] as any;
        if (liveConfig?.bot_on !== "true") return respond(res,200,{state:"disabled"});
        identificationDisabled = liveConfig?.identity_on === "false";
        try {
          const raw = liveConfig?.confirmation_json;
          confirmation = h2AutoConfirmationSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw || {});
        } catch { confirmation = h2AutoConfirmationSchema.parse({}); }
        try {
          const rawPersonalization = liveConfig?.personalization_json;
          personalization = h2AutoPersonalizationSchema.parse(typeof rawPersonalization === "string" ? JSON.parse(rawPersonalization) : rawPersonalization || {});
        } catch { personalization = { ...H2_AUTO_PERSONALIZATION_DEFAULT }; }
        questionCollectionEnabled = liveConfig?.collection_on === "true";
      }
      if (!deviceId) return respond(res, 401, { error: "unauthorized" });
      // O texto de boas-vindas pertence ao ADM: números, emojis e frases
      // editados pelo operador não podem ser substituídos pelo texto padrão.
      const initialMessage = confirmation.identificationWelcome;
      const phoneMessage = confirmation.existingCustomerPrompt;
      const referrerMessage = confirmation.newCustomerPrompt;
      const noReferral = confirmation.noIndicatorMessage;
      const rawHours=Number(liveConfig?.session_hours);
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
      const unansweredResponse = async () => {
        // A fila só recebe texto público de pergunta; nunca dados pessoais,
        // códigos, telefones, comandos ou histórico da conversa.
        if (!safeH2AutoUnknownQuestion(input)) return null;
        let captured = false;
        if (questionCollectionEnabled) {
          try { captured = await recordH2AutoUnknownQuestion(deviceId, input); }
          catch (error) { console.error("[H2Auto] coleta de pergunta indisponível", error); }
        }
        return {
          state: "choice",
          message: "⚡ *H2 COLOMBIANO* 🇨🇴\n\n🤖 Ainda não tenho uma resposta cadastrada para essa pergunta." +
            (captured ? "\n\n📝 Sua pergunta foi registrada para análise." : "") +
            "\n\n💬 Pode enviar outra pergunta. Continuamos por aqui.",
        };
      };
      const existing = await rows(sql`SELECT * FROM h2_auto_access_sessions WHERE id=${sessionId} AND device_id=${deviceId} LIMIT 1`);
      const s = existing[0] as Session | undefined;

      // Verified customers are identified by the phone from their existing OTP
      // session, even if WhatsApp displays only a saved name. No chat identity
      // is inferred from a name, and blocked clients receive no automatic reply.
      const blockedPhones = manualSilencedPhones(String(liveConfig?.blocked_phones || ""));
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
      // Audio captions are not customer input. Check device/contact blocks without
      // creating a session, consuming an OTP attempt or advancing a phone stage.
      // The recognized speech must subsequently pass this same gate as typed text.
      if (req.body?.inputKind === "audio_pending") {
        if (input !== "") return respond(res, 400, { error: "invalid_audio_probe" });
        return respond(res, 200, { state: "audio_pending" });
      }
      const phoneError = async (stage: PhoneStage, kind: H2AutoPhoneKind,
        reason: H2AutoPhoneFailure) => {
        const result = await recordH2AutoPhoneFailure({deviceId,sessionId,conversationId:conversation,
          contactLabel:String(req.body?.contactLabel || ""),invalidAnswer:input,
          stage,reason:reason === "formato" ? "Telefone fora do formato" : "Telefone não confirmado"});
        if (!result.accepted) return {state:"blocked",message:""};
        return {state:result.blocked ? "blocked" : stage,
          message:h2AutoPhoneFailureMessage(kind,reason,result.attempts,confirmation)};
      };
      if (identificationDisabled) return respond(res,200,{state:"identification_disabled"});
      if (s?.stage === "released_customer_phone" || s?.stage === "released_referral_phone" || s?.stage === "released_referrals_phone") {
        const stage = s.stage === "released_customer_phone" ? "customer_phone" :
          s.stage === "released_referrals_phone" ? "referrals_phone" : "referral_phone";
        await update(sessionId, sql`stage=${stage},updated_at=${now}`);
        return respond(res, 200, { state: stage, message: stage === "referral_phone" ? referrerMessage : stage === "referrals_phone" ? confirmation.phonePrompt : phoneMessage });
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
        // 1/2/3 são atalhos de autenticação, não a árvore antiga.
        // A escolha deve funcionar também na primeira mensagem, sem sessão.
        if (isH2AutoGreeting(input))
          return respond(res, 200, {state: "choice", message: h2AutoGreetingWelcome(input, initialMessage)});
        const groupedLines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const groupedReplies = groupedLines
          .filter(line => !isH2AutoGreeting(line))
          .map(line => getH2AutoPersonalizedReply(line, personalization, {stage: "choice"}))
          .filter((reply): reply is NonNullable<typeof reply> => Boolean(reply));
        if (groupedLines.length > 1 && groupedReplies.length >= 2)
          return respond(res, 200, {state: "choice", message: groupedReplies.map(reply => reply.message).join("\n\n"), topic: groupedReplies.map(reply => reply.topic).join(",")});
        const firstStage = initialH2AutoChoiceStage(input) ||
          (h2AutoNaturalExistingCustomerIntent(input) ? "customer_phone" :
          h2AutoNaturalReferralsIntent(input) ? "referrals_phone" :
          h2AutoNaturalNewCustomerIntent(input) ? "referral_phone" : null);
        if (firstStage) {
          await update(sessionId, sql`stage=${firstStage},updated_at=${now}`);
          const nextMessage = firstStage==="customer_phone" ? phoneMessage :
            firstStage==="referrals_phone" ? confirmation.phonePrompt : referrerMessage;
          const greetingPrefix = h2AutoGreetingPrefix(input);
          return respond(res, 200, {state:firstStage, message:greetingPrefix ? `${greetingPrefix}\n\n${nextMessage}` : nextMessage});
        }
        const openingPersonalization = getH2AutoPersonalizedReply(input, personalization, {stage: "choice"});
        if (openingPersonalization)
          // APKs antigos exibem message nos estados conhecidos, mas podem
          // descartar silenciosamente o estado novo "personalized".
          return respond(res, 200, {state:"choice",message:openingPersonalization.message,topic:openingPersonalization.topic});
        if (["oi","ola","olá","menu","inicio","início"].includes(normalized))
          return respond(res, 200, {state:"choice",message:initialMessage});
        if (!treeEnabled) {
          const fallback = await unansweredResponse();
          if (fallback) return respond(res, 200, fallback);
          return respond(res, 200, {state:"tree_disabled",audience:"new_open",message:""});
        }
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
        // Validar o prazo definido no ADM também contra o vencimento
        // gravado na autenticação. Nunca estender a sessão ao ler MENU,
        // receber mensagens ou visualizar uma conversa no Desktop.
        const valid = allowed && Number(s.expires_at) > now &&
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
          // Não repetir as boas-vindas quando a pessoa escolhe por texto.
          // A escolha é um destino de autenticação; jamais libera outra conta.
          const selectedMenuStage = initialH2AutoChoiceStage(input) ||
            (h2AutoNaturalExistingCustomerIntent(input) ? "customer_phone" :
             h2AutoNaturalReferralsIntent(input) ? "referrals_phone" :
             h2AutoNaturalNewCustomerIntent(input) ? "referral_phone" : null);
          // Quem já validou o próprio telefone e e-mail pode consultar indicações
          // sem repetir o OTP durante a validade da sessão autorizada.
          if (authorizedAudience === "customer" && selectedMenuStage === "referrals_phone") {
            await update(sessionId, sql`stage='customer'`);
            return respond(res, 200, grant("referrals"));
          }
          if ((authorizedAudience === "customer" && selectedMenuStage === "customer_phone") ||
              (authorizedAudience === "new" && selectedMenuStage === "referral_phone")) {
            await update(sessionId, sql`stage=${authorizedAudience}`);
            return respond(res, 200, grant(authorizedAudience));
          }
          // Trocar de público exige a validação correspondente no servidor.
          if (selectedMenuStage) {
            const destination = selectedMenuStage;
            await update(sessionId, sql`stage=${destination},
              customer_id=NULL,referrer_id=NULL,customer_phone_hash=NULL,
              customer_email_hash=NULL,code_hash=NULL,code_expires=NULL,
              code_attempts=0,resend_after=0,expires_at=0,updated_at=${now}`);
            return respond(res, 200, { state: destination,
              message: destination === "customer_phone" ? phoneMessage :
                destination === "referrals_phone" ? confirmation.phonePrompt : referrerMessage });
          }
          // Mesmo após abrir MENU, uma pergunta livre continua a conversa.
          // Números fora de 1/2/3 continuam mostrando as opções disponíveis.
          if (/^[0-9]{1,2}$/.test(normalized))
            return respond(res, 200, { state: "choice", message: initialMessage });
        }
        // Personalize only public guidance after the existing authorization checks.
        if (personalization.enabled) {
          let verifiedFirstName = "";
          if (authorizedAudience === "customer" && s.customer_id && personalization.verifiedName) {
            const names = await rows(sql`SELECT name FROM customers WHERE id=${s.customer_id}
              AND deletedAt IS NULL AND COALESCE(blocked,0)=0 LIMIT 1`);
            verifiedFirstName = String(names[0]?.name || "");
          }
          const personalized = getH2AutoPersonalizedReply(input, personalization, {
            verified: authorizedAudience === "customer", verifiedFirstName, stage: "authorized",
          });
          if (personalized) {
            // A sessão permanece autorizada no banco. O estado "choice" é
            // só um envelope de resposta aceito pelo APK 1.70, que descartava
            // o texto vindo em "authorized".
            return respond(res, 200, {state:"choice",message:personalized.message,topic:personalized.topic});
          }
        }
        const fallback = await unansweredResponse();
        if (fallback) return respond(res, 200, fallback);
        // Consultas protegidas e regras locais ainda usam o acesso autorizado.
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
          message: destination === "referrals_phone" ? confirmation.phonePrompt : destination === "customer_phone" ? phoneMessage : initialMessage});
      }

      if (s.stage === "choice") {
        // Numeric choice is separate from the retired question tree.
        if (isH2AutoGreeting(input)) {
          const greeting = h2AutoGreetingWelcome(input, initialMessage);
          return respond(res, 200, {state: "choice", message: greeting});
        }
        const groupedLines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const groupedReplies = groupedLines
          .filter(line => !isH2AutoGreeting(line))
          .map(line => getH2AutoPersonalizedReply(line, personalization, {stage: "choice"}))
          .filter((reply): reply is NonNullable<typeof reply> => Boolean(reply));
        if (groupedLines.length > 1 && groupedReplies.length >= 2)
          return respond(res, 200, {state: "choice", message: groupedReplies.map(reply => reply.message).join("\n\n"), topic: groupedReplies.map(reply => reply.topic).join(",")});
        const selectedInitialStage = initialH2AutoChoiceStage(input);
        if (selectedInitialStage) {
          await update(sessionId, sql`stage=${selectedInitialStage},updated_at=${now}`);
          return respond(res, 200, { state: selectedInitialStage,
            message: selectedInitialStage === "customer_phone" ? phoneMessage :
              selectedInitialStage === "referrals_phone" ? confirmation.phonePrompt : referrerMessage });
        }
        if (h2AutoNaturalExistingCustomerIntent(input)) {
          await update(sessionId, sql`stage='customer_phone',updated_at=${now}`);
          return respond(res, 200, { state: "customer_phone", message: phoneMessage });
        }
        if (h2AutoNaturalReferralsIntent(input)) {
          await update(sessionId, sql`stage='referrals_phone',updated_at=${now}`);
          return respond(res, 200, { state: "referrals_phone", message: confirmation.phonePrompt });
        }
        if (h2AutoNaturalNewCustomerIntent(input)) {
          await update(sessionId, sql`stage='referral_phone',updated_at=${now}`);
          const greetingPrefix = h2AutoGreetingPrefix(input);
          return respond(res, 200, { state: "referral_phone", message: greetingPrefix ? `${greetingPrefix}\n\n${referrerMessage}` : referrerMessage });
        }
        const personalized = getH2AutoPersonalizedReply(input, personalization, {stage: "choice"});
        if (personalized) return respond(res, 200, {state: "choice", message: personalized.message, topic: personalized.topic});
        if (["oi","ola","olá","menu","inicio","início"].includes(normalized))
          return respond(res, 200, {state:"choice",message:initialMessage});
        if (!treeEnabled) {
          const fallback = await unansweredResponse();
          if (fallback) return respond(res, 200, fallback);
          return respond(res, 200, {state:"tree_disabled",audience:"new_open",message:""});
        }
        return respond(res, 200, { state: "choice", message: initialMessage });
      }

      if (s.stage === "customer_phone" || s.stage === "referrals_phone") {
        // A retransmissão da opção inicial não é um telefone inválido.
        if (repeatedH2AutoChoice(s.stage, input))
          return respond(res,200,{state:s.stage,message:s.stage==="referrals_phone" ? confirmation.phonePrompt : phoneMessage});
        if (isH2AutoHelpRequest(input))
          return respond(res, 200, { state: s.stage, message: s.stage === "referrals_phone" ? confirmation.phonePrompt : phoneMessage });
        // Pergunta livre não é telefone inválido: tenta FAQ aprovada e, sem
        // correspondência, repete o pedido do telefone sem consumir tentativa.
        if (isH2AutoFreeTextDuringPhoneStage(s.stage, input)) {
          const freeTextReply = getH2AutoPersonalizedReply(input, personalization, {stage: "customer_phone"});
          if (freeTextReply)
            return respond(res, 200, {state: s.stage, message: freeTextReply.message, topic: freeTextReply.topic});
          return respond(res, 200, {state: s.stage, message: s.stage === "referrals_phone" ? confirmation.phonePrompt : phoneMessage});
        }
        const phone = normalizeH2AutoPhone11(input);
        const referralEntry = s.stage === "referrals_phone";
        if (invalidH2AutoPhoneStageAnswer(s.stage, input) || !phone)
          return respond(res,200,await phoneError(
            referralEntry ? "referrals_phone" : "customer_phone",
            referralEntry ? "indicacoes" : "cadastro","formato"));
        if (Number(s.resend_after) > now)
          return respond(res, 200, { state: "customer_phone", message: confirmation.codeResendWait });
        if (await limited("device:" + deviceId, 400, hour, now) ||
            await limited("phone:" + phone, 5, hour, now))
          return respond(res, 200, { state: "customer_phone", message: confirmation.codeRateLimit });
        const customer = await customerFor(phone);
        const db = await getDb();
        // Never tell a fully completed customer to update the profile because
        // the phone lookup or site-email authorization could not be confirmed.
        if (!db) throw Error("db_unavailable");
        if (!customer) return respond(res,200,await phoneError(
          referralEntry ? "referrals_phone" : "customer_phone",
          referralEntry ? "indicacoes" : "cadastro","nao_confirmado"));
        if (h2AutoCustomerNeedsProfileUpdate(customer))
          return respond(res, 200, { state: "customer_phone", message: confirmation.customerProfileUpdate });
        // H2 AUTO customers are validated against the main customer registry.
        // The restricted-site email allowlist is unrelated to customer identity.
        // Never bypass the registered-email OTP or the blocked/incomplete checks.
        const registeredEmail = normalizeCustomerEmail(customer.email);
        if (!registeredEmail)
          return respond(res, 200, { state: "customer_phone", message: confirmation.customerProfileUpdate });
        const code = generateOwnSiteCode();
        const codeHash = otpHash(sessionId, code);
        const changed: any = await db.execute(sql`UPDATE h2_auto_access_sessions SET
          stage=${referralEntry ? "referrals_code" : "customer_code"},customer_id=${customer.id},referrer_id=NULL,
          customer_phone_hash=${digest(String(normalizeCustomerPhone(customer.phone) || ""))},
          customer_email_hash=${digest(registeredEmail)},
          code_hash=${codeHash},code_expires=${now+otpLifetime},code_attempts=0,
          resend_after=${now+minute},updated_at=${now}
          WHERE id=${sessionId} AND stage=${referralEntry ? 'referrals_phone' : 'customer_phone'} AND resend_after<=${now}`);
        if (!changed[0]?.affectedRows)
          return respond(res, 200, { state: "customer_phone", message: confirmation.codeRequestWait });
        try {
          await sendH2AutoOrderCode(registeredEmail, code, 10, "access");
        } catch {
          await db.execute(sql`UPDATE h2_auto_access_sessions SET stage=${referralEntry ? 'referrals_phone' : 'customer_phone'},
            code_hash=NULL,code_expires=NULL,updated_at=${Date.now()}
            WHERE id=${sessionId} AND code_hash=${codeHash}`);
          return respond(res, 200, { state: "customer_phone", message: confirmation.codeSendFailed });
        }
        await clearH2AutoPhoneFailures(deviceId,sessionId);
        return respond(res, 200, { state: referralEntry ? "referrals_code" : "customer_code",
          message: confirmation.codeSent });
      }

      if (s.stage === "customer_code" || s.stage === "referrals_code") {
        const referralEntry = s.stage === "referrals_code";
        if (isH2AutoHelpRequest(input))
          return respond(res, 200, { state: s.stage, message: confirmation.codePrompt });
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
            message: confirmation.codeInvalid });
        }
        const db = await getDb();
        if (!db) throw new Error("db_unavailable");
        const changed: any = await db.execute(sql`UPDATE h2_auto_access_sessions SET
          stage='customer',code_hash=NULL,code_expires=NULL,code_attempts=0,
          expires_at=${now+accessLifetime},updated_at=${now}
          WHERE id=${sessionId} AND stage=${referralEntry ? 'referrals_code' : 'customer_code'} AND code_hash=${expected}
            AND code_expires>${now} AND code_attempts<5`);
        if (!changed[0]?.affectedRows)
          return respond(res, 200, { state: referralEntry ? "referrals_code" : "customer_code", message: confirmation.codeInvalid });
        return respond(res, 200, grant(referralEntry ? "referrals" : "customer"));
      }

      if (s.stage === "referral_phone") {
        // The APK may replay the same choice on transition. A repeated '2'
        // is not an invalid indicator number and must not count as a failure.
        if (isH2AutoGreeting(input)) {
          await update(sessionId, sql`stage='choice',updated_at=${now}`);
          return respond(res, 200, {state: "choice", message: h2AutoGreetingWelcome(input, initialMessage)});
        }
        if (repeatedH2AutoChoice(s.stage,input) || h2AutoNaturalNewCustomerIntent(input))
          return respond(res,200,{state:"referral_phone",message:referrerMessage});
        if (normalized === "6") return respond(res, 200, { state: "human",
          message: confirmation.referralHumanHelp });
        if (normalized === "nao" || normalized === "não" ||
            normalized.includes("nao tenho") || normalized.includes("não tenho") ||
            normalized.includes("sem indicador"))
          return respond(res,200,{state:"referral_phone",message:noReferral});
        // Texto livre não é um telefone de indicador inválido. Responde uma
        // FAQ aprovada ou repete o pedido sem consumir tentativa/bloquear.
        if (isH2AutoFreeTextDuringPhoneStage(s.stage, input)) {
          const freeTextReply = getH2AutoPersonalizedReply(input, personalization, {stage: "customer_phone"});
          if (freeTextReply)
            return respond(res, 200, {state: s.stage, message: freeTextReply.message, topic: freeTextReply.topic});
          return respond(res, 200, {state: "referral_phone", message: referrerMessage});
        }
        if (invalidH2AutoPhoneStageAnswer(s.stage, input))
          return respond(res,200,await phoneError("referral_phone","indicador","formato"));
        if (await limited("referral:" + sessionId, 30, hour, now))
          return respond(res, 200, { state: "referral_phone", message: confirmation.referrerRateLimit });
        // A service outage is not a wrong indicator and must not consume a chance.
        if (!(await getDb())) throw Error("db_unavailable");
        const found = await resolveReferralDeclaration({ customerPhone: "", referrerPhone: normalizeH2AutoPhone11(input) });
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
