// Script para corrigir os contadores de acesso retroativamente
// Cada sessão existente representa pelo menos 1 acesso real do usuário
// Vamos inserir registros de audit para sessões que não têm audit correspondente

const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Buscar todas as sessões ativas
  const [sessions] = await conn.query(
    'SELECT s.id, s.clientId, s.createdAt, c.phone FROM spreadsheetSessions s JOIN spreadsheetClients c ON s.clientId = c.id'
  );

  console.log(`Total de sessões encontradas: ${sessions.length}`);

  let inserted = 0;
  for (const session of sessions) {
    // Verificar se já existe um audit de sucesso para este cliente criado próximo à criação da sessão
    // (dentro de 1 minuto antes/depois da criação da sessão)
    const sessionTime = new Date(session.createdAt).getTime();
    const windowStart = new Date(sessionTime - 60000); // 1 min antes
    const windowEnd = new Date(sessionTime + 60000);   // 1 min depois

    const [existing] = await conn.query(
      'SELECT id FROM spreadsheetLoginAudit WHERE clientId = ? AND status = "success" AND createdAt BETWEEN ? AND ? LIMIT 1',
      [session.clientId, windowStart, windowEnd]
    );

    if (existing.length === 0) {
      // Não existe audit para esta sessão — inserir um registro retroativo
      await conn.query(
        'INSERT INTO spreadsheetLoginAudit (clientId, phone, status, ipAddress, userAgent, createdAt) VALUES (?, ?, "success", "retroativo", "retroativo", ?)',
        [session.clientId, session.phone, session.createdAt]
      );
      inserted++;
      console.log(`Inserido audit retroativo para clientId=${session.clientId} (${session.phone}) em ${session.createdAt}`);
    } else {
      console.log(`Audit já existe para clientId=${session.clientId} em ${session.createdAt}`);
    }
  }

  console.log(`\nTotal de audits retroativos inseridos: ${inserted}`);

  // Verificar resultado final
  const [result] = await conn.query(
    'SELECT clientId, COUNT(*) as total FROM spreadsheetLoginAudit WHERE status = "success" GROUP BY clientId ORDER BY total DESC LIMIT 10'
  );
  console.log('\nTop 10 clientes por acessos:');
  console.log(JSON.stringify(result, null, 2));

  await conn.end();
}

main().catch(console.error);
