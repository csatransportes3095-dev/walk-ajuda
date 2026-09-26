export type BiofacialConsensusInput = {
  embeddingRaw: number;
  geometryScore: number;
  criticalMean: number;
  globalScore: number;
  eyesScore: number;
  noseScore: number;
  ovalScore: number;
  cheeksScore: number;
  jawScore: number;
  chinScore: number;
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

  const morphologyScore = weightedMean([
    [input.globalScore, 0.08],
    [input.eyesScore, 0.12],
    [input.noseScore, 0.12],
    [input.ovalScore, 0.10],
    [input.cheeksScore, 0.10],
    [input.jawScore, 0.10],
    [input.chinScore, 0.08],
    [input.proportionsScore, 0.10],
    [input.measurementsScore, 0.12],
    [input.structureScore, 0.06],
    [input.symmetryScore, 0.02],
  ]);

  const geometryConsensusScore = clamp(
    input.criticalMean * 0.45 +
    morphologyScore * 0.40 +
    input.geometryScore * 0.15
  );

  let similarityScore = clamp(
    embeddingVisualScore * 0.60 +
    geometryConsensusScore * 0.40
  );

  const gap = Math.abs(embeddingVisualScore - geometryConsensusScore);
  if (embeddingVisualScore >= 65 && geometryConsensusScore >= 60 && gap <= 18) {
    similarityScore += 2.5;
  }

  const structural = [
    input.noseScore,
    input.ovalScore,
    input.cheeksScore,
    input.jawScore,
    input.chinScore,
    input.measurementsScore,
    input.structureScore,
  ];
  const severeCount = structural.filter((score) => score < 30).length;
  const weakCount = structural.filter((score) => score < 42).length;

  if (severeCount >= 3) similarityScore -= 12;
  else if (severeCount >= 2) similarityScore -= 8;
  else if (severeCount === 1 && weakCount >= 3) similarityScore -= 5;

  if (weakCount >= 4) similarityScore -= 6;
  else if (weakCount >= 3) similarityScore -= 3;

  if (input.jawScore < 28 && input.chinScore < 28) similarityScore -= 5;
  if (input.noseScore < 28 && input.measurementsScore < 35) similarityScore -= 4;

  if (gap > 42) similarityScore -= 6;
  else if (gap > 32) similarityScore -= 3;

  return {
    similarityScore: clamp(similarityScore),
    embeddingVisualScore,
    morphologyScore,
    geometryConsensusScore,
  };
}
