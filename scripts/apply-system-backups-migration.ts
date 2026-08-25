import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

const MIGRATION_FILES = [
  "0135_system_backups.sql",
  "0136_system_backups_drive.sql",
];

function assertSafeStatement(statement: string) {
  const leading = statement.trimStart().toLowerCase();
  if (leading.startsWith("drop ") || leading.startsWith("truncate ") || leading.startsWith("reset ") || leading.startsWith("delete ")) {
    throw new Error("Comando destrutivo detectado na migração de backups. Abortando.");
  }
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada para aplicar a migração de backups.");

  const connection = await createConnection(databaseUrl);
  try {
    for (const fileName of MIGRATION_FILES) {
      const migrationFile = path.resolve(process.cwd(), "drizzle", fileName);
      const sql = (await readFile(migrationFile, "utf8")).replace(/\r\n/g, "\n");
      if (!sql.trim()) throw new Error(`A migração ${fileName} está vazia.`);
      const statements = sql
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        assertSafeStatement(statement);
        await connection.query(statement);
      }
    }
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("Falha ao aplicar migração de backups:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
