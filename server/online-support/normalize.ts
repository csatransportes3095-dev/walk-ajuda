export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\.,\/#!$%\^&\*;:{}=\-_`~()\[\]\?"'<>|+]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
}

export function fuzzyIncludes(text: string, candidate: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedCandidate = normalizeText(candidate);

  if (!normalizedText || !normalizedCandidate) return false;
  if (normalizedText.includes(normalizedCandidate)) return true;

  const textTokens = normalizedText.split(" ").filter(Boolean);
  const candidateTokens = normalizedCandidate.split(" ").filter(Boolean);

  if (!textTokens.length || !candidateTokens.length) return false;

  const hits = candidateTokens.filter(token => {
    if (token.length <= 2) return textTokens.includes(token);

    return textTokens.some(t => {
      if (t.includes(token) || token.includes(t)) return true;
      const dist = levenshteinDistance(t, token);
      return dist <= 1;
    });
  }).length;

  return hits >= Math.max(1, Math.ceil(candidateTokens.length * 0.6));
}
