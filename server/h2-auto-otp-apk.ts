/**
 * H2 Auto APK-only OTP handoff. No Meta API, no external messaging service.
 * The paired APK receives a short-lived encrypted task and offers it in WhatsApp.
 * This does not claim that Android can send a proactive WhatsApp message silently.
 */
import type { Express, Request, Response } from "express";
import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { getAdminJwtSecret } from "./adminJwt";
import { validSiteCode } from "../shared/siteAccessCodePolicy";

const FLAG = "H2_AUTO_OTP_APK_ENABLED";
const DEVICE = "H2_AUTO_OTP_DEVICE_ID";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function key(): Buffer {
  const secret = process.env.H2_AUTO_OTP_ENCRYPTION_SECRET || process.env.H2_SITE_ACCESS_SECRET || getAdminJwtSecret();
  if (!secret || secret.length < 32) throw Error("OTP_QUEUE_KEY_UNAVAILABLE");
  return createHash("sha256").update("h2-auto-otp-apk:v1:" + secret).digest();
}
function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), ciphertext.toString("hex")].join(".");
}
function decrypt(value: string): string {
  const [iv, tag, payload] = value.split(".");
  if (!iv || !tag || !payload) throw Error("INVALID_ENCRYPTED_PAYLOAD");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "hex")), decipher.final()]).toString("utf8");
}
let schema: Promise<void> | null = null;
async function ensure(db: any): Promise<void> {
  if (!schema) schema = db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_otp_apk_queue (
    id CHAR(32) NOT NULL PRIMARY KEY, device_id VARCHAR(32) NOT NULL,
    phone_key CHAR(64) NOT NULL, code_digest CHAR(64) NOT NULL,
    payload_encrypted TEXT NOT NULL, expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL, notified_at BIGINT NULL,
    KEY idx_h2_auto_otp_device (device_id, expires_at)
  ) ENGINE=InnoDB`).then(() => undefined).catch((error: unknown) => { schema = null; throw error; });
  await schema;
}
export function isH2AutoApkOtpConfigured(): boolean {
  return process.env[FLAG] === "true" && /^[a-f0-9]{24}$/.test(process.env[DEVICE] || "");
}
export async function enqueueH2AutoApkOtp(input: {
  customerPhone: string; code: string; phoneKey: string; codeDigest: string; expiresAt: number;
}): Promise<void> {
  if (!isH2AutoApkOtpConfigured()) return;
  if (!/^\d{11}$/.test(input.customerPhone) || !validSiteCode(input.code)
      || !/^[a-f0-9]{64}$/.test(input.phoneKey) || !/^[a-f0-9]{64}$/.test(input.codeDigest)) throw Error("INVALID_OTP_TASK");
  const db = await getDb();
  if (!db) throw Error("DB_UNAVAILABLE");
  await ensure(db);
  const deviceId = process.env[DEVICE]!;
  const d: any = await db.execute(sql`SELECT token_hash FROM h2_auto_devices WHERE id=${deviceId} LIMIT 1`);
  if (!d[0]?.[0]?.token_hash) return; // no paired phone; email remains the primary channel
  const id = randomBytes(16).toString("hex");
  const payload = encrypt(JSON.stringify({ phone: "55" + input.customerPhone, code: input.code }));
  await db.execute(sql`DELETE FROM h2_auto_otp_apk_queue
    WHERE (expires_at<=${Date.now()} OR (phone_key=${input.phoneKey} AND device_id=${deviceId}))`);
  await db.execute(sql`INSERT INTO h2_auto_otp_apk_queue
    (id, device_id, phone_key, code_digest, payload_encrypted, expires_at, created_at)
    VALUES (${id},${deviceId},${input.phoneKey},${input.codeDigest},${payload},${input.expiresAt},${Date.now()})`);
}
const send = (res: Response, status: number, body: object) => res.status(status).json(body);
async function authorized(req: Request): Promise<string | null> {
  const id = String(req.header("x-h2-device-id") || "");
  const token = String(req.header("x-h2-device-token") || "");
  if (!isH2AutoApkOtpConfigured() || id !== process.env[DEVICE]
      || !/^[a-f0-9]{24}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db: any = await getDb();
  if (!db) return null;
  const result = await db.execute(sql`SELECT token_hash FROM h2_auto_devices WHERE id=${id} LIMIT 1`);
  const stored = result[0]?.[0]?.token_hash;
  if (!stored || !/^[a-f0-9]{64}$/.test(stored)) return null;
  return timingSafeEqual(Buffer.from(stored,"hex"), Buffer.from(hash(token),"hex")) ? id : null;
}
export function registerH2AutoOtpApkRoutes(app: Express): void {
  app.get("/api/h2-auto/otp/pending", async (req, res) => {
    try {
      const deviceId = await authorized(req);
      if (!deviceId) return send(res, 401, { error: "unauthorized" });
      const db: any = await getDb();
      await ensure(db);
      const now = Date.now();
      const result = await db.execute(sql`SELECT q.id, q.payload_encrypted, q.expires_at
        FROM h2_auto_otp_apk_queue q JOIN customerOtpChallenges c
        ON c.phoneKey=q.phone_key AND c.codeDigest=q.code_digest
        WHERE q.device_id=${deviceId} AND q.expires_at>${now}
          AND c.expiresAt>${now} AND c.usedAt IS NULL AND q.notified_at IS NULL
        ORDER BY q.created_at ASC LIMIT 1`);
      const task = result[0]?.[0];
      if (!task) return send(res, 200, { task: null });
      const { phone, code } = JSON.parse(decrypt(task.payload_encrypted));
      return send(res, 200, { task: { id: task.id, phone, code, expiresAt: Number(task.expires_at) } });
    } catch {
      return send(res, 503, { error: "temporary_error" });
    }
  });
  app.post("/api/h2-auto/otp/ack", async (req, res) => {
    try {
      const deviceId = await authorized(req);
      if (!deviceId) return send(res, 401, { error: "unauthorized" });
      const id = String(req.body?.id || "");
      if (!/^[a-f0-9]{32}$/.test(id)) return send(res, 400, { error: "invalid_request" });
      const db: any = await getDb();
      await ensure(db);
      await db.execute(sql`UPDATE h2_auto_otp_apk_queue SET notified_at=${Date.now()}, payload_encrypted=''
        WHERE id=${id} AND device_id=${deviceId} AND expires_at>${Date.now()} AND notified_at IS NULL`);
      return send(res, 200, { success: true });
    } catch {
      return send(res, 503, { error: "temporary_error" });
    }
  });
}
