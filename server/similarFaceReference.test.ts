import { describe, expect, it } from "vitest";
import {
  SIMILAR_FACE_REFERENCE,
  cosineSimilarity512,
  normalizeDetectorRgbToBgr,
  normalizeRecognizerRgb,
  similarFaceScoreBasisPoints,
} from "../client/src/lib/similarFaceReference";

describe("Similar Face reference math", () => {
  it("keeps verified tensor shapes", () => {
    expect(SIMILAR_FACE_REFERENCE.detectorInput).toEqual([1, 640, 640, 3]);
    expect(SIMILAR_FACE_REFERENCE.detectorOutput).toEqual([16800, 15]);
    expect(SIMILAR_FACE_REFERENCE.recognizerInput).toEqual([1, 112, 112, 3]);
    expect(SIMILAR_FACE_REFERENCE.recognizerOutput).toEqual([1, 512]);
  });

  it("matches native preprocessing constants", () => {
    expect(normalizeDetectorRgbToBgr(255, 128, 0)).toEqual([-0.5, 0.5, 1.4921875]);
    const rgb = normalizeRecognizerRgb(0, 127.5, 255);
    expect(rgb[0]).toBeCloseTo(-1, 8);
    expect(rgb[1]).toBeCloseTo(0, 8);
    expect(rgb[2]).toBeCloseTo(1, 8);
  });

  it("matches native cosine logistic calculation", () => {
    const a = new Float32Array(512);
    const b = new Float32Array(512);
    a[0] = 1;
    b[0] = 2;
    expect(cosineSimilarity512(a, b)).toBeCloseTo(1, 10);
    expect(similarFaceScoreBasisPoints(0.2)).toBe(5000);
  });
});
