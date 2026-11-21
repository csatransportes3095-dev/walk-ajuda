/**
 * Não tratar "NÃO TENHO CUPOM" como resposta "NÃO" de outra pergunta.
 * Somente uma opção completa e pertencente à pergunta clicada pode bloquear.
 */
function normalizeBlockingText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

export function matchExactBlockingOption<T extends { label: string }>(
  clickedLabel: string,
  options: readonly T[],
): T | undefined {
  const clicked = normalizeBlockingText(clickedLabel);
  if (!clicked) return undefined;
  return options.find(option => normalizeBlockingText(option.label) === clicked);
}

export function readBotQuestionId(rawValue: string | null | undefined): number | null {
  if (!rawValue || !/^[1-9]\d*$/.test(rawValue)) return null;
  const id = Number(rawValue);
  return Number.isSafeInteger(id) ? id : null;
}
