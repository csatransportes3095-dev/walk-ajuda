import mysql from "mysql2/promise";

async function tableExists(connection: mysql.Connection, tableName: string) {
  const [rows] = await connection.query<any[]>(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[admin-authenticator-vault-migrate] DATABASE_URL não configurada, pulando migration.");
    return;
  }

  const connection = await mysql.createConnection(databaseUrl);
  try {
    if (!(await tableExists(connection, "adminAuthenticatorEntries"))) {
      await connection.query(`
        CREATE TABLE \`adminAuthenticatorEntries\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`label\` varchar(128) NOT NULL,
          \`issuer\` varchar(128) NULL,
          \`secretCiphertext\` text NOT NULL,
          \`secretIv\` varchar(64) NOT NULL,
          \`secretTag\` varchar(64) NOT NULL,
          \`keyVersion\` varchar(16) NOT NULL DEFAULT 'v1',
          \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          \`lastUsedAt\` timestamp NULL,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("[admin-authenticator-vault-migrate] Tabela de entradas criada.");
    }

    if (!(await tableExists(connection, "adminAuthenticatorAudit"))) {
      await connection.query(`
        CREATE TABLE \`adminAuthenticatorAudit\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`entryId\` int NULL,
          \`action\` varchar(32) NOT NULL,
          \`adminUsername\` varchar(128) NULL,
          \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`adminAuthenticatorAudit_entryId_createdAt_idx\` (\`entryId\`, \`createdAt\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("[admin-authenticator-vault-migrate] Tabela de auditoria criada.");
    }

    console.log("[admin-authenticator-vault-migrate] Estrutura verificada com sucesso.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[admin-authenticator-vault-migrate] Falha:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
