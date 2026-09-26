import { describe, expect, it } from "vitest";
import { calculateCanonicalTransform } from "./facePreprocess";
import type { FaceLandmark } from "./faceGeometry";

function landmarks(): FaceLandmark[] {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const leftIris = [468,469,470,471,472];
  const rightIris = [473,474,475,476,477];
  leftIris.forEach((i, k) => { points[i] = { x: 0.35 + (k-2)*0.002, y: 0.40, z: 0 }; });
  rightIris.forEach((i, k) => { points[i] = { x: 0.65 + (k-2)*0.002, y: 0.40, z: 0 }; });
  return points;
}

describe("canonical face alignment", () => {
  it("preserves equivalent scale across different image resolutions", () => {
    const points = landmarks();
    const a = calculateCanonicalTransform({ width: 1000, height: 1000 } as HTMLCanvasElement, points);
    const b = calculateCanonicalTransform({ width: 2000, height: 2000 } as HTMLCanvasElement, points);
    expect(a.scale * 0.5).toBeCloseTo(b.scale, 6);
    expect(a.angle).toBeCloseTo(b.angle, 6);
  });

  it("detects and compensates a small eye-line tilt deterministically", () => {
    const points = landmarks();
    [473,474,475,476,477].forEach((i) => { points[i] = { ...points[i], y: 0.44 }; });
    const first = calculateCanonicalTransform({ width: 1200, height: 900 } as HTMLCanvasElement, points);
    const second = calculateCanonicalTransform({ width: 1200, height: 900 } as HTMLCanvasElement, points);
    expect(first.angle).toBeGreaterThan(0);
    expect(first.angle).toBeCloseTo(second.angle, 10);
    expect(first.scale).toBeCloseTo(second.scale, 10);
  });
});
