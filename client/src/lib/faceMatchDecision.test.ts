import { describe, expect, it } from "vitest";
import { calibrateIdentitySimilarity, decideFaceMatch } from "./faceMatchDecision";

describe("identity-first face match decision", () => {
  it("does not allow high geometry to rescue a low identity embedding", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.34,
      geometrySimilarity: 84.2,
      geometryCriticalMean: 85.2,
      geometryCriticalFloor: 78.9,
      reliability: 92,
    });

    expect(result.finalScore).toBeLessThanOrEqual(25);
    expect(result.verdict).toBe("low");
  });

  it("keeps a borderline embedding in the partial range even with good geometry", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.49,
      geometrySimilarity: 82,
      geometryCriticalMean: 74,
      geometryCriticalFloor: 66,
      reliability: 90,
    });

    expect(result.finalScore).toBeLessThanOrEqual(55);
    expect(["partial", "low"]).toContain(result.verdict);
  });

  it("requires identity and geometry to agree for a strong result", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.76,
      geometrySimilarity: 94,
      geometryCriticalMean: 89,
      geometryCriticalFloor: 82,
      reliability: 94,
    });

    expect(result.finalScore).toBeGreaterThanOrEqual(86);
    expect(result.verdict).toBe("strong");
  });

  it("does not make low-quality input look definitive", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.75,
      geometrySimilarity: 93,
      geometryCriticalMean: 88,
      geometryCriticalFloor: 80,
      reliability: 52,
    });

    expect(result.verdict).toBe("inconclusive");
  });

  it("caps a high embedding when jaw and chin are structurally incompatible", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.78,
      geometrySimilarity: 88,
      geometryCriticalMean: 72,
      geometryCriticalFloor: 28,
      noseScore: 74,
      jawScore: 24,
      chinScore: 26,
      measurementsScore: 41,
      reliability: 93,
    });

    expect(result.finalScore).toBeLessThanOrEqual(42);
    expect(result.verdict).not.toBe("strong");
  });

  it("caps when several face-only structural regions are weak", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.72,
      geometrySimilarity: 82,
      geometryCriticalMean: 64,
      geometryCriticalFloor: 30,
      noseScore: 39,
      jawScore: 42,
      chinScore: 44,
      measurementsScore: 38,
      reliability: 90,
    });

    expect(result.finalScore).toBeLessThanOrEqual(46);
    expect(["partial", "low"]).toContain(result.verdict);
  });

  it("caps a high embedding when jaw and chin are structurally incompatible", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.78,
      geometrySimilarity: 88,
      geometryCriticalMean: 72,
      geometryCriticalFloor: 28,
      noseScore: 74,
      jawScore: 24,
      chinScore: 26,
      measurementsScore: 41,
      reliability: 93,
    });

    expect(result.finalScore).toBeLessThanOrEqual(42);
    expect(result.verdict).not.toBe("strong");
  });

  it("caps when several face-only structural regions are weak", () => {
    const result = decideFaceMatch({
      identityRawSimilarity: 0.72,
      geometrySimilarity: 82,
      geometryCriticalMean: 64,
      geometryCriticalFloor: 30,
      noseScore: 39,
      jawScore: 42,
      chinScore: 44,
      measurementsScore: 38,
      reliability: 90,
    });

    expect(result.finalScore).toBeLessThanOrEqual(46);
    expect(["partial", "low"]).toContain(result.verdict);
  });

  it("calibration is monotonic", () => {
    const values = [0.2, 0.35, 0.45, 0.5, 0.6, 0.7, 0.8, 0.95].map(calibrateIdentitySimilarity);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});
