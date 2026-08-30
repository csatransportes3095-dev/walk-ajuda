import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada para a migration de cor dos grupos H2 Ads.");
  const migrationPath = path.resolve(process.cwd(), "drizzle", "0144_h2ads_group_card_color.sql");
  const sql = (await readFile(migrationPath, "utf8")).trim();
  if (!/^ALTER TABLE `h2ads_groups`[\s\S]+ADD COLUMN IF NOT EXISTS `cardColor`/i.test(sql)) throw new Error("Migration H2 Ads cardColor inválida.");
  const connection = await createConnection(process.env.DATABASE_URL);
  try { await connection.query(sql); } finally { await connection.end(); }
}
main().catch((error) => { console.error("[H2ADS-MIGRATION] group card color", error instanceof Error ? error.message : "falhou"); process.exit(1); });
