const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const [rows] = await conn.query(
    'SELECT clientId, status, COUNT(*) as cnt FROM spreadsheetLoginAudit GROUP BY clientId, status ORDER BY clientId LIMIT 20'
  );
  console.log('Audit por cliente/status:');
  console.log(JSON.stringify(rows, null, 2));

  const [total] = await conn.query('SELECT COUNT(*) as total FROM spreadsheetLoginAudit');
  console.log('Total registros audit:', total[0].total);

  const [sessions] = await conn.query('SELECT COUNT(*) as total FROM spreadsheetSessions');
  console.log('Total sessoes:', sessions[0].total);

  // Verificar se a tabela existe
  const [tables] = await conn.query("SHOW TABLES LIKE 'spreadsheetLoginAudit'");
  console.log('Tabela existe:', tables.length > 0);

  await conn.end();
}
main().catch(console.error);
