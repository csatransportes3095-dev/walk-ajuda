import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar todos os financialSales com registrationId
const [rows] = await conn.execute(
  'SELECT registrationId, MAX(saleValue) AS saleValue FROM financialSales WHERE registrationId IS NOT NULL AND saleValue > 0 GROUP BY registrationId'
);
console.log('financialSales com preço:', rows.length);

let updated = 0;
for (const row of rows) {
  const reais = row.saleValue / 100;
  // Formatar como "R$ 600,00"
  const intPart = Math.floor(reais);
  const decPart = Math.round((reais - intPart) * 100).toString().padStart(2, '0');
  const intFormatted = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted = `R$ ${intFormatted},${decPart}`;
  
  const [res] = await conn.execute(
    'UPDATE orderStatusHistory SET pricePaid = ? WHERE registrationId = ? AND pricePaid IS NULL',
    [formatted, row.registrationId]
  );
  if (res.affectedRows > 0) updated += res.affectedRows;
}
console.log('Linhas atualizadas:', updated);

await conn.end();
process.exit(0);
