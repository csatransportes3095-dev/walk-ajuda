import mysql from 'mysql2/promise';

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // 1. Criar tabela de backup
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS hiddenSubOrders_backup_20260722 (
      id INT AUTO_INCREMENT PRIMARY KEY,
      registrationId BIGINT,
      subOrderIndex INT,
      customerPhone VARCHAR(255),
      customerName VARCHAR(255),
      serviceName VARCHAR(255),
      latestStatus VARCHAR(255),
      accessedAt DATETIME,
      backedUpAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Tabela de backup criada.');

  // 2. Identificar pedidos protegidos:
  // a) Status entregue
  const [deliveredIds] = await conn.execute(`
    SELECT DISTINCT registrationId FROM orderStatusHistory 
    WHERE status IN ('entregue', 'pedido_entregue', 'login_de_acesso')
  `);
  const deliveredSet = new Set(deliveredIds.map(r => Number(r.registrationId)));
  console.log('Pedidos entregues (protegidos):', deliveredSet.size);

  // b) Pedidos de ontem e hoje (por accessedAt na accessCodePhones)
  const [recentIds] = await conn.execute(`
    SELECT id FROM accessCodePhones 
    WHERE accessedAt >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
  `);
  const recentSet = new Set(recentIds.map(r => Number(r.id)));
  console.log('Pedidos recentes ontem/hoje (protegidos):', recentSet.size);

  // c) Pedidos em pastas extras (customFolderOrders)
  let folderSet = new Set();
  try {
    const [folderIds] = await conn.execute(`SELECT DISTINCT registrationId FROM customFolderOrders`);
    folderSet = new Set(folderIds.map(r => Number(r.registrationId)));
    console.log('Pedidos em pastas extras (protegidos):', folderSet.size);
  } catch(e) {
    console.log('Tabela customFolderOrders não existe, pulando.');
  }

  // d) Pedidos já ocultos
  const [alreadyHidden] = await conn.execute(`SELECT DISTINCT registrationId FROM hiddenSubOrders`);
  const hiddenSet = new Set(alreadyHidden.map(r => Number(r.registrationId)));

  // 3. Buscar todos os pedidos ativos com histórico
  const [allOrders] = await conn.execute(`
    SELECT 
      acp.id as registrationId,
      acp.phone,
      osh_latest.status as latestStatus,
      osh_latest.serviceName,
      acp.accessedAt
    FROM accessCodePhones acp
    LEFT JOIN (
      SELECT registrationId, status, serviceName,
        ROW_NUMBER() OVER (PARTITION BY registrationId ORDER BY createdAt DESC) as rn
      FROM orderStatusHistory
    ) osh_latest ON osh_latest.registrationId = acp.id AND osh_latest.rn = 1
    WHERE acp.archived = 0 AND acp.rgCnhApproved = 0
  `);
  console.log('Total pedidos no sistema:', allOrders.length);

  // Também buscar órfãos (registrationIds no histórico sem accessCodePhones)
  const [orphans] = await conn.execute(`
    SELECT DISTINCT osh.registrationId, osh.customerPhone as phone, 
      (SELECT status FROM orderStatusHistory WHERE registrationId = osh.registrationId ORDER BY createdAt DESC LIMIT 1) as latestStatus,
      (SELECT serviceName FROM orderStatusHistory WHERE registrationId = osh.registrationId ORDER BY createdAt DESC LIMIT 1) as serviceName
    FROM orderStatusHistory osh
    LEFT JOIN accessCodePhones acp ON acp.id = osh.registrationId
    WHERE acp.id IS NULL
  `);
  console.log('Pedidos órfãos:', orphans.length);

  const allToCheck = [
    ...allOrders.map(r => ({ registrationId: Number(r.registrationId), phone: r.phone, latestStatus: r.latestStatus, serviceName: r.serviceName, accessedAt: r.accessedAt })),
    ...orphans.map(r => ({ registrationId: Number(r.registrationId), phone: r.phone, latestStatus: r.latestStatus, serviceName: r.serviceName, accessedAt: null }))
  ];

  // 4. Filtrar: quais devem ser deletados
  const toDelete = [];
  for (const order of allToCheck) {
    const regId = order.registrationId;
    // Já oculto? Pular
    if (hiddenSet.has(regId)) continue;
    // Protegido por status entregue?
    if (deliveredSet.has(regId)) continue;
    // Protegido por data recente?
    if (recentSet.has(regId)) continue;
    // Protegido por pasta extra?
    if (folderSet.has(regId)) continue;
    // Deletar
    toDelete.push(order);
  }
  console.log('Pedidos a deletar (ocultar):', toDelete.length);

  if (toDelete.length === 0) {
    console.log('Nada a deletar.');
    await conn.end();
    return;
  }

  // 5. Inserir backup
  for (const order of toDelete) {
    await conn.execute(
      `INSERT INTO hiddenSubOrders_backup_20260722 (registrationId, subOrderIndex, customerPhone, customerName, serviceName, latestStatus, accessedAt) VALUES (?, 0, ?, NULL, ?, ?, ?)`,
      [order.registrationId, order.phone || '', order.serviceName || '', order.latestStatus || '', order.accessedAt || null]
    );
  }
  console.log('Backup salvo:', toDelete.length, 'registros.');

  // 6. Inserir na hiddenSubOrders (soft delete)
  // Para cada pedido, precisamos saber quantos sub-pedidos tem
  for (const order of toDelete) {
    // Contar sub-pedidos pelo histórico
    const [hist] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM orderStatusHistory WHERE registrationId = ? AND (status = 'recebido' OR status = (SELECT \`key\` FROM orderStatusTypes WHERE isActive=1 ORDER BY sortOrder ASC LIMIT 1))`,
      [order.registrationId]
    );
    const subCount = Math.max(1, Number(hist[0].cnt));
    // Inserir todos os sub-pedidos como ocultos
    for (let i = 0; i < subCount; i++) {
      await conn.execute(
        `INSERT IGNORE INTO hiddenSubOrders (registrationId, subOrderIndex, deletedReason, customerPhone) VALUES (?, ?, 'limpeza_massa_20260722', ?)`,
        [order.registrationId, i, order.phone || '']
      ).catch(() => {});
    }
  }
  console.log('Pedidos ocultados com sucesso!');

  // 7. Verificar resultado
  const [finalCount] = await conn.execute(`SELECT COUNT(DISTINCT registrationId) as cnt FROM hiddenSubOrders`);
  console.log('Total registrationIds ocultos agora:', finalCount[0].cnt);

  await conn.end();
}

run().catch(e => { console.error(e); process.exit(1); });
