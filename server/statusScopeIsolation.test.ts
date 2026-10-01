import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createConnection, type Connection } from 'mysql2/promise';
import { globalActiveStatuses, orderedFlowKeys, statusChoicesForFlow, unavailableFlowKeys } from '../shared/orderStatusScope';
import { getConfiguredGlobalProgressKeys, getDefaultGlobalProgressKeys } from '../shared/orderProgressSequence';
import { recoverReferencedStatusDefinitions, ensureStatusScopeSchema } from './orderStatusScope';

const sample = [
  { key: 'recebido', isActive: 1, isGlobal: 1, sortOrder: 0, showInProgress: 1 },
  { key: 'custom', isActive: 1, isGlobal: 0, sortOrder: -1, showInProgress: 1 },
  { key: 'entregue', isActive: 1, isGlobal: 1, sortOrder: 2, showInProgress: 1 },
  { key: 'inactive', isActive: 0, isGlobal: 1, sortOrder: 3 },
];
describe('status scope selection', () => {
  it('keeps exclusive custom entries out of every global progress source', () => {
    expect(globalActiveStatuses(sample).map(s => s.key)).toEqual(['recebido', 'entregue']);
    expect(getConfiguredGlobalProgressKeys(sample)).toEqual(['recebido', 'entregue']);
    expect(getDefaultGlobalProgressKeys(sample)).toEqual(['recebido', 'entregue']);
  });
  it('preserves custom order while sharing initial and final stages', () => {
    expect(statusChoicesForFlow(sample, { isDefault: 0, statusKeys: ['recebido', 'custom', 'entregue'] })).toEqual(['recebido', 'custom', 'entregue']);
    expect(statusChoicesForFlow(sample, null)).toEqual(['recebido', 'entregue']);
  });
  it('never uses unrelated global entries for an empty or damaged custom flow', () => {
    expect(statusChoicesForFlow(sample, { isDefault: 0, statusKeys: [] })).toEqual([]);
    expect(statusChoicesForFlow(sample, { isDefault: 0, statusKeys: ['missing', 'inactive'] })).toEqual([]);
    expect(unavailableFlowKeys(['recebido', 'missing', 'inactive'], sample)).toEqual(['missing', 'inactive']);
  });
  it('rejects missing and inactive keys instead of dropping them while saving', () => {
    expect(() => orderedFlowKeys('recebido', ['custom', 'missing'], sample)).toThrow('missing');
    expect(() => orderedFlowKeys('recebido', ['inactive'], sample)).toThrow('inactive');
    expect(orderedFlowKeys('recebido', ['custom', 'entregue', 'custom'], sample)).toEqual(['recebido', 'custom', 'entregue']);
  });
  it('maintains compatibility for old snapshots without the scope field', () => {
    expect(globalActiveStatuses([{ key: 'legacy', isActive: 1 }])).toHaveLength(1);
  });
  it('renders dangling references visibly and fails closed on validation errors', () => {
    const page = readFileSync('client/src/pages/AdminStatusFlows.tsx', 'utf8');
    expect(page).toContain('Cadastro ausente - vinculo preservado');
    expect(page).toContain('Restaurar cadastro');
    expect(page).not.toContain('.filter((key) => validKeys.has(key))');
    const routes = readFileSync('server/routers.ts', 'utf8');
    expect(routes).toContain('scopeReport: adminProcedure');
    expect(routes).not.toContain('FROM orderStatusTypes WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1');
    expect(readFileSync('server/db.ts', 'utf8')).not.toContain('FROM orderStatusTypes WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1');
    expect(routes).toContain('flow.unavailableKeys.includes(input.status)');
    expect(routes).toContain('Nao foi possivel validar a sequencia.');
  });
});

const testUrl = process.env.STATUS_TEST_DB_URL;
const integration = testUrl ? describe.sequential : describe.skip;
integration('isolated MySQL catalogue and flow protection', () => {
  let connection: Connection;
  let api: typeof import('./db');
  let db: any;
  let defaultId: number;
  beforeAll(async () => {
    const parsed = new URL(testUrl!);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/h2_status_test') throw new Error('Unsafe status test database');
    process.env.DATABASE_URL = testUrl!;
    connection = await createConnection(testUrl!);
    await connection.query(`CREATE TABLE orderStatusTypes (
      id INT AUTO_INCREMENT PRIMARY KEY, \`key\` VARCHAR(64) NOT NULL UNIQUE, label VARCHAR(128) NOT NULL,
      color VARCHAR(64) NOT NULL DEFAULT 'text-gray-400', bgColor VARCHAR(128) NOT NULL DEFAULT 'bg-gray-500/20 border-gray-500/40',
      icon VARCHAR(32) NOT NULL DEFAULT 'Clock', description TEXT NULL, sortOrder INT NOT NULL DEFAULT 0,
      isSystem INT NOT NULL DEFAULT 0, isActive INT NOT NULL DEFAULT 1, pulseColor VARCHAR(32) DEFAULT '#ffffff',
      showInProgress INT NOT NULL DEFAULT 0, progressOrder INT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await connection.query('CREATE TABLE orderStatusHistory (id INT AUTO_INCREMENT PRIMARY KEY, status VARCHAR(64), registrationId INT, orderNumber INT, serviceName VARCHAR(256))');
    await connection.query('CREATE TABLE orderProgressConfig (id INT AUTO_INCREMENT PRIMARY KEY, statusKey VARCHAR(64))');
    await connection.query('CREATE TABLE products (id INT PRIMARY KEY, name VARCHAR(128), sortOrder INT DEFAULT 0)');
    await connection.query("INSERT INTO products(id,name) VALUES(1,'Vehicle service'),(2,'Other service')");
    await connection.query("INSERT INTO orderStatusTypes (`key`,label,sortOrder,isSystem) VALUES ('recebido','PEDIDO RECEBIDO',0,1),('pedido_entregue','PEDIDO ENTREGUE',11,0),('analise','EM ANALISE',2,0)");
    api = await import('./db');
    db = await api.getDb();
    await api.ensureOrderStatusFlowTables();
    defaultId = await api.getDefaultOrderStatusFlowId();
    await connection.query("INSERT INTO orderStatusFlows (id,name,isDefault,isActive) VALUES (20,'VEICULOS EDICOES',0,1),(21,'Outro produto',0,1)");
    await connection.query("INSERT INTO orderStatusFlowItems (flowId,statusKey,sortOrder) VALUES (20,'recebido',0),(20,'buscando_dados',1),(20,'documento_montagem',2),(20,'documento_em_teste',3),(20,'doc_testado_e_aprovado',4),(20,'pedido_entregue',5),(21,'recebido',0),(21,'unknown_reference',1)");
    await connection.query('INSERT INTO productStatusFlows(productId,flowId) VALUES (1,20),(2,21)');
    await connection.query("INSERT INTO orderStatusHistory(status,registrationId,orderNumber,serviceName) VALUES ('buscando_dados',100,1,'Vehicle service')");
  }, 30000);
  afterAll(async () => { await connection?.end(); await db?.$client?.end(); });
  const rows = async (query: string, params: any[] = []) => (await connection.query(query, params))[0] as any[];
  it('adds schema idempotently and recovers only retained confirmed vehicle keys', async () => {
    await ensureStatusScopeSchema(db); await ensureStatusScopeSchema(db);
    const beforeLinks = await rows('SELECT * FROM orderStatusFlowItems ORDER BY id');
    const beforeOrders = await rows('SELECT * FROM orderStatusHistory ORDER BY id');
    const result = await recoverReferencedStatusDefinitions(db);
    expect(result.restored).toEqual(['buscando_dados','documento_montagem','documento_em_teste','doc_testado_e_aprovado']);
    expect(result.unresolved).toEqual(['unknown_reference']);
    expect(await rows('SELECT * FROM orderStatusFlowItems ORDER BY id')).toEqual(beforeLinks);
    expect(await rows('SELECT * FROM orderStatusHistory ORDER BY id')).toEqual(beforeOrders);
    const recovered = await rows("SELECT * FROM orderStatusTypes WHERE `key`='buscando_dados'");
    expect(recovered[0].isGlobal).toBe(0);
    expect(recovered[0].description).toBeNull();
    expect((await recoverReferencedStatusDefinitions(db)).alreadyApplied).toBe(true);
  });
  it('keeps default options separate from the vehicle sequence', async () => {
    expect((await api.getOrderStatusFlowDefinition(defaultId))?.statusKeys).toEqual(['recebido','analise','pedido_entregue']);
    expect((await api.getOrderStatusFlowDefinition(20))?.statusKeys).toEqual(['recebido','buscando_dados','documento_montagem','documento_em_teste','doc_testado_e_aprovado','pedido_entregue']);
  });
  it('shows missing keys in the ADM definition rather than filtering them out', async () => {
    const flow = await api.getOrderStatusFlowDefinition(21);
    expect(flow?.statusKeys).toEqual(['recebido','unknown_reference']);
    expect(flow?.unavailableKeys).toEqual(['unknown_reference']);
  });
  it('rejects a damaged flow save atomically with links, products and name preserved', async () => {
    const before = await rows('SELECT * FROM orderStatusFlowItems WHERE flowId=21 ORDER BY id');
    await expect(api.updateOrderStatusFlowConfig({id:21,name:'DO NOT SAVE',statusKeys:['recebido','unknown_reference'],productIds:[]})).rejects.toThrow('unknown_reference');
    expect(await rows('SELECT * FROM orderStatusFlowItems WHERE flowId=21 ORDER BY id')).toEqual(before);
    expect((await rows('SELECT name FROM orderStatusFlows WHERE id=21'))[0].name).toBe('Outro produto');
    expect(await rows('SELECT productId FROM productStatusFlows WHERE flowId=21')).toEqual([{productId:2}]);
  });
  it('protects a shared status from deletion or deactivation', async () => {
    const status = (await api.listOrderStatusTypes()).find(s => s.key==='pedido_entregue')!;
    await expect(api.deleteOrderStatusType(status.id)).rejects.toThrow('vinculos');
    await expect(api.updateOrderStatusType(status.id,{isActive:0})).rejects.toThrow('vinculos');
    expect((await api.listOrderStatusTypes()).find(s=>s.id===status.id)?.isActive).toBe(1);
  });
  it('removes from global without changing any custom links or order history', async () => {
    const status = (await api.listOrderStatusTypes()).find(s=>s.key==='pedido_entregue')!;
    const before = await rows('SELECT * FROM orderStatusFlowItems ORDER BY id');
    await api.updateOrderStatusType(status.id,{isGlobal:0});
    expect((await api.getOrderStatusFlowDefinition(defaultId))?.statusKeys).not.toContain('pedido_entregue');
    expect((await api.getOrderStatusFlowDefinition(20))?.statusKeys).toContain('pedido_entregue');
    expect(await rows('SELECT * FROM orderStatusFlowItems ORDER BY id')).toEqual(before);
    await api.updateOrderStatusType(status.id,{isGlobal:1});
  });
  it('removes only one sequence membership and preserves catalogue/history', async () => {
    await api.updateOrderStatusFlowConfig({id:20,statusKeys:['recebido','documento_em_teste','pedido_entregue']});
    expect((await api.getOrderStatusFlowDefinition(20))?.statusKeys).not.toContain('buscando_dados');
    const historical = (await api.listOrderStatusTypes()).find(s=>s.key==='buscando_dados')!;
    expect(historical).toBeTruthy();
    await expect(api.deleteOrderStatusType(historical.id)).rejects.toThrow('historico');
  });
  it('preserves explicit custom order independent of the global sort', async () => {
    await api.updateOrderStatusFlowConfig({id:20,statusKeys:['pedido_entregue','documento_em_teste','buscando_dados']});
    expect((await api.getOrderStatusFlowDefinition(20))?.statusKeys).toEqual(['recebido','pedido_entregue','documento_em_teste','buscando_dados']);
    expect((await api.getOrderStatusFlowDefinition(defaultId))?.statusKeys).toEqual(['recebido','analise','pedido_entregue']);
  });
  it('creates exclusive custom entries and restores retained positions without duplication', async () => {
    await api.createOrderStatusType({key:'unknown_reference',label:'Name confirmed by administrator',sortOrder:90,isActive:1,flowId:21});
    expect((await api.getOrderStatusFlowDefinition(21))?.statusKeys).toEqual(['recebido','unknown_reference']);
    expect((await rows("SELECT sortOrder FROM orderStatusFlowItems WHERE flowId=21 AND statusKey='unknown_reference'"))[0].sortOrder).toBe(1);
    expect((await api.getOrderStatusFlowDefinition(defaultId))?.statusKeys).not.toContain('unknown_reference');
  });
  it('protects the universal initial status and permits deletion only of unused entries', async () => {
    const initial = (await api.listOrderStatusTypes()).find(s=>s.key==='recebido')!;
    await expect(api.updateOrderStatusType(initial.id,{isGlobal:0})).rejects.toThrow('inicial');
    const status = await api.createOrderStatusType({key:'unused_entry',label:'Unused',sortOrder:99,isGlobal:0,isActive:1});
    await api.deleteOrderStatusType(status.id);
    expect((await api.listOrderStatusTypes()).find(s=>s.key==='unused_entry')).toBeUndefined();
    expect((await rows("SELECT reason FROM orderStatusScopeArchive WHERE recordKey='unused_entry' ORDER BY id DESC LIMIT 1"))[0].reason).toBe('before-delete');
  });
  it('rolls back incomplete new flows and safely allocates concurrent flow IDs', async () => {
    const before = await rows('SELECT id FROM orderStatusFlows ORDER BY id');
    await expect(api.createOrderStatusFlowConfig({name:'Invalid',statusKeys:['no_such_key'],productIds:[]})).rejects.toThrow('no_such_key');
    expect(await rows('SELECT id FROM orderStatusFlows ORDER BY id')).toEqual(before);
    const created = await Promise.all(['A','B'].map(name => api.createOrderStatusFlowConfig({name,statusKeys:['recebido','analise'],productIds:[]})));
    expect(created[0]?.id).not.toBe(created[1]?.id);
    expect(created.map(f=>f?.name).sort()).toEqual(['A','B']);
  });
  it('does not overwrite custom progress preferences when saving global progress', async () => {
    await connection.query("UPDATE orderStatusTypes SET showInProgress=1,progressOrder=71 WHERE `key`='documento_em_teste'");
    await api.setGlobalOrderProgressSequence(['recebido','pedido_entregue']);
    expect((await rows("SELECT progressOrder FROM orderStatusTypes WHERE `key`='documento_em_teste'"))[0].progressOrder).toBe(71);
    await expect(api.setGlobalOrderProgressSequence(['documento_em_teste'])).rejects.toThrow('cadastro global');
  });
});
