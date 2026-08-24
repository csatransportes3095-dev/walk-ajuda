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

async function ensureColumns(connection: any, table: string, columns: Array<[string, string]>) {
  if (!(await tableExists(connection, table))) return;
  for (const [name, definition] of columns) {
    await addColumnIfMissing(connection, table, name, definition);
  }
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[loans-compat] DATABASE_URL não configurada, pulando.");
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    await ensureColumns(connection, "loanProfiles", [
      ["name", "VARCHAR(50) NULL"],
      ["slug", "VARCHAR(30) NULL"],
      ["creditLimit", "DECIMAL(10,2) NOT NULL DEFAULT 500"],
      ["interestRate", "DECIMAL(5,2) NOT NULL DEFAULT 5"],
      ["maxDays", "INT NOT NULL DEFAULT 30"],
      ["isActive", "TINYINT(1) NOT NULL DEFAULT 1"],
      ["sortOrder", "INT NOT NULL DEFAULT 0"],
      ["createdAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
      ["defaultPaymentTypes", "VARCHAR(80) NOT NULL DEFAULT 'diario'"],
      ["maxDaysSemanal", "INT NOT NULL DEFAULT 60"],
      ["maxDaysQuinzenal", "INT NOT NULL DEFAULT 60"],
      ["maxDaysMensal", "INT NOT NULL DEFAULT 90"],
    ]);

    await ensureColumns(connection, "loanClients", [
      ["userId", "INT NOT NULL DEFAULT 1"],
      ["name", "VARCHAR(150) NULL"],
      ["cpf", "VARCHAR(14) NULL"],
      ["phone", "VARCHAR(20) NULL"],
      ["status", "ENUM('ativo','bloqueado','inadimplente') NOT NULL DEFAULT 'ativo'"],
      ["profileSlug", "VARCHAR(30) NOT NULL DEFAULT 'bronze'"],
      ["creditLimit", "DECIMAL(10,2) NOT NULL DEFAULT 500"],
      ["interestRate", "DECIMAL(5,2) NOT NULL DEFAULT 5"],
      ["maxDays", "INT NOT NULL DEFAULT 30"],
      ["notes", "TEXT NULL"],
      ["createdAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
      ["loanEnabled", "INT NOT NULL DEFAULT 0"],
      ["pixKey", "VARCHAR(200) NULL"],
      ["pixKeyType", "ENUM('cpf','cnpj','telefone','email','aleatoria') NULL"],
      ["pixName", "VARCHAR(150) NULL"],
      ["spreadsheetToken", "VARCHAR(100) NULL"],
      ["allowedPaymentTypes", "VARCHAR(80) DEFAULT 'diario,semanal,mensal'"],
      ["late_fee_disabled", "TINYINT(1) NOT NULL DEFAULT 0"],
      ["client_pix_key", "VARCHAR(255) NULL"],
      ["client_pix_name", "VARCHAR(200) NULL"],
      ["client_pix_bank", "VARCHAR(100) NULL"],
      ["maxDaysSemanal", "INT NOT NULL DEFAULT 60"],
      ["maxDaysQuinzenal", "INT NOT NULL DEFAULT 60"],
      ["maxDaysMensal", "INT NOT NULL DEFAULT 90"],
    ]);

    await ensureColumns(connection, "loans", [
      ["userId", "INT NOT NULL DEFAULT 1"],
      ["clientId", "INT NULL"],
      ["amount", "DECIMAL(10,2) NOT NULL DEFAULT 0"],
      ["interestRate", "DECIMAL(5,2) NOT NULL DEFAULT 0"],
      ["days", "INT NOT NULL DEFAULT 1"],
      ["paymentType", "ENUM('diario','semanal','mensal','quinzenal','parcelado') NOT NULL DEFAULT 'mensal'"],
      ["interestAmount", "DECIMAL(10,2) NOT NULL DEFAULT 0"],
      ["totalAmount", "DECIMAL(10,2) NOT NULL DEFAULT 0"],
      ["releaseDate", "DATE NULL DEFAULT NULL"],
      ["dueDate", "DATE NULL DEFAULT NULL"],
      ["status", "ENUM('pendente','aprovado','aguardando_pagamento','em_analise','pago','atrasado','cancelado','reprovado') NOT NULL DEFAULT 'pendente'"],
      ["paidAt", "TIMESTAMP NULL DEFAULT NULL"],
      ["paidBy", "VARCHAR(100) NULL"],
      ["refusedReason", "TEXT NULL"],
      ["notes", "TEXT NULL"],
      ["createdAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
      ["installments", "INT NOT NULL DEFAULT 1"],
      ["proofUrl", "TEXT NULL"],
      ["proofSentAt", "TIMESTAMP NULL DEFAULT NULL"],
      ["approvedAt", "TIMESTAMP NULL DEFAULT NULL"],
      ["approvedBy", "VARCHAR(100) NULL"],
      ["rejectedAt", "TIMESTAMP NULL DEFAULT NULL"],
      ["rejectedBy", "VARCHAR(100) NULL"],
      ["rejectedReason", "TEXT NULL"],
      ["workDays", "ENUM('seg_sab','seg_dom','custom') NOT NULL DEFAULT 'seg_sab'"],
      ["interestOnlyEnabled", "TINYINT(1) NOT NULL DEFAULT 0"],
      ["interestOnlyCount", "INT NOT NULL DEFAULT 0"],
      ["pixSentAt", "DATETIME NULL DEFAULT NULL"],
      ["pixSentBy", "VARCHAR(100) NULL"],
      ["pixConfirmedDate", "VARCHAR(10) NULL"],
      ["pixSendNote", "TEXT NULL"],
    ]);

    await ensureColumns(connection, "loanInstallments", [
      ["loanId", "INT NULL"],
      ["installmentNumber", "INT NOT NULL DEFAULT 1"],
      ["dueDate", "VARCHAR(10) NULL"],
      ["amount", "DECIMAL(10,2) NOT NULL DEFAULT 0"],
      ["status", "ENUM('pendente','em_analise','pago','atrasado','pago_juros','rolled_from_interest_only','aguardando_confirmacao') NOT NULL DEFAULT 'pendente'"],
      ["proofUrl", "TEXT NULL"],
      ["proofSentAt", "TIMESTAMP NULL DEFAULT NULL"],
      ["paidAt", "TIMESTAMP NULL DEFAULT NULL"],
      ["paidBy", "VARCHAR(100) NULL"],
      ["createdAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
      ["originalAmount", "DECIMAL(10,2) NULL"],
      ["feeApplied", "DECIMAL(10,2) NULL"],
      ["paidAmount", "DECIMAL(10,2) NULL"],
      ["notes", "TEXT NULL"],
    ]);

    if (await tableExists(connection, "loan_late_fee_config")) {
      await ensureColumns(connection, "loan_late_fee_config", [
        ["enabled", "TINYINT(1) NOT NULL DEFAULT 1"],
        ["fee_after_18h", "DECIMAL(10,2) NOT NULL DEFAULT 10"],
        ["fee_after_20h", "DECIMAL(10,2) NOT NULL DEFAULT 10"],
        ["fee_after_midnight_pct", "DECIMAL(5,2) NOT NULL DEFAULT 100"],
        ["rules_text", "TEXT NULL"],
        ["updated_at", "BIGINT NOT NULL DEFAULT 0"],
      ]);
    }

    if (await tableExists(connection, "loanPixConfig")) {
      await ensureColumns(connection, "loanPixConfig", [
        ["pixKey", "VARCHAR(200) NULL"],
        ["pixKeyType", "ENUM('cpf','cnpj','telefone','email','aleatoria') NULL"],
        ["pixName", "VARCHAR(150) NULL"],
        ["bankName", "VARCHAR(100) NULL"],
        ["isActive", "INT NOT NULL DEFAULT 1"],
        ["createdAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
        ["updatedAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
      ]);
    }

    if (await tableExists(connection, "spreadsheetClients")) {
      await ensureColumns(connection, "spreadsheetClients", [
        ["cpf", "VARCHAR(14) NULL"],
        ["preservedExpiresAt", "TIMESTAMP NULL DEFAULT NULL"],
      ]);
    }

    if (await tableExists(connection, "loans")) {
      try {
        await connection.query("ALTER TABLE loans MODIFY paymentType ENUM('diario','semanal','mensal','quinzenal','parcelado') NOT NULL DEFAULT 'mensal'");
      } catch (error) {
        console.warn("[loans-compat] ajuste paymentType:", error instanceof Error ? error.message : String(error));
      }
      try {
        await connection.query("ALTER TABLE loans MODIFY status ENUM('pendente','aprovado','aguardando_pagamento','em_analise','pago','atrasado','cancelado','reprovado') NOT NULL DEFAULT 'pendente'");
      } catch (error) {
        console.warn("[loans-compat] ajuste status loans:", error instanceof Error ? error.message : String(error));
      }
      try {
        await connection.query("ALTER TABLE loans MODIFY releaseDate DATE NULL DEFAULT NULL");
      } catch (error) {
        console.warn("[loans-compat] ajuste releaseDate:", error instanceof Error ? error.message : String(error));
      }
    }

    if (await tableExists(connection, "loanInstallments")) {
      try {
        await connection.query("ALTER TABLE loanInstallments MODIFY status ENUM('pendente','em_analise','pago','atrasado','pago_juros','rolled_from_interest_only','aguardando_confirmacao') NOT NULL DEFAULT 'pendente'");
      } catch (error) {
        console.warn("[loans-compat] ajuste status parcelas:", error instanceof Error ? error.message : String(error));
      }
    }

    console.log("[loans-compat] compatibilidade TOTAL do módulo de Empréstimos verificada.");
  } catch (error) {
    console.error("[loans-compat] Falha:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
