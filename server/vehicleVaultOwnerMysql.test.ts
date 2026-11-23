import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConnection, type Connection } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import jwt from 'jsonwebtoken';
import type { TrpcContext } from './_core/context';
import { syntheticVehicle, syntheticVehicleText } from '../scripts/tests/vehicle-vault-owner-fixtures.mjs';

// Only the DB getter and private storage boundary are replaced. All schema SQL,
// validation, administrative authorization and save/read procedures are real.
const isolated = vi.hoisted(() => ({ db: null as any, storage: vi.fn() }));
vi.mock('./db', () => ({ getDb: async () => isolated.db }));
vi.mock('./locadora/storage', () => ({
  storeLocadoraPrivateFile: isolated.storage, readLocadoraPrivateFile: isolated.storage, deleteLocadoraPrivateFile: isolated.storage,
}));
import { vehicleVaultRouter } from './routers/vehicleVault';

const testUrl = process.env.VEHICLE_VAULT_OWNER_TEST_DB_URL?.trim();
const databaseName = 'h2_vehicle_vault_owner_test';
const secret = 'isolated-vehicle-vault-owner-mysql-secret-20261120';
let connection: Connection | undefined;
let migratedLegacy: any;
let migratedColumn: any;
const ownedTables = ['vehicle_vault_pdf_files', 'vehicle_vault_clients', 'vehicle_vault_history', 'vehicle_usage_registry', 'vehicle_vault_documents'];

function safeUrl(value: string) {
  const url = new URL(value), host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'mysql:' || !['localhost', '127.0.0.1', '::1', 'mysql'].includes(host)
    || decodeURIComponent(url.pathname) !== '/' + databaseName || url.search || url.hash) {
    throw new Error('VEHICLE_VAULT_OWNER_TEST_DB_URL must point only to the isolated local h2_vehicle_vault_owner_test database.');
  }
  return url;
}
async function query(statement: string, values: any[] = []): Promise<any> {
  return (await connection!.query(statement, values))[0];
}
function caller(admin = true) {
  return vehicleVaultRouter.createCaller({ user: null,
    req: { headers: { cookie: admin ? 'admin_token=' + jwt.sign({ sub: 'vehicle-owner-test', role: 'admin' }, secret) : '' } } as TrpcContext['req'],
    res: {} as TrpcContext['res'] });
}
const input = (ownerName?: string | null, overrides = {}) => ({ ...syntheticVehicle,
  ...(ownerName !== undefined ? { ownerName } : {}), sourceText: syntheticVehicleText('SOURCE NAME IS NOT AN EXPLICIT SAVE VALUE'), ...overrides });
async function row(id: number) { return (await query('SELECT * FROM vehicle_vault_documents WHERE id=?', [id]))[0]; }

describe.skipIf(!testUrl)('Vehicle owner — isolated MySQL persistence and legacy migration', () => {
  beforeAll(async () => {
    const url = safeUrl(testUrl!);
    connection = await createConnection({ host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 3306),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: databaseName, timezone: 'Z' });
    expect((await query('SELECT DATABASE() AS name'))[0].name).toBe(databaseName);
    isolated.db = drizzle(connection);
    vi.stubEnv('JWT_SECRET', secret);
    await query('DROP TRIGGER IF EXISTS vehicle_owner_test_reject_update');
    for (const table of [...ownedTables, 'customers']) await query(`DROP TABLE IF EXISTS ${table}`);
    await query(`CREATE TABLE customers (id INT PRIMARY KEY,name VARCHAR(128),phone VARCHAR(32),customerNumber INT,cpf VARCHAR(32),profilePhotoUrl TEXT) ENGINE=InnoDB`);
    // An actual pre-feature table: no ownerName or optional classification columns.
    await query(`CREATE TABLE vehicle_vault_documents (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,plate VARCHAR(7) NOT NULL UNIQUE,
      renavam VARCHAR(20) NOT NULL,chassis VARCHAR(30) NOT NULL,model VARCHAR(160) NOT NULL,color VARCHAR(48) NOT NULL,
      manufactureYear SMALLINT NOT NULL,modelYear SMALLINT NOT NULL,sourceText LONGTEXT NOT NULL,
      inactive TINYINT NOT NULL DEFAULT 0,createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await query(`INSERT INTO vehicle_vault_documents (plate,renavam,chassis,model,color,manufactureYear,modelYear,sourceText)
      VALUES ('LEG1A23','00000000001','9BWZZZ377VT004251','TESTE/LEGADO','PRATA',2020,2021,'LEGACY SOURCE MUST STAY INTACT')`);
    expect((await query("SHOW COLUMNS FROM vehicle_vault_documents LIKE 'ownerName'")).length).toBe(0);
    await caller().totalCount(); // Executes the production migration, including concurrent-safe optional DDL.
    migratedLegacy = await caller().details({ id: 1 });
    migratedColumn = (await query("SHOW COLUMNS FROM vehicle_vault_documents LIKE 'ownerName'"))[0];
  }, 30_000);

  beforeEach(async () => {
    await query('DROP TRIGGER IF EXISTS vehicle_owner_test_reject_update');
    for (const table of ownedTables) await query(`DELETE FROM ${table}`);
    isolated.storage.mockClear();
  });
  afterAll(async () => {
    if (connection) { await query('DROP TRIGGER IF EXISTS vehicle_owner_test_reject_update'); await connection.end(); }
    vi.unstubAllEnvs();
  });

  it('migrates existing documents to a nullable owner without inventing or changing legacy data', () => {
    expect(migratedColumn).toMatchObject({ Field: 'ownerName', Null: 'YES', Default: null });
    expect(migratedLegacy).toMatchObject({ plate: 'LEG1A23', ownerName: null, model: 'TESTE/LEGADO', modelYear: 2021,
      sourceText: 'LEGACY SOURCE MUST STAY INTACT', links: [], history: [], pdfs: [] });
  });

  it('persists a corrected accented owner and reads it through both details and search', async () => {
    const created = await caller().save(input('  Ana   Sintética D\'Ávila  '));
    const freshCaller = caller();
    expect(await freshCaller.details({ id: created.id })).toMatchObject({ ...syntheticVehicle, ownerName: "ANA SINTÉTICA D'ÁVILA" });
    expect((await freshCaller.search({ query: syntheticVehicle.plate }))[0]).toMatchObject({ id: created.id, ownerName: "ANA SINTÉTICA D'ÁVILA" });
    expect(isolated.storage).not.toHaveBeenCalled();
  });

  it('keeps legal-entity owners independent across two documents', async () => {
    const first = await caller().save(input('EMPRESA SINTÉTICA & FILHOS LTDA'));
    const second = await caller().save(input('SEGUNDA EMPRESA SINTÉTICA S/A', { plate: 'TST2B34', renavam: '00000000002', chassis: '9BWZZZ377VT004252' }));
    await caller().save(input('PESSOA SINTÉTICA CORRIGIDA', { id: first.id }));
    expect((await caller().details({ id: first.id })).ownerName).toBe('PESSOA SINTÉTICA CORRIGIDA');
    expect((await caller().details({ id: second.id })).ownerName).toBe('SEGUNDA EMPRESA SINTÉTICA S/A');
  });

  it('preserves the saved owner when an older client omits the field on UPDATE', async () => {
    const created = await caller().save(input('PROPRIETÁRIA SINTÉTICA'));
    await caller().save(input(undefined, { id: created.id, color: 'AZUL' }));
    expect(await row(created.id)).toMatchObject({ ownerName: 'PROPRIETÁRIA SINTÉTICA', color: 'AZUL' });
  });

  it.each(['', '   ', null])('clears the owner only when an explicit empty value is saved: %s', async empty => {
    const created = await caller().save(input('PESSOA SINTÉTICA'));
    await caller().save(input(empty, { id: created.id }));
    expect((await caller().details({ id: created.id })).ownerName).toBeNull();
    expect((await row(created.id)).ownerName).toBeNull();
  });

  it('creates a legacy-compatible document when ownerName is omitted without reading it from sourceText', async () => {
    const created = await caller().save(input());
    expect((await caller().details({ id: created.id })).ownerName).toBeNull();
  });

  it('supports the full 200-character value without truncation', async () => {
    const ownerName = 'EMPRESA ' + 'A'.repeat(192);
    const created = await caller().save(input(ownerName));
    expect((await row(created.id)).ownerName).toBe(ownerName);
  });

  it('rejects unauthorized reads and writes without mutating the document', async () => {
    const created = await caller().save(input('PESSOA SINTÉTICA ORIGINAL'));
    await expect(caller(false).save(input('OUTRA PESSOA', { id: created.id }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(false).details({ id: created.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await row(created.id)).ownerName).toBe('PESSOA SINTÉTICA ORIGINAL');
    expect((await query('SELECT COUNT(*) AS total FROM vehicle_vault_history'))[0].total).toBe(1);
  });

  it('reports a real SQL write failure and leaves the prior owner and history intact', async () => {
    const created = await caller().save(input('PESSOA SINTÉTICA ORIGINAL'));
    await query("CREATE TRIGGER vehicle_owner_test_reject_update BEFORE UPDATE ON vehicle_vault_documents FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic owner update rejection'");
    await expect(caller().save(input('PESSOA SINTÉTICA NÃO SALVA', { id: created.id }))).rejects.toThrow();
    expect((await row(created.id)).ownerName).toBe('PESSOA SINTÉTICA ORIGINAL');
    expect((await query('SELECT COUNT(*) AS total FROM vehicle_vault_history'))[0].total).toBe(1);
  });
});
