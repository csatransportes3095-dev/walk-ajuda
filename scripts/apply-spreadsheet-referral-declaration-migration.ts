import { createConnection } from 'mysql2/promise';

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[spreadsheet-referral-declaration-migrate] DATABASE_URL não configurada, pulando migration.');
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`spreadsheetReferralDeclarations\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`clientId\` INT NOT NULL,
        \`route\` ENUM('gastos', 'emprestimo') NOT NULL,
        \`answer\` ENUM('yes', 'no') NOT NULL,
        \`referrerName\` VARCHAR(128) NULL,
        \`referrerPhone\` VARCHAR(32) NULL,
        \`referrerCustomerId\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_spreadsheet_referral_declaration_client_route\` (\`clientId\`, \`route\`),
        KEY \`idx_spreadsheet_referral_declaration_referrer\` (\`referrerCustomerId\`),
        CONSTRAINT \`fk_spreadsheet_referral_declaration_client\`
          FOREIGN KEY (\`clientId\`) REFERENCES \`spreadsheetClients\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[spreadsheet-referral-declaration-migrate] Tabela de manifesto de indicação verificada com sucesso.');
  } catch (error) {
    console.error('[spreadsheet-referral-declaration-migrate] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
