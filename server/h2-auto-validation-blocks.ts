import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { H2_AUTO_PHONE_MAX_ATTEMPTS } from "./h2-auto-phone-attempt-message";

export type PhoneStage = "customer_phone" | "referral_phone" | "referrals_phone";
export const INVALID_PHONE_REPLY =
  "⚠️ *H2 COLOMBIANO*\n\n🚫 *VALIDAÇÃO NÃO APROVADA*\n\n" +
  "Sua resposta não corresponde\nao formato solicitado.\n\n" +
  "⛔ O atendimento automático\nfoi interrompido nesta conversa.\n\n" +
  "👨‍💻 Em breve, um atendente\nentrará em contato.\n\n" +
  "🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴";

let initialized: Promise<void> | undefined;
export async function ensureValidationBlocks(): Promise<void> {
  if (!initialized) initialized = (async () => {
    const db = await getDb();
    if (!db) throw Error("db_unavailable");
    await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_phone_attempts (
      session_id CHAR(64) PRIMARY KEY,
      device_id VARCHAR(32) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      INDEX idx_h2auto_attempts_device (device_id)
    ) ENGINE=InnoDB`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_validation_blocks (
      session_id CHAR(64) PRIMARY KEY,
      device_id VARCHAR(32) NOT NULL,
      conversation_id CHAR(64) NOT NULL,
      contact_label VARCHAR(120) NOT NULL DEFAULT '',
      invalid_answer VARCHAR(160) NOT NULL DEFAULT '',
      reason VARCHAR(120) NOT NULL,
      failed_stage VARCHAR(32) NOT NULL,
      blocked_at BIGINT NOT NULL,
      released_at BIGINT NULL,
      INDEX idx_h2auto_validation_active (device_id, released_at, blocked_at)
    ) ENGINE=InnoDB`);
  })().catch(error => { initialized = undefined; throw error; });
  await initialized;
}

function clean(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export async function blockInvalidPhone(params: {
  deviceId: string; sessionId: string; conversationId: string;
  contactLabel: string; invalidAnswer: string; stage: PhoneStage; reason: string;
}): Promise<boolean> {
  await ensureValidationBlocks();
  const db = await getDb();
  if (!db || typeof (db as any).transaction !== "function") throw Error("db_unavailable");
  const now = Date.now();
  const label = clean(params.contactLabel, 120);
  const answer = clean(params.invalidAnswer, 160);
  const reason = clean(params.reason, 120);
  return await (db as any).transaction(async (tx: any) => {
    const changed: any = await tx.execute(sql`UPDATE h2_auto_access_sessions
      SET stage='blocked',updated_at=${now}
      WHERE id=${params.sessionId} AND device_id=${params.deviceId} AND stage=${params.stage}`);
    if (!changed[0]?.affectedRows) return false;
    await tx.execute(sql`INSERT INTO h2_auto_validation_blocks
      (session_id,device_id,conversation_id,contact_label,invalid_answer,reason,failed_stage,blocked_at,released_at)
      VALUES (${params.sessionId},${params.deviceId},${params.conversationId},${label},${answer},${reason},${params.stage},${now},NULL)
      ON DUPLICATE KEY UPDATE contact_label=VALUES(contact_label),
        invalid_answer=VALUES(invalid_answer),reason=VALUES(reason),
        failed_stage=VALUES(failed_stage),blocked_at=VALUES(blocked_at),
        released_at=NULL`);
    return true;
  });
}

/** Atomic per-conversation count across all three phone stages.
 * Third failure suspends and records the block in the same transaction.
 */
export async function recordH2AutoPhoneFailure(params: {
  deviceId: string; sessionId: string; conversationId: string;
  contactLabel: string; invalidAnswer: string; stage: PhoneStage; reason: string;
}): Promise<{ attempts: number; blocked: boolean; accepted: boolean }> {
  await ensureValidationBlocks();
  const db = await getDb();
  if (!db || typeof (db as any).transaction !== "function") throw Error("db_unavailable");
  const now = Date.now();
  return await (db as any).transaction(async (tx: any) => {
    const selected: any = await tx.execute(sql`SELECT stage FROM h2_auto_access_sessions
      WHERE id=${params.sessionId} AND device_id=${params.deviceId} FOR UPDATE`);
    if (String(selected[0]?.[0]?.stage || "") !== params.stage)
      return { attempts: 0, blocked: false, accepted: false };
    await tx.execute(sql`INSERT INTO h2_auto_phone_attempts
      (session_id,device_id,attempts,updated_at)
      VALUES (${params.sessionId},${params.deviceId},1,${now})
      ON DUPLICATE KEY UPDATE
        attempts=LEAST(attempts+1,${H2_AUTO_PHONE_MAX_ATTEMPTS}),
        updated_at=${now}`);
    const result: any = await tx.execute(sql`SELECT attempts FROM h2_auto_phone_attempts
      WHERE session_id=${params.sessionId} AND device_id=${params.deviceId} FOR UPDATE`);
    const attempts = Number(result[0]?.[0]?.attempts || 1);
    if (attempts < H2_AUTO_PHONE_MAX_ATTEMPTS)
      return { attempts, blocked: false, accepted: true };
    await tx.execute(sql`UPDATE h2_auto_access_sessions
      SET stage='blocked',updated_at=${now}
      WHERE id=${params.sessionId} AND device_id=${params.deviceId} AND stage=${params.stage}`);
    await tx.execute(sql`INSERT INTO h2_auto_validation_blocks
      (session_id,device_id,conversation_id,contact_label,invalid_answer,
       reason,failed_stage,blocked_at,released_at)
      VALUES (${params.sessionId},${params.deviceId},${params.conversationId},
        ${clean(params.contactLabel, 120)},${clean(params.invalidAnswer,160)},
        ${clean(params.reason,120)},${params.stage},${now},NULL)
      ON DUPLICATE KEY UPDATE contact_label=VALUES(contact_label),
        invalid_answer=VALUES(invalid_answer),reason=VALUES(reason),
        failed_stage=VALUES(failed_stage),blocked_at=VALUES(blocked_at),
        released_at=NULL`);
    return { attempts, blocked: true, accepted: true };
  });
}

/** Navigation never resets the attempt counter. */
export async function clearH2AutoPhoneFailures(deviceId: string, sessionId: string): Promise<void> {
  await ensureValidationBlocks();
  const db = await getDb();
  if (!db) throw Error("db_unavailable");
  await db.execute(sql`DELETE FROM h2_auto_phone_attempts
    WHERE session_id=${sessionId} AND device_id=${deviceId}`);
}

export async function listActiveValidationBlocks(deviceId: string) {
  await ensureValidationBlocks();
  const db = await getDb();
  if (!db) throw Error("db_unavailable");
  const result: any = await db.execute(sql`SELECT session_id AS sessionId,
    conversation_id AS conversationId,contact_label AS contactLabel,
    invalid_answer AS invalidAnswer,reason,failed_stage AS failedStage,
    blocked_at AS blockedAt
    FROM h2_auto_validation_blocks
    WHERE device_id=${deviceId} AND released_at IS NULL
    ORDER BY blocked_at DESC LIMIT 300`);
  return (result[0] || []).map((item: any) => ({
    sessionId: String(item.sessionId),
    conversationId: String(item.conversationId),
    contactLabel: String(item.contactLabel || ""),
    invalidAnswer: String(item.invalidAnswer || ""),
    reason: String(item.reason || ""),
    failedStage: String(item.failedStage),
    blockedAt: Number(item.blockedAt),
  }));
}

export async function releaseValidationBlock(
  deviceId: string, sessionId: string, restart: boolean,
): Promise<boolean> {
  await ensureValidationBlocks();
  const db = await getDb();
  if (!db || typeof (db as any).transaction !== "function") throw Error("db_unavailable");
  return await (db as any).transaction(async (tx: any) => {
    const selected: any = await tx.execute(sql`SELECT failed_stage FROM h2_auto_validation_blocks
      WHERE session_id=${sessionId} AND device_id=${deviceId} AND released_at IS NULL
      FOR UPDATE`);
    const row = selected[0]?.[0];
    if (!row) return false;
    const stage = restart ? "choice" : "released_" + String(row.failed_stage);
    if (stage !== "choice" && stage !== "released_customer_phone" && stage !== "released_referral_phone" && stage !== "released_referrals_phone")
      throw Error("invalid_restore_stage");
    await tx.execute(sql`UPDATE h2_auto_access_sessions
      SET stage=${stage},code_hash=NULL,code_expires=NULL,
        resend_after=0,code_attempts=0,updated_at=${Date.now()}
      WHERE id=${sessionId} AND device_id=${deviceId} AND stage='blocked'`);
    await tx.execute(sql`DELETE FROM h2_auto_phone_attempts WHERE session_id=${sessionId} AND device_id=${deviceId}`);
    await tx.execute(sql`UPDATE h2_auto_validation_blocks
      SET released_at=${Date.now()} WHERE session_id=${sessionId}
      AND device_id=${deviceId} AND released_at IS NULL`);
    return true;
  });
}

export async function releaseAllValidationBlocks(deviceId: string): Promise<number> {
  await ensureValidationBlocks();
  const db = await getDb();
  if (!db || typeof (db as any).transaction !== "function") throw Error("db_unavailable");
  const now = Date.now();
  return await (db as any).transaction(async (tx: any) => {
    const changed: any = await tx.execute(sql`UPDATE h2_auto_access_sessions AS s
      INNER JOIN h2_auto_validation_blocks AS b ON b.session_id=s.id
      SET s.stage=CONCAT('released_', b.failed_stage),s.updated_at=${now},s.code_hash=NULL,
        s.code_expires=NULL,s.resend_after=0,s.code_attempts=0
      WHERE b.device_id=${deviceId} AND b.released_at IS NULL AND s.stage='blocked'`);
    await tx.execute(sql`DELETE FROM h2_auto_phone_attempts WHERE device_id=${deviceId}`);
    await tx.execute(sql`UPDATE h2_auto_validation_blocks
      SET released_at=${now} WHERE device_id=${deviceId} AND released_at IS NULL`);
    return Number(changed[0]?.affectedRows || 0);
  });
}
