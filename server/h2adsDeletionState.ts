import { sql } from "drizzle-orm";
import { getDb } from "./db";

// The deletion fence persists while Windows, R2 or SQL cleanup is incomplete.
let tableReady: Promise<void> | null = null;
export function ensureH2AdsDeletionRequests(): Promise<void> {
  if (!tableReady) tableReady = (async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para exclusão H2ADS.");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS h2ads_instance_deletion_requests (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        instanceId INT NOT NULL,
        workerId INT NULL,
        state ENUM('pending','local_removed') NOT NULL DEFAULT 'pending',
        requestedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY h2ads_deletion_instance_unique (instanceId),
        KEY h2ads_deletion_worker_state (workerId, state, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  })().catch(error => { tableReady = null; throw error; });
  return tableReady;
}
export type H2AdsDeletionRequest = {
  id: number; instanceId: number; workerId: number | null; state: "pending" | "local_removed";
};
function validId(id: number): boolean { return Number.isSafeInteger(id) && id > 0 && id <= 2147483647; }
function rows<T>(result: unknown): T[] { return (result as [T[]])[0]; }

export async function getH2AdsDeletionRequest(instanceId: number): Promise<H2AdsDeletionRequest | null> {
  if (!validId(instanceId)) return null;
  await ensureH2AdsDeletionRequests();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const result = await db.execute(sql`
    SELECT id, instanceId, workerId, state FROM h2ads_instance_deletion_requests
    WHERE instanceId = ${instanceId} LIMIT 1
  `);
  return rows<H2AdsDeletionRequest>(result)[0] ?? null;
}
export async function isH2AdsInstanceDeletionPending(instanceId: number): Promise<boolean> {
  return Boolean(await getH2AdsDeletionRequest(instanceId));
}
export async function assertH2AdsInstanceNotDeleting(instanceId: number): Promise<void> {
  if (await isH2AdsInstanceDeletionPending(instanceId))
    throw new Error("Exclusão definitiva pendente: novos comandos, restaurações e backups estão bloqueados.");
}
export async function getH2AdsInstanceDeletionIds(): Promise<number[]> {
  await ensureH2AdsDeletionRequests();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const result = await db.execute(sql`SELECT instanceId FROM h2ads_instance_deletion_requests`);
  return rows<{ instanceId: number }>(result).map(row => Number(row.instanceId));
}
export async function beginH2AdsInstanceDeletion(instanceId: number):
  Promise<"not_found" | "pending" | "ready_remote"> {
  if (!validId(instanceId)) throw new Error("Instância inválida.");
  await ensureH2AdsDeletionRequests();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  return db.transaction(async tx => {
    // Serialize concurrent delete requests to the same instance.
    const instanceRows = await tx.execute(sql`SELECT id FROM h2ads_instances WHERE id = ${instanceId} FOR UPDATE`);
    if (!rows<{id:number}>(instanceRows)[0]) return "not_found" as const;
    const prior = await tx.execute(sql`SELECT state FROM h2ads_instance_deletion_requests WHERE instanceId = ${instanceId} LIMIT 1`);
    const priorState = rows<{state:string}>(prior)[0]?.state;
    if (priorState) return priorState === "pending" ? "pending" as const : "ready_remote" as const;
    const run = await tx.execute(sql`SELECT state FROM h2ads_instance_browser_runs WHERE instanceId = ${instanceId} LIMIT 1`);
    if (rows<{state:string}>(run)[0]?.state === "browser_open")
      throw new Error("Encerre o navegador da instância antes da exclusão definitiva.");
    const assignmentRows = await tx.execute(sql`SELECT workerId FROM h2ads_instance_worker_assignments WHERE instanceId = ${instanceId} LIMIT 1`);
    const assignment = rows<{workerId:number}>(assignmentRows)[0];
    if (!assignment) {
      // Only an unused draft can safely skip confirmation from a local Worker.
      const traces = await tx.execute(sql`SELECT
        (SELECT COUNT(*) FROM h2ads_worker_commands WHERE instanceId = ${instanceId}) +
        (SELECT COUNT(*) FROM h2ads_worker_browser_commands WHERE instanceId = ${instanceId}) +
        (SELECT COUNT(*) FROM h2ads_instance_browser_runs WHERE instanceId = ${instanceId}) AS total`);
      if (Number(rows<{total:number}>(traces)[0]?.total ?? 0) !== 0)
        throw new Error("Há histórico local sem Worker atribuído para confirmar a exclusão.");
    }
    await tx.execute(sql`INSERT INTO h2ads_instance_deletion_requests (instanceId,workerId,state)
      VALUES (${instanceId}, ${assignment ? Number(assignment.workerId) : null},
        ${assignment ? "pending" : "local_removed"})`);
    await tx.execute(sql`UPDATE h2ads_worker_commands
      SET status='cancelled',completedAt=CURRENT_TIMESTAMP
      WHERE instanceId = ${instanceId} AND status IN ('queued','claimed')`);
    await tx.execute(sql`UPDATE h2ads_worker_browser_commands
      SET status='cancelled',completedAt=CURRENT_TIMESTAMP
      WHERE instanceId = ${instanceId} AND status IN ('queued','claimed')`);
    return assignment ? "pending" as const : "ready_remote" as const;
  });
}
export async function getNextH2AdsInstanceDeletion(workerId: number): Promise<H2AdsDeletionRequest | null> {
  if (!validId(workerId)) return null;
  await ensureH2AdsDeletionRequests();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const result = await db.execute(sql`SELECT id,instanceId,workerId,state
    FROM h2ads_instance_deletion_requests WHERE workerId = ${workerId}
    AND (state='pending' OR updatedAt < DATE_SUB(UTC_TIMESTAMP(),INTERVAL 20 SECOND))
    ORDER BY id LIMIT 1`);
  return rows<H2AdsDeletionRequest>(result)[0] ?? null;
}
export async function confirmH2AdsLocalRemoval(workerId: number,instanceId: number): Promise<boolean> {
  if (!validId(workerId) || !validId(instanceId)) return false;
  await ensureH2AdsDeletionRequests();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const r = await db.execute(sql`UPDATE h2ads_instance_deletion_requests
    SET state='local_removed',updatedAt=CURRENT_TIMESTAMP
    WHERE instanceId=${instanceId} AND workerId=${workerId} AND state='pending'`);
  if (Number((r[0] as {affectedRows?:number}).affectedRows || 0) > 0) return true;
  const pending = await getH2AdsDeletionRequest(instanceId);
  return pending?.workerId === workerId && pending.state === "local_removed";
}
export async function postponeH2AdsRemoteDeletion(instanceId: number): Promise<void> {
  await ensureH2AdsDeletionRequests();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  await db.execute(sql`UPDATE h2ads_instance_deletion_requests SET updatedAt=CURRENT_TIMESTAMP
    WHERE instanceId=${instanceId} AND state='local_removed'`);
}
export async function finishH2AdsDeletionRequest(instanceId: number): Promise<void> {
  await ensureH2AdsDeletionRequests();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  await db.execute(sql`DELETE FROM h2ads_instance_deletion_requests
    WHERE instanceId=${instanceId} AND state='local_removed'`);
}
