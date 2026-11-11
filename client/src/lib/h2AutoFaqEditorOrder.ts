/**
 * Apenas ordem visual durante a edicao no ADM do H2 AUTO.
 * A lista usada para salvar continua na ordem original, com novas perguntas no final.
 */
export function displayH2AutoFaqWithDraftFirst<T extends { id: string }>(
  faq: readonly T[],
  newDraftId?: string | null,
): T[] {
  const ordered = [...faq];
  if (!newDraftId) return ordered;
  const draftIndex = ordered.findIndex(item => item.id === newDraftId);
  if (draftIndex < 0) return ordered;
  const [draft] = ordered.splice(draftIndex, 1);
  ordered.unshift(draft);
  return ordered;
}
