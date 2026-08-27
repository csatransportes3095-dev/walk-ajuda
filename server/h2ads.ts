import { asc, eq } from "drizzle-orm";
import { h2AdsGroups, h2AdsInstances, type H2AdsGroup, type H2AdsInstance } from "../drizzle/schema";
import { getDb } from "./db";

export type H2AdsDashboard = {
  groups: H2AdsGroup[];
  instances: H2AdsInstance[];
};

async function requireH2AdsDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para o H2 Ads.");
  return db;
}

export async function listH2AdsDashboard(): Promise<H2AdsDashboard> {
  const db = await requireH2AdsDb();
  const [groups, instances] = await Promise.all([
    db.select().from(h2AdsGroups).orderBy(asc(h2AdsGroups.sortOrder), asc(h2AdsGroups.id)),
    db.select().from(h2AdsInstances).orderBy(asc(h2AdsInstances.groupId), asc(h2AdsInstances.sortOrder), asc(h2AdsInstances.id)),
  ]);
  return { groups, instances };
}

export async function getH2AdsGroup(id: number): Promise<H2AdsGroup | undefined> {
  const db = await requireH2AdsDb();
  const rows = await db.select().from(h2AdsGroups).where(eq(h2AdsGroups.id, id)).limit(1);
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
