import { sql } from "drizzle-orm";
import { getDb } from "./db";

// Only small non-sensitive operational identifiers are kept until purge completes.
// The row is deleted alongside the instance; no permanent soft-delete copy.
let tableReady: Promise<void> | null = null;
export function ensureH2AdsDeletionRequests(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível para exclusão de instâncias H2ADS.");
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
  }
  return tableReady;
}

type DeletionRequest = { id: number; instanceId: number; workerId: number | null; state: "pending" | "local_removed" };

export async function isH2AdsInstanceDeletionPending(instanceId: number): Promise<boolean> {
  if (!Number.isSafeInteger(instanceId) || instanceId < 1) return false;
  await ensureH2AdsDeletionRequests();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const result = await db.execute(sql`SELECT id FROM h2ads_instance_deletion_requests WHERE instanceId = ${instanceId} LIMIT 1`);
  return Boolean((result[0] as unknown as Array<{ id: number }>)[0]);
}

export async function assertH2AdsInstanceNotDeleting(instanceId: number): Promise<void> {
  if (await isH2AdsInstanceDeletionPending(instanceId)) {
    throw new Error("A exclusão definitiva desta instância está pendente. Não são permitidos novos comandos ou backups.");
  }
}

export async function getH2AdsInstanceDeletionIds(): Promise<number[]> {
  await ensureH2AdsDeletionRequests();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const result = await db.execute(sql`SELECT instanceId FROM h2ads_instance_deletion_requests`);
  return (result[0] as unknown as Array<{ instanceId: number }>).map(row => Number(row.instanceId));
}

export async function getNextH2AdsInstanceDeletion(workerId: number): Promise<DeletionRequest | null> {
  await ensureH2AdsDeletionRequests();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const result = await db.execute(sql`
    SELECT id, instanceId, workerId, state
    FROM h2ads_instance_deletion_requests
    WHERE workerId = ${workerId}
    ORDER BY id ASC LIMIT 1
  `);
  const row = (result[0] as unknown as DeletionRequest[])[0];
  return row || null;
}
