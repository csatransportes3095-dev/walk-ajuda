import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { isValidCustomerKeyword } from "../shared/customerKeyword";
import { isValidCustomerBirthDate } from "../shared/customerBirthDate";
import { ensureCustomerBirthDateTable, readCustomerBirthDate } from "./customerBirthDate";

const schemas = new WeakMap<object, Promise<void>>();
export async function ensureCustomerKeywordTables(db: any): Promise<void> {
  await ensureCustomerBirthDateTable(db);
  let ready = schemas.get(db);
  if (!ready) {
    ready = (async () => {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS customerKeywordCredentials (
        customerId INT NOT NULL PRIMARY KEY,
        keywordHash VARCHAR(255) NULL,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS customerAuthSessionProofs (
        tokenHash CHAR(64) NOT NULL PRIMARY KEY,
        customerId INT NOT NULL,
        authMethod VARCHAR(16) NOT NULL,
        verifiedAt BIGINT NOT NULL,
        expiresAt BIGINT NOT NULL,
        KEY idx_customerAuthProof_customer (customerId),
        KEY idx_customerAuthProof_expiry (expiresAt)
      ) ENGINE=InnoDB`);
    })();
    schemas.set(db, ready);
  }
  try { await ready; } catch (error) { schemas.delete(db); throw error; }
}
function derive(value: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve,reject) => scrypt(value, salt, 64, {N:32768,r:8,p:1,maxmem:64*1024*1024}, (error,key) => error ? reject(error) : resolve(key)));
}
export async function hashCustomerKeyword(value: string): Promise<string> {
  if (!isValidCustomerKeyword(value)) throw new Error("A palavra-chave deve ter de 8 a 128 caracteres.");
  const salt = randomBytes(24);
  return "scrypt-v1:" + salt.toString("hex") + ":" + (await derive(value,salt)).toString("hex");
}
export async function matchesCustomerKeyword(value: string, hash: unknown): Promise<boolean> {
  if (!isValidCustomerKeyword(value) || typeof hash !== "string") return false;
  const match = /^scrypt-v1:([a-f0-9]{48}):([a-f0-9]{128})$/.exec(hash);
  if (!match) return false;
  return timingSafeEqual(await derive(value, Buffer.from(match[1],"hex")), Buffer.from(match[2],"hex"));
}
export async function readCustomerSecurity(db: any, customerId: number, lock = false) {
  const result = await db.execute(lock
    ? sql`SELECT keywordHash FROM customerKeywordCredentials WHERE customerId=${customerId} FOR UPDATE`
    : sql`SELECT keywordHash FROM customerKeywordCredentials WHERE customerId=${customerId}`);
  const credential = result?.[0]?.[0];
  const birthDate = await readCustomerBirthDate(db, customerId);
  // A date captured during registration is not trusted for authentication until
  // its owner confirms it during OTP-protected enrollment.
  const birthDateRegistered = !!credential && isValidCustomerBirthDate(birthDate);
  const keywordHash = birthDateRegistered && typeof credential.keywordHash === "string" ? credential.keywordHash : null;
  return { birthDate, birthDateRegistered, keywordHash, keywordRegistered: !!keywordHash };
}
export async function writeCustomerSecurity(tx: any, customerId: number, birthDate: string | undefined, keywordHash: string): Promise<void> {
  const current = await readCustomerSecurity(tx,customerId,true);
  if (!current.birthDateRegistered) {
    if (!isValidCustomerBirthDate(birthDate)) throw new Error("Informe uma data de nascimento válida.");
    await tx.execute(sql`INSERT INTO customerBirthDates (customerId,birthDate) VALUES (${customerId},${birthDate})
      ON DUPLICATE KEY UPDATE birthDate=${birthDate}`);
  }
  await tx.execute(sql`INSERT INTO customerKeywordCredentials (customerId,keywordHash) VALUES (${customerId},${keywordHash})
    ON DUPLICATE KEY UPDATE keywordHash=${keywordHash}, updatedAt=NOW()`);
}
