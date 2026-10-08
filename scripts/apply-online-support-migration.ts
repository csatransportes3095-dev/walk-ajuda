import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

const MARKER = "--> statement-breakpoint";
const MIGRATION_FILE = path.resolve(process.cwd(), "drizzle", "0128_online_support_core.sql");

function assertSafeStatement(statement: string) {
  const leading = statement.trimStart().toLowerCase();
  if (leading.startsWith("drop ") || leading.startsWith("truncate ") || leading.startsWith("reset ") || leading.startsWith("delete ")) {
    throw new Error("Comando destrutivo detectado na migração 0128. Abortando.");
  }
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para aplicar a migração online support.");
  }

  const sqlRaw = await readFile(MIGRATION_FILE, "utf8");
  const sql = sqlRaw.replace(/\r\n/g, "\n");

  const statements = sql
    .split(MARKER)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  if (statements.length === 0) {
    throw new Error("Nenhuma instrução SQL encontrada na migração 0128.");
  }

  const connection = await createConnection(process.env.DATABASE_URL);

  try {
    for (let i = 0; i < statements.length; i += 1) {
      const statement = statements[i];
      assertSafeStatement(statement);
      await connection.query(statement);
    }

    // CREATE TABLE IF NOT EXISTS nao adiciona colunas em tabelas restauradas.
    // Upgrade estritamente aditivo: preserva menu, botoes, textos e IDs existentes.
    const [columns] = await connection.query("SHOW COLUMNS FROM `onlineSupportMenuItems`");
    const known = new Set((columns as Array<{ Field: string }>).map(row => row.Field.toLowerCase()));
    const required: Array<[string, string]> = [
      ["responseText", "TEXT NULL"],
      ["responseImageUrl", "TEXT NULL"],
      ["subButtonsJson", "LONGTEXT NULL"],
      ["keywordsJson", "LONGTEXT NULL"],
    ];
    for (const [name, definition] of required) {
      if (known.has(name.toLowerCase())) continue;
      try {
        await connection.query(`ALTER TABLE \`onlineSupportMenuItems\` ADD COLUMN \`${name}\` ${definition}`);
      } catch (error) {
        // Duas inicializacoes concorrentes podem adicionar a mesma coluna.
        if ((error as { code?: string })?.code !== "ER_DUP_FIELDNAME") throw error;
      }
    }
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("Falha ao aplicar migração online support:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
