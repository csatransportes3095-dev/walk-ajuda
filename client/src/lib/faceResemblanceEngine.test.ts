import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  estimateSimilarityTransform,
  similarityScoreFromCosine,
  calibratedLocalResemblanceScore,
  compareFaceResemblanceDescriptors,
} from "./faceResemblanceEngine";

describe("standardized 112x112 resemblance engine", () => {
  it("maps cosine with the reference logistic curve", () => {
    expect(similarityScoreFromCosine(0.2)).toBeCloseTo(50, 6);
    expect(similarityScoreFromCosine(0.3)).toBeCloseTo(73.1059, 3);
    expect(similarityScoreFromCosine(0.4)).toBeCloseTo(88.0797, 3);
  });

  it("returns 100 percent direction similarity for proportional vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
  });

  it("recovers a simple scale and translation with five points", () => {
    const source = [
      { x: 10, y: 20 },
      { x: 20, y: 20 },
      { x: 15, y: 30 },
      { x: 11, y: 40 },
      { x: 19, y: 40 },
    ];
    const target = source.map((p) => ({ x: p.x * 2 + 5, y: p.y * 2 - 3 }));
    const t = estimateSimilarityTransform(source, target);
    expect(t.a).toBeCloseTo(2, 8);
    expect(t.b).toBeCloseTo(0, 8);
    expect(t.c).toBeCloseTo(0, 8);
    expect(t.d).toBeCloseTo(2, 8);
    expect(t.e).toBeCloseTo(5, 8);
    expect(t.f).toBeCloseTo(-3, 8);
  });
  it("tracks the three supplied Similar Face reference pairs with local facial regions", () => {
    const ref75 = calibratedLocalResemblanceScore({ eyes: 80.6, nose: 72.5, mouth: 42.6 });
    const ref71 = calibratedLocalResemblanceScore({ eyes: 82.1, nose: 70.5, mouth: 38.3 });
    const ref86 = calibratedLocalResemblanceScore({ eyes: 86.2, nose: 77.5, mouth: 62.1 });

    expect(ref75.score).toBeGreaterThanOrEqual(72);
    expect(ref75.score).toBeLessThanOrEqual(76);

    expect(ref71.score).toBeGreaterThanOrEqual(70);
    expect(ref71.score).toBeLessThanOrEqual(74);

    expect(ref86.score).toBeGreaterThanOrEqual(84);
    expect(ref86.score).toBeLessThanOrEqual(88);

    expect(ref86.score).toBeGreaterThan(ref75.score);
    expect(ref75.score).toBeGreaterThan(ref71.score);
  });

  it("clamps local calibration to a valid percentage", () => {
    expect(calibratedLocalResemblanceScore({ eyes: 0, nose: 0, mouth: 0 }).score).toBe(0);
    expect(calibratedLocalResemblanceScore({ eyes: 100, nose: 100, mouth: 100 }).score).toBe(100);
  });

  it("compares FaceX eye nose and mouth embeddings independently", () => {
    const a = {
      embedding: [1, 0, 0],
      alignedCanvas: null as unknown as HTMLCanvasElement,
      parts: {
        eyes: [1, 0, 0],
        nose: [1, 0, 0],
        mouth: [1, 0, 0],
      },
    };
    const b = {
      embedding: [1, 0, 0],
      alignedCanvas: null as unknown as HTMLCanvasElement,
      parts: {
        eyes: [1, 0, 0],
        nose: [0.8, 0.2, 0],
        mouth: [0, 1, 0],
      },
    };

    const result = compareFaceResemblanceDescriptors(a, b);
    expect(result.parts.eyes.cosine).toBeCloseTo(1, 8);
    expect(result.parts.nose.cosine).toBeGreaterThan(0.9);
    expect(result.parts.mouth.cosine).toBeCloseTo(0, 8);
    expect(result.partMeanScore).toBeCloseTo(
      (result.parts.eyes.score + result.parts.nose.score + result.parts.mouth.score) / 3,
      10,
    );
  });

});
