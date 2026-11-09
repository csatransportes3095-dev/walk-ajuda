/**
 * Regras de pré-validação do extrator em lote do Cofre da Frota.
 * A validação definitiva permanece no servidor (vehicleVault.save).
 */
export const MAX_PDFS_PER_BATCH = 20;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type VaultFieldKey =
  | "plate" | "renavam" | "chassis" | "model" | "color" | "manufactureYear" | "modelYear" | "category" | "exerciseYear";
export type VaultFields = Record<VaultFieldKey, string>;

export const VAULT_FIELDS: ReadonlyArray<readonly [VaultFieldKey, string]> = [
  ["plate", "PLACA"], ["renavam", "RENAVAM"], ["chassis", "CHASSI"],
  ["model", "MARCA / MODELO"], ["color", "COR"],
  ["manufactureYear", "ANO FABRICAÇÃO"], ["modelYear", "ANO DO MODELO"],
  ["category", "CATEGORIA"], ["exerciseYear", "EXERCÍCIO"],
];

export function checkBatchPdf(file: { name: string; size: number }): string | null {
  if (!/\.pdf$/i.test(file.name)) return "Arquivo inválido: selecione somente PDFs.";
  if (!file.size || file.size > MAX_PDF_BYTES) return "PDF vazio ou acima de 10 MB.";
  return null;
}

export function normalizedBatchPlate(value: string): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function fieldsFromPdf(result: {
  plate: string; renavam: string; chassis: string; model: string; color: string;
  manufactureYear: number | null; modelYear: number | null;
  category?: string; exerciseYear?: number | null;
}): VaultFields {
  return {
    plate: result.plate || "",
    renavam: result.renavam || "",
    chassis: result.chassis || "",
    model: result.model || "",
    color: result.color || "",
    manufactureYear: result.manufactureYear ? String(result.manufactureYear) : "",
    modelYear: result.modelYear ? String(result.modelYear) : "",
    category: result.category || "",exerciseYear: result.exerciseYear ? String(result.exerciseYear) : "",
  };
}

export function validateBatchFields(fields: VaultFields): string[] {
  const issues: string[] = [];
  const missing = VAULT_FIELDS.slice(0,7).filter(([key]) => !fields[key].trim()).map(([, label]) => label);
  if (missing.length) return ["Preencha: " + missing.join(", ")];

  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizedBatchPlate(fields.plate)))
    issues.push("Placa inválida.");
  if (!/^\d{9,11}$/.test(fields.renavam.replace(/\D/g, "")))
    issues.push("Renavam deve ter de 9 a 11 dígitos.");
  if (!/^[A-Z0-9]{8,30}$/.test(fields.chassis.toUpperCase().replace(/[^A-Z0-9]/g, "")))
    issues.push("Chassi inválido.");
  for (const [key, label] of [
    ["manufactureYear", "Ano fabricação"],
    ["modelYear", "Ano do modelo"],
  ] as const) {
    const value = fields[key].trim();
    if (!/^\d{4}$/.test(value) || Number(value) < 1900 || Number(value) > 2100)
      issues.push(label + " inválido.");
  }
  const category=fields.category.trim().toUpperCase();
  if(category && category!=="PARTICULAR" && category!=="ALUGUEL")issues.push("Categoria inválida.");
  const exercise=fields.exerciseYear.trim();
  if(exercise && (!/^\d{4}$/.test(exercise) || Number(exercise)<1900 || Number(exercise)>2100))issues.push("Exercício inválido.");
  return issues;
}

/** Identifica placas repetidas no próprio lote antes de salvar. */
export function duplicatedBatchPlates(
  items: ReadonlyArray<{ status: string; fields: VaultFields }>
): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (item.status === "error" || item.status === "queued" || item.status === "reading") continue;
    const plate = normalizedBatchPlate(item.fields.plate);
    if (!plate) continue;
    if (seen.has(plate)) duplicates.add(plate);
    seen.add(plate);
  }
  return duplicates;
}
