import { sql } from "drizzle-orm";
import { isValidCustomerBirthDate } from "../shared/customerBirthDate";

// Separate from public customer identity lookups: never return the date in
// unauthenticated phone/CPF queries, referral results or session payloads.
const initialization = new WeakMap<object, Promise<void>>();

export async function ensureCustomerBirthDateTable(db: any): Promise<void> {
  if (!db) throw new Error("Banco indisponível.");
  let pending = initialization.get(db);
  if (!pending) {
    pending = (async () => {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS customerBirthDates (
        customerId INT NOT NULL PRIMARY KEY,
        birthDate CHAR(10) NOT NULL,
        CONSTRAINT fk_customerBirthDates_customer FOREIGN KEY (customerId)
          REFERENCES customers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`);
    })();
    initialization.set(db, pending);
  }
  try { await pending; } catch (error) {
    initialization.delete(db);
    throw error;
  }
}

export async function readCustomerBirthDate(db: any, customerId: number): Promise<string | null> {
  const result = await db.execute(sql`SELECT birthDate FROM customerBirthDates WHERE customerId=${customerId} LIMIT 1`);
  const date = result?.[0]?.[0]?.birthDate;
  return isValidCustomerBirthDate(date) ? date : null;
}

// A concurrent submission must never overwrite a date already registered.
export async function saveCustomerBirthDate(db: any, customerId: number, date: string): Promise<void> {
  if (!isValidCustomerBirthDate(date)) throw new Error("Informe uma data de nascimento válida.");
  await db.execute(sql`INSERT INTO customerBirthDates (customerId,birthDate)
    VALUES (${customerId},${date}) ON DUPLICATE KEY UPDATE customerId=customerId`);
}

// The audit table is only initialized at boot or before an ADM correction,
// never as part of a public CPF login or within a transaction (DDL can commit).
const adminAuditInitialization = new WeakMap<object, Promise<void>>();

export async function ensureAdminCustomerBirthDateAuditTable(db: any): Promise<void> {
  await ensureCustomerBirthDateTable(db);
  let pending = adminAuditInitialization.get(db);
  if (!pending) {
    pending = (async () => {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS customerBirthDateAdminAudit (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        customerId INT NOT NULL,
        adminSubject VARCHAR(255) NOT NULL,
        action ENUM('created','corrected') NOT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_customerBirthDateAdminAudit_customer (customerId,createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    })();
    adminAuditInitialization.set(db, pending);
  }
  try { await pending; } catch (error) {
    adminAuditInitialization.delete(db);
    throw error;
  }
}

/**
 * ADM only: the caller must authenticate the admin and use an active
 * transaction. Keep the normal customer save insert-only. Do not record
 * birth dates, CPF or session tokens in the audit trail.
 */
export async function correctCustomerBirthDateByAdmin(
  tx: any, customerId: number, date: string, adminSubject: string,
): Promise<boolean> {
  if (!isValidCustomerBirthDate(date)) throw new Error("Informe uma data de nascimento válida.");
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new Error("Cliente inválido.");
  if (typeof adminSubject !== "string" || !adminSubject.trim() || adminSubject.length > 255) {
    throw new Error("Administrador não identificado.");
  }
  const customer = await tx.execute(sql`SELECT id FROM customers
    WHERE id=${customerId} AND deletedAt IS NULL FOR UPDATE`);
  if (!customer?.[0]?.[0]) throw new Error("Cliente não encontrado.");
  const result = await tx.execute(sql`SELECT birthDate FROM customerBirthDates
    WHERE customerId=${customerId} FOR UPDATE`);
  const previous = result?.[0]?.[0];
  if (previous?.birthDate === date) return false;

  await tx.execute(sql`INSERT INTO customerBirthDates (customerId,birthDate)
    VALUES (${customerId},${date}) ON DUPLICATE KEY UPDATE birthDate=${date}`);
  await tx.execute(sql`INSERT INTO customerBirthDateAdminAudit (customerId,adminSubject,action)
    VALUES (${customerId},${adminSubject},${previous ? "corrected" : "created"})`);
  return true;
}
