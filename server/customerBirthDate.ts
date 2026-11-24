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
