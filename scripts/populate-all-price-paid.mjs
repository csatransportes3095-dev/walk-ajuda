import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar todos os pedidos sem pricePaid que têm serviceOption
const [orders] = await conn.execute(`
  SELECT DISTINCT osh.registrationId, osh.serviceOption
  FROM orderStatusHistory osh
  WHERE osh.pricePaid IS NULL 
    AND osh.registrationId IS NOT NULL
    AND osh.serviceOption IS NOT NULL
    AND osh.serviceOption != ''
    AND osh.serviceOption != 'NULL'
`);

console.log('Pedidos sem pricePaid com serviceOption:', orders.length);

let updated = 0;
let notFound = 0;

for (const order of orders) {
  const { registrationId, serviceOption } = order;
  
  // Extrair nome base da opção (antes do " - Garantia:" ou "— Garantia:")
  const baseOptionName = serviceOption
    .split(/ - Garantia:/i)[0]
    .split(/ — Garantia:/i)[0]
    .split(/\s*-\s*Garantia:/i)[0]
    .trim();

  // Tentar buscar pelo label exato primeiro
  let price = null;
  
  // 1. Tentar match exato com productOptions.label
  const [exactRows] = await conn.execute(
    'SELECT price FROM productOptions WHERE label = ? AND isActive = 1 LIMIT 1',
    [baseOptionName]
  );
  if (exactRows.length > 0) {
    price = exactRows[0].price;
  }
  
  // 2. Se não encontrou, tentar match parcial (LIKE)
  if (!price) {
    const [likeRows] = await conn.execute(
      'SELECT price FROM productOptions WHERE ? LIKE CONCAT(label, \'%\') AND isActive = 1 LIMIT 1',
      [baseOptionName]
    );
    if (likeRows.length > 0) {
      price = likeRows[0].price;
    }
  }

  // 3. Se ainda não encontrou, tentar match reverso
  if (!price) {
    const [revRows] = await conn.execute(
      'SELECT price FROM productOptions WHERE label LIKE ? AND isActive = 1 LIMIT 1',
      [`%${baseOptionName.substring(0, 20)}%`]
    );
    if (revRows.length > 0) {
      price = revRows[0].price;
    }
  }

  if (price) {
    // Formatar o preço: pode vir como "350.00" ou "R$ 350,00"
    let formatted = price;
    if (!price.includes('R$')) {
      const num = parseFloat(price.replace(',', '.'));
      if (!isNaN(num) && num > 0) {
        const intPart = Math.floor(num);
        const decPart = Math.round((num - intPart) * 100).toString().padStart(2, '0');
        const intFormatted = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        formatted = `R$ ${intFormatted},${decPart}`;
      }
    }
    
    const [res] = await conn.execute(
      'UPDATE orderStatusHistory SET pricePaid = ? WHERE registrationId = ? AND pricePaid IS NULL',
      [formatted, registrationId]
    );
    if (res.affectedRows > 0) {
      updated += res.affectedRows;
    }
  } else {
    notFound++;
    // console.log(`  Não encontrado: regId=${registrationId}, option="${baseOptionName}"`);
  }
}

console.log('Linhas atualizadas:', updated);
console.log('Sem match de produto:', notFound);

// Verificar resultado final
const [final] = await conn.execute('SELECT COUNT(*) as cnt FROM orderStatusHistory WHERE pricePaid IS NOT NULL');
const [totalReg] = await conn.execute('SELECT COUNT(DISTINCT registrationId) as cnt FROM orderStatusHistory WHERE registrationId IS NOT NULL');
console.log(`\nResultado: ${final[0].cnt} registros com pricePaid de ${totalReg[0].cnt} registrationIds totais`);

await conn.end();
process.exit(0);
