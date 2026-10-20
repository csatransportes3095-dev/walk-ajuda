import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConnection, createPool, type Pool } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import jwt from 'jsonwebtoken';
import { filterSiteDirectory } from '../shared/siteSecurityDirectory';

const state=vi.hoisted(()=>({db:null as any,restoring:false}));
vi.mock('./db',()=>({getDb:vi.fn(async()=>state.db),getAdminCredential:vi.fn(async(name:string)=>name==='directory-test-owner'?{username:name}:null)}));
vi.mock('./backupRestoreService',()=>({isSystemRestoreLocked:()=>state.restoring}));
vi.mock('./_core/customerEntryNotification',()=>({notifyCustomerEntry:vi.fn()}));
const localUrl=process.env.SITE_ACCESS_TEST_DB_URL;

describe.skipIf(!localUrl)('authorization directory: isolated MySQL and real admin middleware',()=>{
  let pool:Pool;
  let router:typeof import('./siteSecurityRouter').siteSecurityRouter;
  const owner='directory-test-owner';
  const secret='directory-test-only-secret-never-used-in-production-20261019';
  beforeAll(async()=>{
    const parsed=new URL(localUrl!);
    if(parsed.hostname!=='127.0.0.1'||parsed.port!=='33306'||parsed.pathname!=='/h2_site_access_test')throw new Error('Refusing nonisolated directory database');
    const setup=await createConnection(localUrl!);
    try{await setup.query('CREATE DATABASE IF NOT EXISTS h2_directory_test');}finally{await setup.end();}
    parsed.pathname='/h2_directory_test';
    pool=createPool(parsed.toString());
    state.db=drizzle(pool);
    for(const query of [
      "CREATE TABLE IF NOT EXISTS customers (id INT PRIMARY KEY,name VARCHAR(128) NOT NULL,email VARCHAR(320),phone VARCHAR(32) NOT NULL,profilePhotoUrl TEXT,deletedAt TIMESTAMP NULL,blocked INT DEFAULT 0) ENGINE=InnoDB",
      "CREATE TABLE IF NOT EXISTS orderStatusHistory (id INT PRIMARY KEY,registrationId INT NOT NULL,customerPhone VARCHAR(32) NOT NULL,status VARCHAR(64) NOT NULL) ENGINE=InnoDB",
      "CREATE TABLE IF NOT EXISTS hiddenSubOrders (registrationId INT NOT NULL,subOrderIndex INT NOT NULL) ENGINE=InnoDB",
      "CREATE TABLE IF NOT EXISTS orderStatusTypes (id INT PRIMARY KEY,`key` VARCHAR(64),sortOrder INT,isActive INT,isGlobal INT) ENGINE=InnoDB",
      "CREATE TABLE IF NOT EXISTS siteAccessEntries (id INT PRIMARY KEY AUTO_INCREMENT,displayName VARCHAR(128) NOT NULL,email VARCHAR(320) NOT NULL UNIQUE,phone VARCHAR(32),customerId INT,status VARCHAR(16) NOT NULL DEFAULT 'active',expiresAt TIMESTAMP NULL,sessionVersion INT DEFAULT 1,createdBy VARCHAR(64) NOT NULL,createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB",
      "CREATE TABLE IF NOT EXISTS siteAccessAudit (id INT PRIMARY KEY AUTO_INCREMENT,actor VARCHAR(64) NOT NULL,action VARCHAR(48) NOT NULL,subject VARCHAR(320),createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
    ])await pool.query(query);
    vi.stubEnv('JWT_SECRET',secret);vi.stubEnv('H2_SITE_SECURITY_OWNER',owner);
    router=(await import('./siteSecurityRouter')).siteSecurityRouter;
  },30000);
  beforeEach(async()=>{
    state.db=drizzle(pool);state.restoring=false;
    for(const table of ['siteAccessAudit','siteAccessEntries','hiddenSubOrders','orderStatusHistory','orderStatusTypes','customers'])await pool.query('DELETE FROM '+table);
    await pool.query("INSERT INTO orderStatusTypes (id,`key`,sortOrder,isActive,isGlobal) VALUES (1,'recebido',0,1,1)");
    await pool.query("INSERT INTO siteAccessEntries (id,displayName,email,createdBy) VALUES (801,'Cliente novo','new@example.test',?)",[owner]);
  });
  afterEach(()=>vi.restoreAllMocks());
  afterAll(async()=>{vi.unstubAllEnvs();await pool?.end();});
  const caller=(sub=owner,cookie?:string)=>router.createCaller({req:{headers:{cookie:cookie??'admin_token='+jwt.sign({sub,role:'admin'},secret,{expiresIn:'5m'})}},res:{},user:null} as any);
  const read=async()=>{const [rows]=await pool.query<any[]>('SELECT * FROM siteAccessEntries ORDER BY id');return rows;};

  it('lists and searches an email even when customers and orders are empty',async()=>{
    const list=await caller().list();
    expect(list).toMatchObject([{id:801,registrationState:'none',phone:null,profilePhotoUrl:null,visibleOrderCount:null}]);
    expect(filterSiteDirectory(list,'without_registration','NEW@EXAMPLE.TEST')).toHaveLength(1);
    expect(filterSiteDirectory(list,'registered_without_orders')).toHaveLength(0);
  });
  it('suspends and reactivates by authorization id without creating a client',async()=>{
    await caller().changeStatus({id:801,status:'suspended'});
    expect((await read())[0]).toMatchObject({id:801,status:'suspended',sessionVersion:2});
    expect(filterSiteDirectory(await caller().list(),'without_registration')).toMatchObject([{id:801,status:'suspended'}]);
    await caller().changeStatus({id:801,status:'active'});
    expect((await read())[0]).toMatchObject({status:'active',sessionVersion:3});
    const [customers]=await pool.query<any[]>('SELECT * FROM customers');expect(customers).toHaveLength(0);
    const [audit]=await pool.query<any[]>('SELECT action FROM siteAccessAudit ORDER BY id');
    expect(audit.map(row=>row.action)).toEqual(['ACCESS_SUSPENDED','ACCESS_ACTIVATED']);
  });
  it('classifies later registration without changing a suspended authorization or customerId',async()=>{
    await caller().changeStatus({id:801,status:'suspended'});
    const before=await read();
    await pool.query("INSERT INTO customers (id,name,email,phone) VALUES (227,'Cadastro novo',' NEW@EXAMPLE.TEST ','11999990000')");
    const list=await caller().list();
    expect(list).toMatchObject([{id:801,customerId:null,status:'suspended',registrationState:'registered',visibleOrderCount:0}]);
    expect(filterSiteDirectory(list,'without_registration')).toHaveLength(0);
    expect(filterSiteDirectory(list,'registered_without_orders')).toHaveLength(1);
    expect(await read()).toEqual(before);
  });
  it('classifies visible orders without double-counting status history or hidden suborders',async()=>{
    await pool.query("INSERT INTO customers (id,name,email,phone) VALUES (227,'Cadastro novo','new@example.test','11999990000')");
    await pool.query("INSERT INTO orderStatusHistory (id,registrationId,customerPhone,status) VALUES (1,501,'11999990000','recebido'),(2,501,'11999990000','entregue'),(3,501,'11999990000','recebido'),(4,501,'11999990000','em_analise'),(5,502,'(11) 99999-0000','recebido')");
    await pool.query('INSERT INTO hiddenSubOrders VALUES (501,1)');
    const list=await caller().list();
    expect(filterSiteDirectory(list,'with_orders')).toMatchObject([{id:801,visibleOrderCount:2}]);
    expect(filterSiteDirectory(list,'registered_without_orders')).toHaveLength(0);
    expect((await read())[0].status).toBe('active');
  });
  it('never uses a customer primary key for the suspension action',async()=>{
    await pool.query("INSERT INTO customers (id,name,email,phone) VALUES (227,'Cliente','new@example.test','11999990000')");
    const [entry]=await caller().list();
    expect(entry.id).toBe(801);
    await expect(caller().changeStatus({id:227,status:'suspended'})).rejects.toMatchObject({code:'NOT_FOUND'});
    expect((await read())[0].status).toBe('active');
  });
  it('preserves expiry and original profile photos in the richer list',async()=>{
    await pool.query("INSERT INTO customers (id,name,email,phone,profilePhotoUrl) VALUES (227,'Cliente','new@example.test','11999990000','https://example.test/profile.jpg')");
    await pool.query("UPDATE siteAccessEntries SET expiresAt='2020-01-01 00:00:00' WHERE id=801");
    const before=await read();const [entry]=await caller().list();
    expect(entry.profilePhotoUrl).toBe('https://example.test/profile.jpg');expect(entry.expiresAt).toEqual(before[0].expiresAt);
    expect(await read()).toEqual(before);
  });
  it('does not call a deleted customer a current registration',async()=>{
    await pool.query("INSERT INTO customers (id,name,email,phone,deletedAt) VALUES (227,'Excluido','new@example.test','11999990000',NOW())");
    expect(filterSiteDirectory(await caller().list(),'without_registration')).toHaveLength(1);
  });
  it('recognizes a blocked customer as registered without changing access',async()=>{
    await pool.query("INSERT INTO customers (id,name,email,phone,blocked) VALUES (227,'Bloqueado','new@example.test','11999990000',1)");
    expect((await caller().list())[0]).toMatchObject({registrationState:'registered',status:'active'});
  });
  it('does not guess an ambiguous customer and keeps the authorization visible',async()=>{
    await pool.query("INSERT INTO customers (id,name,email,phone) VALUES (227,'Um','new@example.test','11999990000'),(228,'Outro','new@example.test','21999990000')");
    const [entry]=await caller().list();expect(entry).toMatchObject({id:801,registrationState:'ambiguous',visibleOrderCount:null,profilePhotoUrl:null});
  });
  it('uses a confirmed customerId despite a customer email change',async()=>{
    await pool.query("INSERT INTO customers (id,name,email,phone) VALUES (227,'Vinculado','different@example.test','11999990000')");
    await pool.query('UPDATE siteAccessEntries SET customerId=227 WHERE id=801');
    expect((await caller().list())[0]).toMatchObject({id:801,registrationState:'registered',registeredName:'Vinculado'});
  });
  it.each([['no cookie',''],['invalid token','admin_token=invalid']])('does not expose directory data with %s',async(_,cookie)=>{
    await expect(caller(owner,cookie).list()).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('rejects another admin and leaves the same owner-only permission checks in place',async()=>{
    await expect(caller('other-admin').list()).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(caller('other-admin').changeStatus({id:801,status:'suspended'})).rejects.toMatchObject({code:'FORBIDDEN'});
    expect((await read())[0].status).toBe('active');
  });
  it('returns a read error rather than silently marking everyone as unregistered',async()=>{
    state.db=null;await expect(caller().list()).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR'});
    expect((await read())[0].status).toBe('active');
  });
});
