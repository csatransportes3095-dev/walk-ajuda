import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type H2AdsVisualEntityType = "group" | "instance";
export type H2AdsVisualColor = { entityType: H2AdsVisualEntityType; entityId: number; color: string };

let visualColorsTableReady = false;

function assertEntityType(value: string): asserts value is H2AdsVisualEntityType {
  if (value !== "group" && value !== "instance") throw new Error("Tipo visual H2 Ads inválido.");
}

export function normalizeH2AdsVisualColor(value: string): string {
  const color = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new Error("Cor H2 Ads inválida.");
  return color;
}

async function requireDb() {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco indisponível para preferências visuais do H2 Ads.");
  return db;
}

export async function ensureH2AdsVisualColorsTable(): Promise<void> {
  if (visualColorsTableReady) return;
  const db = await requireDb();
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS h2ads_visual_colors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      entityType VARCHAR(16) NOT NULL,
      entityId INT NOT NULL,
      color VARCHAR(7) NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY h2ads_visual_colors_entity_uq (entityType, entityId),
      KEY h2ads_visual_colors_entity_idx (entityType, entityId)
    )
  `));
  visualColorsTableReady = true;
}

export async function listH2AdsVisualColors(): Promise<H2AdsVisualColor[]> {
  await ensureH2AdsVisualColorsTable();
  const db = await requireDb();
  const result = await db.execute(sql.raw("SELECT entityType, entityId, color FROM h2ads_visual_colors ORDER BY entityType, entityId")) as any;
  const rows = Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : [];
  return rows.flatMap((row: any) => {
    try {
      const entityType = String(row.entityType);
      assertEntityType(entityType);
      const entityId = Number(row.entityId);
      if (!Number.isInteger(entityId) || entityId < 1) return [];
      return [{ entityType, entityId, color: normalizeH2AdsVisualColor(String(row.color)) }];
    } catch {
      return [];
    }
  });
}

export async function saveH2AdsVisualColor(input: H2AdsVisualColor): Promise<void> {
  assertEntityType(input.entityType);
  if (!Number.isInteger(input.entityId) || input.entityId < 1) throw new Error("Identificador visual H2 Ads inválido.");
  const color = normalizeH2AdsVisualColor(input.color);
  await ensureH2AdsVisualColorsTable();
  const db = await requireDb();
  await db.execute(sql`
    INSERT INTO h2ads_visual_colors (entityType, entityId, color)
    VALUES (${input.entityType}, ${input.entityId}, ${color})
    ON DUPLICATE KEY UPDATE color = VALUES(color), updatedAt = CURRENT_TIMESTAMP
  `);
}
