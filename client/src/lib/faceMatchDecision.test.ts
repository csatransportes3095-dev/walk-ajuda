import { describe, expect, it } from "vitest";
import { decideFaceMatch } from "./faceMatchDecision";

describe("biofacial consensus math", () => {
  it("keeps the supplied reference case in a useful middle range", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.38,
      geometrySimilarity: 41.8,
      geometryCriticalMean: 63.6,
      geometryCriticalFloor: 28.2,
      noseScore: 54.4,
      jawScore: 55.0,
      chinScore: 57.4,
      measurementsScore: 39.5,
      reliability: 96,
    });
    expect(result.finalScore).toBeGreaterThanOrEqual(60);
    expect(result.finalScore).toBeLessThanOrEqual(78);
  });

  it("rewards agreement between both calculation branches", () => {
    const lower = decideFaceMatch({
      identityRawSimilarity: 0.38,
      geometrySimilarity: 42,
      geometryCriticalMean: 58,
      geometryCriticalFloor: 35,
      reliability: 90,
    });
    const higher = decideFaceMatch({
      identityRawSimilarity: 0.62,
      geometrySimilarity: 78,
      geometryCriticalMean: 76,
      geometryCriticalFloor: 64,
      reliability: 90,
    });
    expect(higher.finalScore).toBeGreaterThan(lower.finalScore);
  });

  it("reduces the score when several structural measurements are weak", () => {
    const baseline = decideFaceMatch({
      identityRawSimilarity: 0.65,
      geometrySimilarity: 80,
      geometryCriticalMean: 72,
      geometryCriticalFloor: 60,
      noseScore: 72,
      jawScore: 70,
      chinScore: 72,
      measurementsScore: 68,
      reliability: 92,
    });
    const weak = decideFaceMatch({
      identityRawSimilarity: 0.65,
      geometrySimilarity: 80,
      geometryCriticalMean: 72,
      geometryCriticalFloor: 30,
      noseScore: 26,
      jawScore: 25,
      chinScore: 24,
      measurementsScore: 28,
      reliability: 92,
    });
    expect(weak.finalScore).toBeLessThan(baseline.finalScore);
  });
});
