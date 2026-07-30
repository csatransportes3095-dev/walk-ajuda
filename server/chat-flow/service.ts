import { asc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { chatFlowNodes } from "../../drizzle/schema";

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function stringify(v: unknown): string {
  return JSON.stringify(v ?? null);
}

export async function listFlowNodes(parentId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const rows = parentId == null
    ? await db.select().from(chatFlowNodes).where(isNull(chatFlowNodes.parentId)).orderBy(asc(chatFlowNodes.sortOrder), asc(chatFlowNodes.id))
    : await db.select().from(chatFlowNodes).where(eq(chatFlowNodes.parentId, parentId)).orderBy(asc(chatFlowNodes.sortOrder), asc(chatFlowNodes.id));
  return rows.map(r => ({
    ...r,
    actionPayload: parseJson<Record<string, unknown>>(r.actionPayloadJson, {}),
  }));
}

export async function listAllFlowNodes() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(chatFlowNodes).orderBy(asc(chatFlowNodes.sortOrder), asc(chatFlowNodes.id));
  return rows.map(r => ({
    ...r,
    actionPayload: parseJson<Record<string, unknown>>(r.actionPayloadJson, {}),
  }));
}

export async function getFlowNode(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(chatFlowNodes).where(eq(chatFlowNodes.id, id)).limit(1);
  if (!rows[0]) return null;
  return { ...rows[0], actionPayload: parseJson<Record<string, unknown>>(rows[0].actionPayloadJson, {}) };
}

export async function saveFlowNode(input: {
  id?: number;
  parentId?: number | null;
  label: string;
  botResponse?: string;
  actionType: string;
  actionPayload?: Record<string, unknown>;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");
  const payload = {
    parentId: input.parentId ?? null,
    label: input.label,
    botResponse: input.botResponse || null,
    botImageUrl: (input as any).botImageUrl || null,
    actionType: input.actionType,
    actionPayloadJson: stringify(input.actionPayload || {}),
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive === false ? 0 : 1,
  };
  if (input.id) {
    await db.update(chatFlowNodes).set({ ...payload, updatedAt: new Date() }).where(eq(chatFlowNodes.id, input.id));
    const row = await db.select().from(chatFlowNodes).where(eq(chatFlowNodes.id, input.id)).limit(1);
    return row[0];
  }
  const result = await db.insert(chatFlowNodes).values(payload);
  const id = Number(result[0].insertId);
  const row = await db.select().from(chatFlowNodes).where(eq(chatFlowNodes.id, id)).limit(1);
  return row[0];
}

export async function deleteFlowNode(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");
  // Deletar recursivamente todos os filhos
  const children = await db.select().from(chatFlowNodes).where(eq(chatFlowNodes.parentId, id));
  for (const child of children) {
    await deleteFlowNode(child.id);
  }
  await db.delete(chatFlowNodes).where(eq(chatFlowNodes.id, id));
  return true;
}

// Resolver um nó pelo label (para o bot responder)
// Busca em todos os nós raiz (parentId = null) por padrão
export async function findFlowNodeByLabel(label: string, parentId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  const normalized = label.trim().toLowerCase();
  // Buscar em nós raiz primeiro
  const rootRows = await db.select().from(chatFlowNodes).where(isNull(chatFlowNodes.parentId));
  const rootMatch = rootRows.find(r => r.isActive === 1 && (
    r.label.trim().toLowerCase() === normalized ||
    normalized === r.label.trim().toLowerCase() ||
    normalized.includes(r.label.trim().toLowerCase())
  ));
  if (rootMatch) return { ...rootMatch, actionPayload: parseJson<Record<string, unknown>>(rootMatch.actionPayloadJson, {}) };
  // Buscar em TODOS os nós (para sub-botões clicados)
  const allRows = await db.select().from(chatFlowNodes);
  const anyMatch = allRows.find(r => r.isActive === 1 && (
    r.label.trim().toLowerCase() === normalized
  ));
  if (!anyMatch) return null;
  return { ...anyMatch, actionPayload: parseJson<Record<string, unknown>>(anyMatch.actionPayloadJson, {}) };
}

// Buscar filhos de um nó
export async function getNodeChildren(nodeId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(chatFlowNodes)
    .where(eq(chatFlowNodes.parentId, nodeId))
    .orderBy(asc(chatFlowNodes.sortOrder), asc(chatFlowNodes.id));
  return rows.filter(r => r.isActive === 1).map(r => ({
    ...r,
    actionPayload: parseJson<Record<string, unknown>>(r.actionPayloadJson, {}),
  }));
}
