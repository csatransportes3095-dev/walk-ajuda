import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type H2AdsBrowserEngine = "chrome" | "firefox";

let browserEngineTableReady = false;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para a seleção de navegador H2ADS.");
  return db;
}

async function ensureBrowserEngineTable() {
  if (browserEngineTableReady) return;
  const db = await requireDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS h2ads_browser_engine_preferences (
      instanceId INT NOT NULL PRIMARY KEY,
      engine VARCHAR(16) NOT NULL DEFAULT 'chrome',
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY h2ads_browser_engine_idx (engine)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  browserEngineTableReady = true;
}

export async function setH2AdsBrowserEngine(instanceId: number, engine: H2AdsBrowserEngine): Promise<void> {
  if (!Number.isInteger(instanceId) || instanceId < 1) throw new Error("Instância H2ADS inválida.");
  if (engine !== "chrome" && engine !== "firefox") throw new Error("Navegador H2ADS inválido.");
  await ensureBrowserEngineTable();
  const db = await requireDb();
  await db.execute(sql`
    INSERT INTO h2ads_browser_engine_preferences (instanceId, engine)
    VALUES (${instanceId}, ${engine})
    ON DUPLICATE KEY UPDATE engine=VALUES(engine)
  `);
}

export async function getH2AdsBrowserEngine(instanceId: number): Promise<H2AdsBrowserEngine> {
  if (!Number.isInteger(instanceId) || instanceId < 1) return "chrome";
  await ensureBrowserEngineTable();
  const db = await requireDb();
  const result = await db.execute(sql`
    SELECT engine
    FROM h2ads_browser_engine_preferences
    WHERE instanceId=${instanceId}
    LIMIT 1
  `);
  const rows = (result[0] ?? []) as unknown as Array<{ engine?: string | null }>;
  return rows[0]?.engine === "firefox" ? "firefox" : "chrome";
}

export async function deleteH2AdsBrowserEnginePreference(instanceId: number): Promise<void> {
  if (!Number.isInteger(instanceId) || instanceId < 1) return;
  await ensureBrowserEngineTable();
  const db = await requireDb();
  await db.execute(sql`DELETE FROM h2ads_browser_engine_preferences WHERE instanceId=${instanceId}`);
}
