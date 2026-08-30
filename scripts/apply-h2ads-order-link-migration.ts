import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";
import { assertH2AdsSchemaStatementSafe } from "../server/h2adsSchemaMigration";

const migrationPath = path.resolve(process.cwd(), "drizzle", "0143_h2ads_order_links.sql");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada para a migration de vínculo Pedido/Instância H2 Ads.");
  const statements = (await readFile(migrationPath, "utf8")).split("--> statement-breakpoint").map(statement => statement.trim()).filter(Boolean);
  if (statements.length !== 1) throw new Error("A migration de vínculo Pedido/Instância H2 Ads precisa conter exatamente uma tabela isolada.");
  statements.forEach(assertH2AdsSchemaStatementSafe);
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    for (const statement of statements) await connection.query(statement);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[H2ADS-MIGRATION] order links", error instanceof Error ? error.message : "falhou");
  process.exit(1);
});
