/**
 * Limiar operacional único do comparador H2.
 * Altera apenas a classificação, a exibição e a triagem de diagnósticos.
 * O cálculo do embedding TFLite e o percentual retornado não são modificados.
 */
export const H2_FACE_MINIMUM_PERCENT = 75;
export const H2_FACE_MINIMUM_RELIABILITY = 60;

export function normalizeH2FaceMinimum(value: number | null | undefined): number {
  return Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : H2_FACE_MINIMUM_PERCENT));
}

export function meetsH2FaceMinimum(score: number | null | undefined, minimum = H2_FACE_MINIMUM_PERCENT): boolean {
  return typeof score === "number" && Number.isFinite(score) && score >= normalizeH2FaceMinimum(minimum);
}

/**
 * Um percentual alto com foto ruim não recebe indicação visual de qualidade.
 * O índice numérico pode ser exibido para conferência manual.
 */
export function canHighlightH2Face(
  score: number | null | undefined,
  reliability: number | null | undefined,
  minimum = H2_FACE_MINIMUM_PERCENT,
): boolean {
  return meetsH2FaceMinimum(score, minimum) &&
    typeof reliability === "number" &&
    Number.isFinite(reliability) &&
    reliability >= H2_FACE_MINIMUM_RELIABILITY;
}

/** Fotos do H2BICO abaixo de 75% não precisam da segunda leitura geométrica.
 * O score principal já é definitivo, logo elas não podem entrar no ranking.
 * Um valor inválido nunca é descartado silenciosamente.
 */
export function needsDetailedH2BicoAnalysis(score: number, minimum = H2_FACE_MINIMUM_PERCENT): boolean {
  return !Number.isFinite(score) || meetsH2FaceMinimum(score, minimum);
}
