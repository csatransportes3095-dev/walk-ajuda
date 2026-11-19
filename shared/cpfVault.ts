import { isValidCPF, normalizeCpf } from "./cpf";

export const CPF_VAULT_BATCH_LIMIT = 2000;
export const CPF_VAULT_TEXT_LIMIT = 64_000;

export type CpfVaultRecord = {
  id: number;
  normalizedCpf: string;
  registrationId: number | null;
  subOrderIndex: number;
  orderRootId: number | null;
  customerId: number | null;
  customerName: string | null;
  customerNumber: number | null;
  orderNumber: number | null;
  note: string | null;
  createdAt: string;
};

/** Punctuation is optional; labels/letters are not silently turned into a CPF. */
export function validCpfVaultValue(value: string): string | null {
  if (!/^[\d.\s-]+$/.test(value)) return null;
  const cpf = normalizeCpf(value);
  return isValidCPF(cpf) ? cpf : null;
}

/** A paste never truncates a CPF or silently discards an invalid item. */
export function parseCpfVaultBatch(text: string): {
  cpfs: string[];
  invalid: string[];
  duplicateCount: number;
  total: number;
} {
  if (text.length > CPF_VAULT_TEXT_LIMIT) {
    throw new Error("A lista excede o limite de 64.000 caracteres.");
  }
  const tokens = text.split(/[\n\r,;\t]+/).flatMap(part => {
    const value = part.trim();
    if (!value) return [];
    // Also accept spacing inside one CPF, without joining separate CPF entries.
    if (/^[\d.\s-]+$/.test(value) && normalizeCpf(value).length === 11) return [value];
    return value.split(/\s+/).filter(Boolean);
  });
  if (tokens.length > CPF_VAULT_BATCH_LIMIT) {
    throw new Error("Consulte ou cadastre no máximo 2.000 CPFs por vez.");
  }
  const seen = new Set<string>();
  const invalid: string[] = [];
  let duplicateCount = 0;
  for (const token of tokens) {
    const cpf = validCpfVaultValue(token);
    if (!cpf) invalid.push(token);
    else if (seen.has(cpf)) duplicateCount += 1;
    else seen.add(cpf);
  }
  const cpfs = [...seen];
  return { cpfs, invalid, duplicateCount, total: cpfs.length };
}
