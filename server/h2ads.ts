import { asc, eq } from "drizzle-orm";
import { h2AdsGroups, h2AdsInstanceNetworkProfiles, h2AdsInstanceProxyCredentials, h2AdsInstances, type H2AdsGroup, type H2AdsInstance, type H2AdsInstanceNetworkProfile } from "../drizzle/schema";
import { getDb } from "./db";

export type H2AdsDashboard = {
  groups: H2AdsGroup[];
  instances: H2AdsInstance[];
  networkProfiles: H2AdsInstanceNetworkProfile[];
  proxyCredentialStatuses: Array<{ instanceId: number; updatedAt: Date }>;
};

async function requireH2AdsDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para o H2 Ads.");
  return db;
}

export async function listH2AdsDashboard(): Promise<H2AdsDashboard> {
  const db = await requireH2AdsDb();
  const [groups, instances, networkProfiles, proxyCredentialStatuses] = await Promise.all([
    db.select().from(h2AdsGroups).orderBy(asc(h2AdsGroups.sortOrder), asc(h2AdsGroups.id)),
    db.select().from(h2AdsInstances).orderBy(asc(h2AdsInstances.groupId), asc(h2AdsInstances.sortOrder), asc(h2AdsInstances.id)),
    db.select().from(h2AdsInstanceNetworkProfiles).orderBy(asc(h2AdsInstanceNetworkProfiles.instanceId)),
    db.select({ instanceId: h2AdsInstanceProxyCredentials.instanceId, updatedAt: h2AdsInstanceProxyCredentials.updatedAt }).from(h2AdsInstanceProxyCredentials).orderBy(asc(h2AdsInstanceProxyCredentials.instanceId)),
  ]);
  return { groups, instances, networkProfiles, proxyCredentialStatuses };
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
