import { describe, expect, it } from "vitest";
import type { FaceIdentityDescriptor } from "./faceIdentity";

describe("face identity descriptor contract", () => {
  it("keeps the model embedding in its native representation", () => {
    const descriptor: FaceIdentityDescriptor = {
      embedding: [0.1, 0.2, 0.3],
      detectionScore: 0.95,
    };
    expect(descriptor.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(descriptor.detectionScore).toBe(0.95);
  });
});
