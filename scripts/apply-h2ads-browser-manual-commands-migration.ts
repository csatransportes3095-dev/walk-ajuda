import { createConnection } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada.");
  const migrationPath = path.resolve(process.cwd(), "drizzle", "0142_h2ads_browser_manual_commands.sql");
  const sql = await readFile(migrationPath, "utf8");
  const connection = await createConnection(databaseUrl);
  try {
    const [existingColumns] = await connection.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
      ["h2ads_worker_commands", "commandAction"],
    );
    if (Array.isArray(existingColumns) && existingColumns.length > 0) return;
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[H2ADS-MIGRATION] browser manual", error instanceof Error ? error.message : "falhou");
  process.exit(1);
});
