export const H2ADS_NAME_MIN_LENGTH = 2;

export function validateH2AdsName(value: string, entity: "grupo" | "instância"): string | null {
  if (value.trim().length >= H2ADS_NAME_MIN_LENGTH) return null;
  return `Informe um nome de ${entity} com pelo menos ${H2ADS_NAME_MIN_LENGTH} caracteres.`;
}
