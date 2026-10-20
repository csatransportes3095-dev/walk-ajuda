import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { getDb } from './db';
import { SITE_CODE_ALPHABET, SITE_CODE_LENGTH, SITE_CODE_LIFETIME_MS, SITE_ACCESS_LIFETIME_MS, validSiteCode } from '../shared/siteAccessCodePolicy';

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Executor = Pick<Db, 'execute'>;
type Person = { id: number; email: string; status: string; sessionVersion: number; expiresMs: number | string | null };
export type ReservedSiteCode = { code: string; fingerprint: string; emailKey: string; accessId: number; expiresAt: number };
export type OwnSiteSession = { token: string; expiresAt: number };

function secret(): string {
  const value = process.env.H2_SITE_ACCESS_SECRET || '';
  if (value.length < 32) throw new Error('SITE_CODE_SECRET_UNAVAILABLE');
  return value;
}
export function ownSiteHash(value: string): string { return createHmac('sha256', secret()).update(value).digest('hex'); }
export function ownCodeFingerprint(code: string): string {
  // Stable across signing-key rotation. Never remove this registry on logout, expiry or user removal.
  return createHash('sha256').update('h2-site-code-v2:' + code).digest('hex');
}
export function generateOwnSiteCode(): string {
  return Array.from({length: SITE_CODE_LENGTH}, () => SITE_CODE_ALPHABET[randomInt(SITE_CODE_ALPHABET.length)]).join('');
}
export function ownSiteErrorCode(error: unknown): string {
  let current: unknown = error;
  for (let i=0; current && typeof current==='object' && i<8; i++) {
    const e=current as {code?:unknown; cause?:unknown};
    if (typeof e.code==='string' && /^[A-Z0-9_]{2,64}$/.test(e.code)) return e.code;
    if (e.cause===current) break;
    current=e.cause;
  }
  return 'SITE_CODE_FAILURE';
}
async function rows<T>(db: Executor, statement: ReturnType<typeof sql>): Promise<T[]> {
  const result=await db.execute(statement);
  return result[0] as unknown as T[];
}
const ready = new WeakMap<object, Promise<void>>();
/** Additive only. Old authorization, customer, scheduling and OTP tables are not changed. */
export async function ensureOwnSiteCodeStore(db: Db): Promise<void> {
  let promise=ready.get(db);
  if (!promise) {
    promise=(async()=>{
      await db.execute(sql`CREATE TABLE IF NOT EXISTS siteAccessCodeLedgerV2 (
        fingerprint CHAR(64) NOT NULL PRIMARY KEY,
        emailKey CHAR(64) NOT NULL,
        accessId INT NOT NULL,
        sessionVersion INT NOT NULL,
        codeHash CHAR(64) NOT NULL,
        issuedAt BIGINT NOT NULL,
        expiresAt BIGINT NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        deliveryState VARCHAR(16) NOT NULL,
        channel VARCHAR(16) NULL,
        messageId VARCHAR(255) NULL,
        consumedAt BIGINT NULL,
        INDEX site_code_email (emailKey, issuedAt)
      ) ENGINE=InnoDB`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS siteAccessSessionsV2 (
        sessionHash CHAR(64) NOT NULL PRIMARY KEY,
        emailKey CHAR(64) NOT NULL,
        accessId INT NOT NULL,
        sessionVersion INT NOT NULL,
        createdAt BIGINT NOT NULL,
        expiresAt BIGINT NOT NULL,
        revokedAt BIGINT NULL,
        INDEX site_session_expiry (expiresAt),
        INDEX site_session_access (accessId)
      ) ENGINE=InnoDB`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS siteAccessLimitsV2 (
        limitKey CHAR(64) NOT NULL PRIMARY KEY,
        windowStartedAt BIGINT NOT NULL,
        hits INT NOT NULL
      ) ENGINE=InnoDB`);
    })().catch(error=>{ready.delete(db);throw error;});
    ready.set(db,promise);
  }
  return promise;
}
function active(person: Person | undefined, now: number): person is Person {
  return !!person && person.status==='active' && Number.isSafeInteger(Number(person.id)) && Number(person.id)>0 &&
    (person.expiresMs===null || Number(person.expiresMs)>now);
}
async function personForEmail(db: Executor, email: string, lock=false): Promise<Person | undefined> {
  const found=await rows<Person>(db,sql`SELECT id,email,status,sessionVersion,UNIX_TIMESTAMP(expiresAt)*1000 AS expiresMs
    FROM siteAccessEntries WHERE LOWER(TRIM(email))=${email} LIMIT 2 ${lock?sql`FOR UPDATE`:sql``}`);
  // Do not guess which authorization applies if a legacy database has ambiguous duplicates.
  return found.length===1?found[0]:undefined;
}
/** Returns seconds until the fixed window resets, or zero when allowed. No sliding lockout. */
export async function takeOwnSiteLimit(db: Db, key: string, max: number, windowMs: number, now=Date.now()): Promise<number> {
  await ensureOwnSiteCodeStore(db);
  const hash=ownSiteHash('limit:'+key);
  return db.transaction(async tx=>{
    await tx.execute(sql`INSERT INTO siteAccessLimitsV2 (limitKey,windowStartedAt,hits) VALUES (${hash},${now},1)
      ON DUPLICATE KEY UPDATE hits=IF(windowStartedAt<=${now-windowMs},1,LEAST(hits+1,1000000)),
      windowStartedAt=IF(windowStartedAt<=${now-windowMs},${now},windowStartedAt)`);
    const [row]=await rows<{hits:number;windowStartedAt:number}>(tx,sql`SELECT hits,windowStartedAt FROM siteAccessLimitsV2 WHERE limitKey=${hash} FOR UPDATE`);
    if (!row) throw new Error('SITE_LIMIT_UNAVAILABLE');
    return Number(row.hits)>max?Math.max(1,Math.ceil((Number(row.windowStartedAt)+windowMs-now)/1000)):0;
  });
}
/** This looks up the authorization only. A customer account, order or phone is never required. */
export async function reserveOwnSiteCode(db: Db, email: string, now=Date.now(), generator=generateOwnSiteCode): Promise<ReservedSiteCode|null> {
  await ensureOwnSiteCodeStore(db);
  const normalized=email.trim().toLowerCase();
  const emailKey=ownSiteHash('email:'+normalized);
  for (let attempt=0;attempt<8;attempt++) {
    const code=generator();
    if (!validSiteCode(code)) throw new Error('SITE_GENERATOR_INVALID_OUTPUT');
    const fingerprint=ownCodeFingerprint(code);
    try {
      return await db.transaction(async tx=>{
        const person=await personForEmail(tx,normalized,true);
        if (!active(person,now)) return null;
        const expiresAt=Math.min(now+SITE_CODE_LIFETIME_MS,person.expiresMs===null?Infinity:Number(person.expiresMs));
        await tx.execute(sql`INSERT INTO siteAccessCodeLedgerV2
          (fingerprint,emailKey,accessId,sessionVersion,codeHash,issuedAt,expiresAt,attempts,deliveryState)
          VALUES (${fingerprint},${emailKey},${person.id},${person.sessionVersion},${ownSiteHash('otp:'+normalized+':'+code)},${now},${expiresAt},0,'pending')`);
        return {code,fingerprint,emailKey,accessId:Number(person.id),expiresAt};
      });
    } catch(error) {
      if (ownSiteErrorCode(error)!=='ER_DUP_ENTRY') throw error;
      // The persistent primary key prevents repetition globally, including concurrent generators.
    }
  }
  throw new Error('SITE_CODE_UNIQUENESS_RETRY_EXHAUSTED');
}
export async function finishOwnSiteCodeDelivery(db: Db, fingerprint: string, outcome: {channel:'smtp'|'resend';messageId:string}|null): Promise<void> {
  await db.execute(sql`UPDATE siteAccessCodeLedgerV2 SET deliveryState=${outcome?'accepted':'failed'},
    channel=${outcome?.channel??null},messageId=${outcome?.messageId.slice(0,255)??null}
    WHERE fingerprint=${fingerprint} AND deliveryState='pending'`);
}
/** Accept an exact email-bound code once; lock authorization and consume atomically with session creation. */
export async function consumeOwnSiteCode(db: Db, email: string, code: string, now=Date.now()): Promise<OwnSiteSession|null> {
  if (!validSiteCode(code)) return null;
  await ensureOwnSiteCodeStore(db);
  const normalized=email.trim().toLowerCase(), emailKey=ownSiteHash('email:'+normalized);
  return db.transaction(async tx=>{
    const person=await personForEmail(tx,normalized,true);
    if (!active(person,now)) return null;
    const [record]=await rows<{codeHash:string;fingerprint:string;accessId:number;sessionVersion:number;attempts:number;expiresAt:number;consumedAt:number|null;deliveryState:string}>(tx,
      sql`SELECT codeHash,fingerprint,accessId,sessionVersion,attempts,expiresAt,consumedAt,deliveryState
        FROM siteAccessCodeLedgerV2 WHERE fingerprint=${ownCodeFingerprint(code)} AND emailKey=${emailKey} FOR UPDATE`);
    const expected=Buffer.from(ownSiteHash('otp:'+normalized+':'+code),'hex');
    const actual=Buffer.from(record?.codeHash??'','hex');
    const valid=record && actual.length===expected.length && timingSafeEqual(actual,expected) &&
      Number(record.accessId)===Number(person.id) && Number(record.sessionVersion)===Number(person.sessionVersion) &&
      record.deliveryState==='accepted' && record.consumedAt===null && Number(record.attempts)<5 && Number(record.expiresAt)>now;
    if (!valid) {
      await tx.execute(sql`UPDATE siteAccessCodeLedgerV2 SET attempts=LEAST(attempts+1,5)
        WHERE emailKey=${emailKey} AND deliveryState='accepted' AND consumedAt IS NULL AND expiresAt>${now}`);
      return null;
    }
    // A successful login also consumes older, still-arriving codes for this email.
    // Failed delivery never invalidates a previously usable code.
    await tx.execute(sql`UPDATE siteAccessCodeLedgerV2 SET consumedAt=${now}
      WHERE emailKey=${emailKey} AND consumedAt IS NULL AND deliveryState IN ('accepted','pending')`);
    const token=randomBytes(32).toString('hex');
    const expiresAt=Math.min(now+SITE_ACCESS_LIFETIME_MS,person.expiresMs===null?Infinity:Number(person.expiresMs));
    await tx.execute(sql`INSERT INTO siteAccessSessionsV2 (sessionHash,emailKey,accessId,sessionVersion,createdAt,expiresAt,revokedAt)
      VALUES (${ownSiteHash('session:'+token)},${emailKey},${person.id},${person.sessionVersion},${now},${expiresAt},NULL)`);
    return {token,expiresAt};
  });
}
export async function readOwnSiteSession(db: Db, token: string, now=Date.now()): Promise<{expiresAt:number}|null> {
  // Legacy twelve-hour JWT cookies are not silently upgraded to the new policy.
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  await ensureOwnSiteCodeStore(db);
  const [row]=await rows<{email:string;emailKey:string;expiresAt:number;createdAt:number}>(db,sql`
    SELECT a.email,s.emailKey,s.expiresAt,s.createdAt FROM siteAccessSessionsV2 s
    INNER JOIN siteAccessEntries a ON a.id=s.accessId AND a.sessionVersion=s.sessionVersion
    WHERE s.sessionHash=${ownSiteHash('session:'+token)} AND s.revokedAt IS NULL
      AND s.expiresAt>${now} AND s.createdAt>${now-SITE_ACCESS_LIFETIME_MS}
      AND a.status='active' AND (a.expiresAt IS NULL OR UNIX_TIMESTAMP(a.expiresAt)*1000>${now}) LIMIT 1`);
  if (!row || row.emailKey!==ownSiteHash('email:'+row.email.trim().toLowerCase())) return null;
  return {expiresAt:Number(row.expiresAt)};
}
export async function revokeOwnSiteSession(db: Db, token: string, now=Date.now()): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  await ensureOwnSiteCodeStore(db);
  await db.execute(sql`UPDATE siteAccessSessionsV2 SET revokedAt=${now} WHERE sessionHash=${ownSiteHash('session:'+token)} AND revokedAt IS NULL`);
}
