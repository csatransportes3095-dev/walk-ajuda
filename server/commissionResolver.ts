export type CommissionCandidate = {
  id: number;
  productId: number;
  productName: string | null;
  optionLabel: string | null;
  commissionValue: number;
};

export type CommissionResolution = {
  value: number;
  candidateId: number | null;
  reason: "matched" | "ambiguous" | "not_found";
};

export function normalizeCommissionText(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bN\s*\/\s*/gi, " NOME ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function optionScore(serviceOption: string, optionLabel: string): number {
  if (!serviceOption || !optionLabel) return 0;
  if (serviceOption === optionLabel) return 100;
  if (serviceOption.includes(optionLabel)) return 90;
  if (serviceOption.length >= 5 && optionLabel.includes(serviceOption)) return 70;
  return 0;
}

function productScore(serviceName: string, productName: string): number {
  if (!serviceName || !productName) return 0;
  if (serviceName === productName) return 30;
  if (serviceName.includes(productName) || productName.includes(serviceName)) return 20;
  return 0;
}

/**
 * Resolve apenas comissões legadas que não possuem snapshot congelado.
 * Nunca inventa valor: exige correspondência forte da opção e rejeita empates.
 */
export function resolveLegacyCommissionValue(input: {
  serviceName?: string | null;
  serviceOption?: string | null;
  candidates: CommissionCandidate[];
}): CommissionResolution {
  const serviceName = normalizeCommissionText(input.serviceName);
  const serviceOption = normalizeCommissionText(input.serviceOption);
  if (!serviceOption) return { value: 0, candidateId: null, reason: "not_found" };

  const scored = input.candidates
    .filter((candidate) => Number(candidate.commissionValue || 0) > 0)
    .map((candidate) => {
      const option = normalizeCommissionText(candidate.optionLabel);
      const product = normalizeCommissionText(candidate.productName);
      const optionMatch = optionScore(serviceOption, option);
      return {
        candidate,
        optionMatch,
        score: optionMatch + productScore(serviceName, product),
      };
    })
    .filter((item) => item.optionMatch >= 90)
    .sort((a, b) => b.score - a.score || b.optionMatch - a.optionMatch || a.candidate.id - b.candidate.id);

  if (scored.length === 0) return { value: 0, candidateId: null, reason: "not_found" };

  const bestScore = scored[0].score;
  const best = scored.filter((item) => item.score === bestScore);
  const distinctValues = new Set(best.map((item) => Number(item.candidate.commissionValue || 0)));
  if (best.length > 1 && distinctValues.size > 1) {
    return { value: 0, candidateId: null, reason: "ambiguous" };
  }

  const chosen = best[0].candidate;
  return {
    value: Math.max(0, Number(chosen.commissionValue || 0)),
    candidateId: chosen.id,
    reason: "matched",
  };
}
