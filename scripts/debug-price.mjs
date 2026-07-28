import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Verificar quantos pedidos têm pricePaid
const [withPrice] = await conn.execute('SELECT COUNT(*) as cnt FROM orderStatusHistory WHERE pricePaid IS NOT NULL');
console.log('Com pricePaid:', withPrice[0].cnt);

// Verificar quantos pedidos existem no total (distintos por registrationId)
const [total] = await conn.execute('SELECT COUNT(DISTINCT registrationId) as cnt FROM orderStatusHistory WHERE registrationId IS NOT NULL');
console.log('Total registrationIds:', total[0].cnt);

// Verificar quantos financialSales existem
const [fs] = await conn.execute('SELECT COUNT(*) as cnt, COUNT(DISTINCT registrationId) as distinct_reg FROM financialSales WHERE registrationId IS NOT NULL AND saleValue > 0');
console.log('financialSales com preço:', fs[0].cnt, 'distintos:', fs[0].distinct_reg);

// Verificar se os registrationIds batem
const [match] = await conn.execute(`
  SELECT COUNT(DISTINCT osh.registrationId) as cnt
  FROM orderStatusHistory osh
  INNER JOIN financialSales fs ON fs.registrationId = osh.registrationId
  WHERE fs.saleValue > 0
`);
console.log('Pedidos com match no financialSales:', match[0].cnt);

// Mostrar alguns pedidos sem pricePaid e seus registrationIds
const [noprice] = await conn.execute(`
  SELECT DISTINCT osh.registrationId 
  FROM orderStatusHistory osh 
  WHERE osh.pricePaid IS NULL AND osh.registrationId IS NOT NULL 
  LIMIT 5
`);
console.log('Pedidos sem pricePaid (sample):', noprice.map(r => r.registrationId));

// Verificar se esses registrationIds existem no financialSales
for (const row of noprice) {
  const [fsRow] = await conn.execute('SELECT registrationId, saleValue FROM financialSales WHERE registrationId = ?', [row.registrationId]);
  console.log(`  regId ${row.registrationId} -> financialSales:`, fsRow.length > 0 ? `saleValue=${fsRow[0].saleValue}` : 'NÃO ENCONTRADO');
}

await conn.end();
process.exit(0);
