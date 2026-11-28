import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { ValidraPayClient, validraAmount } from "./validraPay";

export async function ensureValidraAttemptStorage() {
  const db = await getDb();
  if (!db) throw new Error("validra_database_unavailable");
  await db.execute(sql`CREATE TABLE IF NOT EXISTS validra_checkout_attempts (
    external_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    customer_id INT NOT NULL,
    purchase_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount_cents BIGINT UNSIGNED NOT NULL,
    charge_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin UNIQUE,
    registration_id INT UNIQUE,
    state VARCHAR(24) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  return db;
}

// Only accept immutable, server-priced purchase snapshots from authenticated checkout.
export async function reserveValidraAttempt(input: { externalId: string; customerId: number; purchaseDigest: string; amountCents: number }) {
  validraAmount(input.amountCents);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.externalId) || !/^[a-f0-9]{64}$/.test(input.purchaseDigest) || !Number.isSafeInteger(input.customerId) || input.customerId <= 0) throw new Error("validra_invalid_attempt");
  const db = await ensureValidraAttemptStorage();
  await db.execute(sql`INSERT INTO validra_checkout_attempts (external_id, customer_id, purchase_digest, amount_cents)
    VALUES (${input.externalId}, ${input.customerId}, ${input.purchaseDigest}, ${input.amountCents})
    ON DUPLICATE KEY UPDATE external_id = external_id`);
  const [rows] = await db.execute(sql`SELECT external_id, customer_id, purchase_digest, amount_cents, charge_id, registration_id, state FROM validra_checkout_attempts WHERE external_id = ${input.externalId}`);
  const row = (rows as unknown as Array<{customer_id: number; purchase_digest: string; amount_cents: string | number; charge_id: string | null; registration_id: number | null; state: string}>)[0];
  if (!row || Number(row.customer_id) !== input.customerId || row.purchase_digest !== input.purchaseDigest || Number(row.amount_cents) !== input.amountCents) throw new Error("validra_attempt_conflict");
  return row;
}

/** Server-only reconciliation of an existing immutable attempt. Does not fulfill orders. */
export async function reconcileValidraAttempt(externalId: string, customerId: number, client = new ValidraPayClient()) {
  const db = await ensureValidraAttemptStorage();
  const [rows] = await db.execute(sql`SELECT amount_cents, charge_id, state FROM validra_checkout_attempts WHERE external_id = ${externalId} AND customer_id = ${customerId}`);
  const row = (rows as unknown as Array<{amount_cents: string | number; charge_id: string | null; state: string}>)[0];
  if (!row) throw new Error("validra_attempt_not_found");
  const attempt = { externalId, amountCents: Number(row.amount_cents) };
  const charge = row.charge_id ? await client.getCharge({...attempt, chargeId: row.charge_id}) : await client.getChargeByExternalId(attempt);
  await db.execute(sql`UPDATE validra_checkout_attempts SET charge_id = ${charge.id}
    WHERE external_id = ${externalId} AND customer_id = ${customerId}
    AND (charge_id IS NULL OR charge_id = ${charge.id})`);
  const [bound] = await db.execute(sql`SELECT charge_id FROM validra_checkout_attempts WHERE external_id = ${externalId} AND customer_id = ${customerId}`);
  if ((bound as unknown as Array<{charge_id: string}>)[0]?.charge_id !== charge.id) throw new Error("validra_charge_conflict");
  const paid = await client.confirmPaid({...attempt, chargeId: charge.id});
  return { chargeId: charge.id, confirmedPaid: paid !== null };
}
