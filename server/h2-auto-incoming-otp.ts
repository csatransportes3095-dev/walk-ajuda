/**
 * Customer-initiated OTP replies. A paired H2 Auto receives the code only
 * after an incoming WhatsApp message was observed and a unique number matched.
 * Does not initiate a WhatsApp conversation or change ordinary auto replies.
 */
import type { Express, Response } from "express";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { getAdminJwtSecret } from "./adminJwt";
import { authorizedOtpDevice, encrypt, decrypt, isH2AutoApkOtpConfigured } from "./h2-auto-otp-apk";

const response = (res: Response, status: number, body: object) =>
  res.status(status).set("Cache-Control", "no-store").json(body);
const normalize = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  const withoutCountry = digits.startsWith("55") && digits.length === 13 ? digits.slice(2) : digits;
  return /^\d{11}$/.test(withoutCountry) ? withoutCountry : "";
};
const phoneToken = (phone: string) => {
  const secret = process.env.H2_SITE_ACCESS_SECRET ||
    process.env.H2_AUTO_OTP_ENCRYPTION_SECRET || getAdminJwtSecret();
  if (!secret || secret.length < 32) throw Error("OTP_PHONE_KEY_UNAVAILABLE");
  return createHmac("sha256", secret)
    .update("h2-otp-incoming-phone:" + phone).digest("hex");
};
let schema: Promise<void> | null = null;
async function ensure(db: any) {
  if (!schema) schema = db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_otp_incoming_queue (
    id CHAR(32) NOT NULL PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL,
    recipient_key CHAR(64) NOT NULL,
    phone_key CHAR(64) NOT NULL,
    code_digest CHAR(64) NOT NULL,
    payload_encrypted TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    sent_at BIGINT NULL,
    created_at BIGINT NOT NULL,
    KEY idx_incoming_device_phone (device_id,recipient_key,expires_at)
  ) ENGINE=InnoDB`).then(() => undefined).catch((error: unknown) => { schema = null; throw error; });
  await schema;
}
/** Called only after the OTP issuing transaction has committed. */
export async function enqueueIncomingWhatsappOtp(input: {
  customerPhone: string; code: string; phoneKey: string; codeDigest: string; expiresAt: number;
}): Promise<void> {
  if (!isH2AutoApkOtpConfigured()) throw Error("H2_AUTO_NOT_CONFIGURED");
  const phone = normalize(input.customerPhone);
  if (!phone || !/^\d{6}$/.test(input.code)
    || !/^[a-f0-9]{64}$/.test(input.phoneKey)
    || !/^[a-f0-9]{64}$/.test(input.codeDigest)) throw Error("INVALID_OTP");
  const db: any = await getDb();
  if (!db) throw Error("DB_UNAVAILABLE");
  await ensure(db);
  const deviceId = process.env.H2_AUTO_OTP_DEVICE_ID!;
  const paired = await db.execute(sql`SELECT token_hash FROM h2_auto_devices WHERE id=${deviceId} LIMIT 1`);
  if (!/^[a-f0-9]{64}$/.test(String(paired[0]?.[0]?.token_hash || ""))) throw Error("DEVICE_NOT_PAIRED");
  const id = (await import("node:crypto")).randomBytes(16).toString("hex");
  const recipientKey = phoneToken(phone);
  const payload = encrypt(JSON.stringify({code:input.code}));
  const now = Date.now();
  await db.execute(sql`DELETE FROM h2_auto_otp_incoming_queue
    WHERE expires_at<=${now} OR (device_id=${deviceId} AND recipient_key=${recipientKey})`);
  await db.execute(sql`INSERT INTO h2_auto_otp_incoming_queue
    (id,device_id,recipient_key,phone_key,code_digest,payload_encrypted,expires_at,created_at)
    VALUES (${id},${deviceId},${recipientKey},${input.phoneKey},${input.codeDigest},${payload},${input.expiresAt},${now})`);
}
export function registerH2AutoIncomingOtpRoutes(app: Express): void {
  app.post("/api/h2-auto/otp/incoming", async (req, res) => {
    try {
      const deviceId = await authorizedOtpDevice(req);
      if (!deviceId) return response(res,401,{error:"unauthorized"});
      const phone = normalize(String(req.body?.phone || ""));
      if (!phone) return response(res,400,{error:"invalid_phone"});
      const db: any = await getDb();
      if (!db) throw Error("DB_UNAVAILABLE");
      await ensure(db);
      const recipientKey = phoneToken(phone), now = Date.now();
      // Only an unused, unexpired challenge for the exact sender may be sent.
      const found: any = await db.execute(sql`SELECT q.id,q.payload_encrypted,q.expires_at
        FROM h2_auto_otp_incoming_queue q
        INNER JOIN customerOtpChallenges c
          ON c.phoneKey=q.phone_key AND c.codeDigest=q.code_digest
        WHERE q.device_id=${deviceId} AND q.recipient_key=${recipientKey}
          AND q.expires_at>${now} AND q.sent_at IS NULL
          AND c.expiresAt>${now} AND c.usedAt IS NULL AND c.attempts<5
        LIMIT 1`);
      const task = found[0]?.[0];
      if (!task) return response(res,200,{task:null});
      const payload = JSON.parse(decrypt(String(task.payload_encrypted)));
      if (!/^\d{6}$/.test(payload.code)) throw Error("INVALID_PAYLOAD");
      return response(res,200,{task:{id:task.id,code:payload.code,expiresAt:Number(task.expires_at)}});
    } catch { return response(res,503,{error:"temporarily_unavailable"}); }
  });
  app.post("/api/h2-auto/otp/incoming/ack",async(req,res)=>{
    try {
      const deviceId=await authorizedOtpDevice(req);
      if (!deviceId) return response(res,401,{error:"unauthorized"});
      const id=String(req.body?.id||"");
      if (!/^[a-f0-9]{32}$/.test(id)) return response(res,400,{error:"invalid_request"});
      const db: any=await getDb(); if(!db)throw Error("DB_UNAVAILABLE");
      await ensure(db);
      await db.execute(sql`UPDATE h2_auto_otp_incoming_queue
        SET sent_at=${Date.now()},payload_encrypted=''
        WHERE id=${id} AND device_id=${deviceId} AND sent_at IS NULL`);
      return response(res,200,{success:true});
    }catch{return response(res,503,{error:"temporarily_unavailable"});}
  });
}
