import { calculateBiofacialConsensus } from "./biofacialConsensus";

export type MatchVerdict =
  | "strong"
  | "near"
  | "partial"
  | "low"
  | "inconclusive";

export type FaceMatchDecisionInput = {
  identityRawSimilarity: number;
  geometrySimilarity: number;
  geometryCriticalMean: number;
  geometryCriticalFloor: number;
  noseScore?: number;
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

  const nose = clamp(input.noseScore ?? criticalMean);
  const jaw = clamp(input.jawScore ?? criticalMean);
  const chin = clamp(input.chinScore ?? criticalMean);
  const measurements = clamp(input.measurementsScore ?? criticalMean);

  const consensus = calculateBiofacialConsensus({
    embeddingRaw: raw,
    geometryScore: geometry,
    criticalMean,
    globalScore: clamp(input.globalScore ?? criticalMean),
    eyesScore: clamp(input.eyesScore ?? criticalMean),
    noseScore: nose,
    ovalScore: clamp(input.ovalScore ?? criticalMean),
    cheeksScore: clamp(input.cheeksScore ?? criticalMean),
    jawScore: jaw,
    chinScore: chin,
    proportionsScore: clamp(input.proportionsScore ?? criticalMean),
    measurementsScore: measurements,
    structureScore: clamp(input.structureScore ?? criticalMean),
    symmetryScore: clamp(input.symmetryScore ?? criticalMean),
  });

  const finalScore = consensus.similarityScore;
  const identityScore = consensus.embeddingVisualScore;

  if (reliability < 60) {
    return {
      finalScore,
      identityScore,
      geometryConsensusScore: consensus.geometryConsensusScore,
      morphologyScore: consensus.morphologyScore,
      verdict: "inconclusive",
      detail: "A qualidade das imagens não é suficiente para uma conclusão confiável.",
      identityRawSimilarity: raw,
    };
  }

  if (
    raw >= 0.68 &&
    consensus.geometryConsensusScore >= 72 &&
    criticalMean >= 65 &&
    criticalFloor >= 45
  ) {
    return {
      finalScore,
      identityScore,
      geometryConsensusScore: consensus.geometryConsensusScore,
      morphologyScore: consensus.morphologyScore,
      verdict: "strong",
      detail: "Embedding e estruturas faciais concordam fortemente. Há alta compatibilidade biofacial.",
      identityRawSimilarity: raw,
    };
  }

  if (
    raw >= 0.58 &&
    consensus.geometryConsensusScore >= 60 &&
    criticalMean >= 52
  ) {
    return {
      finalScore,
      identityScore,
      geometryConsensusScore: consensus.geometryConsensusScore,
      morphologyScore: consensus.morphologyScore,
      verdict: "near",
      detail: "Os rostos chegam perto e há concordância relevante entre embedding e medidas faciais.",
      identityRawSimilarity: raw,
    };
  }

  if (finalScore >= 55) {
    return {
      finalScore,
      identityScore,
      geometryConsensusScore: consensus.geometryConsensusScore,
      morphologyScore: consensus.morphologyScore,
      verdict: "partial",
      detail: "Existe semelhança biofacial relevante, mas os sinais não são fortes o bastante para uma conclusão de identidade.",
      identityRawSimilarity: raw,
    };
  }

  return {
    finalScore,
    identityScore,
    geometryConsensusScore: consensus.geometryConsensusScore,
    morphologyScore: consensus.morphologyScore,
    verdict: "low",
    detail: "A semelhança conjunta é baixa e não há suporte forte de correspondência.",
    identityRawSimilarity: raw,
  };
}
