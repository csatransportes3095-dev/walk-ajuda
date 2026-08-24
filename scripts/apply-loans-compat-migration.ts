import { createConnection } from "mysql2/promise";

async function tableExists(connection: any, table: string) {
  const [rows] = await connection.execute(
    "SELECT COUNT(*) cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    [table],
  ) as any[];
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function hasColumn(connection: any, table: string, column: string) {
  if (!(await tableExists(connection, table))) return false;
  const [rows] = await connection.execute(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]) as any[];
  return Array.isArray(rows) && rows.length > 0;
}

async function addColumnIfMissing(connection: any, table: string, column: string, definition: string) {
  if (!(await hasColumn(connection, table, column))) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`[loans-compat] coluna adicionada: ${table}.${column}`);
  }
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[loans-compat] DATABASE_URL não configurada, pulando.");
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    if (await tableExists(connection, "loanProfiles")) {
      await addColumnIfMissing(connection, "loanProfiles", "defaultPaymentTypes", "VARCHAR(80) NOT NULL DEFAULT 'diario'");
      await addColumnIfMissing(connection, "loanProfiles", "maxDaysSemanal", "INT NOT NULL DEFAULT 60");
      await addColumnIfMissing(connection, "loanProfiles", "maxDaysQuinzenal", "INT NOT NULL DEFAULT 60");
      await addColumnIfMissing(connection, "loanProfiles", "maxDaysMensal", "INT NOT NULL DEFAULT 90");
    }

    if (await tableExists(connection, "loan_late_fee_config")) {
      await addColumnIfMissing(connection, "loan_late_fee_config", "enabled", "TINYINT(1) NOT NULL DEFAULT 1");
      await addColumnIfMissing(connection, "loan_late_fee_config", "fee_after_18h", "DECIMAL(10,2) NOT NULL DEFAULT 10");
      await addColumnIfMissing(connection, "loan_late_fee_config", "fee_after_20h", "DECIMAL(10,2) NOT NULL DEFAULT 10");
      await addColumnIfMissing(connection, "loan_late_fee_config", "fee_after_midnight_pct", "DECIMAL(5,2) NOT NULL DEFAULT 100");
      await addColumnIfMissing(connection, "loan_late_fee_config", "rules_text", "TEXT NULL");
      await addColumnIfMissing(connection, "loan_late_fee_config", "updated_at", "BIGINT NOT NULL DEFAULT 0");
    }

    if (await tableExists(connection, "loanPixConfig")) {
      await addColumnIfMissing(connection, "loanPixConfig", "bankName", "VARCHAR(100) NULL");
      await addColumnIfMissing(connection, "loanPixConfig", "isActive", "INT NOT NULL DEFAULT 1");
    }

    console.log("[loans-compat] compatibilidade do módulo de Empréstimos verificada.");
  } catch (error) {
    console.error("[loans-compat] Falha:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
