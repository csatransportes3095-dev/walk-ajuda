import { createConnection } from "mysql2/promise";

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[referral-commission-migrate] DATABASE_URL não configurada, pulando migration.");
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`referralCommissionAttributions\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`referrerCustomerId\` INT NULL,
        \`referrerPhone\` VARCHAR(32) NOT NULL,
        \`referrerName\` VARCHAR(128) NULL,
        \`referredCustomerId\` INT NOT NULL,
        \`referredPhone\` VARCHAR(32) NOT NULL,
        \`referredName\` VARCHAR(128) NULL,
        \`source\` VARCHAR(32) NOT NULL DEFAULT 'cadastro',
        \`sourceReference\` VARCHAR(128) NULL,
        \`registrationId\` INT NOT NULL,
        \`orderStatusId\` INT NOT NULL,
        \`orderNumber\` INT NULL,
        \`productId\` INT NULL,
        \`optionId\` INT NULL,
        \`serviceName\` VARCHAR(256) NULL,
        \`serviceOption\` VARCHAR(256) NULL,
        \`commissionRule\` VARCHAR(32) NOT NULL DEFAULT 'fixed_option',
        \`commissionValue\` INT NOT NULL DEFAULT 0,
        \`status\` ENUM('em_analise','elegivel','paga','nao_elegivel','cancelada') NOT NULL DEFAULT 'em_analise',
        \`invalidReason\` VARCHAR(512) NULL,
        \`invalidatedAt\` TIMESTAMP NULL,
        \`eligibleAt\` TIMESTAMP NULL,
        \`paidAt\` TIMESTAMP NULL,
        \`paidBy\` VARCHAR(128) NULL,
        \`paymentReference\` VARCHAR(256) NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_referral_commission_order_status\` (\`orderStatusId\`),
        KEY \`idx_referral_commission_referrer\` (\`referrerPhone\`, \`status\`),
        KEY \`idx_referral_commission_referred\` (\`referredPhone\`),
        KEY \`idx_referral_commission_registration\` (\`registrationId\`)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    const [columnRows] = await connection.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orderStatusHistory' AND COLUMN_NAME IN ('referralInvalid','referralInvalidReason','referralInvalidAt')"
    );
    const existingColumns = new Set((columnRows as Array<{ COLUMN_NAME: string }>).map((row) => row.COLUMN_NAME));
    if (!existingColumns.has("referralInvalid")) {
      await connection.query("ALTER TABLE \`orderStatusHistory\` ADD COLUMN \`referralInvalid\` TINYINT(1) NOT NULL DEFAULT 0");
    }
    if (!existingColumns.has("referralInvalidReason")) {
      await connection.query("ALTER TABLE \`orderStatusHistory\` ADD COLUMN \`referralInvalidReason\` VARCHAR(512) NULL");
    }
    if (!existingColumns.has("referralInvalidAt")) {
      await connection.query("ALTER TABLE \`orderStatusHistory\` ADD COLUMN \`referralInvalidAt\` DATETIME NULL");
    }
    console.log("[referral-commission-migrate] Estrutura de atribuicoes e estados de comissao verificada com sucesso.");
  } catch (error) {
    console.error("[referral-commission-migrate] Falha:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
