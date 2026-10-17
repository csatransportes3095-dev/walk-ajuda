import { and, eq } from "drizzle-orm";
import {
  h2AdsInstanceBrowserRuns,
  h2AdsInstanceWorkerAssignments,
  h2AdsBrowserWorkers,
} from "../drizzle/schema";
import { getDb } from "./db";

export async function h2AdsRemoteOwnerForOpenInstance(instanceId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [assignment] = await db.select({ workerId: h2AdsInstanceWorkerAssignments.workerId })
    .from(h2AdsInstanceWorkerAssignments)
    .where(eq(h2AdsInstanceWorkerAssignments.instanceId, instanceId)).limit(1);
  if (!assignment) return null;
  const [run, worker] = await Promise.all([
    db.select({ state: h2AdsInstanceBrowserRuns.state })
      .from(h2AdsInstanceBrowserRuns)
      .where(and(eq(h2AdsInstanceBrowserRuns.instanceId, instanceId), eq(h2AdsInstanceBrowserRuns.workerId, assignment.workerId))).limit(1),
    db.select({
      status: h2AdsBrowserWorkers.status,
      lastSeenAt: h2AdsBrowserWorkers.lastSeenAt,
    }).from(h2AdsBrowserWorkers)
      .where(eq(h2AdsBrowserWorkers.id, assignment.workerId)).limit(1),
  ]);
  const currentWorker = worker[0];
  if (run[0]?.state !== "browser_open" || !currentWorker ||
      currentWorker.status !== "active" || !currentWorker.lastSeenAt ||
      Date.now() - currentWorker.lastSeenAt.getTime() > 70_000) return null;
  return assignment.workerId;
}
