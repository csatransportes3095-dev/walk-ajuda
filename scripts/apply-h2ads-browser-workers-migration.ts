import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";
import { assertH2AdsSchemaStatementSafe } from "../server/h2adsSchemaMigration";

const migrationFile = path.resolve(process.cwd(), "drizzle", "0140_h2ads_browser_workers.sql");

async function run() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada para a migration de Workers H2 Ads.");
  const statements = (await readFile(migrationFile, "utf8")).split("--> statement-breakpoint").map(statement => statement.trim()).filter(Boolean);
  if (statements.length !== 3) throw new Error("A migration de Workers H2 Ads precisa conter exatamente três tabelas isoladas.");
  for (const statement of statements) assertH2AdsSchemaStatementSafe(statement);
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    for (const statement of statements) await connection.query(statement);
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("Falha ao aplicar migration de Workers H2 Ads:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
