import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { h2AdsBrowserWorkers, h2AdsGroups, h2AdsInstanceBrowserRuns, h2AdsInstanceNetworkProfiles, h2AdsInstanceProxyCredentials, h2AdsInstances, h2AdsInstanceWorkerAssignments, h2AdsWorkerCommands, h2AdsWorkerPairingCodes, type H2AdsBrowserWorker, type H2AdsGroup, type H2AdsInstance, type H2AdsInstanceBrowserRun, type H2AdsInstanceNetworkProfile, type H2AdsInstanceWorkerAssignment, type H2AdsWorkerCommand } from "../drizzle/schema";
import { getDb } from "./db";

export type H2AdsDashboard = {
  groups: H2AdsGroup[];
  instances: H2AdsInstance[];
  networkProfiles: H2AdsInstanceNetworkProfile[];
  proxyCredentialStatuses: Array<{ instanceId: number; updatedAt: Date }>;
  browserWorkers: H2AdsBrowserWorkerSummary[];
  instanceWorkerAssignments: H2AdsInstanceWorkerAssignmentSummary[];
  instanceBrowserRuns: H2AdsInstanceBrowserRunSummary[];
};

export type H2AdsBrowserWorkerSummary = Omit<H2AdsBrowserWorker, "tokenHash"> & { connectionStatus: "online" | "offline" | "revoked" };
export type H2AdsInstanceWorkerAssignmentSummary = Pick<H2AdsInstanceWorkerAssignment, "instanceId" | "workerId" | "profileState" | "profileVersion" | "lastSnapshotAt" | "assignedAt" | "updatedAt">;
export type H2AdsInstanceBrowserRunSummary = Pick<H2AdsInstanceBrowserRun, "instanceId" | "workerId" | "state" | "observedIp" | "lastErrorCategory" | "preparedAt" | "lastChangedAt">;
export const H2ADS_WORKER_ONLINE_WINDOW_MS = 70_000;

async function requireH2AdsDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para o H2 Ads.");
  return db;
}

export async function listH2AdsDashboard(): Promise<H2AdsDashboard> {
  const db = await requireH2AdsDb();
  const [groups, instances, networkProfiles, proxyCredentialStatuses, browserWorkers, instanceWorkerAssignments, instanceBrowserRuns] = await Promise.all([
    db.select().from(h2AdsGroups).orderBy(asc(h2AdsGroups.sortOrder), asc(h2AdsGroups.id)),
    db.select().from(h2AdsInstances).orderBy(asc(h2AdsInstances.groupId), asc(h2AdsInstances.sortOrder), asc(h2AdsInstances.id)),
    db.select().from(h2AdsInstanceNetworkProfiles).orderBy(asc(h2AdsInstanceNetworkProfiles.instanceId)),
    db.select({ instanceId: h2AdsInstanceProxyCredentials.instanceId, updatedAt: h2AdsInstanceProxyCredentials.updatedAt }).from(h2AdsInstanceProxyCredentials).orderBy(asc(h2AdsInstanceProxyCredentials.instanceId)),
    db.select({ id: h2AdsBrowserWorkers.id, workerKey: h2AdsBrowserWorkers.workerKey, name: h2AdsBrowserWorkers.name, operatingSystem: h2AdsBrowserWorkers.operatingSystem, status: h2AdsBrowserWorkers.status, capacity: h2AdsBrowserWorkers.capacity, computerName: h2AdsBrowserWorkers.computerName, agentVersion: h2AdsBrowserWorkers.agentVersion, lastSeenAt: h2AdsBrowserWorkers.lastSeenAt, revokedAt: h2AdsBrowserWorkers.revokedAt, createdAt: h2AdsBrowserWorkers.createdAt, updatedAt: h2AdsBrowserWorkers.updatedAt }).from(h2AdsBrowserWorkers).orderBy(asc(h2AdsBrowserWorkers.name), asc(h2AdsBrowserWorkers.id)),
    db.select({ instanceId: h2AdsInstanceWorkerAssignments.instanceId, workerId: h2AdsInstanceWorkerAssignments.workerId, profileState: h2AdsInstanceWorkerAssignments.profileState, profileVersion: h2AdsInstanceWorkerAssignments.profileVersion, lastSnapshotAt: h2AdsInstanceWorkerAssignments.lastSnapshotAt, assignedAt: h2AdsInstanceWorkerAssignments.assignedAt, updatedAt: h2AdsInstanceWorkerAssignments.updatedAt }).from(h2AdsInstanceWorkerAssignments).orderBy(asc(h2AdsInstanceWorkerAssignments.instanceId)),
    db.select({ instanceId: h2AdsInstanceBrowserRuns.instanceId, workerId: h2AdsInstanceBrowserRuns.workerId, state: h2AdsInstanceBrowserRuns.state, observedIp: h2AdsInstanceBrowserRuns.observedIp, lastErrorCategory: h2AdsInstanceBrowserRuns.lastErrorCategory, preparedAt: h2AdsInstanceBrowserRuns.preparedAt, lastChangedAt: h2AdsInstanceBrowserRuns.lastChangedAt }).from(h2AdsInstanceBrowserRuns).orderBy(asc(h2AdsInstanceBrowserRuns.instanceId)),
  ]);
  const now = Date.now();
  return {
    groups,
    instances,
    networkProfiles,
    proxyCredentialStatuses,
    browserWorkers: browserWorkers.map(worker => ({ ...worker, connectionStatus: worker.status === "revoked" ? "revoked" : worker.lastSeenAt && now - worker.lastSeenAt.getTime() <= H2ADS_WORKER_ONLINE_WINDOW_MS ? "online" : "offline" })),
    instanceWorkerAssignments,
    instanceBrowserRuns,
  };
}

export async function getH2AdsGroup(id: number): Promise<H2AdsGroup | undefined> {
  const db = await requireH2AdsDb();
  const rows = await db.select().from(h2AdsGroups).where(eq(h2AdsGroups.id, id)).limit(1);
  return rows[0];
}

export async function getH2AdsInstance(id: number): Promise<H2AdsInstance | undefined> {
  const db = await requireH2AdsDb();
  const rows = await db.select().from(h2AdsInstances).where(eq(h2AdsInstances.id, id)).limit(1);
  return rows[0];
}

export async function getH2AdsNetworkProfile(instanceId: number): Promise<H2AdsInstanceNetworkProfile | undefined> {
  const db = await requireH2AdsDb();
  const rows = await db.select().from(h2AdsInstanceNetworkProfiles).where(eq(h2AdsInstanceNetworkProfiles.instanceId, instanceId)).limit(1);
  return rows[0];
}

export async function createH2AdsGroup(input: Pick<H2AdsGroup, "name"> & Partial<Pick<H2AdsGroup, "description" | "status" | "sortOrder">>): Promise<number> {
  const db = await requireH2AdsDb();
  const result = await db.insert(h2AdsGroups).values({
    name: input.name,
    description: input.description ?? null,
    status: input.status ?? "active",
    sortOrder: input.sortOrder ?? 0,
  });
  return Number(result[0].insertId);
}

export async function updateH2AdsGroup(id: number, input: Partial<Pick<H2AdsGroup, "name" | "description" | "status" | "sortOrder">>): Promise<boolean> {
  const db = await requireH2AdsDb();
  if (Object.keys(input).length === 0) return false;
  const result = await db.update(h2AdsGroups).set(input).where(eq(h2AdsGroups.id, id));
  return Number(result[0].affectedRows) > 0;
}

export async function createH2AdsInstance(input: Pick<H2AdsInstance, "groupId" | "name"> & Partial<Pick<H2AdsInstance, "status" | "notes" | "sortOrder">>): Promise<number> {
  const db = await requireH2AdsDb();
  const result = await db.insert(h2AdsInstances).values({
    groupId: input.groupId,
    name: input.name,
    status: input.status ?? "draft",
    notes: input.notes ?? null,
    sortOrder: input.sortOrder ?? 0,
  });
  return Number(result[0].insertId);
}

export async function updateH2AdsInstance(id: number, input: Partial<Pick<H2AdsInstance, "groupId" | "name" | "status" | "notes" | "sortOrder">>): Promise<boolean> {
  const db = await requireH2AdsDb();
  if (Object.keys(input).length === 0) return false;
  const result = await db.update(h2AdsInstances).set(input).where(eq(h2AdsInstances.id, id));
  return Number(result[0].affectedRows) > 0;
}

export type H2AdsNetworkProfileInput = Partial<Pick<H2AdsInstanceNetworkProfile, "providerName" | "routeLabel" | "targetCountryCode" | "targetCity" | "expectedIsp" | "expectedAsn" | "setupStatus" | "healthStatus" | "observedIp" | "observedCountryCode" | "observedCity" | "observedIsp" | "observedAsn" | "latencyMs" | "lastCheckedAt" | "lastCheckMessage">>;

export async function saveH2AdsNetworkProfile(instanceId: number, input: H2AdsNetworkProfileInput): Promise<void> {
  const db = await requireH2AdsDb();
  const existing = await db.select({ id: h2AdsInstanceNetworkProfiles.id }).from(h2AdsInstanceNetworkProfiles).where(eq(h2AdsInstanceNetworkProfiles.instanceId, instanceId)).limit(1);
  if (existing[0]) {
    await db.update(h2AdsInstanceNetworkProfiles).set(input).where(eq(h2AdsInstanceNetworkProfiles.id, existing[0].id));
    return;
  }
  await db.insert(h2AdsInstanceNetworkProfiles).values({ instanceId, ...input });
}

export async function saveH2AdsProxyCredential(instanceId: number, encryptedPayload: string): Promise<void> {
  const db = await requireH2AdsDb();
  const existing = await db.select({ id: h2AdsInstanceProxyCredentials.id }).from(h2AdsInstanceProxyCredentials).where(eq(h2AdsInstanceProxyCredentials.instanceId, instanceId)).limit(1);
  if (existing[0]) {
    await db.update(h2AdsInstanceProxyCredentials).set({ cipherVersion: "v1", encryptedPayload }).where(eq(h2AdsInstanceProxyCredentials.id, existing[0].id));
    return;
  }
  await db.insert(h2AdsInstanceProxyCredentials).values({ instanceId, cipherVersion: "v1", encryptedPayload });
}

export async function getH2AdsProxyCredential(instanceId: number): Promise<string | undefined> {
  const db = await requireH2AdsDb();
  const rows = await db.select({ encryptedPayload: h2AdsInstanceProxyCredentials.encryptedPayload }).from(h2AdsInstanceProxyCredentials).where(eq(h2AdsInstanceProxyCredentials.instanceId, instanceId)).limit(1);
  return rows[0]?.encryptedPayload;
}

export type H2AdsNetworkValidationResult = Pick<H2AdsInstanceNetworkProfile, "healthStatus" | "observedIp" | "observedCountryCode" | "observedCity" | "observedIsp" | "observedAsn" | "latencyMs" | "lastCheckMessage">;

export async function recordH2AdsNetworkValidation(instanceId: number, result: H2AdsNetworkValidationResult): Promise<void> {
  await saveH2AdsNetworkProfile(instanceId, { ...result, lastCheckedAt: new Date(), setupStatus: result.healthStatus === "blocked" || result.healthStatus === "failed" ? "blocked" : "metadata_ready" });
}

const hashH2AdsWorkerSecret = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function isH2AdsWorkerSecretValid(received: string, expectedHash: string): boolean {
  const receivedHash = Buffer.from(hashH2AdsWorkerSecret(received), "utf8");
  const storedHash = Buffer.from(expectedHash, "utf8");
  return receivedHash.length === storedHash.length && timingSafeEqual(receivedHash, storedHash);
}

export type H2AdsWorkerPairingRequest = { name: string; capacity: number };
export type H2AdsWorkerPairingResult = { pairingCode: string; expiresAt: Date };
export type H2AdsWorkerClaimInput = { pairingCode: string; computerName: string; agentVersion: string };
export type H2AdsWorkerClaimResult = { workerKey: string; workerToken: string; workerName: string; capacity: number };

export async function createH2AdsWorkerPairingCode(input: H2AdsWorkerPairingRequest): Promise<H2AdsWorkerPairingResult> {
  const db = await requireH2AdsDb();
  const pairingCode = `H2W-${randomBytes(18).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await db.insert(h2AdsWorkerPairingCodes).values({
    codeHash: hashH2AdsWorkerSecret(pairingCode),
    requestedName: input.name,
    requestedCapacity: input.capacity,
    expiresAt,
  });
  return { pairingCode, expiresAt };
}

export async function claimH2AdsWorker(input: H2AdsWorkerClaimInput): Promise<H2AdsWorkerClaimResult> {
  const db = await requireH2AdsDb();
  const codeHash = hashH2AdsWorkerSecret(input.pairingCode);
  const now = new Date();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(h2AdsWorkerPairingCodes).where(and(eq(h2AdsWorkerPairingCodes.codeHash, codeHash), isNull(h2AdsWorkerPairingCodes.usedAt), gt(h2AdsWorkerPairingCodes.expiresAt, now))).limit(1);
    const pairing = rows[0];
    if (!pairing) throw new Error("Código de pareamento inválido ou expirado.");
    const workerKey = `h2w_${randomBytes(16).toString("hex")}`;
    const workerToken = `h2wt_${randomBytes(32).toString("base64url")}`;
    await tx.insert(h2AdsBrowserWorkers).values({
      workerKey,
      name: pairing.requestedName,
      capacity: pairing.requestedCapacity,
      tokenHash: hashH2AdsWorkerSecret(workerToken),
      computerName: input.computerName,
      agentVersion: input.agentVersion,
      lastSeenAt: now,
    });
    const marked = await tx.update(h2AdsWorkerPairingCodes).set({ usedAt: now }).where(and(eq(h2AdsWorkerPairingCodes.id, pairing.id), isNull(h2AdsWorkerPairingCodes.usedAt)));
    if (Number(marked[0].affectedRows) !== 1) throw new Error("Código de pareamento já foi utilizado.");
    return { workerKey, workerToken, workerName: pairing.requestedName, capacity: pairing.requestedCapacity };
  });
}

async function getH2AdsBrowserWorkerByKey(workerKey: string): Promise<H2AdsBrowserWorker | undefined> {
  const db = await requireH2AdsDb();
  const rows = await db.select().from(h2AdsBrowserWorkers).where(eq(h2AdsBrowserWorkers.workerKey, workerKey)).limit(1);
  return rows[0];
}

export async function authenticateH2AdsWorker(workerKey: string, workerToken: string): Promise<Pick<H2AdsBrowserWorker, "id" | "workerKey" | "name" | "status" | "capacity"> | null> {
  const worker = await getH2AdsBrowserWorkerByKey(workerKey);
  if (!worker || worker.status !== "active" || !isH2AdsWorkerSecretValid(workerToken, worker.tokenHash)) return null;
  return { id: worker.id, workerKey: worker.workerKey, name: worker.name, status: worker.status, capacity: worker.capacity };
}

export async function recordH2AdsWorkerHeartbeat(input: { workerKey: string; workerToken: string; computerName: string; agentVersion: string }): Promise<boolean> {
  const worker = await authenticateH2AdsWorker(input.workerKey, input.workerToken);
  if (!worker) return false;
  const db = await requireH2AdsDb();
  const updated = await db.update(h2AdsBrowserWorkers).set({ computerName: input.computerName, agentVersion: input.agentVersion, lastSeenAt: new Date() }).where(eq(h2AdsBrowserWorkers.id, worker.id));
  return Number(updated[0].affectedRows) === 1;
}

export async function revokeH2AdsBrowserWorker(workerId: number): Promise<boolean> {
  const db = await requireH2AdsDb();
  const updated = await db.update(h2AdsBrowserWorkers).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(h2AdsBrowserWorkers.id, workerId), eq(h2AdsBrowserWorkers.status, "active")));
  return Number(updated[0].affectedRows) === 1;
}

export async function assignH2AdsInstanceWorker(instanceId: number, workerId: number): Promise<void> {
  const db = await requireH2AdsDb();
  const workers = await db.select().from(h2AdsBrowserWorkers).where(and(eq(h2AdsBrowserWorkers.id, workerId), eq(h2AdsBrowserWorkers.status, "active"))).limit(1);
  if (!workers[0]) throw new Error("Worker H2 Ads indisponível para atribuição.");
  const assignments = await db.select().from(h2AdsInstanceWorkerAssignments).where(eq(h2AdsInstanceWorkerAssignments.instanceId, instanceId)).limit(1);
  const current = assignments[0];
  if (!current) {
    await db.insert(h2AdsInstanceWorkerAssignments).values({ instanceId, workerId });
    return;
  }
  if (current.workerId === workerId) return;
  if (current.profileState !== "not_started") throw new Error("A transferência de perfil desta instância ainda não está pronta. Pare e crie um snapshot íntegro antes de mover o Worker.");
  await db.update(h2AdsInstanceWorkerAssignments).set({ workerId, assignedAt: new Date() }).where(eq(h2AdsInstanceWorkerAssignments.id, current.id));
}

export type H2AdsBrowserPreparationRequest = { commandId: number; instanceId: number; workerId: number };
type H2AdsWorkerCommandAction = "prepare_browser" | "launch_browser" | "close_browser";
export type H2AdsClaimedWorkerCommand = Pick<H2AdsWorkerCommand, "id" | "instanceId" | "workerId"> & { command: H2AdsWorkerCommandAction };

function toH2AdsWorkerCommandAction(value: string | null | undefined): H2AdsWorkerCommandAction {
  if (value === "launch_browser" || value === "close_browser" || value === "prepare_browser") return value;
  return "prepare_browser";
}

async function upsertH2AdsBrowserRun(instanceId: number, workerId: number, input: Pick<H2AdsInstanceBrowserRun, "state"> & Partial<Pick<H2AdsInstanceBrowserRun, "observedIp" | "lastErrorCategory" | "preparedAt">>): Promise<void> {
  const db = await requireH2AdsDb();
  const rows = await db.select({ id: h2AdsInstanceBrowserRuns.id }).from(h2AdsInstanceBrowserRuns).where(eq(h2AdsInstanceBrowserRuns.instanceId, instanceId)).limit(1);
  if (rows[0]) {
    await db.update(h2AdsInstanceBrowserRuns).set({ workerId, ...input, lastChangedAt: new Date() }).where(eq(h2AdsInstanceBrowserRuns.id, rows[0].id));
    return;
  }
  await db.insert(h2AdsInstanceBrowserRuns).values({ instanceId, workerId, ...input });
}

export async function requestH2AdsBrowserPreparation(instanceId: number): Promise<H2AdsBrowserPreparationRequest> {
  const db = await requireH2AdsDb();
  const assignments = await db.select().from(h2AdsInstanceWorkerAssignments).where(eq(h2AdsInstanceWorkerAssignments.instanceId, instanceId)).limit(1);
  const assignment = assignments[0];
  if (!assignment) throw new Error("A instância precisa ter um Worker atribuído antes da preparação.");
  const workers = await db.select().from(h2AdsBrowserWorkers).where(and(eq(h2AdsBrowserWorkers.id, assignment.workerId), eq(h2AdsBrowserWorkers.status, "active"))).limit(1);
  const worker = workers[0];
  if (!worker || !worker.lastSeenAt || Date.now() - worker.lastSeenAt.getTime() > H2ADS_WORKER_ONLINE_WINDOW_MS) throw new Error("O Worker atribuído precisa estar online antes da preparação.");
  const credentials = await db.select({ id: h2AdsInstanceProxyCredentials.id }).from(h2AdsInstanceProxyCredentials).where(eq(h2AdsInstanceProxyCredentials.instanceId, instanceId)).limit(1);
  if (!credentials[0]) throw new Error("A instância não possui uma rota protegida para validar.");
  const networkProfiles = await db.select({ healthStatus: h2AdsInstanceNetworkProfiles.healthStatus }).from(h2AdsInstanceNetworkProfiles).where(eq(h2AdsInstanceNetworkProfiles.instanceId, instanceId)).limit(1);
  if (networkProfiles[0]?.healthStatus !== "healthy") throw new Error("A rota precisa estar aprovada antes da preparação do browser.");
  const latestCommand = await db.select({ id: h2AdsWorkerCommands.id, status: h2AdsWorkerCommands.status }).from(h2AdsWorkerCommands).where(and(eq(h2AdsWorkerCommands.instanceId, instanceId), eq(h2AdsWorkerCommands.commandAction, "prepare_browser"))).orderBy(desc(h2AdsWorkerCommands.id)).limit(1);
  if (latestCommand[0] && (latestCommand[0].status === "queued" || latestCommand[0].status === "claimed")) return { commandId: latestCommand[0].id, instanceId, workerId: worker.id };
  await upsertH2AdsBrowserRun(instanceId, worker.id, { state: "queued", observedIp: null, lastErrorCategory: null, preparedAt: null });
  const inserted = await db.insert(h2AdsWorkerCommands).values({ workerId: worker.id, instanceId, command: "prepare_browser", commandAction: "prepare_browser" });
  return { commandId: Number(inserted[0].insertId), instanceId, workerId: worker.id };
}

export async function claimNextH2AdsWorkerCommand(workerId: number): Promise<H2AdsClaimedWorkerCommand | null> {
  const db = await requireH2AdsDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select({ id: h2AdsWorkerCommands.id, workerId: h2AdsWorkerCommands.workerId, instanceId: h2AdsWorkerCommands.instanceId, commandAction: h2AdsWorkerCommands.commandAction }).from(h2AdsWorkerCommands).where(and(eq(h2AdsWorkerCommands.workerId, workerId), eq(h2AdsWorkerCommands.status, "queued"))).orderBy(asc(h2AdsWorkerCommands.id)).limit(1);
    const command = rows[0];
    if (!command) return null;
    const marked = await tx.update(h2AdsWorkerCommands).set({ status: "claimed", claimedAt: new Date() }).where(and(eq(h2AdsWorkerCommands.id, command.id), eq(h2AdsWorkerCommands.status, "queued")));
    if (Number(marked[0].affectedRows) !== 1) return null;
    await tx.update(h2AdsInstanceBrowserRuns).set({ state: "preparing", lastChangedAt: new Date() }).where(eq(h2AdsInstanceBrowserRuns.instanceId, command.instanceId));
    return { ...command, command: toH2AdsWorkerCommandAction(command.commandAction) };
  });
}

export async function completeH2AdsWorkerPreparation(input: { workerId: number; commandId: number; state: "proxy_verified" | "blocked"; observedIp?: string | null; errorCategory?: string | null }): Promise<boolean> {
  const db = await requireH2AdsDb();
  const commands = await db.select().from(h2AdsWorkerCommands).where(and(eq(h2AdsWorkerCommands.id, input.commandId), eq(h2AdsWorkerCommands.workerId, input.workerId), eq(h2AdsWorkerCommands.commandAction, "prepare_browser"), eq(h2AdsWorkerCommands.status, "claimed"))).limit(1);
  const command = commands[0];
  if (!command) return false;
  await db.update(h2AdsWorkerCommands).set({ status: input.state === "proxy_verified" ? "succeeded" : "failed", errorCategory: input.errorCategory ?? null, completedAt: new Date() }).where(eq(h2AdsWorkerCommands.id, command.id));
  await upsertH2AdsBrowserRun(command.instanceId, input.workerId, { state: input.state, observedIp: input.observedIp ?? null, lastErrorCategory: input.errorCategory ?? null, preparedAt: input.state === "proxy_verified" ? new Date() : null });
  if (input.state === "proxy_verified") {
    await db.update(h2AdsInstanceWorkerAssignments).set({ profileState: "local_only", profileVersion: 1, updatedAt: new Date() }).where(and(eq(h2AdsInstanceWorkerAssignments.instanceId, command.instanceId), eq(h2AdsInstanceWorkerAssignments.workerId, input.workerId)));
  }
  return true;
}

async function getAssignedOnlineWorker(instanceId: number) {
  const db = await requireH2AdsDb();
  const assignments = await db.select().from(h2AdsInstanceWorkerAssignments).where(eq(h2AdsInstanceWorkerAssignments.instanceId, instanceId)).limit(1);
  const assignment = assignments[0];
  if (!assignment) throw new Error("A instância precisa ter um Worker atribuído.");
  const workers = await db.select().from(h2AdsBrowserWorkers).where(and(eq(h2AdsBrowserWorkers.id, assignment.workerId), eq(h2AdsBrowserWorkers.status, "active"))).limit(1);
  const worker = workers[0];
  if (!worker || !worker.lastSeenAt || Date.now() - worker.lastSeenAt.getTime() > H2ADS_WORKER_ONLINE_WINDOW_MS) throw new Error("O Worker atribuído precisa estar online.");
  return { db, assignment, worker };
}

export async function requestH2AdsBrowserLaunch(instanceId: number): Promise<{ commandId: number; instanceId: number; workerId: number }> {
  const { db, assignment, worker } = await getAssignedOnlineWorker(instanceId);
  if (assignment.profileState !== "local_only" && assignment.profileState !== "snapshot_ready") throw new Error("O perfil local precisa estar preparado antes da abertura.");
  const runs = await db.select().from(h2AdsInstanceBrowserRuns).where(and(eq(h2AdsInstanceBrowserRuns.instanceId, instanceId), eq(h2AdsInstanceBrowserRuns.workerId, worker.id))).limit(1);
  if (runs[0]?.state !== "proxy_verified" && runs[0]?.state !== "closed") throw new Error("A rota precisa ser confirmada pelo Worker antes da abertura.");
  const pending = await db.select({ id: h2AdsWorkerCommands.id, status: h2AdsWorkerCommands.status }).from(h2AdsWorkerCommands).where(and(eq(h2AdsWorkerCommands.instanceId, instanceId), eq(h2AdsWorkerCommands.commandAction, "launch_browser"))).orderBy(desc(h2AdsWorkerCommands.id)).limit(1);
  if (pending[0] && (pending[0].status === "queued" || pending[0].status === "claimed")) return { commandId: pending[0].id, instanceId, workerId: worker.id };
  const inserted = await db.insert(h2AdsWorkerCommands).values({ workerId: worker.id, instanceId, command: "prepare_browser", commandAction: "launch_browser" });
  return { commandId: Number(inserted[0].insertId), instanceId, workerId: worker.id };
}

export async function requestH2AdsBrowserClose(instanceId: number): Promise<{ commandId: number; instanceId: number; workerId: number }> {
  const { db, worker } = await getAssignedOnlineWorker(instanceId);
  const runs = await db.select().from(h2AdsInstanceBrowserRuns).where(and(eq(h2AdsInstanceBrowserRuns.instanceId, instanceId), eq(h2AdsInstanceBrowserRuns.workerId, worker.id))).limit(1);
  if (runs[0]?.state !== "browser_open") throw new Error("Não há browser aberto para encerrar nesta instância.");
  const pending = await db.select({ id: h2AdsWorkerCommands.id, status: h2AdsWorkerCommands.status }).from(h2AdsWorkerCommands).where(and(eq(h2AdsWorkerCommands.instanceId, instanceId), eq(h2AdsWorkerCommands.commandAction, "close_browser"))).orderBy(desc(h2AdsWorkerCommands.id)).limit(1);
  if (pending[0] && (pending[0].status === "queued" || pending[0].status === "claimed")) return { commandId: pending[0].id, instanceId, workerId: worker.id };
  const inserted = await db.insert(h2AdsWorkerCommands).values({ workerId: worker.id, instanceId, command: "prepare_browser", commandAction: "close_browser" });
  return { commandId: Number(inserted[0].insertId), instanceId, workerId: worker.id };
}

export async function completeH2AdsWorkerBrowserCommand(input: { workerId: number; commandId: number; command: "launch_browser" | "close_browser"; state: "browser_open" | "closed" | "blocked"; errorCategory?: string | null }): Promise<boolean> {
  const db = await requireH2AdsDb();
  const commands = await db.select().from(h2AdsWorkerCommands).where(and(eq(h2AdsWorkerCommands.id, input.commandId), eq(h2AdsWorkerCommands.workerId, input.workerId), eq(h2AdsWorkerCommands.commandAction, input.command), eq(h2AdsWorkerCommands.status, "claimed"))).limit(1);
  const command = commands[0];
  if (!command) return false;
  if ((input.command === "launch_browser" && input.state !== "browser_open" && input.state !== "blocked") || (input.command === "close_browser" && input.state !== "closed" && input.state !== "blocked")) return false;
  await db.update(h2AdsWorkerCommands).set({ status: input.state === "blocked" ? "failed" : "succeeded", errorCategory: input.errorCategory ?? null, completedAt: new Date() }).where(eq(h2AdsWorkerCommands.id, command.id));
  await upsertH2AdsBrowserRun(command.instanceId, input.workerId, { state: input.state, lastErrorCategory: input.errorCategory ?? null });
  return true;
}

export async function recordH2AdsBrowserRuntimeState(input: { workerId: number; instanceId: number; state: "closed" }): Promise<boolean> {
  const db = await requireH2AdsDb();
  const assignments = await db.select().from(h2AdsInstanceWorkerAssignments).where(and(eq(h2AdsInstanceWorkerAssignments.instanceId, input.instanceId), eq(h2AdsInstanceWorkerAssignments.workerId, input.workerId))).limit(1);
  if (!assignments[0]) return false;
  const runs = await db.select({ id: h2AdsInstanceBrowserRuns.id, state: h2AdsInstanceBrowserRuns.state }).from(h2AdsInstanceBrowserRuns).where(and(eq(h2AdsInstanceBrowserRuns.instanceId, input.instanceId), eq(h2AdsInstanceBrowserRuns.workerId, input.workerId))).limit(1);
  if (!runs[0] || runs[0].state !== "browser_open") return false;
  await db.update(h2AdsInstanceBrowserRuns).set({ state: "closed", lastErrorCategory: null, lastChangedAt: new Date() }).where(eq(h2AdsInstanceBrowserRuns.id, runs[0].id));
  return true;
}
