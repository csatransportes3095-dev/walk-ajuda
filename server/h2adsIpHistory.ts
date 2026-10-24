import { and, eq, sql } from "drizzle-orm";
import { h2AdsInstanceBrowserRuns, h2AdsInstanceWorkerAssignments } from "../drizzle/schema";
import { getDb } from "./db";

let historyTableReady = false;

function isPrivateOrLocalIp(value: string): boolean {
  const ip = value.trim().toLowerCase();
  if (!ip || ip === "localhost" || ip === "::1" || ip === "0.0.0.0") return true;
  if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = octets;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (ip.includes(":")) {
    return ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip);
  }
  return true;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para o histórico de IP H2 Ads.");
  return db;
}

async function ensureHistoryTable() {
  if (historyTableReady) return;
  const db = await requireDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS h2ads_instance_ip_history (
      id INT NOT NULL AUTO_INCREMENT,
      instanceId INT NOT NULL,
      workerId INT NOT NULL,
      observedIp VARCHAR(64) NOT NULL,
      observedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY h2ads_ip_history_instance_time_idx (instanceId, observedAt),
      KEY h2ads_ip_history_worker_idx (workerId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  historyTableReady = true;
}

export type H2AdsIpHistoryEntry = {
  id: number;
  instanceId: number;
  workerId: number;
  observedIp: string;
  observedAt: Date;
};

async function insertHistory(instanceId: number, workerId: number, observedIp: string): Promise<void> {
  const db = await requireDb();
  await db.execute(sql`
    INSERT INTO h2ads_instance_ip_history (instanceId, workerId, observedIp)
    VALUES (${instanceId}, ${workerId}, ${observedIp})
  `);
}

export async function recordH2AdsRuntimeIp(input: { workerId: number; instanceId: number; observedIp: string }): Promise<boolean> {
  const observedIp = input.observedIp.trim();
  if (!observedIp || observedIp.length > 64 || isPrivateOrLocalIp(observedIp)) return false;
  const db = await requireDb();
  await ensureHistoryTable();

  const assignments = await db.select({ id: h2AdsInstanceWorkerAssignments.id }).from(h2AdsInstanceWorkerAssignments).where(and(eq(h2AdsInstanceWorkerAssignments.instanceId, input.instanceId), eq(h2AdsInstanceWorkerAssignments.workerId, input.workerId))).limit(1);
  if (!assignments[0]) return false;

  const runs = await db.select({ id: h2AdsInstanceBrowserRuns.id, state: h2AdsInstanceBrowserRuns.state, observedIp: h2AdsInstanceBrowserRuns.observedIp }).from(h2AdsInstanceBrowserRuns).where(and(eq(h2AdsInstanceBrowserRuns.instanceId, input.instanceId), eq(h2AdsInstanceBrowserRuns.workerId, input.workerId))).limit(1);
  const run = runs[0];
  if (!run || run.state !== "browser_open") return false;

  const latest = await db.execute(sql`
    SELECT observedIp
    FROM h2ads_instance_ip_history
    WHERE instanceId = ${input.instanceId}
    ORDER BY id DESC
    LIMIT 1
  `);
  const latestRows = latest[0] as unknown as Array<{ observedIp: string }>;
  const latestIp = latestRows[0]?.observedIp ?? null;

  if (run.observedIp === observedIp) {
    if (!latestIp) await insertHistory(input.instanceId, input.workerId, observedIp);
    return true;
  }

  if (!latestIp && run.observedIp) {
    await insertHistory(input.instanceId, input.workerId, run.observedIp);
  }

  await db.update(h2AdsInstanceBrowserRuns).set({ observedIp, lastChangedAt: new Date() }).where(eq(h2AdsInstanceBrowserRuns.id, run.id));
  if (latestIp !== observedIp) {
    await insertHistory(input.instanceId, input.workerId, observedIp);
  }
  return true;
}

export async function listH2AdsIpHistory(instanceId: number, limit = 20): Promise<H2AdsIpHistoryEntry[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const db = await requireDb();
  await ensureHistoryTable();
  const result = await db.execute(sql`
    SELECT id, instanceId, workerId, observedIp, observedAt
    FROM h2ads_instance_ip_history
    WHERE instanceId = ${instanceId}
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `);
  return result[0] as unknown as H2AdsIpHistoryEntry[];
}

export async function deleteH2AdsIpHistory(instanceId: number): Promise<void> {
  const db = await requireDb();
  await ensureHistoryTable();
  await db.execute(sql`DELETE FROM h2ads_instance_ip_history WHERE instanceId = ${instanceId}`);
}
