import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";
import { assertH2AdsSchemaStatementSafe } from "../server/h2adsSchemaMigration";

const migrationFile = path.resolve(process.cwd(), "drizzle", "0138_h2ads_network_metadata.sql");

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para a migration de metadados H2 Ads.");
  }

  const statement = (await readFile(migrationFile, "utf8")).trim();
  assertH2AdsSchemaStatementSafe(statement);

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    await connection.query(statement);
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("Falha ao aplicar migration de metadados H2 Ads:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
