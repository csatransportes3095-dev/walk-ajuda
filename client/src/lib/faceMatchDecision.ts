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
  reliability: number;
};

export type FaceMatchDecision = {
  finalScore: number;
  identityScore: number;
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
  const identityScore = calibrateIdentitySimilarity(raw);
  const geometry = clamp(input.geometrySimilarity);
  const criticalMean = clamp(input.geometryCriticalMean);
  const criticalFloor = clamp(input.geometryCriticalFloor);
  const reliability = clamp(input.reliability);

  // Identidade é a prova principal; geometria é confirmação secundária.
  let finalScore = identityScore * 0.82 + geometry * 0.18;

  // Vetor facial baixo impõe teto. Uma geometria "bonita" nunca pode carregar
  // sozinha duas pessoas diferentes para 80-90%.
  if (raw < 0.38) finalScore = Math.min(finalScore, 25);
  else if (raw < 0.44) finalScore = Math.min(finalScore, 34);
  else if (raw < 0.48) finalScore = Math.min(finalScore, 44);
  else if (raw < 0.52) finalScore = Math.min(finalScore, 55);
  else if (raw < 0.58) finalScore = Math.min(finalScore, 68);
  else if (raw < 0.64) finalScore = Math.min(finalScore, 80);
  else if (raw < 0.70) finalScore = Math.min(finalScore, 89);

  // Geometria extremamente incompatível também impede conclusão alta, mesmo
  // quando a textura/aparência gerou embedding relativamente próximo.
  if (criticalMean < 35) finalScore = Math.min(finalScore, 48);
  else if (criticalMean < 45) finalScore = Math.min(finalScore, 58);
  else if (criticalMean < 55) finalScore = Math.min(finalScore, 70);

  if (criticalFloor < 20 && criticalMean < 55) {
    finalScore = Math.min(finalScore, 52);
  }

  finalScore = clamp(finalScore);

  if (reliability < 60) {
    return {
      finalScore,
      identityScore,
      verdict: "inconclusive",
      detail: "A qualidade das imagens não é suficiente para uma conclusão segura.",
      identityRawSimilarity: raw,
    };
  }

  if (raw >= 0.68 && finalScore >= 86 && criticalMean >= 62) {
    return {
      finalScore,
      identityScore,
      verdict: "strong",
      detail: "Vetor facial e geometria concordam fortemente. Pode ser a mesma pessoa, mas o resultado não é prova de identidade.",
      identityRawSimilarity: raw,
    };
  }

  if (raw >= 0.58 && finalScore >= 68 && criticalMean >= 50) {
    return {
      finalScore,
      identityScore,
      verdict: "near",
      detail: "Existe aproximação relevante no vetor facial e na geometria, mas ainda há diferenças.",
      identityRawSimilarity: raw,
    };
  }

  if (raw >= 0.48 && finalScore >= 45) {
    return {
      finalScore,
      identityScore,
      verdict: "partial",
      detail: "Há alguns sinais de semelhança, porém eles não são fortes o bastante para tratar os rostos como muito próximos.",
      identityRawSimilarity: raw,
    };
  }

  return {
    finalScore,
    identityScore,
    verdict: "low",
    detail: "O vetor facial não sustenta uma correspondência forte; a geometria não pode elevar esse resultado sozinha.",
    identityRawSimilarity: raw,
  };
}
