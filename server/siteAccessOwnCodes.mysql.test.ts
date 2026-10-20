import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPool, type Pool } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { request as httpRequest, type Server } from 'node:http';
import express from 'express';
import { parse as cookies } from 'cookie';
import { createHmac } from 'node:crypto';
import { registerSiteIdentity } from './siteAccessIdentity';
import { createSiteAccessGateway } from './siteAccessGateway';
import { ensureOwnSiteCodeStore, reserveOwnSiteCode, finishOwnSiteCodeDelivery, consumeOwnSiteCode, readOwnSiteSession, ownCodeFingerprint, generateOwnSiteCode } from './siteAccessOwnCodes';
import { SITE_ACCESS_LIFETIME_MS, validSiteCode } from '../shared/siteAccessCodePolicy';

const url=process.env.SITE_CODE_TEST_DB_URL;
describe.skipIf(!url)('own site codes: isolated MySQL, actual HTTP routes and gateway',()=>{
  let pool:Pool,db:any,available=true,now:number,server:Server,port:number;
  let delivery=vi.fn();
  const email='authorized@example.test',other='second@example.test';
  const secret='test-only-own-site-code-secret-never-production-20261020';
  async function query(statement:string,values:unknown[]=[]){const [result]=await pool.query(statement,values);return result as any;}
  async function call(path:string,body:any={},headers:Record<string,string>={},method='POST'):Promise<{status:number;body:any;headers:import('node:http').IncomingHttpHeaders}> {
    return new Promise((resolve,reject)=>{
      const req=httpRequest({hostname:'127.0.0.1',port,path,method,headers:{host:'h2colombiano.com',origin:'https://h2colombiano.com','content-type':'application/json',...headers}},res=>{
        const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(Buffer.from(chunk)));res.on('end',()=>{
          const text=Buffer.concat(chunks).toString();let body:any;try{body=JSON.parse(text);}catch{body=text;}
          resolve({status:res.statusCode!,body,headers:res.headers});
        });
      });req.on('error',reject);req.end(method==='GET'?undefined:JSON.stringify(body));
    });
  }
  const request=(value:any=email,headers:Record<string,string>={})=>call('/api/site-access/request',{email:value},headers);
  const verify=(code:string,value=email)=>call('/api/site-access/verify',{email:value,code});
  const session=(cookie:string)=>call('/api/site-access/session',{}, {cookie},'GET');
  async function issue(value=email){const response=await request(value);expect(response.status).toBe(200);expect(response.body.codeLength).toBe(6);const code=delivery.mock.calls.at(-1)![1] as string;expect(code).toMatch(/^[0-9]{6}$/);return code;}
  async function login(value=email){const code=await issue(value);const result=await verify(code,value);expect(result.status).toBe(200);return {code,result,cookie:result.headers['set-cookie']![0].split(';')[0]};}
  beforeAll(async()=>{
    const parsed=new URL(url!);
    if(parsed.hostname!=='127.0.0.1'||parsed.port!=='33306'||parsed.pathname!=='/h2_site_code_test')throw new Error('REFUSING_NON_ISOLATED_DATABASE');
    pool=createPool({host:parsed.hostname,port:Number(parsed.port),user:decodeURIComponent(parsed.username),password:decodeURIComponent(parsed.password),database:'h2_site_code_test',timezone:'Z',connectionLimit:12});
    db=drizzle(pool);
    await query(`CREATE TABLE IF NOT EXISTS siteAccessEntries (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,email VARCHAR(320) NOT NULL UNIQUE,status VARCHAR(16) NOT NULL,sessionVersion INT NOT NULL,expiresAt TIMESTAMP NULL,customerId INT NULL,displayName VARCHAR(128) NULL)`);
    await query(`CREATE TABLE IF NOT EXISTS siteAccessConfig (id INT PRIMARY KEY,mode VARCHAR(16) NOT NULL)`);
    await ensureOwnSiteCodeStore(db);
    vi.stubEnv('H2_SITE_ACCESS_SECRET',secret);vi.stubEnv('H2_SITE_ACCESS_ENFORCE','true');vi.stubEnv('NODE_ENV','production');
    vi.spyOn(console,'info').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});
    const app=express();
    app.use(createSiteAccessGateway({enabled:()=>true,mode:async()=> 'restricted',isAdmin:()=>false,visitor:async req=>!!await readOwnSiteSession(db,cookies(req.headers.cookie||'').h2_site_auth||'',now)}));
    // Gateway requires owner configuration even for the test-only visitor dependency.
    vi.stubEnv('H2_SITE_SECURITY_OWNER','test-owner');
    app.use(express.json());registerSiteIdentity(app,{db:async()=>available?db:null,delivery:(...args)=>delivery(...args),now:()=>now});
    app.get('/private-probe',(_req,res)=>res.json({protected:true}));
    server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
    port=(server.address() as import('node:net').AddressInfo).port;
  },30000);
  beforeEach(async()=>{
    now=Date.now();available=true;
    for(const table of ['siteAccessSessionsV2','siteAccessCodeLedgerV2','siteAccessLimitsV2','siteAccessEntries','siteAccessConfig'])await query('DELETE FROM '+table);
    await query("INSERT INTO siteAccessConfig VALUES (1,'restricted')");
    await query("INSERT INTO siteAccessEntries (id,email,status,sessionVersion,expiresAt,customerId,displayName) VALUES (1,?,'active',1,NULL,NULL,'Somente autorizado'),(2,?,'active',1,NULL,NULL,'Segundo'),(3,'suspended@example.test','suspended',1,NULL,NULL,'Suspenso'),(4,'expired@example.test','active',1,?,NULL,'Vencido')",[email,other,new Date(now-60000)]);
    delivery=vi.fn().mockResolvedValue({channel:'smtp',messageId:'test-message'});
  });
  afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool?.end();vi.unstubAllEnvs();vi.restoreAllMocks();});
  it('issues and validates without any customers or orders table',async()=>{
    const {result,cookie}=await login();expect(result.body.expiresAt-now).toBe(SITE_ACCESS_LIFETIME_MS);
    expect((await session(cookie)).body.authorized).toBe(true);
    expect((await call('/private-probe',{}, {cookie},'GET')).status).toBe(200);
    expect(await query("SHOW TABLES LIKE 'customers'")).toHaveLength(0);
  });
  it('normalizes authorized emails before lookup without requiring a customerId',async()=>{
    await issue(' AUTHORIZED@EXAMPLE.TEST ');expect(delivery.mock.calls[0][0]).toBe(email);
    expect((await query('SELECT customerId FROM siteAccessEntries WHERE id=1'))[0].customerId).toBeNull();
  });
  it('stores no plaintext code, ties hash to email and uses a ten minute code lifetime',async()=>{
    const code=await issue();const [record]=await query('SELECT * FROM siteAccessCodeLedgerV2');
    expect(record.fingerprint).toBe(ownCodeFingerprint(code));
    expect(record.codeHash).toBe(createHmac('sha256',secret).update('otp:'+email+':'+code).digest('hex'));
    expect(record).not.toHaveProperty('code');expect(Object.values(record)).not.toContain(code);expect(JSON.stringify(record)).not.toContain(email);
    expect(Number(record.expiresAt)-Number(record.issuedAt)).toBe(600000);
  });
  it('sets a secure 24-hour opaque cookie, not an admin credential',async()=>{
    const {result}=await login();const cookie=result.headers['set-cookie']![0];
    expect(cookie).toMatch(/^h2_site_auth=[a-f0-9]{64};/);expect(cookie).toContain('Max-Age=86400');
    for(const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/'])expect(cookie).toContain(flag);
    expect(result.body).not.toHaveProperty('token');expect(cookie).not.toContain('admin_token');
  });
  it('requires the authorized email paired to that exact code',async()=>{
    const code=await issue();expect((await verify(code,other)).status).toBe(401);expect((await verify(code)).status).toBe(200);
  });
  it('consumes a code once and refuses replay',async()=>{const {code}=await login();expect((await verify(code)).status).toBe(401);});
  it('accepts pasted six-digit codes with optional separators',async()=>{
    const code=await issue();expect((await verify(' '+code.slice(0,3)+'-'+code.slice(3)+' ')).status).toBe(200);
  });
  it('preserves all leading zeroes through reserve, delivery and verification',async()=>{
    const reserved=await reserveOwnSiteCode(db,email,now,()=> '000012');
    expect(reserved?.code).toBe('000012');await finishOwnSiteCodeDelivery(db,reserved!.fingerprint,{channel:'smtp',messageId:'zero-test'});
    const response=await verify('000012');expect(response.status).toBe(200);expect(response.body.expiresAt-now).toBe(SITE_ACCESS_LIFETIME_MS);
    expect((await verify('000012')).status).toBe(401);
  });
  it.each(['1234ABCDEFGH','0123456','12345','O12345','１２３４５６'])('rejects wrong length or letters without a session: %s',async value=>{
    const response=await verify(value);expect(response.status).toBe(401);expect(response.headers['set-cookie']).toBeUndefined();expect(await query('SELECT * FROM siteAccessSessionsV2')).toHaveLength(0);
  });
  it('does not grant a session before confirming a code',async()=>{
    const response=await request();expect(response.headers['set-cookie']).toBeUndefined();expect(response.body).not.toHaveProperty('code');
    expect((await call('/private-probe',{}, {},'GET')).status).toBe(302);
  });
  it.each(['unknown@example.test','suspended@example.test','expired@example.test'])('does not issue for %s and does not enumerate approval',async value=>{
    const response=await request(value);expect(response.status).toBe(200);expect(response.body.message).toContain('Se este e-mail');
    expect(delivery).not.toHaveBeenCalled();expect(await query('SELECT * FROM siteAccessCodeLedgerV2')).toHaveLength(0);
  });
  it.each(['invalid','',null,{}])('rejects malformed email %j',async value=>{expect((await request(value)).status).toBe(400);expect(delivery).not.toHaveBeenCalled();});
  it.each(['','https://evil.example.test','http://h2colombiano.com'])('rejects foreign/missing origin %s',async origin=>{expect((await request(email,{origin})).status).toBe(403);expect(delivery).not.toHaveBeenCalled();});
  it('returns an explicit retry time instead of pretending a second email was sent',async()=>{
    await issue();const response=await request();expect(response.status).toBe(429);expect(response.body.retryAfter).toBe(60);expect(response.headers['retry-after']).toBe('60');expect(delivery).toHaveBeenCalledTimes(1);
  });
  it('allows another authorized email behind the same reverse proxy',async()=>{await issue();await issue(other);expect(delivery).toHaveBeenCalledTimes(2);});
  it('generates a fresh code after the resend interval',async()=>{
    const first=await issue();now+=60001;const second=await issue();expect(second).not.toBe(first);expect(await query('SELECT * FROM siteAccessCodeLedgerV2')).toHaveLength(2);
  });
  it('never reissues a previously generated value, even for another email',async()=>{
    const reused='012345',fresh='234567';
    await reserveOwnSiteCode(db,email,now,()=>reused);
    const sequence=vi.fn().mockReturnValueOnce(reused).mockReturnValue(fresh);
    expect((await reserveOwnSiteCode(db,other,now,sequence))?.code).toBe(fresh);expect(sequence).toHaveBeenCalledTimes(2);
  });
  it('retains uniqueness across a new database handle/restart and after user removal',async()=>{
    const reused='012345';await reserveOwnSiteCode(db,email,now,()=>reused);
    await query('DELETE FROM siteAccessEntries WHERE id=1');
    const second=drizzle(pool),sequence=vi.fn().mockReturnValueOnce(reused).mockReturnValue('234567');
    expect((await reserveOwnSiteCode(second,other,now,sequence))?.code).toBe('234567');
    expect(await query('SELECT * FROM siteAccessCodeLedgerV2')).toHaveLength(2);
  });
  it('fails rather than repeating if a broken generator repeatedly collides',async()=>{
    await reserveOwnSiteCode(db,email,now,()=> '012345');
    await expect(reserveOwnSiteCode(db,email,now,()=> '012345')).rejects.toThrow('UNIQUENESS');
    expect(await query('SELECT * FROM siteAccessCodeLedgerV2')).toHaveLength(1);
  });
  it('expires the code at ten minutes',async()=>{const code=await issue();now+=600000;expect((await verify(code)).status).toBe(401);});
  it('expires the session at exactly 24 hours without extending it on page refresh',async()=>{
    const {cookie,result}=await login();now+=SITE_ACCESS_LIFETIME_MS-1;
    expect((await session(cookie)).body).toMatchObject({authorized:true,expiresAt:result.body.expiresAt});
    now++;expect((await session(cookie)).body.authorized).toBe(false);expect((await call('/private-probe',{}, {cookie},'GET')).status).toBe(302);
  });
  it('requires a fresh code to renew an expired session',async()=>{
    const old=await login();now+=SITE_ACCESS_LIFETIME_MS;
    const fresh=await login();expect(fresh.code).not.toBe(old.code);expect(fresh.cookie).not.toBe(old.cookie);
    expect((await session(fresh.cookie)).body.authorized).toBe(true);
  });
  it('revokes logout on the server so a copied cookie cannot be replayed',async()=>{
    const {cookie}=await login();expect((await call('/api/site-access/logout',{}, {cookie})).status).toBe(200);
    expect((await session(cookie)).body.authorized).toBe(false);expect((await call('/private-probe',{}, {cookie},'GET')).status).toBe(302);
    expect(await query('SELECT * FROM siteAccessCodeLedgerV2')).toHaveLength(1);
  });
  it('does not revoke another authorized person when one logs out',async()=>{
    const first=await login(),second=await login(other);await call('/api/site-access/logout',{}, {cookie:first.cookie});
    expect((await session(second.cookie)).body.authorized).toBe(true);
  });
  it('rejects legacy JWT-like site cookies rather than silently extending them',async()=>{expect((await session('h2_site_auth=old.jwt.cookie')).body.authorized).toBe(false);});
  it('revokes existing sessions after suspension and never restores them on reactivation',async()=>{
    const {cookie}=await login();await query("UPDATE siteAccessEntries SET status='suspended',sessionVersion=sessionVersion+1 WHERE id=1");
    expect((await session(cookie)).body.authorized).toBe(false);
    await query("UPDATE siteAccessEntries SET status='active',sessionVersion=sessionVersion+1 WHERE id=1");
    expect((await session(cookie)).body.authorized).toBe(false);
  });
  it('rejects a previously issued code after authorization is suspended',async()=>{
    const code=await issue();await query("UPDATE siteAccessEntries SET status='suspended',sessionVersion=sessionVersion+1 WHERE id=1");expect((await verify(code)).status).toBe(401);
  });
  it('does not restore an old code by deleting/recreating an authorization with the same email',async()=>{
    const code=await issue();await query('DELETE FROM siteAccessEntries WHERE id=1');
    await query("INSERT INTO siteAccessEntries (email,status,sessionVersion) VALUES (?,'active',1)",[email]);expect((await verify(code)).status).toBe(401);
  });
  it('keeps a previous valid code usable when a resend cannot be delivered',async()=>{
    const first=await issue();now+=60001;delivery.mockRejectedValue(new Error('PRIVATE_PROVIDER_DETAILS'));
    const response=await request();expect(response.status).toBe(503);expect(JSON.stringify(response.body)).not.toContain('PRIVATE_PROVIDER');
    expect((await verify(first)).status).toBe(200);
  });
  it('never accepts a code from a failed delivery',async()=>{
    delivery.mockRejectedValue(new Error('test-only-failure'));expect((await request()).status).toBe(503);
    const code=delivery.mock.calls[0][1];expect((await verify(code)).status).toBe(401);
  });
  it('blocks after five wrong numeric guesses even when a correct code is later supplied',async()=>{
    const code=await issue(),wrong=code==='000000'?'000001':'000000';for(let i=0;i<5;i++)expect((await verify(wrong)).status).toBe(401);
    expect((await verify(code)).status).toBe(401);
  });
  it('creates only one session under concurrent verification',async()=>{
    const code=await issue();const results=await Promise.all([consumeOwnSiteCode(db,email,code,now),consumeOwnSiteCode(db,email,code,now)]);
    expect(results.filter(Boolean)).toHaveLength(1);expect(await query('SELECT * FROM siteAccessSessionsV2')).toHaveLength(1);
  });
  it('shortens the session if the authorization itself expires sooner',async()=>{
    const expiry=new Date(now+3600000);expiry.setMilliseconds(0);await query('UPDATE siteAccessEntries SET expiresAt=? WHERE id=1',[expiry]);
    const {result}=await login();expect(result.body.expiresAt).toBe(expiry.getTime());
  });
  it('fails closed when storage is unavailable',async()=>{
    available=false;expect((await request()).status).toBe(503);expect((await session('h2_site_auth='+'a'.repeat(64))).status).toBe(503);expect(delivery).not.toHaveBeenCalled();
  });
  it('makes no customer records and changes no authorization fields while issuing/verifying',async()=>{
    const before=await query('SELECT * FROM siteAccessEntries ORDER BY id');await login();expect(await query('SELECT * FROM siteAccessEntries ORDER BY id')).toEqual(before);
  });
  it('generates only six digits; uniqueness is enforced by reservation, not by chance',async()=>{
    const values=Array.from({length:500},()=>generateOwnSiteCode());expect(values.every(value=>validSiteCode(value)&&value.length===6)).toBe(true);
    const saved=[];for(let i=0;i<25;i++)saved.push((await reserveOwnSiteCode(db,email,now))!.code);
    expect(new Set(saved).size).toBe(25);expect(await query('SELECT * FROM siteAccessCodeLedgerV2')).toHaveLength(25);
  });
});
