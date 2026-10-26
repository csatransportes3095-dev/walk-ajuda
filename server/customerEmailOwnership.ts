import { sql } from "drizzle-orm";

/**
 * A mailbox belongs to a single active customer, regardless of its casing or
 * whitespace in older rows. Never infer ownership from an email OTP alone.
 *
 * Uses original customers.email instead of trusting normalizedEmail, because
 * older rows may not have been backfilled or might predate that column.
 * Database failures deliberately propagate (fail closed before sending codes).
 */
export async function emailBelongsToAnotherCustomer(
  db: any,
  emailInput: string,
  allowedCustomerId: number | null = null,
): Promise<boolean> {
  const email = String(emailInput || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("E-mail inválido.");
  const result: any = allowedCustomerId == null
    ? await db.execute(sql`SELECT id FROM customers
        WHERE deletedAt IS NULL AND LOWER(TRIM(email)) = ${email} LIMIT 1`)
    : await db.execute(sql`SELECT id FROM customers
        WHERE deletedAt IS NULL AND LOWER(TRIM(email)) = ${email}
          AND id <> ${allowedCustomerId} LIMIT 1`);
  const rows = Array.isArray(result?.[0]) ? result[0] : [];
  return rows.length > 0;
}

export const CUSTOMER_EMAIL_IN_USE_MESSAGE =
  "Este e-mail já está vinculado a outro cadastro. Confira o telefone informado.";
