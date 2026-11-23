/**
 * "Com CPF" significa CPF preenchido com 11 dígitos (aceita pontuação).
 * Não valida a autenticidade do número: o filtro serve apenas para excluir
 * cadastros incompletos, sem expor o documento ao navegador.
 */
export function hasRegisteredCpf(value: string | null | undefined): boolean {
  return String(value || "").replace(/\D/g, "").length === 11;
}
