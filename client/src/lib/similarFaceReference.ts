export type SimilarFaceDetection = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  landmarks: Array<{ x: number; y: number }>;
};

export const SIMILAR_FACE_REFERENCE = {
  detectorInput: [1, 640, 640, 3] as const,
  detectorOutput: [16800, 15] as const,
  recognizerInput: [1, 112, 112, 3] as const,
  recognizerOutput: [1, 512] as const,
  detectorScoreThreshold: 0.4,
  nmsIouThreshold: 0.5,
  detectorScale: 1 / 128,
  detectorMean: 0.5,
  recognizerScale: 1 / 127.5,
  recognizerBias: -1,
  retryBorderRatio: 0.2,
  jpegQuality: 0.95,
  arcFaceTarget: [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
  ] as const,
};

export function cosineSimilarity512(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== 512 || b.length !== 512) {
    throw new Error("O motor de referência usa embeddings com 512 dimensões.");
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < 512; i += 1) {
    const av = Number(a[i]);
    const bv = Number(b[i]);
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator > 0 ? dot / denominator : 0;
}

export function similarFaceScoreBasisPoints(cosine: number) {
  const logistic = 1 / (1 + Math.exp(2 - 10 * cosine));
  return Math.trunc(logistic * 10000);
}

export function similarFaceScorePercent(cosine: number) {
  return similarFaceScoreBasisPoints(cosine) / 100;
}

export function similarFaceDisplayPercent(cosine: number) {
  return Math.round(similarFaceScorePercent(cosine));
}

export function normalizeDetectorRgbToBgr(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const { detectorScale, detectorMean } = SIMILAR_FACE_REFERENCE;
  return [
    b * detectorScale - detectorMean,
    g * detectorScale - detectorMean,
    r * detectorScale - detectorMean,
  ];
}

export function normalizeRecognizerRgb(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const { recognizerScale, recognizerBias } = SIMILAR_FACE_REFERENCE;
  return [
    r * recognizerScale + recognizerBias,
    g * recognizerScale + recognizerBias,
    b * recognizerScale + recognizerBias,
  ];
}

function iou(a: SimilarFaceDetection, b: SimilarFaceDetection) {
  const left = Math.max(a.x1, b.x1);
  const top = Math.max(a.y1, b.y1);
  const right = Math.min(a.x2, b.x2);
  const bottom = Math.min(a.y2, b.y2);
  const iw = Math.max(0, right - left);
  const ih = Math.max(0, bottom - top);
  const intersection = iw * ih;

  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

export function applySimilarFaceNms(detections: SimilarFaceDetection[]) {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: SimilarFaceDetection[] = [];

  for (const candidate of sorted) {
    if (
      kept.every(
        (current) =>
          iou(candidate, current) <=
          SIMILAR_FACE_REFERENCE.nmsIouThreshold,
      )
    ) {
      kept.push(candidate);
    }
  }

  return kept;
}

export function parseDetectorRows(output: ArrayLike<number>) {
  const rowWidth = SIMILAR_FACE_REFERENCE.detectorOutput[1];
  if (output.length % rowWidth !== 0) {
    throw new Error("Saída do detector com tamanho inválido.");
  }

  const detections: SimilarFaceDetection[] = [];
  for (let offset = 0; offset < output.length; offset += rowWidth) {
    const score = Number(output[offset + 4]);
    if (!(score > SIMILAR_FACE_REFERENCE.detectorScoreThreshold)) continue;

    detections.push({
      x1: Math.trunc(Number(output[offset])),
      y1: Math.trunc(Number(output[offset + 1])),
      x2: Math.trunc(Number(output[offset + 2])),
      y2: Math.trunc(Number(output[offset + 3])),
      score,
      landmarks: [
        { x: Math.trunc(Number(output[offset + 5])), y: Math.trunc(Number(output[offset + 6])) },
        { x: Math.trunc(Number(output[offset + 7])), y: Math.trunc(Number(output[offset + 8])) },
        { x: Math.trunc(Number(output[offset + 9])), y: Math.trunc(Number(output[offset + 10])) },
        { x: Math.trunc(Number(output[offset + 11])), y: Math.trunc(Number(output[offset + 12])) },
        { x: Math.trunc(Number(output[offset + 13])), y: Math.trunc(Number(output[offset + 14])) },
      ],
    });
  }

  return applySimilarFaceNms(detections);
}

export function createDetectorSquareCanvas(source: HTMLCanvasElement) {
  const side = Math.max(source.width, source.height);
  const output = document.createElement("canvas");
  output.width = side;
  output.height = side;
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar a imagem para o detector.");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(source, 0, 0);
  return output;
}

export function createDetectorRetryCanvas(sourceSquare: HTMLCanvasElement) {
  const margin = Math.trunc(
    sourceSquare.width * SIMILAR_FACE_REFERENCE.retryBorderRatio,
  );
  const output = document.createElement("canvas");
  output.width = sourceSquare.width + margin * 2;
  output.height = sourceSquare.height + margin * 2;
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar o fallback do detector.");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.drawImage(sourceSquare, margin, margin);
  return output;
}


type ReferencePoint = { x: number; y: number };

export function estimateReferenceTransform(source: ReferencePoint[]) {
  if (source.length !== 5) {
    throw new Error("O alinhamento exige cinco pontos.");
  }

  const target = SIMILAR_FACE_REFERENCE.arcFaceTarget;
  const srcMean = source.reduce(
    (acc, p) => ({ x: acc.x + p.x / 5, y: acc.y + p.y / 5 }),
    { x: 0, y: 0 },
  );
  const dstMean = target.reduce(
    (acc, p) => ({ x: acc.x + p[0] / 5, y: acc.y + p[1] / 5 }),
    { x: 0, y: 0 },
  );

  let den = 0;
  let numA = 0;
  let numB = 0;
  for (let i = 0; i < 5; i += 1) {
    const sx = source[i].x - srcMean.x;
    const sy = source[i].y - srcMean.y;
    const tx = target[i][0] - dstMean.x;
    const ty = target[i][1] - dstMean.y;
    den += sx * sx + sy * sy;
    numA += sx * tx + sy * ty;
    numB += sx * ty - sy * tx;
  }

  if (den < 1e-9) throw new Error("Falha ao estimar alinhamento.");

  const a = numA / den;
  const b = numB / den;

  return {
    a,
    b,
    c: -b,
    d: a,
    e: dstMean.x - a * srcMean.x + b * srcMean.y,
    f: dstMean.y - b * srcMean.x - a * srcMean.y,
  };
}

export function createReferenceAligned112(
  source: HTMLCanvasElement,
  fivePoints: ReferencePoint[],
) {
  const t = estimateReferenceTransform(fivePoints);
  const output = document.createElement("canvas");
  output.width = 112;
  output.height = 112;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Falha ao criar face alinhada.");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 112, 112);
  ctx.save();
  ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
  ctx.drawImage(source, 0, 0);
  ctx.restore();
  return output;
}


export function resizeReferenceDetector640(source: HTMLCanvasElement) {
  const output = document.createElement("canvas");
  output.width = 640;
  output.height = 640;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Falha ao criar entrada 640x640.");

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, 640, 640);
  return output;
}

export function detectorCanvasToFloatInput(canvas: HTMLCanvasElement) {
  if (canvas.width !== 640 || canvas.height !== 640) {
    throw new Error("A entrada do detector deve ser 640x640.");
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Falha ao ler a entrada do detector.");

  const rgba = ctx.getImageData(0, 0, 640, 640).data;
  const out = new Float32Array(640 * 640 * 3);

  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const p = normalizeDetectorRgbToBgr(rgba[i], rgba[i + 1], rgba[i + 2]);
    out[j] = p[0];
    out[j + 1] = p[1];
    out[j + 2] = p[2];
  }

  return out;
}

export function recognizerCanvasToFloatInput(canvas: HTMLCanvasElement) {
  if (canvas.width !== 112 || canvas.height !== 112) {
    throw new Error("A entrada do reconhecedor deve ser 112x112.");
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Falha ao ler a entrada do reconhecedor.");

  const rgba = ctx.getImageData(0, 0, 112, 112).data;
  const out = new Float32Array(112 * 112 * 3);

  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const p = normalizeRecognizerRgb(rgba[i], rgba[i + 1], rgba[i + 2]);
    out[j] = p[0];
    out[j + 1] = p[1];
    out[j + 2] = p[2];
  }

  return out;
}
