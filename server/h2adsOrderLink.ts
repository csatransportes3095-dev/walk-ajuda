import { sql } from "drizzle-orm";
import { getDb, getOrderStatusHistory } from "./db";

export type H2AdsOrderLink = {
  instanceId: number;
  registrationId: number;
  subOrderIndex: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type HistoryEntry = { status: string };

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(result)) return [];
  if (Array.isArray(result[0])) return result[0] as Array<Record<string, unknown>>;
  if (result[0] && typeof result[0] === "object") return result as Array<Record<string, unknown>>;
  return [];
}

export function splitH2AdsOrderHistory(historyNewestFirst: HistoryEntry[], initialStatus: string): HistoryEntry[][] {
  const chronological = [...historyNewestFirst].reverse();
  const groups: HistoryEntry[][] = [];
  let current: HistoryEntry[] = [];
  for (const entry of chronological) {
    if ((entry.status === initialStatus || entry.status === "recebido") && current.length > 0) {
      groups.push(current);
      current = [entry];
    } else {
      current.push(entry);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups.reverse();
}

async function requireH2AdsDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para o H2 Ads.");
  return db;
}

async function requireInstance(instanceId: number): Promise<void> {
  const db = await requireH2AdsDb();
  const rows = rowsFrom(await db.execute(sql`SELECT id FROM h2ads_instances WHERE id = ${instanceId} LIMIT 1`));
  if (!rows[0]) throw new Error("Instância H2 Ads não encontrada.");
}

async function getInitialOrderStatus(): Promise<string> {
  const db = await requireH2AdsDb();
  const rows = rowsFrom(await db.execute(sql`SELECT \`key\` FROM orderStatusTypes WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1`));
  return typeof rows[0]?.key === "string" && rows[0].key ? String(rows[0].key) : "recebido";
}

async function requireOrderSubOrder(registrationId: number, subOrderIndex: number): Promise<void> {
  const history = await getOrderStatusHistory(registrationId);
  if (history.length === 0) throw new Error("Pedido/subpedido não encontrado.");
  const initialStatus = await getInitialOrderStatus();
  const subOrders = splitH2AdsOrderHistory(history, initialStatus);
  if (!subOrders[subOrderIndex]?.length) throw new Error("Pedido/subpedido não encontrado.");
}

export async function listH2AdsOrderLinks(): Promise<H2AdsOrderLink[]> {
  const db = await requireH2AdsDb();
  const rows = rowsFrom(await db.execute(sql`
    SELECT instanceId, registrationId, subOrderIndex, createdAt, updatedAt
    FROM h2ads_order_links
    ORDER BY instanceId ASC
  `));
  return rows.map(row => ({
    instanceId: Number(row.instanceId),
    registrationId: Number(row.registrationId),
    subOrderIndex: Number(row.subOrderIndex || 0),
    createdAt: row.createdAt instanceof Date ? row.createdAt : row.createdAt ? new Date(String(row.createdAt)) : null,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : row.updatedAt ? new Date(String(row.updatedAt)) : null,
  }));
}

export async function setH2AdsOrderLink(instanceId: number, registrationId: number | null, subOrderIndex = 0): Promise<void> {
  const db = await requireH2AdsDb();
  await requireInstance(instanceId);
  if (registrationId === null) {
    await db.execute(sql`DELETE FROM h2ads_order_links WHERE instanceId = ${instanceId}`);
    return;
  }
  await requireOrderSubOrder(registrationId, subOrderIndex);
  try {
    await db.transaction(async tx => {
      const owner = rowsFrom(await tx.execute(sql`
        SELECT instanceId FROM h2ads_order_links
        WHERE registrationId = ${registrationId} AND subOrderIndex = ${subOrderIndex}
        LIMIT 1
      `))[0];
      if (owner && Number(owner.instanceId) !== instanceId) {
        throw new Error("Este pedido/subpedido já está vinculado a outra instância.");
      }
      await tx.execute(sql`DELETE FROM h2ads_order_links WHERE instanceId = ${instanceId}`);
      await tx.execute(sql`
        INSERT INTO h2ads_order_links (instanceId, registrationId, subOrderIndex)
        VALUES (${instanceId}, ${registrationId}, ${subOrderIndex})
      `);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível vincular o pedido à instância.";
    if (/duplicate|unique/i.test(message)) throw new Error("Este pedido/subpedido já está vinculado a outra instância.");
    throw error;
  }
}
