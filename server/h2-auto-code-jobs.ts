import type { Express, Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const respond = (res: Response, status: number, body: unknown) =>
  res.status(status).set("Cache-Control", "no-store").json(body);
let ready: Promise<void> | undefined;

export async function ensureH2AutoCodeJobs(): Promise<void> {
  if (!ready) ready = (async () => {
    const db = await getDb();
    if (!db) throw new Error("db_unavailable");
    await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_code_jobs (
      id CHAR(64) PRIMARY KEY,
      device_id VARCHAR(32) NOT NULL,
      target_phone VARCHAR(24) NOT NULL,
      source VARCHAR(24) NULL,
      message VARCHAR(600) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      available_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      claimed_at BIGINT NULL,
      sent_at BIGINT NULL,
      failure_code VARCHAR(48) NULL,
      created_at BIGINT NOT NULL,
      INDEX h2_auto_code_jobs_device (device_id,status,available_at),
      INDEX h2_auto_code_jobs_expiry (expires_at)
    )`);
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}

export async function enqueueH2AutoCodeJob(input: {
  deviceId: string;
  targetPhone: string;
  message: string;
  source?: string;
  ttlMs?: number;
}): Promise<void> {
  if (!/^[a-f0-9]{24}$/.test(input.deviceId)) throw new Error("invalid_device");
  const phone = String(input.targetPhone).replace(/\D/g, "").slice(-15);
  if (phone.length < 10) throw new Error("invalid_target_phone");
  const message = input.message.trim();
  if (!message || message.length > 600) throw new Error("invalid_message");
  await ensureH2AutoCodeJobs();
  const db = await getDb();
  if (!db) throw new Error("db_unavailable");
  const now = Date.now();
  const ttl = Math.max(60_000, Math.min(input.ttlMs ?? 10 * 60_000, 30 * 60_000));
  // Stable id prevents duplicate sends when the email delivery is retried.
  const id = hash([input.deviceId, phone, message, String(now - (now % 60_000))].join("|"));
  await db.execute(sql`INSERT IGNORE INTO h2_auto_code_jobs
    (id,device_id,target_phone,source,message,status,attempts,available_at,expires_at,created_at)
    VALUES (${id},${input.deviceId},${phone},${input.source || null},${message},'pending',0,${now},${now + ttl},${now})`);
}

async function authenticate(req: Request): Promise<string | null> {
  const id = String(req.header("x-h2-device-id") || "");
  const token = String(req.header("x-h2-device-token") || "");
  if (!/^[a-f0-9]{24}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = await getDb();
  if (!db) return null;
  const result: any = await db.execute(sql`SELECT token_hash FROM h2_auto_devices WHERE id=${id} LIMIT 1`);
  const expected = String(result[0]?.[0]?.token_hash || "");
  if (!/^[a-f0-9]{64}$/.test(expected)) return null;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hash(token), "hex")) ? id : null;
}

export function registerH2AutoCodeJobRoutes(app: Express): void {
  app.get("/api/h2-auto/code-jobs/next", async (req, res) => {
    try {
      const deviceId = await authenticate(req);
      if (!deviceId) return respond(res, 401, { error: "unauthorized" });
      await ensureH2AutoCodeJobs();
      const db = await getDb();
      if (!db) throw new Error("db_unavailable");
      const now = Date.now();
      await db.execute(sql`UPDATE h2_auto_code_jobs SET status='expired',failure_code='EXPIRED'
        WHERE device_id=${deviceId} AND status IN ('pending','claimed') AND expires_at<=${now}`);
      const rows: any = await db.execute(sql`SELECT * FROM h2_auto_code_jobs
        WHERE device_id=${deviceId} AND status='pending' AND available_at<=${now} AND expires_at>${now}
        ORDER BY created_at ASC LIMIT 1`);
      const job = rows[0]?.[0];
      if (!job) return respond(res, 200, { job: null });
      const claimed: any = await db.execute(sql`UPDATE h2_auto_code_jobs SET status='claimed',attempts=attempts+1,claimed_at=${now}
        WHERE id=${job.id} AND device_id=${deviceId} AND status='pending' AND expires_at>${now} AND attempts<30`);
      if (!claimed[0]?.affectedRows) return respond(res, 200, { job: null });
      return respond(res, 200, { job: { id: job.id, targetPhone: job.target_phone, source: job.source, message: job.message, expiresAt: Number(job.expires_at) } });
    } catch { return respond(res, 503, { error: "temporarily_unavailable" }); }
  });

  app.post("/api/h2-auto/code-jobs/:id/result", async (req, res) => {
    try {
      const deviceId = await authenticate(req);
      if (!deviceId || !/^[a-f0-9]{64}$/.test(req.params.id)) return respond(res, 401, { error: "unauthorized" });
      const status = req.body?.status;
      if (status !== "sent" && status !== "failed") return respond(res, 400, { error: "invalid_status" });
      const failure = typeof req.body?.failureCode === "string" && /^[A-Z_]{2,48}$/.test(req.body.failureCode) ? req.body.failureCode : null;
      await ensureH2AutoCodeJobs();
      const db = await getDb(); if (!db) throw new Error("db_unavailable");
      const now = Date.now();
      const waiting = status === "failed" && failure === "WAITING_TARGET";
      const changed: any = await db.execute(sql`UPDATE h2_auto_code_jobs SET
        status=${waiting ? "pending" : status},
        available_at=${waiting ? now + 10_000 : now},
        claimed_at=NULL,
        sent_at=${status === "sent" ? now : null},failure_code=${failure}
        WHERE id=${req.params.id} AND device_id=${deviceId} AND status='claimed'`);
      if (!changed[0]?.affectedRows) return respond(res, 409, { error: "job_not_claimed" });
      return respond(res, 200, { success: true });
    } catch { return respond(res, 503, { error: "temporarily_unavailable" }); }
  });
}
