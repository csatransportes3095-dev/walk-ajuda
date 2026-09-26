import { calculateBiofacialConsensus } from "./biofacialConsensus";

export type MatchVerdict =
  | "strong"
  | "near"
  | "partial"
  | "low"
  | "inconclusive";

export type FaceMatchDecisionInput = {
  identityRawSimilarity: number;
  primarySimilarityScore?: number;
  geometrySimilarity: number;
  geometryCriticalMean: number;
  geometryCriticalFloor: number;
  browsScore?: number;
  noseScore?: number;
  mouthScore?: number;
  jawScore?: number;
  chinScore?: number;
  measurementsScore?: number;
  globalScore?: number;
  eyesScore?: number;
  ovalScore?: number;
  cheeksScore?: number;
  proportionsScore?: number;
  structureScore?: number;
  symmetryScore?: number;
  reliability: number;
};

export type FaceMatchDecision = {
  finalScore: number;
  identityScore: number;
  geometryConsensusScore: number;
  morphologyScore: number;
  verdict: MatchVerdict;
  detail: string;
  identityRawSimilarity: number;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

// O embedding retorna similaridade normalizada 0..1. A documentação do motor
// considera ~0.50 como região de match; por segurança operacional usamos uma
// curva conservadora e reservamos notas muito altas para similaridades bem acima.
export function calibrateIdentitySimilarity(raw: number) {
  const r = Math.max(0, Math.min(1, raw));
  if (r <= 0.30) return (r / 0.30) * 10;
  if (r <= 0.45) return 10 + ((r - 0.30) / 0.15) * 25;
  if (r <= 0.50) return 35 + ((r - 0.45) / 0.05) * 15;
  if (r <= 0.60) return 50 + ((r - 0.50) / 0.10) * 20;
  if (r <= 0.70) return 70 + ((r - 0.60) / 0.10) * 18;
  if (r <= 0.80) return 88 + ((r - 0.70) / 0.10) * 8;
  return 96 + ((r - 0.80) / 0.20) * 4;
}

export function decideFaceMatch(input: FaceMatchDecisionInput): FaceMatchDecision {
  const raw = Math.max(0, Math.min(1, input.identityRawSimilarity));
  const geometry = clamp(input.geometrySimilarity);
  const criticalMean = clamp(input.geometryCriticalMean);
  const criticalFloor = clamp(input.geometryCriticalFloor);
  const reliability = clamp(input.reliability);

  const brows = clamp(input.browsScore ?? criticalMean);
  const nose = clamp(input.noseScore ?? criticalMean);
  const mouth = clamp(input.mouthScore ?? criticalMean);
  const jaw = clamp(input.jawScore ?? criticalMean);
  const chin = clamp(input.chinScore ?? criticalMean);
  const measurements = clamp(input.measurementsScore ?? criticalMean);

  const consensus = calculateBiofacialConsensus({
    embeddingRaw: raw,
    geometryScore: geometry,
    criticalMean,
    globalScore: clamp(input.globalScore ?? criticalMean),
    eyesScore: clamp(input.eyesScore ?? criticalMean),
    browsScore: brows,
    noseScore: nose,
    ovalScore: clamp(input.ovalScore ?? criticalMean),
    cheeksScore: clamp(input.cheeksScore ?? criticalMean),
    jawScore: jaw,
    chinScore: chin,
    mouthScore: mouth,
    proportionsScore: clamp(input.proportionsScore ?? criticalMean),
    measurementsScore: measurements,
    structureScore: clamp(input.structureScore ?? criticalMean),
    symmetryScore: clamp(input.symmetryScore ?? criticalMean),
  });

  const finalScore = Number.isFinite(input.primarySimilarityScore)
    ? clamp(Number(input.primarySimilarityScore))
    : consensus.similarityScore;
  const identityScore = Number.isFinite(input.primarySimilarityScore)
    ? clamp(Number(input.primarySimilarityScore))
    : consensus.embeddingVisualScore;

  if (reliability < 60) {
    return {
      finalScore,
      identityScore,
      geometryConsensusScore: consensus.geometryConsensusScore,
      morphologyScore: consensus.morphologyScore,
      verdict: "inconclusive",
      detail: "A qualidade das imagens nao e suficiente para medir a semelhanca facial com confianca.",
      identityRawSimilarity: raw,
    };
  }

  if (finalScore >= 92) {
    return {
      finalScore,
      identityScore,
      geometryConsensusScore: consensus.geometryConsensusScore,
      morphologyScore: consensus.morphologyScore,
      verdict: "strong",
      detail: "As principais estruturas do rosto apresentam semelhanca visual muito alta.",
      identityRawSimilarity: raw,
    };
  }

  if (finalScore >= 86) {
    return {
      finalScore,
      identityScore,
      geometryConsensusScore: consensus.geometryConsensusScore,
      morphologyScore: consensus.morphologyScore,
      verdict: "near",
      detail: "Ha semelhanca facial alta entre formato, proporcoes e regioes principais do rosto.",
      identityRawSimilarity: raw,
    };
  }

  if (finalScore >= 60) {
    return {
      finalScore,
      identityScore,
      geometryConsensusScore: consensus.geometryConsensusScore,
      morphologyScore: consensus.morphologyScore,
      verdict: "partial",
      detail: "Existe semelhanca facial moderada, com algumas regioes parecidas e outras diferentes.",
      identityRawSimilarity: raw,
    };
  }

  return {
    finalScore,
    identityScore,
    geometryConsensusScore: consensus.geometryConsensusScore,
    morphologyScore: consensus.morphologyScore,
    verdict: "low",
    detail: "A semelhanca visual entre as estruturas faciais e baixa.",
    identityRawSimilarity: raw,
  };
}
