import mysql from 'mysql2/promise';

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // 1. Pedidos protegidos por status entregue/login
  const [deliveredRows] = await conn.execute(`
    SELECT DISTINCT registrationId FROM orderStatusHistory 
    WHERE status IN ('entregue', 'pedido_entregue', 'login_de_acesso', 'login_liberado')
  `);
  const deliveredSet = new Set(deliveredRows.map(r => Number(r.registrationId)));
  console.log('Protegidos por status entregue/login:', deliveredSet.size);

  // 2. Pedidos recentes (ontem e hoje)
  const [recentRows] = await conn.execute(`
    SELECT id FROM accessCodePhones 
    WHERE accessedAt >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
  `);
  const recentSet = new Set(recentRows.map(r => Number(r.id)));
  console.log('Protegidos por data recente:', recentSet.size);

  // 3. Pedidos nos GRUPOS EXTRAS (orderCustomGroupMembers) - TABELA CORRETA!
  const [groupRows] = await conn.execute(`SELECT DISTINCT registrationId FROM orderCustomGroupMembers`);
  const groupSet = new Set(groupRows.map(r => Number(r.registrationId)));
  console.log('Protegidos por grupos extras:', groupSet.size);

  // 4. Pedidos em pastas fixas (fixedFolderOrders)
  const [fixedRows] = await conn.execute(`SELECT DISTINCT registrationId FROM fixedFolderOrders`);
  const fixedSet = new Set(fixedRows.map(r => Number(r.registrationId)));
  console.log('Protegidos por pastas fixas:', fixedSet.size);

  // 5. Pedidos já ocultos
  const [hiddenRows] = await conn.execute(`SELECT DISTINCT registrationId FROM hiddenSubOrders`);
  const hiddenSet = new Set(hiddenRows.map(r => Number(r.registrationId)));
  console.log('Já ocultos:', hiddenSet.size);

  // 6. Buscar todos os pedidos ativos
  const [allOrders] = await conn.execute(`
    SELECT id, phone, accessedAt FROM accessCodePhones WHERE archived = 0
  `);
  console.log('Total pedidos ativos:', allOrders.length);

  // 7. Buscar órfãos (registrationIds no histórico sem accessCodePhones)
  const [orphans] = await conn.execute(`
    SELECT DISTINCT osh.registrationId, osh.customerPhone as phone
    FROM orderStatusHistory osh
    LEFT JOIN accessCodePhones acp ON acp.id = osh.registrationId
    WHERE acp.id IS NULL
  `);
  console.log('Pedidos órfãos:', orphans.length);

  // 8. Filtrar quais devem ser deletados
  const toDelete = [];
  
  // Processar pedidos ativos
  for (const order of allOrders) {
    const regId = Number(order.id);
    if (hiddenSet.has(regId)) continue;
    if (deliveredSet.has(regId)) continue;
    if (recentSet.has(regId)) continue;
    if (groupSet.has(regId)) continue;
    if (fixedSet.has(regId)) continue;
    toDelete.push({ registrationId: regId, phone: order.phone || '' });
  }
  
  // Processar órfãos
  for (const order of orphans) {
    const regId = Number(order.registrationId);
    if (hiddenSet.has(regId)) continue;
    if (deliveredSet.has(regId)) continue;
    if (recentSet.has(regId)) continue;
    if (groupSet.has(regId)) continue;
    if (fixedSet.has(regId)) continue;
    toDelete.push({ registrationId: regId, phone: order.phone || '' });
  }

  console.log('---');
  console.log('TOTAL A OCULTAR:', toDelete.length);
  
  if (toDelete.length === 0) {
    console.log('Nada a fazer.');
    await conn.end();
    return;
  }

  // 9. Inserir na hiddenSubOrders
  let inserted = 0;
  for (const order of toDelete) {
    try {
      await conn.execute(
        `INSERT IGNORE INTO hiddenSubOrders (registrationId, subOrderIndex, deletedReason, customerPhone) VALUES (?, 0, 'limpeza_massa_20260722_v2', ?)`,
        [order.registrationId, order.phone]
      );
      inserted++;
    } catch(e) {}
  }
  console.log('Inseridos:', inserted);

  // 10. Verificar resultado
  const [finalCount] = await conn.execute(`SELECT COUNT(DISTINCT registrationId) as cnt FROM hiddenSubOrders`);
  console.log('Total registrationIds ocultos agora:', finalCount[0].cnt);

  await conn.end();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
