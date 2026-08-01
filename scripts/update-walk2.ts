import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

const NEW_CLIENT_ID = '1000.VIW1Y5ZPTSN5XJJ81MYA344UOW4NAM';
const NEW_CLIENT_SECRET = '6d702a38665312cdb9a8ca26948ac6f19da17b2f3b';
const NEW_REFRESH_TOKEN = '1000.675476b03af9046ea19b9dcd2c589552.d1a1ba2d0ffe540bece4473922c7ceba';
const ORG_ID = '933183212';

async function main() {
  const db = await getDb();
  if (!db) { console.error('DB connection failed'); process.exit(1); }

  // Listar todos os configs
  const result = await db.execute(sql.raw(`SELECT id, name, zohoOrgId, zohoClientId, isActive, status FROM zohoOAuthConfigs ORDER BY id ASC`));
  const rows = (result as any)[0] as any[];
  console.log('Configs existentes:');
  rows.forEach(r => console.log(`  id=${r.id} name=${r.name} orgId=${r.zohoOrgId} active=${r.isActive} status=${r.status}`));

  // Encontrar o WALK2
  const walk2 = rows.find(r => r.name?.toLowerCase().includes('walk2') || r.name?.toLowerCase().includes('walk 2'));
  if (walk2) {
    console.log(`\nAtualizando WALK2 (id=${walk2.id})...`);
    const now = Date.now();
    await db.execute(sql.raw(
      `UPDATE zohoOAuthConfigs SET 
        zohoOrgId = '${ORG_ID}',
        zohoClientId = '${NEW_CLIENT_ID}',
        zohoClientSecret = '${NEW_CLIENT_SECRET}',
        zohoRefreshToken = '${NEW_REFRESH_TOKEN}',
        status = 'active',
        isActive = 1,
        updatedAt = ${now}
      WHERE id = ${walk2.id}`
    ));
    console.log('WALK2 atualizado com sucesso!');
  } else {
    console.log('\nWALK2 não encontrado. Criando novo...');
    const now = Date.now();
    await db.execute(sql.raw(
      `INSERT INTO zohoOAuthConfigs (name, \`domain\`, zohoOrgId, zohoClientId, zohoClientSecret, zohoRefreshToken, isActive, status, createdAt, updatedAt)
       VALUES ('WALK2', 'h2colombiano.com', '${ORG_ID}', '${NEW_CLIENT_ID}', '${NEW_CLIENT_SECRET}', '${NEW_REFRESH_TOKEN}', 1, 'active', ${now}, ${now})`
    ));
    console.log('WALK2 criado com sucesso!');
  }

  // Listar novamente para confirmar
  const result2 = await db.execute(sql.raw(`SELECT id, name, zohoOrgId, zohoClientId, isActive, status FROM zohoOAuthConfigs ORDER BY id ASC`));
  const rows2 = (result2 as any)[0] as any[];
  console.log('\nConfigs após atualização:');
  rows2.forEach(r => console.log(`  id=${r.id} name=${r.name} orgId=${r.zohoOrgId} active=${r.isActive} status=${r.status}`));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
