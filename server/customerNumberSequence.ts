import { sql } from "drizzle-orm";

export const CUSTOMER_NUMBER_SEQUENCE_START = 470;
export const RESERVED_CUSTOMER_NUMBER = 99999;

export function pickNextCustomerNumber(
  rows: Array<{ customerNumber?: number | string | null }>,
): number {
  const used = new Set(
    rows
      .map((row) => Number(row.customerNumber))
      .filter(
        (value) =>
          Number.isInteger(value) &&
          value >= CUSTOMER_NUMBER_SEQUENCE_START &&
          value !== RESERVED_CUSTOMER_NUMBER,
      ),
  );

  let next = CUSTOMER_NUMBER_SEQUENCE_START;
  while (used.has(next) || next === RESERVED_CUSTOMER_NUMBER) next += 1;
  return next;
}

/**
 * Fonte única da sequência oficial de cadastro.
 * Ignora números manuais altos para não pular a sequência normal e preserva
 * números já usados, inclusive de cadastros arquivados/lixeira.
 */
export async function generateNextCustomerNumber(db: any): Promise<number> {
  const result = await db.execute(sql`
    SELECT customerNumber
    FROM customers
    WHERE customerNumber IS NOT NULL
      AND customerNumber >= ${CUSTOMER_NUMBER_SEQUENCE_START}
      AND customerNumber <> ${RESERVED_CUSTOMER_NUMBER}
    ORDER BY customerNumber ASC
  `);

  const rows = (
    Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : []
  ) as Array<{ customerNumber?: number | string | null }>;

  return pickNextCustomerNumber(rows);
}
