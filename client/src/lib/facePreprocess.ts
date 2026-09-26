import { FACE_OVAL, LEFT_IRIS, RIGHT_IRIS, type FaceLandmark } from "./faceGeometry";

export type CanonicalFaceCanvases = {
  primary: HTMLCanvasElement;
  fallback: HTMLCanvasElement;
};

type CanonicalTransform = {
  sourceCenterX: number;
  sourceCenterY: number;
  targetCenterX: number;
  targetCenterY: number;
  scale: number;
  angle: number;
};

const OUTPUT_SIZE = 512;
const TARGET_LEFT_EYE = { x: OUTPUT_SIZE * 0.34, y: OUTPUT_SIZE * 0.38 };
const TARGET_RIGHT_EYE = { x: OUTPUT_SIZE * 0.66, y: OUTPUT_SIZE * 0.38 };

function meanPoint(points: FaceLandmark[], indices: number[]) {
  const valid = indices.filter((index) => points[index]);
  if (!valid.length) return { x: 0.5, y: 0.4 };
  const total = valid.reduce(
    (acc, index) => ({
      x: acc.x + points[index].x,
      y: acc.y + points[index].y,
    }),
    { x: 0, y: 0 },
  );
  return { x: total.x / valid.length, y: total.y / valid.length };
}

function eyeCenters(points: FaceLandmark[]) {
  if (points.length >= 478) {
    return {
      left: meanPoint(points, LEFT_IRIS),
      right: meanPoint(points, RIGHT_IRIS),
    };
  }
  return {
    left: meanPoint(points, [33, 133]),
    right: meanPoint(points, [362, 263]),
  };
}

export function calculateCanonicalTransform(
  canvas: HTMLCanvasElement,
  landmarks: FaceLandmark[],
): CanonicalTransform {
  const { left, right } = eyeCenters(landmarks);
  const leftX = left.x * canvas.width;
  const leftY = left.y * canvas.height;
  const rightX = right.x * canvas.width;
  const rightY = right.y * canvas.height;

  const sourceCenterX = (leftX + rightX) / 2;
  const sourceCenterY = (leftY + rightY) / 2;
  const sourceDistance = Math.max(1, Math.hypot(rightX - leftX, rightY - leftY));
  const targetDistance = TARGET_RIGHT_EYE.x - TARGET_LEFT_EYE.x;

  return {
    sourceCenterX,
    sourceCenterY,
    targetCenterX: (TARGET_LEFT_EYE.x + TARGET_RIGHT_EYE.x) / 2,
    targetCenterY: (TARGET_LEFT_EYE.y + TARGET_RIGHT_EYE.y) / 2,
    scale: targetDistance / sourceDistance,
    angle: Math.atan2(rightY - leftY, rightX - leftX),
  };
}

function normalizeToneModerately(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  let count = 0;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const luminance = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    sum += luminance;
    sumSq += luminance * luminance;
    count += 1;
  }

  if (!count) return;

  const mean = sum / count;
  const std = Math.sqrt(Math.max(1, sumSq / count - mean * mean));
  const gain = Math.max(0.90, Math.min(1.10, 48 / std));
  const offset = Math.max(-10, Math.min(10, 128 - mean * gain));

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      data[i] = 127;
      data[i + 1] = 127;
      data[i + 2] = 127;
      data[i + 3] = 255;
      continue;
    }

    data[i] = Math.max(0, Math.min(255, data[i] * gain + offset));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * gain + offset));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * gain + offset));
  }

  ctx.putImageData(image, 0, 0);
}

function createCanonicalFaceCanvas(
  canvas: HTMLCanvasElement,
  landmarks: FaceLandmark[],
  expansion: number,
) {
  const output = document.createElement("canvas");
  output.width = OUTPUT_SIZE;
  output.height = OUTPUT_SIZE;

  const ctx = output.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  const transform = calculateCanonicalTransform(canvas, landmarks);
  const oval = FACE_OVAL.map((index) => landmarks[index]).filter(Boolean);
  if (oval.length < 20) return canvas;

  const center = oval.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  center.x /= oval.length;
  center.y /= oval.length;

  ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.save();
  ctx.translate(transform.targetCenterX, transform.targetCenterY);
  ctx.rotate(-transform.angle);
  ctx.scale(transform.scale, transform.scale);
  ctx.translate(-transform.sourceCenterX, -transform.sourceCenterY);

  ctx.beginPath();
  oval.forEach((point, index) => {
    const px = (center.x + (point.x - center.x) * expansion) * canvas.width;
    const py = (center.y + (point.y - center.y) * expansion) * canvas.height;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();

  normalizeToneModerately(output);
  return output;
}

export function createCanonicalFaceCanvases(
  canvas: HTMLCanvasElement,
  landmarks: FaceLandmark[],
): CanonicalFaceCanvases {
  return {
    primary: createCanonicalFaceCanvas(canvas, landmarks, 1.07),
    fallback: createCanonicalFaceCanvas(canvas, landmarks, 1.16),
  };
}
