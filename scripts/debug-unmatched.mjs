import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar pedidos ainda sem pricePaid
const [orders] = await conn.execute(`
  SELECT DISTINCT osh.registrationId, osh.serviceOption
  FROM orderStatusHistory osh
  WHERE osh.pricePaid IS NULL 
    AND osh.registrationId IS NOT NULL
    AND osh.serviceOption IS NOT NULL
    AND osh.serviceOption != ''
    AND osh.serviceOption != 'NULL'
  LIMIT 20
`);

console.log('Ainda sem pricePaid:', orders.length);
for (const o of orders) {
  const base = o.serviceOption.split(/ - Garantia:/i)[0].split(/ — Garantia:/i)[0].trim();
  console.log(`  regId=${o.registrationId} | base="${base}"`);
}

// Mostrar todos os labels disponíveis no productOptions
const [labels] = await conn.execute('SELECT label, price FROM productOptions WHERE isActive = 1 ORDER BY label');
console.log('\nLabels disponíveis:');
for (const l of labels) {
  console.log(`  "${l.label}" -> ${l.price}`);
}

await conn.end();
process.exit(0);
