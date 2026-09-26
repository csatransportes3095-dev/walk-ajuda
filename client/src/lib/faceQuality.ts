import {
  FACE_OVAL,
  LEFT_EYE,
  RIGHT_EYE,
  NOSE,
  MOUTH,
  correctImageAspect,
  distance,
  type FaceLandmark,
} from "./faceGeometry";

export type CaptureIssueSeverity = "warning" | "critical";

export type CaptureIssue = {
  code: string;
  message: string;
  severity: CaptureIssueSeverity;
};

export type CaptureCheck = {
  code: string;
  message: string;
};

export type FaceCaptureQuality = {
  score: number;
  width: number;
  height: number;
  faceWidthPx: number;
  faceHeightPx: number;
  faceAreaRatio: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  shadowAsymmetry: number;
  rollDeg: number;
  yawAsymmetry: number;
  issues: CaptureIssue[];
  checks: CaptureCheck[];
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function regionBox(
  landmarks: FaceLandmark[],
  indices: number[],
  width: number,
  height: number,
  padding = 0.22,
) {
  const points = indices.map((index) => landmarks[index]).filter(Boolean);
  if (!points.length) return null;
  const xs = points.map((p) => p.x * width);
  const ys = points.map((p) => p.y * height);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = Math.max(2, (maxX - minX) * padding);
  const padY = Math.max(2, (maxY - minY) * padding);
  return {
    x1: Math.max(0, Math.floor(minX - padX)),
    y1: Math.max(0, Math.floor(minY - padY)),
    x2: Math.min(width, Math.ceil(maxX + padX)),
    y2: Math.min(height, Math.ceil(maxY + padY)),
  };
}

function sampleStats(
  gray: Float32Array,
  width: number,
  height: number,
  box: { x1: number; y1: number; x2: number; y2: number },
) {
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = box.y1; y < box.y2; y += 1) {
    for (let x = box.x1; x < box.x2; x += 1) {
      const value = gray[y * width + x];
      sum += value;
      sumSq += value * value;
      count += 1;
    }
  }
  const mean = count ? sum / count : 0;
  const std = count ? Math.sqrt(Math.max(0, sumSq / count - mean * mean)) : 0;
  return { mean, std, count };
}

export function analyzeFaceCaptureQuality(
  canvas: HTMLCanvasElement,
  landmarks: FaceLandmark[],
  aspectRatio = 1,
): FaceCaptureQuality {
  const width = canvas.width;
  const height = canvas.height;
  const issues: CaptureIssue[] = [];
  const checks: CaptureCheck[] = [];

  const ovalBox = regionBox(landmarks, FACE_OVAL, width, height, 0.02);
  if (!ovalBox) {
    return {
      score: 0,
      width,
      height,
      faceWidthPx: 0,
      faceHeightPx: 0,
      faceAreaRatio: 0,
      brightness: 0,
      contrast: 0,
      sharpness: 0,
      shadowAsymmetry: 0,
      rollDeg: 0,
      yawAsymmetry: 1,
      issues: [{ code: "face_missing", message: "rosto não detectado", severity: "critical" }],
      checks: [],
    };
  }

  const faceWidthPx = ovalBox.x2 - ovalBox.x1;
  const faceHeightPx = ovalBox.y2 - ovalBox.y1;
  const faceAreaRatio = (faceWidthPx * faceHeightPx) / Math.max(1, width * height);

  const sample = document.createElement("canvas");
  const maxSide = 480;
  const ratio = Math.min(1, maxSide / Math.max(width, height));
  sample.width = Math.max(32, Math.round(width * ratio));
  sample.height = Math.max(32, Math.round(height * ratio));
  const ctx = sample.getContext("2d", { willReadFrequently: true });

  let brightness = 0;
  let contrast = 0;
  let sharpness = 0;
  let shadowAsymmetry = 0;
  let directionalBlurRatio = 1;
  let eyeTexture = 100;
  let criticalRegionLowTextureCount = 0;

  if (ctx) {
    ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
    const image = ctx.getImageData(0, 0, sample.width, sample.height);
    const gray = new Float32Array(sample.width * sample.height);
    let sum = 0;
    let sumSq = 0;

    for (let p = 0, i = 0; i < image.data.length; i += 4, p += 1) {
      const g = image.data[i] * 0.2126 + image.data[i + 1] * 0.7152 + image.data[i + 2] * 0.0722;
      gray[p] = g;
      sum += g;
      sumSq += g * g;
    }

    const count = gray.length || 1;
    brightness = sum / count;
    contrast = Math.sqrt(Math.max(0, sumSq / count - brightness * brightness));

    let lapSum = 0;
    let lapSumSq = 0;
    let lapN = 0;
    let gxEnergy = 0;
    let gyEnergy = 0;

    for (let y = 1; y < sample.height - 1; y += 1) {
      for (let x = 1; x < sample.width - 1; x += 1) {
        const k = y * sample.width + x;
        const lap = gray[k - sample.width] + gray[k + sample.width] + gray[k - 1] + gray[k + 1] - 4 * gray[k];
        lapSum += lap;
        lapSumSq += lap * lap;
        lapN += 1;
        gxEnergy += Math.abs(gray[k + 1] - gray[k - 1]);
        gyEnergy += Math.abs(gray[k + sample.width] - gray[k - sample.width]);
      }
    }

    const lapMean = lapSum / Math.max(1, lapN);
    sharpness = Math.sqrt(Math.max(0, lapSumSq / Math.max(1, lapN) - lapMean * lapMean));
    const minGradient = Math.max(1e-6, Math.min(gxEnergy, gyEnergy));
    directionalBlurRatio = Math.max(gxEnergy, gyEnergy) / minGradient;

    const scaleX = sample.width / width;
    const scaleY = sample.height / height;
    const scaledBox = {
      x1: Math.max(0, Math.floor(ovalBox.x1 * scaleX)),
      y1: Math.max(0, Math.floor(ovalBox.y1 * scaleY)),
      x2: Math.min(sample.width, Math.ceil(ovalBox.x2 * scaleX)),
      y2: Math.min(sample.height, Math.ceil(ovalBox.y2 * scaleY)),
    };
    const midX = Math.floor((scaledBox.x1 + scaledBox.x2) / 2);
    const leftStats = sampleStats(gray, sample.width, sample.height, { ...scaledBox, x2: midX });
    const rightStats = sampleStats(gray, sample.width, sample.height, { ...scaledBox, x1: midX });
    shadowAsymmetry = Math.abs(leftStats.mean - rightStats.mean);

    const regionTexture = (indices: number[]) => {
      const box = regionBox(
        landmarks,
        indices,
        sample.width,
        sample.height,
        0.28,
      );
      if (!box) return 0;
      return sampleStats(gray, sample.width, sample.height, box).std;
    };

    const leftEyeTexture = regionTexture(LEFT_EYE);
    const rightEyeTexture = regionTexture(RIGHT_EYE);
    eyeTexture = Math.min(leftEyeTexture, rightEyeTexture);
    const noseTexture = regionTexture(NOSE);
    const mouthTexture = regionTexture(MOUTH);
    criticalRegionLowTextureCount = [leftEyeTexture, rightEyeTexture, noseTexture, mouthTexture]
      .filter((value) => value < Math.max(7, contrast * 0.24)).length;
  }

  const corrected = correctImageAspect(landmarks, aspectRatio);
  const leftEye = corrected[33];
  const rightEye = corrected[263];
  const rollDeg = Math.abs(Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI);

  const nose = corrected[1];
  const leftCheek = corrected[234];
  const rightCheek = corrected[454];
  const leftDistance = distance(nose, leftCheek);
  const rightDistance = distance(nose, rightCheek);
  const yawAsymmetry = Math.abs(leftDistance - rightDistance) / Math.max(1e-6, leftDistance + rightDistance);

  const nearBorder =
    ovalBox.x1 <= width * 0.012 ||
    ovalBox.y1 <= height * 0.012 ||
    ovalBox.x2 >= width * 0.988 ||
    ovalBox.y2 >= height * 0.988;

  let score = 100;
  const addIssue = (code: string, message: string, severity: CaptureIssueSeverity, deduction: number) => {
    issues.push({ code, message, severity });
    score -= deduction;
  };

  if (width < 320 || height < 320) addIssue("low_resolution", "resolução insuficiente", "warning", 12);
  else checks.push({ code: "resolution_ok", message: "resolução adequada" });

  if (faceWidthPx < 120 || faceHeightPx < 150 || faceAreaRatio < 0.055) {
    addIssue("face_small", "rosto muito pequeno na imagem", "warning", 16);
  } else checks.push({ code: "face_size_ok", message: "tamanho do rosto adequado" });

  if (nearBorder) addIssue("face_cropped", "rosto parcialmente cortado", "critical", 20);
  else checks.push({ code: "face_detected", message: "rosto detectado por completo" });

  if (brightness < 58) addIssue("too_dark", "iluminação insuficiente", "warning", 16);
  else if (brightness > 218) addIssue("too_bright", "iluminação excessivamente clara", "warning", 16);
  else checks.push({ code: "lighting_ok", message: "boa iluminação" });

  if (contrast < 22) addIssue("low_contrast", "contraste facial baixo", "warning", 10);

  if (sharpness < 8) addIssue("blur", "foto desfocada", "critical", 22);
  else if (sharpness < 13) addIssue("soft_focus", "nitidez baixa", "warning", 10);
  else checks.push({ code: "sharpness_ok", message: "boa nitidez" });

  if (sharpness < 13 && directionalBlurRatio > 2.6) {
    addIssue("motion_blur", "possível borrão de movimento", "warning", 8);
  }

  if (shadowAsymmetry > 34) addIssue("strong_shadow", "sombras muito fortes no rosto", "warning", 10);
  else checks.push({ code: "shadow_ok", message: "iluminação facial equilibrada" });

  if (rollDeg > 16) addIssue("roll_excessive", "inclinação facial excessiva", "critical", 18);
  else if (rollDeg > 9) addIssue("roll", "rosto inclinado", "warning", 8);

  if (yawAsymmetry > 0.22) addIssue("yaw_excessive", "ângulo facial excessivo", "critical", 20);
  else if (yawAsymmetry > 0.13) addIssue("yaw", "rosto levemente lateral", "warning", 9);
  else checks.push({ code: "pose_ok", message: "posição adequada" });

  if (eyeTexture < Math.max(7, contrast * 0.22)) {
    addIssue("eyes_low_visibility", "olhos pouco visíveis", "warning", 10);
  } else checks.push({ code: "eyes_ok", message: "olhos detectados" });

  if (criticalRegionLowTextureCount >= 3) {
    addIssue("possible_occlusion", "possível oclusão significativa do rosto", "warning", 12);
  } else checks.push({ code: "occlusion_ok", message: "regiões principais do rosto visíveis" });

  return {
    score: clamp(score),
    width,
    height,
    faceWidthPx,
    faceHeightPx,
    faceAreaRatio,
    brightness,
    contrast,
    sharpness,
    shadowAsymmetry,
    rollDeg,
    yawAsymmetry,
    issues,
    checks,
  };
}

export function confidenceLabel(score: number): "Alta" | "Média" | "Baixa" {
  if (score >= 80) return "Alta";
  if (score >= 60) return "Média";
  return "Baixa";
}
