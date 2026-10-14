import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const source = await readFile(path.resolve(process.cwd(), "drizzle/chassis-service.sql"), "utf8");
  const statements = source.replace(/^--.*$/gm, "").split(";").map(value => value.trim()).filter(Boolean);
  for (const statement of statements) {
    if (!/^(CREATE TABLE IF NOT EXISTS h2_chassis_\w+\s*\(|INSERT IGNORE INTO h2_chassis_settings\s*\()/i.test(statement)) {
      throw new Error("Migração rejeitada: somente tabelas independentes do módulo são permitidas.");
    }
  }
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    for (const statement of statements) await connection.query(statement);
    console.log("[Chassis Service] Tabelas independentes criadas; cadastros e registros centrais preservados.");
  } finally { await connection.end(); }
}
main().catch(error => {
  console.error("[Chassis Service] Migração não concluída:", error instanceof Error ? error.message : "erro desconhecido");
  process.exitCode = 1;
});
