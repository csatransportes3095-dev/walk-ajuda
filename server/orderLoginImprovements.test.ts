import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createConnection, type Connection } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { cnhCodeSchema, resolveOrderGroupLink, loginOptionalFields, globalOrderGroupSchema, safeLoginLink } from '../shared/orderLoginPresentation';
import { readOrderLoginDefaults, saveOrderGroupDefault, canReadOrderLoginExtras } from './orderLoginDefaults';
import { migrateOrderLoginImprovements } from '../scripts/apply-order-login-improvements-migration';

describe('manual CNH / global group rules', () => {
  it.each(['012345', '000000', '123456', '999999', ''])('preserves the manual string %j', code => {
    expect(cnhCodeSchema.parse(code)).toBe(code);
    expect(loginOptionalFields({ cnhCode: code }).cnhCode).toBe(code || null);
  });
  it.each(['12345', '1234567', '123a56', ' 123456', '123456 ', 'https://example.com', '1e3456'])('rejects invalid code %j', code => {
    expect(cnhCodeSchema.safeParse(code).success).toBe(false);
  });
  it('does not erase old values from old tabs or reinterpret email URLs as CNH', () => {
    expect(loginOptionalFields({})).toEqual({});
    expect(loginOptionalFields({ emailLink: 'https://mail.example.com' })).toEqual({ emailLink: 'https://mail.example.com' });
    expect(loginOptionalFields({ cnhCode: '' })).toEqual({ cnhCode: null });
  });
  it('changes and removes global group without resurrecting legacy links', () => {
    expect(resolveOrderGroupLink(null, 'old')).toBe('old');
    expect(resolveOrderGroupLink({ groupLink: 'new' }, 'old')).toBe('new');
    expect(resolveOrderGroupLink({ groupLink: null }, 'old')).toBeNull();
  });
  it.each(['javascript:alert(1)', 'data:text/html,hello', 'https://user:pass@example.com', 'not a link'])('rejects unsafe group %j', groupLink => {
    expect(globalOrderGroupSchema.safeParse({ groupLink, expectedRevision: 0 }).success).toBe(false);
    expect(safeLoginLink(groupLink)).toBeNull();
  });
  it('uses server persistence and separates group save from individual save', () => {
    const source = readFileSync('server/routers.ts', 'utf8');
    const route = source.slice(source.indexOf('  loginData: router({'), source.indexOf('  customerPin: router({'));
    expect(route).toContain('getGlobalGroup: adminProcedure');
    expect(route).toContain('setGlobalGroup: adminProcedure');
    expect(route).toContain('cnhCode: cnhCodeSchema.optional()');
    const save = route.slice(route.indexOf('    save: adminProcedure'), route.indexOf('    getForClient:'));
    expect(save).toContain('...loginOptionalFields(input)');
    expect(save).not.toContain('saveOrderGroupDefault');
    const client = route.slice(route.indexOf('    getForClient:'), route.indexOf('    getAuthenticatorQrForClient:'));
    expect(client).toContain('canReadOrderLoginExtras');
    expect(client).toContain('cnhCode: allowedExtras');
    expect(client).not.toContain('...safeRow');
    expect(client).not.toContain('getCodeForOrder');
  });
  it('puts normal fields before the authenticator in all three admin forms', () => {
    const source = readFileSync('client/src/pages/AdminOrders.tsx', 'utf8');
    const blocks = source.split('className="order-login-layout ').slice(1);
    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      const form = block.slice(0, block.indexOf('</fieldset>'));
      expect(form.indexOf('<OrderLoginCnhField')).toBeLessThan(form.indexOf('<OrderLoginGlobalGroup'));
      expect(form.indexOf('data-login-field="notes"')).toBeLessThan(form.indexOf('data-login-field="authenticator"'));
      expect(form.indexOf('<OrderLoginCnhField')).toBeLessThan(form.indexOf('<AuthenticatorQrAdminField'));
      if (form.includes('<OrderLoginAuthenticatorCode')) expect(form.indexOf('data-login-field="notes"')).toBeLessThan(form.indexOf('<OrderLoginAuthenticatorCode'));
      expect(form).not.toContain('value={fields.emailLink}');
    }
  });
  it('preserves customer delivery gate and keeps the private ADM authenticator out', () => {
    const client = readFileSync('client/src/pages/OrderTracking.tsx', 'utf8');
    const section = client.slice(client.indexOf('BLOCO LOGIN / ENTREGUE'), client.indexOf('{qrExpanded &&'));
    expect(section).toContain("latestStatus === 'entregue' || latestStatus === 'pedido_entregue'");
    expect(section.indexOf('data-login-field="notes"')).toBeLessThan(section.indexOf('data-login-field="authenticator"'));
    expect(client).not.toContain('OrderLoginAuthenticatorCode');
    expect(client).not.toContain('getCodeForOrder');
    expect(section).toContain('Entrar no grupo');
  });
});

// This integration suite can only target the isolated CI database, never production.
const url = process.env.LOGIN_TEST_DB_URL;
const integration = url ? describe : describe.skip;
integration('isolated MySQL: migration, persistence and access', () => {
  let connection: Connection;
  let db: ReturnType<typeof drizzle>;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/h2_login_test') throw new Error('Unsafe test database');
    connection = await createConnection(url!); db = drizzle(connection);
    await connection.query('CREATE TABLE orderLoginData (id INT PRIMARY KEY, registrationId INT NOT NULL, emailLink VARCHAR(512), loginGroupLink VARCHAR(1024), authCode VARCHAR(512), loginPassword VARCHAR(256))');
    await connection.query('INSERT INTO orderLoginData VALUES (1, 101, ?, ?, ?, ?)', ['https://mail.example.com', 'https://chat.whatsapp.com/old', 'legacy-secret', 'legacy-password']);
    await connection.query('CREATE TABLE customerPasswordSessions (token VARCHAR(512) PRIMARY KEY, phone VARCHAR(32), expiresAt TIMESTAMP)');
    await connection.query('CREATE TABLE orderStatusHistory (id INT PRIMARY KEY AUTO_INCREMENT, registrationId INT, customerPhone VARCHAR(32), status VARCHAR(64), createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await connection.query('INSERT INTO orderStatusHistory (registrationId, customerPhone, status) VALUES (101, ?, ?), (102, ?, ?)', ['11999999999', 'pedido_entregue', '11999999999', 'recebido']);
    await connection.query('INSERT INTO customerPasswordSessions VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY)), (?, ?, DATE_SUB(NOW(), INTERVAL 1 DAY))', ['valid-test-token-with-20-characters', '11999999999', 'expired-test-token-20-characters', '11999999999']);
    await migrateOrderLoginImprovements(connection);
    await migrateOrderLoginImprovements(connection);
  });
  afterAll(async () => { if (connection) await connection.end(); });
  it('migration is repeatable and retains original credentials and links', async () => {
    const [rows] = await connection.query<any[]>('SELECT * FROM orderLoginData WHERE id=1');
    expect(rows[0]).toMatchObject({ emailLink: 'https://mail.example.com', loginGroupLink: 'https://chat.whatsapp.com/old', authCode: 'legacy-secret', loginPassword: 'legacy-password', cnhCode: null });
    expect(await readOrderLoginDefaults(db as any)).toBeNull();
    await connection.query('UPDATE orderLoginData SET cnhCode=? WHERE id=1', [cnhCodeSchema.parse('012345')]);
    const [saved] = await connection.query<any[]>('SELECT cnhCode FROM orderLoginData WHERE id=1');
    expect(saved[0].cnhCode).toBe('012345');
  });
  it('global changes cover old/new orders and removal survives a new read', async () => {
    const first = await saveOrderGroupDefault(db as any, { groupLink: 'https://chat.whatsapp.com/first', expectedRevision: 0 });
    expect(first.revision).toBe(1);
    for (const legacy of ['old-a', 'old-b', null]) expect(resolveOrderGroupLink(await readOrderLoginDefaults(db as any), legacy)).toBe(first.groupLink);
    await expect(saveOrderGroupDefault(db as any, { groupLink: 'https://example.com/stale', expectedRevision: 0 })).rejects.toMatchObject({ code: 'CONFLICT' });
    const second = await saveOrderGroupDefault(db as any, { groupLink: 'https://chat.whatsapp.com/second', expectedRevision: 1 });
    expect(second.revision).toBe(2);
    await expect(saveOrderGroupDefault(db as any, { groupLink: 'https://example.com/stale', expectedRevision: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await saveOrderGroupDefault(db as any, { groupLink: '', expectedRevision: 2 });
    const removed = await readOrderLoginDefaults(db as any);
    expect(removed).toMatchObject({ groupLink: null, revision: 3 });
    expect(resolveOrderGroupLink(removed, 'legacy-must-not-return')).toBeNull();
  });
  it('allows only an authenticated owner of a delivered order to see new fields', async () => {
    const request = { registrationId: 101, customerPhone: '11999999999', cpToken: 'valid-test-token-with-20-characters' };
    expect(await canReadOrderLoginExtras(db as any, request)).toBe(true);
    expect(await canReadOrderLoginExtras(db as any, { ...request, cpToken: undefined })).toBe(false);
    expect(await canReadOrderLoginExtras(db as any, { ...request, cpToken: 'expired-test-token-20-characters' })).toBe(false);
    expect(await canReadOrderLoginExtras(db as any, { ...request, customerPhone: '11888888888' })).toBe(false);
    expect(await canReadOrderLoginExtras(db as any, { ...request, registrationId: 102 })).toBe(false);
    expect(await canReadOrderLoginExtras(db as any, { ...request, registrationId: 999 })).toBe(false);
    expect(await canReadOrderLoginExtras(db as any, { ...request, cpToken: undefined }, true)).toBe(true);
    await connection.query('INSERT INTO orderStatusHistory (registrationId, customerPhone, status, createdAt) VALUES (101, ?, ?, DATE_ADD(NOW(), INTERVAL 1 SECOND))', ['11999999999', 'recebido']);
    expect(await canReadOrderLoginExtras(db as any, request)).toBe(false);
  });
});
