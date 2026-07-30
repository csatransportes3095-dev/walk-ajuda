import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

const DEFAULT_BACKUP_FILE = "C:\\Users\\jhony\\Downloads\\backup_financeiro_planilha.sql";

function resolveBackupFile() {
  return path.resolve(process.env.BACKUP_SQL_FILE || DEFAULT_BACKUP_FILE);
}

function assertDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL nao configurada. Defina a conexao do banco antes de restaurar.");
  }
}

async function main() {
  assertDatabaseUrl();

  const backupFile = resolveBackupFile();
  const sqlRaw = await readFile(backupFile, "utf8");
  const sql = sqlRaw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");

  if (!sql.includes("CREATE TABLE") || !sql.includes("INSERT INTO")) {
    throw new Error(`O arquivo ${backupFile} nao parece ser um dump SQL valido.`);
  }

  const connection = await createConnection({
    uri: process.env.DATABASE_URL,
    multipleStatements: true,
  });

  try {
    await connection.query(sql);
    console.log(`Backup restaurado com sucesso a partir de ${backupFile}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Falha ao restaurar o backup financeiro:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});