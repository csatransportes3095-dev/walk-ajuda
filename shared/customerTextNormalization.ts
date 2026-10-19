/**
 * Canonical formatting for CUSTOMER REGISTRATION DESCRIPTIVE TEXT only.
 * Do not apply to email, passwords, phone, CPF, CEP, photos, URLs or IDs.
 * Example: "Maurício José Gonçalves" -> "MAURICIO JOSE GONCALVES".
 */
export function normalizeCustomerText(value: string): string {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export const CUSTOMER_TEXT_KEYS = [
  "name", "street", "addressNumber", "neighborhood",
  "addressComplement", "city", "uf", "referredBy",
] as const;

export type CustomerTextKey = typeof CUSTOMER_TEXT_KEYS[number];
export type CustomerTextRecord = Record<CustomerTextKey, string | null>;

export function normalizedCustomerTextRecord(row: CustomerTextRecord): CustomerTextRecord {
  return {
    name: row.name === null ? null : normalizeCustomerText(row.name),
    street: row.street === null ? null : normalizeCustomerText(row.street),
    addressNumber: row.addressNumber === null ? null : normalizeCustomerText(row.addressNumber),
    neighborhood: row.neighborhood === null ? null : normalizeCustomerText(row.neighborhood),
    addressComplement: row.addressComplement === null ? null : normalizeCustomerText(row.addressComplement),
    city: row.city === null ? null : normalizeCustomerText(row.city),
    uf: row.uf === null ? null : normalizeCustomerText(row.uf),
    referredBy: row.referredBy === null ? null : normalizeCustomerText(row.referredBy),
  };
}

export function hasCustomerTextDifferences(before: CustomerTextRecord, after: CustomerTextRecord): boolean {
  return CUSTOMER_TEXT_KEYS.some(key => before[key] !== after[key]);
}
