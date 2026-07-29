import mysql from 'mysql2/promise';

(async () => {
  try {
    const connection = await mysql.createConnection({
      host: 'gateway05.us-east-1.prod.aws.tidbcloud.com',
      port: 4000,
      user: '4F3TuhLLRdn3h3N.root',
      password: 'v32u6F2vwNpTplCIeU12',
      database: 'RjBUSWZB6B8QJu724zr2z2',
      ssl: {
        rejectUnauthorized: false,
      },
    });

    console.log('✅ Conectado ao banco!');

    const sql = `CREATE TABLE IF NOT EXISTS \`zohoOAuthConfigs\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`name\` varchar(128) NOT NULL,
      \`zohoOrgId\` varchar(64) NOT NULL,
      \`zohoClientId\` varchar(256) NOT NULL,
      \`zohoClientSecret\` varchar(256) NOT NULL,
      \`zohoRefreshToken\` varchar(512) NOT NULL,
      \`isActive\` int NOT NULL DEFAULT 1,
      \`status\` enum('active','inactive','error') NOT NULL DEFAULT 'inactive',
      \`lastError\` text,
      \`lastTestAt\` bigint,
      \`createdAt\` bigint NOT NULL,
      \`updatedAt\` bigint NOT NULL,
      CONSTRAINT \`zohoOAuthConfigs_id\` PRIMARY KEY (\`id\`)
    )`;

    await connection.execute(sql);
    console.log('✅ Tabela criada com sucesso!');
    
    await connection.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
