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
    const [columns] = await connection.query<any[]>("SHOW COLUMNS FROM h2_chassis_purchases");
    const names = new Set(columns.map(column => String(column.Field)));
    const additions = [
      ["pix_key", "ALTER TABLE h2_chassis_settings ADD COLUMN pix_key VARCHAR(256) NOT NULL DEFAULT '' AFTER support_phone"],
      ["pix_name", "ALTER TABLE h2_chassis_settings ADD COLUMN pix_name VARCHAR(160) NOT NULL DEFAULT '' AFTER pix_key"],
      ["pix_bank", "ALTER TABLE h2_chassis_settings ADD COLUMN pix_bank VARCHAR(120) NOT NULL DEFAULT '' AFTER pix_name"],
      ["proof_status", "ALTER TABLE h2_chassis_purchases ADD COLUMN proof_status ENUM('none','submitted','rejected') NOT NULL DEFAULT 'none' AFTER status"],
      ["proof_url", "ALTER TABLE h2_chassis_purchases ADD COLUMN proof_url VARCHAR(1024) NULL AFTER proof_status"],
      ["proof_key", "ALTER TABLE h2_chassis_purchases ADD COLUMN proof_key VARCHAR(512) NULL AFTER proof_url"],
      ["proof_mime", "ALTER TABLE h2_chassis_purchases ADD COLUMN proof_mime VARCHAR(100) NULL AFTER proof_key"],
      ["proof_submitted_at", "ALTER TABLE h2_chassis_purchases ADD COLUMN proof_submitted_at DATETIME NULL AFTER proof_mime"],
    ] as const;
    const [settingsColumns] = await connection.query<any[]>("SHOW COLUMNS FROM h2_chassis_settings");
    const settingsNames = new Set(settingsColumns.map(column => String(column.Field)));
    for (const [column, ddl] of additions) {
      const target = column.startsWith("pix_") ? settingsNames : names;
      if (!target.has(column)) await connection.query(ddl);
    }
    console.log("[Chassis Service] Tabelas independentes e comprovante do módulo conferidos; cadastros e registros centrais preservados.");
  } finally { await connection.end(); }
}
main().catch(error => {
  console.error("[Chassis Service] Migração não concluída:", error instanceof Error ? error.message : "erro desconhecido");
  process.exitCode = 1;
});
