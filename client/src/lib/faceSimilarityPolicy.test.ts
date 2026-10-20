import { describe, expect, it } from "vitest";
import {
  H2_FACE_MINIMUM_PERCENT,
  canHighlightH2Face,
  meetsH2FaceMinimum,
  needsDetailedH2BicoAnalysis,
} from "./faceSimilarityPolicy";

describe("H2 Face: único limite de 75%", () => {
  it("inclui exatamente 75% no ranking", () => {
    expect(H2_FACE_MINIMUM_PERCENT).toBe(75);
    expect(meetsH2FaceMinimum(74.99)).toBe(false);
    expect(meetsH2FaceMinimum(75)).toBe(true);
    expect(meetsH2FaceMinimum(86)).toBe(true);
  });

  it("rejeita leituras ausentes ou não numéricas", () => {
    expect(meetsH2FaceMinimum(null)).toBe(false);
    expect(meetsH2FaceMinimum(undefined)).toBe(false);
    expect(meetsH2FaceMinimum(Number.NaN)).toBe(false);
    expect(meetsH2FaceMinimum(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("somente destaca fotos acima do limite com leitura confiável", () => {
    expect(canHighlightH2Face(75, 60)).toBe(true);
    expect(canHighlightH2Face(75, 59.9)).toBe(false);
    expect(canHighlightH2Face(99, null)).toBe(false);
    expect(canHighlightH2Face(74.9, 99)).toBe(false);
  });

  it("só pula o diagnóstico geométrico quando score principal é comprovadamente abaixo do limite", () => {
    expect(needsDetailedH2BicoAnalysis(74.9)).toBe(false);
    expect(needsDetailedH2BicoAnalysis(75)).toBe(true);
    expect(needsDetailedH2BicoAnalysis(98)).toBe(true);
    expect(needsDetailedH2BicoAnalysis(Number.NaN)).toBe(true);
  });
});
