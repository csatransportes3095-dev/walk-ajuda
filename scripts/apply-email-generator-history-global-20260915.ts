import { createConnection } from 'mysql2/promise';

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[email-generator-history-migrate] DATABASE_URL não configurada, pulando migration.');
    return;
  }
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`emailGeneratorHistory\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`emailAddress\` VARCHAR(320) NOT NULL,
        \`domain\` VARCHAR(253) NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`emailGeneratorHistory_emailAddress_unique\` (\`emailAddress\`),
        KEY \`emailGeneratorHistory_domain_idx\` (\`domain\`),
        KEY \`emailGeneratorHistory_createdAt_idx\` (\`createdAt\`)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('[email-generator-history-migrate] Tabela global verificada com sucesso.');
  } catch (error) {
    console.error('[email-generator-history-migrate] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
