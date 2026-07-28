import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar o registrationId do pedido #3010000
const [osh] = await conn.execute(
  'SELECT registrationId, orderNumber, serviceOption, pricePaid FROM orderStatusHistory WHERE orderNumber = 3010000 LIMIT 1'
);
console.log('orderStatusHistory:', JSON.stringify(osh, null, 2));

if (osh.length > 0) {
  const regId = osh[0].registrationId;
  // Buscar no financialSales
  const [fs] = await conn.execute(
    'SELECT * FROM financialSales WHERE registrationId = ?', [regId]
  );
  console.log('financialSales:', JSON.stringify(fs, null, 2));
  
  // Buscar cupons usados
  const [coupons] = await conn.execute(
    'SELECT * FROM couponUsages WHERE registrationId = ? LIMIT 5', [regId]
  ).catch(() => [[]]);
  console.log('couponUsages:', JSON.stringify(coupons, null, 2));
}

// Ver estrutura das tabelas relacionadas a cupons
const [tables] = await conn.execute(
  "SHOW TABLES LIKE '%coupon%'"
);
console.log('Tabelas de cupom:', tables.map(t => Object.values(t)[0]));

await conn.end();
process.exit(0);
