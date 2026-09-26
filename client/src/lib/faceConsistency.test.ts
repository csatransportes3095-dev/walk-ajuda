import { describe, expect, it } from "vitest";
import { decideFaceMatch } from "./faceMatchDecision";
import { confidenceLabel } from "./faceQuality";

const baseInput = {
  identityRawSimilarity: 0.61,
  geometrySimilarity: 74,
  geometryCriticalMean: 71,
  geometryCriticalFloor: 58,
  globalScore: 76,
  eyesScore: 73,
  noseScore: 72,
  ovalScore: 70,
  cheeksScore: 71,
  jawScore: 68,
  chinScore: 69,
  proportionsScore: 77,
  measurementsScore: 72,
  structureScore: 74,
  symmetryScore: 82,
  reliability: 90,
};

describe("face comparison consistency", () => {
  it("returns the same score for the exact same inputs", () => {
    const a = decideFaceMatch(baseInput);
    const b = decideFaceMatch(baseInput);
    expect(a.finalScore).toBeCloseTo(b.finalScore, 10);
    expect(a.verdict).toBe(b.verdict);
  });

  it("increases when embedding and facial geometry agree more strongly", () => {
    const baseline = decideFaceMatch(baseInput);
    const stronger = decideFaceMatch({
      ...baseInput,
      identityRawSimilarity: 0.75,
      geometrySimilarity: 88,
      geometryCriticalMean: 84,
      geometryCriticalFloor: 74,
      globalScore: 88,
      eyesScore: 86,
      noseScore: 87,
      measurementsScore: 85,
    });
    expect(stronger.finalScore).toBeGreaterThan(baseline.finalScore);
  });

  it("drops when several structural regions disagree", () => {
    const baseline = decideFaceMatch(baseInput);
    const weaker = decideFaceMatch({
      ...baseInput,
      noseScore: 25,
      jawScore: 27,
      chinScore: 24,
      measurementsScore: 29,
      geometryCriticalFloor: 24,
    });
    expect(weaker.finalScore).toBeLessThan(baseline.finalScore);
  });

  it("maps confidence labels independently from facial similarity", () => {
    expect(confidenceLabel(88)).toBe("Alta");
    expect(confidenceLabel(70)).toBe("Média");
    expect(confidenceLabel(45)).toBe("Baixa");
  });
});
