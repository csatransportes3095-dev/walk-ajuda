import { and, eq } from "drizzle-orm";
import { h2AdsBrowserWorkers, h2AdsInstanceWorkerAssignments } from "../drizzle/schema";
import { getDb } from "./db";

export async function assignH2AdsInstanceWorkerPortable(instanceId: number, workerId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para o H2 Ads.");

  const workers = await db.select({ id: h2AdsBrowserWorkers.id }).from(h2AdsBrowserWorkers).where(and(eq(h2AdsBrowserWorkers.id, workerId), eq(h2AdsBrowserWorkers.status, "active"))).limit(1);
  if (!workers[0]) throw new Error("Worker H2 Ads indisponível para atribuição.");

  const assignments = await db.select().from(h2AdsInstanceWorkerAssignments).where(eq(h2AdsInstanceWorkerAssignments.instanceId, instanceId)).limit(1);
  const current = assignments[0];
  if (!current) {
    await db.insert(h2AdsInstanceWorkerAssignments).values({ instanceId, workerId });
    return;
  }
  if (current.workerId === workerId) return;

  const hasVerifiedSnapshot = Boolean(
    current.snapshotKey &&
    current.integrityHash &&
    /^[a-f0-9]{64}$/i.test(current.integrityHash) &&
    current.snapshotSizeBytes &&
    current.snapshotSizeBytes > 0,
  );

  if (current.profileState !== "not_started" && !hasVerifiedSnapshot) {
    throw new Error("Este perfil ainda existe somente no computador antigo. Encerre o browser para gerar um snapshot íntegro antes de mover o Worker.");
  }

  await db.update(h2AdsInstanceWorkerAssignments).set({
    workerId,
    profileState: hasVerifiedSnapshot ? "transferring" : "not_started",
    assignedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(h2AdsInstanceWorkerAssignments.id, current.id));
}
