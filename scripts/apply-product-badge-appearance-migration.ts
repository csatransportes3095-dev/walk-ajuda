import { createConnection } from "mysql2/promise";

// Only additive, nullable visual settings. Safe to run on every start.
const COLUMNS: Record<string, string> = {
  badgeBgColor: "VARCHAR(32) NULL",
  badgeTextColor: "VARCHAR(32) NULL",
  badgeBorderColor: "VARCHAR(32) NULL",
  badgeSize: "VARCHAR(12) NULL",
  badgeAlign: "VARCHAR(12) NULL",
};

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[product-badge] DATABASE_URL ausente; sem alteração local.");
    return;
  }
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    for (const [column, definition] of Object.entries(COLUMNS)) {
      const [rows] = await connection.query("SHOW COLUMNS FROM `products` LIKE ?", [column]) as any[];
      if (Array.isArray(rows) && rows.length > 0) continue;
      await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`[product-badge] Coluna opcional adicionada: ${column}`);
    }
    console.log("[product-badge] Aparência do selo verificada.");
  } catch (error) {
    console.error("[product-badge] Falha na migração:", error);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
