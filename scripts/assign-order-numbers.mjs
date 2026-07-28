/**
 * Script de migração: atribui número único para cada sub-pedido sem orderNumber.
 * Cada sub-pedido (card) recebe um número diferente, mesmo que do mesmo cliente.
 *
 * Lógica:
 * 1. Busca todos os registros de orderStatusHistory ordenados por registrationId e createdAt
 * 2. Divide em sub-pedidos usando o marcador 'recebido' (igual ao splitIntoSubOrders do backend)
 * 3. Para cada sub-pedido sem orderNumber, gera um novo número via INSERT em orderCounter
 * 4. Atualiza o primeiro registro do sub-pedido com o novo orderNumber
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
console.log('Conectado ao banco de dados');

// 1. Buscar todos os registros de orderStatusHistory ordenados
const [rows] = await connection.execute(
  `SELECT id, registrationId, status, orderNumber, createdAt
   FROM orderStatusHistory
   ORDER BY registrationId ASC, createdAt ASC, id ASC`
);

console.log(`Total de registros no histórico: ${rows.length}`);

// 2. Agrupar por registrationId
const byRegistration = new Map();
for (const row of rows) {
  const regId = row.registrationId;
  if (!byRegistration.has(regId)) byRegistration.set(regId, []);
  byRegistration.get(regId).push(row);
}

console.log(`Total de registrationIds: ${byRegistration.size}`);

// 3. Dividir em sub-pedidos (igual ao splitIntoSubOrders do backend)
// Um novo sub-pedido começa quando encontra um status 'recebido'
const subOrders = []; // { registrationId, subOrderIndex, firstRowId, hasOrderNumber }

for (const [regId, history] of byRegistration.entries()) {
  let subIdx = 0;
  let currentSubStart = 0;

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    // Novo sub-pedido começa com 'recebido' (exceto o primeiro registro)
    if (i > 0 && entry.status === 'recebido') {
      // Fechar sub-pedido anterior
      const subHistory = history.slice(currentSubStart, i);
      const existingOrderNumber = subHistory.find(
        r => r.orderNumber != null && r.orderNumber !== 'NULL' && r.orderNumber !== 0
      )?.orderNumber;
      subOrders.push({
        registrationId: regId,
        subOrderIndex: subIdx,
        firstRowId: subHistory[0].id,
        hasOrderNumber: !!existingOrderNumber,
        existingOrderNumber,
      });
      subIdx++;
      currentSubStart = i;
    }
  }

  // Fechar o último sub-pedido
  const subHistory = history.slice(currentSubStart);
  const existingOrderNumber = subHistory.find(
    r => r.orderNumber != null && r.orderNumber !== 'NULL' && r.orderNumber !== 0
  )?.orderNumber;
  subOrders.push({
    registrationId: regId,
    subOrderIndex: subIdx,
    firstRowId: subHistory[0].id,
    hasOrderNumber: !!existingOrderNumber,
    existingOrderNumber,
  });
}

console.log(`Total de sub-pedidos encontrados: ${subOrders.length}`);

const withoutNumber = subOrders.filter(s => !s.hasOrderNumber);
const withNumber = subOrders.filter(s => s.hasOrderNumber);
console.log(`Sub-pedidos com número: ${withNumber.length}`);
console.log(`Sub-pedidos SEM número: ${withoutNumber.length}`);

if (withoutNumber.length === 0) {
  console.log('Nenhum sub-pedido sem número. Nada a fazer.');
  await connection.end();
  process.exit(0);
}

// 4. Para cada sub-pedido sem número, gerar e atribuir um orderNumber
let updated = 0;
let errors = 0;

for (const sub of withoutNumber) {
  try {
    // Inserir na tabela orderCounter para gerar número único (AUTO_INCREMENT)
    const [result] = await connection.execute(
      `INSERT INTO orderCounter (createdAt) VALUES (NOW())`
    );
    const newOrderNumber = result.insertId;

    // Atualizar o primeiro registro do sub-pedido com o novo orderNumber
    await connection.execute(
      `UPDATE orderStatusHistory SET orderNumber = ? WHERE id = ?`,
      [newOrderNumber, sub.firstRowId]
    );

    updated++;
    if (updated % 50 === 0) {
      console.log(`Progresso: ${updated}/${withoutNumber.length} sub-pedidos numerados...`);
    }
  } catch (err) {
    console.error(`Erro ao processar sub-pedido registrationId=${sub.registrationId} idx=${sub.subOrderIndex}:`, err.message);
    errors++;
  }
}

console.log(`\n✅ Concluído!`);
console.log(`   Sub-pedidos numerados: ${updated}`);
console.log(`   Erros: ${errors}`);
console.log(`   Sub-pedidos que já tinham número: ${withNumber.length}`);

await connection.end();
