import { describe, expect, it } from "vitest";
import {
  averageEmbeddings,
  identityDescriptorStability,
  normalizeEmbedding,
  type FaceIdentityDescriptor,
} from "./faceIdentity";

function norm(values: number[]) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

describe("stable face identity descriptor helpers", () => {
  it("normalizes scaled copies to the same direction", () => {
    const a = normalizeEmbedding([3, 4, 0]);
    const b = normalizeEmbedding([30, 40, 0]);
    expect(a[0]).toBeCloseTo(b[0], 10);
    expect(a[1]).toBeCloseTo(b[1], 10);
    expect(norm(a)).toBeCloseTo(1, 10);
  });

  it("averages multiple crops into one normalized descriptor", () => {
    const averaged = averageEmbeddings([
      [1, 0.05, 0],
      [0.98, 0.08, 0.01],
    ]);
    expect(norm(averaged)).toBeCloseTo(1, 10);
    expect(averaged[0]).toBeGreaterThan(0.99);
  });

  it("is deterministic for the same embeddings", () => {
    const samples = [
      [0.8, 0.2, 0.1],
      [0.79, 0.21, 0.11],
    ];
    const a = averageEmbeddings(samples);
    const b = averageEmbeddings(samples);
    expect(a).toEqual(b);
  });

  it("reports internal consistency without changing similarity", () => {
    const descriptor: FaceIdentityDescriptor = {
      embedding: [1, 0, 0],
      detectionScore: 0.95,
      internalConsistency: 0.82,
      sampleCount: 2,
    };
    expect(identityDescriptorStability(descriptor)).toBeCloseTo(82, 10);
  });

  it("uses a neutral fallback when only one crop is available", () => {
    const descriptor: FaceIdentityDescriptor = {
      embedding: [1, 0, 0],
      detectionScore: 0.9,
      internalConsistency: null,
      sampleCount: 1,
    };
    expect(identityDescriptorStability(descriptor)).toBe(65);
  });
});
