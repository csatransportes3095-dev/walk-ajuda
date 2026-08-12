/**
 * Normaliza CPF sem decidir se ele é válido.
 * Deve ser usada antes de persistir, comparar ou exibir a identificação.
 */
export function normalizeCpf(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Validação matemática oficial do CPF brasileiro.
 * Rejeita formatos incompletos, sequências repetidas e dígitos verificadores incorretos.
 */
export function isValidCPF(value: unknown): boolean {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (base: string, factor: number): number => {
    let sum = 0;
    for (const digit of base) sum += Number(digit) * factor--;
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };

  const firstDigit = calculateDigit(cpf.slice(0, 9), 10);
  const secondDigit = calculateDigit(cpf.slice(0, 9) + firstDigit, 11);
  return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
}

export function formatCPF(value: unknown): string {
  const cpf = normalizeCpf(value).slice(0, 11);
  return cpf
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
