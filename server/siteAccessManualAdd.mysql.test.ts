import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPool, type Pool } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import jwt from 'jsonwebtoken';
import { siteAccessEntries } from './siteAccessSchema';
import { addManualSiteAccess } from './siteAccessManualAdd';

const state = vi.hoisted(() => ({db: null as any, ownerExists: true, restoring: false}));
vi.mock('./db', () => ({
  getDb: vi.fn(async () => state.db),
  getAdminCredential: vi.fn(async (user: string) => state.ownerExists && user === 'test-site-owner' ? {username: user} : null),
}));
vi.mock('./backupRestoreService', () => ({isSystemRestoreLocked: () => state.restoring}));
vi.mock('./_core/customerEntryNotification', () => ({notifyCustomerEntry: vi.fn()}));

const isolatedUrl = process.env.SITE_ACCESS_TEST_DB_URL;
// Never use DATABASE_URL or any production database/credentials for these destructive fixtures.
describe.skipIf(!isolatedUrl)('manual authorization: real isolated MySQL + real tRPC admin middleware', () => {
  let pool: Pool;
  let router: typeof import('./siteSecurityRouter').siteSecurityRouter;
  const secret = 'test-only-site-admin-secret-not-used-in-production-20261019';
  const actor = 'test-site-owner';
  const input = {displayName: '227', email: 'person@example.test'};

  beforeAll(async () => {
    const url = new URL(isolatedUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/h2_site_access_test') {
      throw new Error('Refusing to run outside explicitly isolated local test database');
    }
    pool = createPool({host:url.hostname,port:Number(url.port || 3306),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:'h2_site_access_test',connectionLimit:12,timezone:'Z'});
    await pool.query(`CREATE TABLE IF NOT EXISTS siteAccessEntries (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      displayName VARCHAR(128) NOT NULL,
      email VARCHAR(320) NOT NULL UNIQUE,
      phone VARCHAR(32) NULL,
      customerId INT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      expiresAt TIMESTAMP NULL DEFAULT NULL,
      sessionVersion INT NOT NULL DEFAULT 1,
      createdBy VARCHAR(64) NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS siteAccessAudit (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      actor VARCHAR(64) NOT NULL,
      action VARCHAR(48) NOT NULL,
      subject VARCHAR(320) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    state.db = drizzle(pool);
    vi.stubEnv('JWT_SECRET', secret);
    vi.stubEnv('H2_SITE_SECURITY_OWNER', actor);
    router = (await import('./siteSecurityRouter')).siteSecurityRouter;
  }, 30000);

  beforeEach(async () => {
    state.db = drizzle(pool);
    state.ownerExists = true;
    state.restoring = false;
    vi.stubEnv('H2_SITE_SECURITY_OWNER', actor);
    await pool.query('DELETE FROM siteAccessAudit');
    await pool.query('DELETE FROM siteAccessEntries');
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {vi.unstubAllEnvs();await pool?.end();});

  function caller(options: {cookie?: string; subject?: string; role?: string} = {}) {
    const cookie = options.cookie ?? 'admin_token=' + jwt.sign({sub:options.subject ?? actor,role:options.role ?? 'admin'},secret,{expiresIn:'5m'});
    return router.createCaller({req:{headers:{cookie}},res:{},user:null} as any);
  }
  async function rows(table: 'siteAccessEntries' | 'siteAccessAudit') {
    const [result] = await pool.query('SELECT * FROM ' + table + ' ORDER BY id');
    return result as any[];
  }

  it('creates the numeric display name shown in the report without a phone or customer/order record', async () => {
    const result = await caller().add(input);
    expect(result).toMatchObject({success:true,created:true,status:'active',expired:false});
    const [person] = await rows('siteAccessEntries');
    expect(person).toMatchObject({id:result.id,displayName:'227',email:input.email,phone:null,customerId:null,status:'active',expiresAt:null,sessionVersion:1,createdBy:actor});
    expect(person.createdAt).toBeInstanceOf(Date);
    expect(person.updatedAt).toBeInstanceOf(Date);
    expect(await rows('siteAccessAudit')).toEqual([expect.objectContaining({actor,action:'ACCESS_ADDED',subject:input.email})]);
  });

  it('normalizes surrounding spaces and case before email validation', async () => {
    await caller().add({displayName:'  Pessoa de teste  ',email:' PERSON@EXAMPLE.TEST ',phone:' 11900000000 '});
    expect((await rows('siteAccessEntries'))[0]).toMatchObject({displayName:'Pessoa de teste',email:input.email,phone:'11900000000'});
  });

  it('accepts an explicit future expiry without shifting or dropping it', async () => {
    const expiresAt = new Date(Date.now()+86400000).toISOString().replace(/\.\d{3}Z$/,'.000Z');
    await caller().add({...input,expiresAt});
    expect((await rows('siteAccessEntries'))[0].expiresAt.toISOString()).toBe(expiresAt);
  });

  it('parameterizes apostrophes and SQL-like text rather than executing them', async () => {
    const displayName = "José D'Ávila — teste'); DELETE FROM siteAccessEntries; --";
    await caller().add({...input,displayName});
    expect((await rows('siteAccessEntries'))[0].displayName).toBe(displayName);
    expect(await rows('siteAccessAudit')).toHaveLength(1);
  });

  it('reproduces the old duplicate insertion error, then handles a repeated add idempotently', async () => {
    const first = await caller().add(input);
    await expect(state.db.insert(siteAccessEntries).values({displayName:input.displayName,email:input.email,phone:null,expiresAt:null,createdBy:actor})).rejects.toThrow(/Failed query/);
    const again = await caller().add({...input,displayName:'Outro nome',phone:'11999999999'});
    expect(again).toMatchObject({created:false,id:first.id,status:'active'});
    expect(await rows('siteAccessEntries')).toHaveLength(1);
    expect((await rows('siteAccessEntries'))[0]).toMatchObject({displayName:'227',phone:null});
    expect(await rows('siteAccessAudit')).toHaveLength(1);
  });

  it('does not overwrite imported customer links, names, phones or session versions', async () => {
    const first = await caller().add(input);
    await pool.query('UPDATE siteAccessEntries SET displayName=?,phone=?,customerId=?,sessionVersion=? WHERE id=?',['Original','11900000001',227,7,first.id]);
    const before = (await rows('siteAccessEntries'))[0];
    await caller().add({...input,displayName:'Novo',phone:'11900000002'});
    expect((await rows('siteAccessEntries'))[0]).toEqual(before);
  });

  it('finds a legacy email with whitespace/case without creating a second authorization', async () => {
    const first = await caller().add(input);
    await pool.query('UPDATE siteAccessEntries SET email=? WHERE id=?',[' PERSON@EXAMPLE.TEST ',first.id]);
    expect(await caller().add(input)).toMatchObject({created:false,id:first.id});
    expect(await rows('siteAccessEntries')).toHaveLength(1);
  });

  it('does not reactivate a suspended authorization', async () => {
    const first = await caller().add(input);
    await pool.query('UPDATE siteAccessEntries SET status=?,sessionVersion=? WHERE id=?',['suspended',4,first.id]);
    expect(await caller().add(input)).toMatchObject({created:false,status:'suspended'});
    expect((await rows('siteAccessEntries'))[0]).toMatchObject({status:'suspended',sessionVersion:4});
    expect(await rows('siteAccessAudit')).toHaveLength(1);
  });

  it('does not renew an expired authorization on repeated add', async () => {
    const first = await caller().add(input);
    await pool.query('UPDATE siteAccessEntries SET expiresAt=? WHERE id=?',[new Date(Date.now()-60000),first.id]);
    expect(await caller().add(input)).toMatchObject({created:false,expired:true});
    expect((await rows('siteAccessEntries'))[0].expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('keeps one authorization and one audit under eight concurrent submissions', async () => {
    const results = await Promise.all(Array.from({length:8},()=>caller().add(input)));
    expect(results.filter(result=>result.created)).toHaveLength(1);
    expect(new Set(results.map(result=>result.id)).size).toBe(1);
    expect(await rows('siteAccessEntries')).toHaveLength(1);
    expect(await rows('siteAccessAudit')).toHaveLength(1);
  });

  it('creates different authorized emails concurrently without sharing identities', async () => {
    const results = await Promise.all(['one@example.test','two@example.test'].map(email=>caller().add({...input,email})));
    expect(results.every(result=>result.created)).toBe(true);
    expect(results[0].id).not.toBe(results[1].id);
    expect(await rows('siteAccessEntries')).toHaveLength(2);
    expect(await rows('siteAccessAudit')).toHaveLength(2);
  });

  it('works with strict legacy columns that have no implicit status/session/timestamp defaults', async () => {
    await pool.query("ALTER TABLE siteAccessEntries ALTER status DROP DEFAULT, ALTER sessionVersion DROP DEFAULT, ALTER createdAt DROP DEFAULT, ALTER updatedAt DROP DEFAULT");
    try {
      await expect(state.db.insert(siteAccessEntries).values({displayName:input.displayName,email:input.email,createdBy:actor})).rejects.toThrow();
      expect(await caller().add(input)).toMatchObject({created:true,status:'active'});
      expect(await rows('siteAccessEntries')).toHaveLength(1);
    } finally {
      await pool.query("ALTER TABLE siteAccessEntries ALTER status SET DEFAULT 'active', ALTER sessionVersion SET DEFAULT 1, ALTER createdAt SET DEFAULT CURRENT_TIMESTAMP, ALTER updatedAt SET DEFAULT CURRENT_TIMESTAMP");
    }
  });

  it('rolls back the authorization if the audit insert fails and never exposes the SQL', async () => {
    const log = vi.spyOn(console,'error').mockImplementation(()=>{});
    await pool.query('RENAME TABLE siteAccessAudit TO siteAccessAudit_test_unavailable');
    try {
      await expect(caller().add(input)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:expect.stringContaining('SAE_ADD')});
      expect(await rows('siteAccessEntries')).toHaveLength(0);
      const diagnostic = JSON.stringify(log.mock.calls);
      expect(diagnostic).toContain('ER_NO_SUCH_TABLE');
      expect(diagnostic).not.toContain(input.email);
      expect(diagnostic).not.toContain(actor);
      expect(diagnostic).not.toContain('INSERT');
    } finally {await pool.query('RENAME TABLE siteAccessAudit_test_unavailable TO siteAccessAudit');}
  });

  it.each([
    {displayName:'x',email:'valid@example.test'},
    {displayName:'Pessoa',email:'invalid'},
    {displayName:'Pessoa',email:'valid@example.test',phone:'1'.repeat(33)},
    {displayName:'Pessoa',email:'valid@example.test',expiresAt:'invalid'},
    {displayName:'Pessoa',email:'valid@example.test',expiresAt:'2020-01-01T00:00:00Z'},
  ])('rejects invalid input without persisting anything: %j', async invalid => {
    await expect(caller().add(invalid)).rejects.toMatchObject({code:'BAD_REQUEST'});
    expect(await rows('siteAccessEntries')).toHaveLength(0);
    expect(await rows('siteAccessAudit')).toHaveLength(0);
  });

  it.each([
    {cookie:''},
    {cookie:'admin_token=not-a-jwt'},
    {subject:'another-admin'},
    {role:'customer'},
  ])('preserves both admin and site-owner authorization: %j', async options => {
    await expect(caller(options).add(input)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(await rows('siteAccessEntries')).toHaveLength(0);
  });

  it('rejects a removed Super Admin credential', async () => {
    state.ownerExists=false;
    await expect(caller().add(input)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(await rows('siteAccessEntries')).toHaveLength(0);
  });

  it('rejects changes when no site owner is configured', async () => {
    vi.stubEnv('H2_SITE_SECURITY_OWNER','');
    await expect(caller().add(input)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(await rows('siteAccessEntries')).toHaveLength(0);
  });

  it('preserves the administrative restore lock', async () => {
    state.restoring=true;
    await expect(caller().add(input)).rejects.toMatchObject({code:'CONFLICT'});
    expect(await rows('siteAccessEntries')).toHaveLength(0);
  });

  it('returns a safe error and no success when the database is unavailable', async () => {
    state.db=null;
    await expect(caller().add(input)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:expect.stringContaining('SAE_ADD')});
    expect(await rows('siteAccessEntries')).toHaveLength(0);
  });

  it('rejects invalid direct-helper expiry before any write', async () => {
    await expect(addManualSiteAccess(state.db,actor,{...input,expiresAt:'not-a-date'})).rejects.toMatchObject({code:'BAD_REQUEST'});
    expect(await rows('siteAccessEntries')).toHaveLength(0);
  });
});
