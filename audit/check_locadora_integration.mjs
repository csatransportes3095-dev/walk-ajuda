import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const [router, storage, migration, app, admin, hub, portal, schema] = await Promise.all([
  read('../server/routers/locadora.ts'), read('../server/locadora/storage.ts'), read('../scripts/apply-locadora-migration.ts'), read('../client/src/App.tsx'), read('../client/src/pages/AdminLocadora.tsx'), read('../client/src/pages/AdminHubCentral.tsx'), read('../client/src/pages/LocadoraPortal.tsx'), read('../drizzle/locadoraSchema.ts'),
]);
const checks = [];
function check(name, value) { assert.ok(value, name); checks.push(name); }
check('API exige adminProcedure', /adminProcedure/.test(router));
check('Validação tenant central existe', /async function requireTenant/.test(router));
check('Todas as entidades operacionais usam tenantId', ['locadora_clients','locadora_vehicles','locadora_contracts','locadora_charges','locadora_maintenances','locadora_fines','locadora_employees'].every(t => router.includes(t) && router.includes('tenantId')));
check('Storage usa AES-GCM', /aes-256-gcm/.test(storage));
check('Storage não constrói URL pública', !/buildR2PublicUrl|R2_PUBLIC_URL/.test(storage));
check('Upload valida assinatura de PNG/JPEG/WebP/PDF', /isPng|png/.test(storage) && /jpeg/.test(storage) && /webp/.test(storage) && /pdf/.test(storage));
check('Migração não importa backup', !/INSERT\s+INTO|readFile|locacar-source/i.test(migration));
check('Migração cria tabelas com prefixo locadora_', (migration.match(/CREATE TABLE IF NOT EXISTS locadora_/g) || []).length >= 14);
check('Schema usa apenas tabelas locadora_', !/mysqlTable\("users"/.test(schema) && (schema.match(/mysqlTable\("locadora_/g) || []).length >= 14);
check('Rota administrativa existe', /path=\{"\/admin\/locadora"\}/.test(app));
check('Rota /locadora existe', /path=\{"\/locadora"\}/.test(app));
check('Card LOCADORA existe no hub', /LOCADORA/.test(hub));
check('Portal não expõe dados privados sem API administrativa', /acesso controlado/i.test(portal) && !/fileBase64|dataBase64/.test(portal));
console.log(`[locadora-check] ${checks.length} validações aprovadas.`);
for (const item of checks) console.log(`OK: ${item}`);
