import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";
import { assertH2AdsSchemaStatementSafe, H2ADS_MIGRATION_FILE } from "../server/h2adsSchemaMigration";

const MARKER = "--> statement-breakpoint";
const migrationFile = path.resolve(process.cwd(), "drizzle", H2ADS_MIGRATION_FILE);

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para a migration H2 Ads.");
  }

  const migrationSql = await readFile(migrationFile, "utf8");
  const statements = migrationSql
    .replace(/\r\n/g, "\n")
    .split(MARKER)
    .map(statement => statement.trim())
    .filter(Boolean);

  if (statements.length !== 2) {
    throw new Error("A migration H2 Ads deve conter exatamente as duas tabelas isoladas.");
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    for (const statement of statements) {
      assertH2AdsSchemaStatementSafe(statement);
      await connection.query(statement);
    }
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("Falha ao aplicar migration base H2 Ads:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
