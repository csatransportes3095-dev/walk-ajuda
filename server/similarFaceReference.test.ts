import { describe, expect, it } from "vitest";
import {
  SIMILAR_FACE_REFERENCE,
  cosineSimilarity512,
  normalizeDetectorRgbToBgr,
  normalizeRecognizerRgb,
  normalizeReferenceLandmarkOrder,
  parseDetectorRows,
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
  it("replicates native landmark truncation and mirrored-eye correction", () => {
    const corrected = normalizeReferenceLandmarkOrder([
      { x: 80.9, y: 40.8 },
      { x: 30.2, y: 41.4 },
      { x: 55.7, y: 65.9 },
      { x: 40.4, y: 90.1 },
      { x: 70.6, y: 89.8 },
    ]);
    expect(corrected[0]).toEqual({ x: 30, y: 41 });
    expect(corrected[1]).toEqual({ x: 80, y: 40 });

    const raw = new Float32Array(15);
    raw.set([
      10.9, 20.8, 100.7, 120.6, 0.9,
      30.9, 40.8, 80.7, 41.6, 55.9, 65.4,
      40.7, 90.8, 70.9, 89.2,
    ]);
    const parsed = parseDetectorRows(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].x1).toBe(10);
    expect(parsed[0].landmarks[0]).toEqual({ x: 30, y: 40 });
  });

});
