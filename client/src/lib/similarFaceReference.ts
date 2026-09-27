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


export type ReferencePoint = { x: number; y: number };

const OPENCV_410_SCRIPT = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
let referenceOpenCvPromise: Promise<any> | null = null;

function loadReferenceScript(src: string) {
  const current = document.querySelector<HTMLScriptElement>(`script[data-h2-opencv="${src}"]`);
  if (current) {
    if ((window as any).cv) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      current.addEventListener("load", () => resolve(), { once: true });
      current.addEventListener("error", () => reject(new Error("Falha ao carregar OpenCV 4.10.0.")), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.h2Opencv = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar OpenCV 4.10.0."));
    document.head.appendChild(script);
  });
}

export async function getReferenceOpenCv() {
  if (!referenceOpenCvPromise) {
    referenceOpenCvPromise = (async () => {
      await loadReferenceScript(OPENCV_410_SCRIPT);
      let cv: any = (window as any).cv;
      if (!cv) throw new Error("OpenCV 4.10.0 não inicializado.");

      // Algumas builds expõem cv como Promise; outras expõem o Module
      // antes de o runtime WASM terminar de inicializar.
      if (typeof cv.then === "function") {
        cv = await cv;
        (window as any).cv = cv;
      }

      if (!cv?.Mat) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(
            () => reject(new Error("Tempo esgotado ao inicializar OpenCV 4.10.0.")),
            20000,
          );
          const previous = cv.onRuntimeInitialized;
          cv.onRuntimeInitialized = () => {
            window.clearTimeout(timeout);
            try {
              if (typeof previous === "function") previous();
            } finally {
              resolve();
            }
          };
        });
      }

      if (!cv?.Mat || typeof cv.resize !== "function" || typeof cv.warpAffine !== "function") {
        throw new Error("OpenCV 4.10.0 carregado sem resize/warpAffine.");
      }
      return cv;
    })().catch((error) => {
      referenceOpenCvPromise = null;
      throw error;
    });
  }
  return referenceOpenCvPromise;
}

function cvMatFromCanvas(cv: any, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Falha ao ler pixels para OpenCV.");
  return cv.matFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function cvMatToCanvas(mat: any, width: number, height: number) {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Falha ao criar canvas OpenCV.");

  const rgba = new Uint8ClampedArray(mat.data.length);
  rgba.set(mat.data);
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return output;
}


function f32(value: number) {
  return Math.fround(value);
}

/**
 * Replica a correção de ordem dos olhos feita em alignFace() no APK.
 * O detector pode devolver os dois olhos invertidos em fotos espelhadas.
 */
export function normalizeReferenceLandmarkOrder(points: ReferencePoint[]) {
  if (points.length !== 5) {
    throw new Error("O alinhamento exige cinco pontos.");
  }

  const out = points.map((p) => ({
    x: Math.trunc(Number(p.x)),
    y: Math.trunc(Number(p.y)),
  }));

  if (out[0].x > out[1].x) {
    if (out[2].y > out[0].y && out[2].y > out[1].y) {
      const tmp = out[0];
      out[0] = out[1];
      out[1] = tmp;
    }
  } else if (out[0].x === out[1].x) {
    out[0].x -= 1;
  }

  return out;
}

export function estimateReferenceTransform(sourceInput: ReferencePoint[]) {
  const source = normalizeReferenceLandmarkOrder(sourceInput);
  const target = SIMILAR_FACE_REFERENCE.arcFaceTarget;

  let srcMeanX = 0;
  let srcMeanY = 0;
  let dstMeanX = 0;
  let dstMeanY = 0;

  for (let i = 0; i < 5; i += 1) {
    srcMeanX = f32(srcMeanX + f32(source[i].x / 5));
    srcMeanY = f32(srcMeanY + f32(source[i].y / 5));
    dstMeanX = f32(dstMeanX + f32(target[i][0] / 5));
    dstMeanY = f32(dstMeanY + f32(target[i][1] / 5));
  }

  // Para 2D, esta forma fechada é equivalente ao Umeyama usado no APK
  // quando a orientação é preservada. A correção dos olhos acima evita
  // que selfies espelhadas caiam no ramo de reflexão.
  let den = 0;
  let numA = 0;
  let numB = 0;
  for (let i = 0; i < 5; i += 1) {
    const sx = f32(source[i].x - srcMeanX);
    const sy = f32(source[i].y - srcMeanY);
    const tx = f32(target[i][0] - dstMeanX);
    const ty = f32(target[i][1] - dstMeanY);
    den = f32(den + f32(sx * sx + sy * sy));
    numA = f32(numA + f32(sx * tx + sy * ty));
    numB = f32(numB + f32(sx * ty - sy * tx));
  }

  if (Math.abs(den) < 1e-9) {
    throw new Error("Falha ao estimar alinhamento.");
  }

  const a = f32(numA / den);
  const b = f32(numB / den);
  const c = f32(-b);
  const d = a;
  const e = f32(dstMeanX - f32(a * srcMeanX) + f32(b * srcMeanY));
  const f = f32(dstMeanY - f32(b * srcMeanX) - f32(a * srcMeanY));

  return { a, b, c, d, e, f };
}

export async function createReferenceAligned112(
  source: HTMLCanvasElement,
  fivePoints: ReferencePoint[],
) {
  const cv = await getReferenceOpenCv();
  const transform = estimateReferenceTransform(fivePoints);
  const src = cvMatFromCanvas(cv, source);
  const dst = new cv.Mat();
  const matrix = cv.matFromArray(
    2,
    3,
    cv.CV_32F,
    [
      transform.a, transform.c, transform.e,
      transform.b, transform.d, transform.f,
    ],
  );

  try {
    // Mesmo OpenCV 4.10.0 e mesmos parâmetros observados no APK:
    // INTER_LINEAR + BORDER_CONSTANT preto, saída 112x112.
    cv.warpAffine(
      src,
      dst,
      matrix,
      new cv.Size(112, 112),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0, 255),
    );
    return cvMatToCanvas(dst, 112, 112);
  } finally {
    matrix.delete();
    dst.delete();
    src.delete();
  }
}

export async function resizeReferenceDetector640(source: HTMLCanvasElement) {
  const cv = await getReferenceOpenCv();
  const src = cvMatFromCanvas(cv, source);
  const dst = new cv.Mat();

  try {
    // O APK usa cv::resize(..., INTER_LINEAR) do OpenCV 4.10.0.
    // Não usar drawImage aqui: o filtro do navegador muda pixels/landmarks.
    cv.resize(
      src,
      dst,
      new cv.Size(640, 640),
      0,
      0,
      cv.INTER_LINEAR,
    );
    return cvMatToCanvas(dst, 640, 640);
  } finally {
    dst.delete();
    src.delete();
  }
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
