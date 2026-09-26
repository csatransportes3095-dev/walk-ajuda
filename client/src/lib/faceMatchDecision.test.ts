import { describe, expect, it } from "vitest";
import { decideFaceMatch } from "./faceMatchDecision";

describe("facial resemblance scoring", () => {
  it("keeps a morphology around 75% near that range even with a very high embedding", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.95,
      geometrySimilarity: 82.2,
      geometryCriticalMean: 83.1,
      geometryCriticalFloor: 56,
      globalScore: 90.9,
      eyesScore: 80.6,
      browsScore: 69.5,
      noseScore: 72.5,
      mouthScore: 42.6,
      ovalScore: 89.9,
      cheeksScore: 69.6,
      jawScore: 91.3,
      chinScore: 89.8,
      proportionsScore: 90.3,
      measurementsScore: 56,
      structureScore: 88.3,
      symmetryScore: 97.3,
      reliability: 90,
    });
    expect(result.morphologyScore).toBeGreaterThanOrEqual(74);
    expect(result.morphologyScore).toBeLessThanOrEqual(78);
    expect(result.finalScore).toBeGreaterThanOrEqual(72);
    expect(result.finalScore).toBeLessThanOrEqual(82);
  });

  it("does not let an extreme embedding override weak facial morphology", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.99,
      geometrySimilarity: 48,
      geometryCriticalMean: 44,
      geometryCriticalFloor: 30,
      globalScore: 50,
      eyesScore: 42,
      browsScore: 38,
      noseScore: 40,
      mouthScore: 35,
      ovalScore: 52,
      cheeksScore: 41,
      jawScore: 45,
      chinScore: 43,
      proportionsScore: 49,
      measurementsScore: 37,
      structureScore: 46,
      symmetryScore: 88,
      reliability: 95,
    });
    expect(result.finalScore).toBeLessThanOrEqual(50);
  });

  it("rewards broadly similar facial structures", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.60,
      geometrySimilarity: 88,
      geometryCriticalMean: 86,
      geometryCriticalFloor: 70,
      globalScore: 90,
      eyesScore: 87,
      browsScore: 84,
      noseScore: 88,
      mouthScore: 85,
      ovalScore: 90,
      cheeksScore: 83,
      jawScore: 89,
      chinScore: 86,
      proportionsScore: 91,
      measurementsScore: 84,
      structureScore: 88,
      symmetryScore: 92,
      reliability: 94,
    });
    expect(result.finalScore).toBeGreaterThanOrEqual(82);
    expect(result.verdict).not.toBe("low");
  });
  it("reserves high-similarity verdict for scores at or above 86", () => {
    const base = {
      identityRawSimilarity: 0.60,
      geometrySimilarity: 84,
      geometryCriticalMean: 80,
      geometryCriticalFloor: 68,
      globalScore: 84,
      eyesScore: 83,
      browsScore: 82,
      noseScore: 84,
      mouthScore: 82,
      ovalScore: 85,
      cheeksScore: 81,
      jawScore: 84,
      chinScore: 83,
      proportionsScore: 85,
      measurementsScore: 82,
      structureScore: 84,
      symmetryScore: 90,
      reliability: 92,
    };

    const result = decideFaceMatch(base);
    if (result.finalScore < 86) {
      expect(result.verdict).not.toBe("near");
      expect(result.verdict).not.toBe("strong");
    }
  });

  it("uses the standardized 112x112 score as the final percentage without geometry mixing", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.38,
      primarySimilarityScore: 86.4,
      geometrySimilarity: 42,
      geometryCriticalMean: 48,
      geometryCriticalFloor: 30,
      globalScore: 45,
      eyesScore: 46,
      browsScore: 44,
      noseScore: 43,
      mouthScore: 40,
      ovalScore: 50,
      cheeksScore: 42,
      jawScore: 45,
      chinScore: 44,
      proportionsScore: 47,
      measurementsScore: 41,
      structureScore: 46,
      symmetryScore: 80,
      reliability: 90,
    });
    expect(result.finalScore).toBeCloseTo(86.4, 10);
    expect(result.verdict).toBe("near");
  });

});
