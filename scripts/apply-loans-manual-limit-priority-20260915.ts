import { createConnection } from "mysql2/promise";

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[loans-manual-limit] DATABASE_URL não configurada, pulando.");
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    const [columns] = await connection.execute(
      "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='loanClients' AND COLUMN_NAME='creditLimitManual'",
    ) as any[];
    const exists = Number(columns?.[0]?.cnt || 0) > 0;
    if (!exists) {
      await connection.query(
        "ALTER TABLE loanClients ADD COLUMN creditLimitManual TINYINT(1) NOT NULL DEFAULT 0 AFTER creditLimit",
      );
      console.log("[loans-manual-limit] coluna loanClients.creditLimitManual criada.");
    } else {
      console.log("[loans-manual-limit] coluna loanClients.creditLimitManual já existe.");
    }
  } catch (error) {
    console.error("[loans-manual-limit] Falha:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
