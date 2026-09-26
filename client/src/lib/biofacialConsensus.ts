export type BiofacialConsensusInput = {
  embeddingRaw: number;
  geometryScore: number;
  criticalMean: number;
  globalScore: number;
  eyesScore: number;
  browsScore: number;
  noseScore: number;
  ovalScore: number;
  cheeksScore: number;
  jawScore: number;
  chinScore: number;
  mouthScore: number;
  proportionsScore: number;
  measurementsScore: number;
  structureScore: number;
  symmetryScore: number;
};

export type BiofacialConsensusResult = {
  similarityScore: number;
  embeddingVisualScore: number;
  morphologyScore: number;
  geometryConsensusScore: number;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function weightedMean(entries: Array<[number, number]>) {
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  return clamp(entries.reduce((sum, [value, weight]) => sum + clamp(value) * weight, 0) / totalWeight);
}

export function calibrateEmbeddingForSimilarity(raw: number) {
  const r = Math.max(0, Math.min(1, raw));
  return clamp(100 / (1 + Math.exp(-(r - 0.25) / 0.12)));
}

export function calculateBiofacialConsensus(input: BiofacialConsensusInput): BiofacialConsensusResult {
  const embeddingVisualScore = calibrateEmbeddingForSimilarity(input.embeddingRaw);

  // A nota principal mede parecenca visual/morfologica, nao identidade.
  // Os pesos somam 100% e privilegiam estruturas perceptiveis do rosto.
  const morphologyScore = weightedMean([
    [input.globalScore, 0.06],
    [input.eyesScore, 0.10],
    [input.browsScore, 0.07],
    [input.noseScore, 0.11],
    [input.mouthScore, 0.10],
    [input.ovalScore, 0.10],
    [input.cheeksScore, 0.08],
    [input.jawScore, 0.08],
    [input.chinScore, 0.07],
    [input.proportionsScore, 0.08],
    [input.measurementsScore, 0.10],
    [input.structureScore, 0.05],
  ]);

  const geometryConsensusScore = clamp(
    morphologyScore * 0.70 +
    input.criticalMean * 0.20 +
    input.geometryScore * 0.10
  );

  // O embedding e apenas apoio. Mesmo um embedding muito alto nao pode
  // transformar uma morfologia moderada em 90%+.
  let similarityScore = clamp(
    morphologyScore * 0.87 +
    geometryConsensusScore * 0.10 +
    embeddingVisualScore * 0.03
  );

  const structural = [
    input.eyesScore,
    input.browsScore,
    input.noseScore,
    input.mouthScore,
    input.ovalScore,
    input.cheeksScore,
    input.jawScore,
    input.chinScore,
    input.measurementsScore,
  ];
  const severeCount = structural.filter((score) => score < 30).length;
  const weakCount = structural.filter((score) => score < 45).length;

  if (severeCount >= 3) similarityScore -= 8;
  else if (severeCount >= 2) similarityScore -= 5;

  if (weakCount >= 4) similarityScore -= 4;
  else if (weakCount >= 3) similarityScore -= 2;

  // Tetos morfologicos impedem que o embedding domine comparacoes pouco parecidas.
  if (morphologyScore < 45) similarityScore = Math.min(similarityScore, 50);
  else if (morphologyScore < 55) similarityScore = Math.min(similarityScore, 60);
  else if (morphologyScore < 65) similarityScore = Math.min(similarityScore, 70);

  return {
    similarityScore: clamp(similarityScore),
    embeddingVisualScore,
    morphologyScore,
    geometryConsensusScore,
  };
}
