// Palavra-chave é uma senha pessoal; CPF e data de nascimento não são segredos.
export function isValidCustomerKeyword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128 && value.trim().length >= 8;
}
