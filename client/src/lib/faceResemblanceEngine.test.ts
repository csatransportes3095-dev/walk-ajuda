import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  estimateSimilarityTransform,
  similarityScoreFromCosine,
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

  it("keeps the whole-face score independent of local eye nose and mouth diagnostics", () => {
    const a = {
      embedding: [1, 0, 0],
      alignedCanvas: null as unknown as HTMLCanvasElement,
      parts: { eyes: [1, 0, 0], nose: [1, 0, 0], mouth: [1, 0, 0] },
    };
    const b = {
      embedding: [0.4, Math.sqrt(0.84), 0],
      alignedCanvas: null as unknown as HTMLCanvasElement,
      parts: { eyes: [0, 1, 0], nose: [0, 1, 0], mouth: [0, 1, 0] },
    };
    const first = compareFaceResemblanceDescriptors(a, b);
    b.parts.eyes = [1, 0, 0];
    b.parts.nose = [1, 0, 0];
    b.parts.mouth = [1, 0, 0];
    const second = compareFaceResemblanceDescriptors(a, b);
    expect(first.score).toBeCloseTo(second.score, 10);
    expect(first.partMeanScore).not.toBeCloseTo(second.partMeanScore, 3);
  });

});
