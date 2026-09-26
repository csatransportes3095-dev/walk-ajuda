import { describe, expect, it } from "vitest";
import { assessCaptureMetrics, confidenceLabel, type CaptureMetricInput } from "./faceQuality";

const good: CaptureMetricInput = {
  width: 1200,
  height: 1200,
  faceWidthPx: 430,
  faceHeightPx: 560,
  faceAreaRatio: 0.17,
  brightness: 128,
  contrast: 42,
  sharpness: 20,
  shadowAsymmetry: 8,
  rollDeg: 2,
  yawAsymmetry: 0.05,
  nearBorder: false,
  directionalBlurRatio: 1.2,
  eyeTexture: 22,
  criticalRegionLowTextureCount: 0,
};

function codes(result: ReturnType<typeof assessCaptureMetrics>) {
  return result.issues.map((issue) => issue.code);
}

describe("face capture quality rules", () => {
  it("accepts a clear frontal capture", () => {
    const result = assessCaptureMetrics(good);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(codes(result)).toHaveLength(0);
  });

  it("flags dark and overexposed captures independently", () => {
    expect(codes(assessCaptureMetrics({ ...good, brightness: 45 }))).toContain("too_dark");
    expect(codes(assessCaptureMetrics({ ...good, brightness: 230 }))).toContain("too_bright");
  });

  it("flags blur and likely motion blur", () => {
    const result = assessCaptureMetrics({ ...good, sharpness: 6, directionalBlurRatio: 3.4 });
    expect(codes(result)).toContain("blur");
    expect(codes(result)).toContain("motion_blur");
    expect(result.score).toBeLessThan(80);
  });

  it("flags low resolution and a face that is too small", () => {
    const result = assessCaptureMetrics({
      ...good,
      width: 240,
      height: 280,
      faceWidthPx: 80,
      faceHeightPx: 100,
      faceAreaRatio: 0.035,
    });
    expect(codes(result)).toContain("low_resolution");
    expect(codes(result)).toContain("face_small");
  });

  it("flags excessive roll and yaw without changing similarity math", () => {
    const result = assessCaptureMetrics({ ...good, rollDeg: 20, yawAsymmetry: 0.28 });
    expect(codes(result)).toContain("roll_excessive");
    expect(codes(result)).toContain("yaw_excessive");
  });

  it("flags strong shadow, eye visibility and possible occlusion", () => {
    const result = assessCaptureMetrics({
      ...good,
      shadowAsymmetry: 45,
      eyeTexture: 3,
      criticalRegionLowTextureCount: 3,
    });
    expect(codes(result)).toContain("strong_shadow");
    expect(codes(result)).toContain("eyes_low_visibility");
    expect(codes(result)).toContain("possible_occlusion");
  });

  it("maps confidence labels separately", () => {
    expect(confidenceLabel(90)).toBe("Alta");
    expect(confidenceLabel(70)).toBe("Média");
    expect(confidenceLabel(50)).toBe("Baixa");
  });
});
