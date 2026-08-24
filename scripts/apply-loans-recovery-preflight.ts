import { createConnection } from "mysql2/promise";

async function tableExists(db: any, table: string) {
  const [rows] = await db.execute(
    "SELECT COUNT(*) cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    [table],
  ) as any[];
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function hasColumn(db: any, table: string, column: string) {
  if (!(await tableExists(db, table))) return false;
  const [rows] = await db.execute(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]) as any[];
  return Array.isArray(rows) && rows.length > 0;
}

async function addColumn(db: any, table: string, column: string, definition: string) {
  if (!(await hasColumn(db, table, column))) {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`[loans-preflight] coluna adicionada: ${table}.${column}`);
  }
}

async function ensureColumns(db: any, table: string, columns: Array<[string, string]>) {
  for (const [name, definition] of columns) await addColumn(db, table, name, definition);
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[loans-preflight] DATABASE_URL ausente; pulando.");
    return;
  }

  const db = await createConnection(process.env.DATABASE_URL);
  try {
    // A Planilha usa os mesmos clientes por CPF/telefone e precisa existir antes da recuperação.
    await db.query(`CREATE TABLE IF NOT EXISTS spreadsheetClients (
      id INT NOT NULL AUTO_INCREMENT,
      phone VARCHAR(32) NOT NULL,
      name VARCHAR(128) NOT NULL,
      status ENUM('active','blocked') NOT NULL DEFAULT 'active',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      cpf VARCHAR(14) NULL,
      preservedExpiresAt TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY phone (phone)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await ensureColumns(db, "spreadsheetClients", [
      ["phone", "VARCHAR(32) NULL"],
      ["name", "VARCHAR(128) NULL"],
      ["status", "ENUM('active','blocked') NOT NULL DEFAULT 'active'"],
      ["createdAt", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
      ["cpf", "VARCHAR(14) NULL"],
      ["preservedExpiresAt", "TIMESTAMP NULL DEFAULT NULL"],
    ]);

    await db.query(`CREATE TABLE IF NOT EXISTS installmentProofs (
      id INT NOT NULL AUTO_INCREMENT,
      installmentId INT NOT NULL,
      loanId INT NOT NULL,
      clientId INT NOT NULL,
      installmentNumber INT NOT NULL,
      amountPaid DECIMAL(10,2) NOT NULL,
      paidAt DATETIME NOT NULL,
      paidBy VARCHAR(100) NOT NULL,
      observation TEXT NULL,
      originalFileName VARCHAR(255) NULL,
      fileKey VARCHAR(512) NULL,
      fileUrl VARCHAR(512) NULL,
      fileMimeType VARCHAR(100) NULL,
      fileSizeBytes INT NULL,
      hasProof TINYINT(1) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_installmentId (installmentId),
      KEY idx_loanId (loanId),
      KEY idx_clientId (clientId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await ensureColumns(db, "installmentProofs", [
      ["installmentId", "INT NULL"], ["loanId", "INT NULL"], ["clientId", "INT NULL"],
      ["installmentNumber", "INT NOT NULL DEFAULT 1"], ["amountPaid", "DECIMAL(10,2) NOT NULL DEFAULT 0"],
      ["paidAt", "DATETIME NULL DEFAULT NULL"], ["paidBy", "VARCHAR(100) NULL"], ["observation", "TEXT NULL"],
      ["originalFileName", "VARCHAR(255) NULL"], ["fileKey", "VARCHAR(512) NULL"], ["fileUrl", "VARCHAR(512) NULL"],
      ["fileMimeType", "VARCHAR(100) NULL"], ["fileSizeBytes", "INT NULL"], ["hasProof", "TINYINT(1) NOT NULL DEFAULT 0"],
      ["createdAt", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
    ]);

    await db.query(`CREATE TABLE IF NOT EXISTS installmentProofLogs (
      id INT NOT NULL AUTO_INCREMENT,
      proofId INT NOT NULL,
      installmentId INT NOT NULL,
      loanId INT NOT NULL,
      action ENUM('attached','replaced','deleted') NOT NULL,
      performedBy VARCHAR(100) NOT NULL,
      performedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      previousFileKey VARCHAR(512) NULL,
      previousFileUrl VARCHAR(512) NULL,
      previousFileName VARCHAR(255) NULL,
      newFileKey VARCHAR(512) NULL,
      newFileUrl VARCHAR(512) NULL,
      newFileName VARCHAR(255) NULL,
      deleteReason TEXT NULL,
      PRIMARY KEY (id),
      KEY idx_proofId (proofId),
      KEY idx_installmentId (installmentId),
      KEY idx_loanId (loanId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await ensureColumns(db, "installmentProofLogs", [
      ["proofId", "INT NULL"], ["installmentId", "INT NULL"], ["loanId", "INT NULL"],
      ["action", "ENUM('attached','replaced','deleted') NULL"], ["performedBy", "VARCHAR(100) NULL"],
      ["performedAt", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["previousFileKey", "VARCHAR(512) NULL"], ["previousFileUrl", "VARCHAR(512) NULL"], ["previousFileName", "VARCHAR(255) NULL"],
      ["newFileKey", "VARCHAR(512) NULL"], ["newFileUrl", "VARCHAR(512) NULL"], ["newFileName", "VARCHAR(255) NULL"],
      ["deleteReason", "TEXT NULL"],
    ]);

    await db.query(`CREATE TABLE IF NOT EXISTS loanRecoveryMeta (
      recoveryKey VARCHAR(100) NOT NULL,
      appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      summaryJson TEXT NULL,
      PRIMARY KEY (recoveryKey)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    // Confirma a estrutura mínima exigida pelo pacote antes da tentativa de restauração.
    const required: Record<string, string[]> = {
      spreadsheetClients: ["id","phone","name","status","createdAt","updatedAt","cpf","preservedExpiresAt"],
      loanProfiles: ["id","name","slug","creditLimit","interestRate","maxDays","defaultPaymentTypes"],
      loanClients: ["id","userId","name","cpf","phone","profileSlug","creditLimit","interestRate","maxDays","spreadsheetToken"],
      loans: ["id","userId","clientId","amount","interestRate","days","paymentType","interestAmount","totalAmount","releaseDate","dueDate","status"],
      loanInstallments: ["id","loanId","installmentNumber","dueDate","amount","status"],
      installmentProofs: ["id","installmentId","loanId","clientId","installmentNumber","amountPaid","paidAt","paidBy"],
      installmentProofLogs: ["id","proofId","installmentId","loanId","action","performedBy","performedAt"],
    };
    const missing: string[] = [];
    for (const [table, columns] of Object.entries(required)) {
      if (!(await tableExists(db, table))) { missing.push(`${table}.*`); continue; }
      for (const column of columns) if (!(await hasColumn(db, table, column))) missing.push(`${table}.${column}`);
    }
    if (missing.length) throw new Error(`estrutura ainda incompleta: ${missing.join(", ")}`);

    console.log("[loans-preflight] estrutura TOTAL de recuperação verificada com sucesso.");
  } catch (error) {
    console.error("[loans-preflight] falha:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

void run();
