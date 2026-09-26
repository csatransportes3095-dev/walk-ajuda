import { LEFT_IRIS, RIGHT_IRIS, type FaceLandmark } from "./faceGeometry";

export type FacePartName = "eyes" | "nose" | "mouth";

export type FacePartDescriptorMap = Record<FacePartName, number[]>;

export type FacePartComparison = {
  cosine: number;
  score: number;
};

export type FaceResemblanceDescriptor = {
  embedding: number[];
  alignedCanvas: HTMLCanvasElement;
  parts: FacePartDescriptorMap;
};

export type FaceResemblanceComparison = {
  cosine: number;
  score: number;
  parts: Record<FacePartName, FacePartComparison>;
  partMeanScore: number;
};

type Point2 = { x: number; y: number };

type FaceXModuleInstance = {
  FS: { writeFile: (path: string, bytes: Uint8Array) => void };
  HEAPF32: Float32Array;
  _malloc: (bytes: number) => number;
  _free: (ptr: number) => void;
  cwrap: (name: string, returnType: string, argTypes: string[]) => (...args: any[]) => number;
};

type FaceXRuntime = {
  module: FaceXModuleInstance;
  handle: number;
  embedFn: (handle: number, inputPtr: number, outputPtr: number) => number;
};

const FACEX_SCRIPT_URL = "/face-model/facex.js";
const FACEX_WASM_URL = "/face-model/facex.wasm";
const FACEX_WEIGHT_URL = "/face-model/edgeface_xs_fp32.bin";

const TARGET_5PT: Point2[] = [
  { x: 38.2946, y: 51.6963 },
  { x: 73.5318, y: 51.5014 },
  { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 },
  { x: 70.7299, y: 92.2041 },
];

let runtimePromise: Promise<FaceXRuntime> | null = null;
let scriptPromise: Promise<void> | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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

export function similarityScoreFromCosine(cosine: number) {
  const c = clamp(cosine, -1, 1);
  return clamp(100 / (1 + Math.exp(2 - 10 * c)), 0, 100);
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den > 1e-12 ? clamp(dot / den, -1, 1) : 0;
}

function sourceFivePoints(canvas: HTMLCanvasElement, landmarks: FaceLandmark[]): Point2[] {
  const leftEye = landmarks.length >= 478
    ? meanPoint(landmarks, LEFT_IRIS)
    : meanPoint(landmarks, [33, 133]);
  const rightEye = landmarks.length >= 478
    ? meanPoint(landmarks, RIGHT_IRIS)
    : meanPoint(landmarks, [362, 263]);
  const nose = landmarks[1];
  const leftMouth = landmarks[61];
  const rightMouth = landmarks[291];

  const normalized = [leftEye, rightEye, nose, leftMouth, rightMouth];
  if (normalized.some((point) => !point)) {
    throw new Error("Landmarks insuficientes para alinhamento facial 112x112.");
  }

  const eyes = [leftEye, rightEye].sort((a, b) => a.x - b.x);
  const mouth = [leftMouth, rightMouth].sort((a, b) => a.x - b.x);
  const imageOrdered = [eyes[0], eyes[1], nose, mouth[0], mouth[1]];

  return imageOrdered.map((point) => ({
    x: point.x * canvas.width,
    y: point.y * canvas.height,
  }));
}

export function estimateSimilarityTransform(source: Point2[], target: Point2[]) {
  if (source.length !== target.length || source.length < 2) {
    throw new Error("Pontos insuficientes para alinhamento facial.");
  }

  const srcMean = source.reduce(
    (acc, p) => ({ x: acc.x + p.x / source.length, y: acc.y + p.y / source.length }),
    { x: 0, y: 0 },
  );
  const dstMean = target.reduce(
    (acc, p) => ({ x: acc.x + p.x / target.length, y: acc.y + p.y / target.length }),
    { x: 0, y: 0 },
  );

  let den = 0;
  let numA = 0;
  let numB = 0;

  for (let i = 0; i < source.length; i += 1) {
    const sx = source[i].x - srcMean.x;
    const sy = source[i].y - srcMean.y;
    const tx = target[i].x - dstMean.x;
    const ty = target[i].y - dstMean.y;
    den += sx * sx + sy * sy;
    numA += sx * tx + sy * ty;
    numB += sx * ty - sy * tx;
  }

  if (den < 1e-9) throw new Error("Nao foi possivel alinhar o rosto.");

  const a = numA / den;
  const b = numB / den;
  const e = dstMean.x - a * srcMean.x + b * srcMean.y;
  const f = dstMean.y - b * srcMean.x - a * srcMean.y;

  return { a, b, c: -b, d: a, e, f };
}

export function createArcFaceAligned112(
  canvas: HTMLCanvasElement,
  landmarks: FaceLandmark[],
) {
  const source = sourceFivePoints(canvas, landmarks);
  const transform = estimateSimilarityTransform(source, TARGET_5PT);

  const output = document.createElement("canvas");
  output.width = 112;
  output.height = 112;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Nao foi possivel preparar o rosto alinhado.");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 112, 112);
  ctx.save();
  ctx.setTransform(
    transform.a,
    transform.b,
    transform.c,
    transform.d,
    transform.e,
    transform.f,
  );
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();

  return output;
}

function loadScriptOnce(url: string) {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-h2-facex="${url}"]`);
    if (existing) {
      if ((globalThis as any).FaceXModule) resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.h2Facex = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Nao foi possivel carregar o motor facial 112x112."));
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

async function loadWeightsCached(url: string) {
  const key = "h2-facex-xs-v2";
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("h2-face-model-cache", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("weights")) {
          request.result.createObjectStore("weights");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const cached = await new Promise<ArrayBuffer | null>((resolve) => {
      const tx = db.transaction("weights", "readonly");
      const req = tx.objectStore("weights").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (cached) return new Uint8Array(cached);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();

    try {
      const tx = db.transaction("weights", "readwrite");
      tx.objectStore("weights").put(buffer, key);
    } catch {
      // Cache e opcional.
    }
    return new Uint8Array(buffer);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao carregar modelo facial: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

async function getRuntime(): Promise<FaceXRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      await loadScriptOnce(FACEX_SCRIPT_URL);
      const factory = (globalThis as any).FaceXModule;
      if (typeof factory !== "function") {
        throw new Error("Motor FaceX indisponivel no navegador.");
      }

      const module: FaceXModuleInstance = await factory({
        locateFile: (file: string) => file === "facex.wasm" ? FACEX_WASM_URL : file,
      });
      const weights = await loadWeightsCached(FACEX_WEIGHT_URL);
      module.FS.writeFile("/h2-face.bin", weights);

      const init = module.cwrap("facex_init", "number", ["string", "string"]);
      const handle = init("/h2-face.bin", null);
      if (!handle) throw new Error("Falha ao inicializar o motor facial 112x112.");

      const embedFn = module.cwrap("facex_embed", "number", [
        "number",
        "number",
        "number",
      ]) as FaceXRuntime["embedFn"];

      return { module, handle, embedFn };
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

const PART_RECTS: Record<FacePartName, { x: number; y: number; w: number; h: number }> = {
  eyes: { x: 16, y: 36, w: 80, h: 28 },
  nose: { x: 36, y: 56, w: 40, h: 32 },
  mouth: { x: 28, y: 80, w: 56, h: 28 },
};

export function createFacePartCanvas(
  alignedCanvas: HTMLCanvasElement,
  part: FacePartName,
) {
  const rect = PART_RECTS[part];
  const output = document.createElement("canvas");
  output.width = 112;
  output.height = 112;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error(`Nao foi possivel preparar a regiao facial ${part}.`);

  // Mantem a regiao exatamente na mesma posicao e escala do rosto alinhado
  // 112x112. O restante fica mascarado. Isso evita distorcer olhos/nariz/boca
  // para ocupar o rosto inteiro, que saturava os embeddings locais.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 112, 112);
  ctx.drawImage(
    alignedCanvas,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
  );
  return output;
}

async function embedAlignedCanvas(canvas: HTMLCanvasElement) {
  const runtime = await getRuntime();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Nao foi possivel ler o rosto alinhado.");

  const image = ctx.getImageData(0, 0, 112, 112);
  const pixelCount = 112 * 112;
  const inputLength = pixelCount * 3;
  const inputPtr = runtime.module._malloc(inputLength * 4);
  const outputPtr = runtime.module._malloc(512 * 4);

  try {
    const base = inputPtr >> 2;
    const heap = runtime.module.HEAPF32;
    for (let i = 0; i < pixelCount; i += 1) {
      heap[base + i * 3] = image.data[i * 4] / 127.5 - 1;
      heap[base + i * 3 + 1] = image.data[i * 4 + 1] / 127.5 - 1;
      heap[base + i * 3 + 2] = image.data[i * 4 + 2] / 127.5 - 1;
    }

    const status = runtime.embedFn(runtime.handle, inputPtr, outputPtr);
    if (status !== 0) throw new Error("Falha ao gerar embedding facial 512D.");

    const raw = Array.from(
      heap.subarray(outputPtr >> 2, (outputPtr >> 2) + 512),
    );
    if (raw.length !== 512 || raw.some((value) => !Number.isFinite(value))) {
      throw new Error("Embedding facial 512D invalido.");
    }
    return raw;
  } finally {
    runtime.module._free(inputPtr);
    runtime.module._free(outputPtr);
  }
}

export async function extractFaceResemblanceDescriptor(
  canvas: HTMLCanvasElement,
  landmarks: FaceLandmark[],
): Promise<FaceResemblanceDescriptor> {
  const alignedCanvas = createArcFaceAligned112(canvas, landmarks);
  const embedding = await embedAlignedCanvas(alignedCanvas);
  const [eyes, nose, mouth] = await Promise.all([
    embedAlignedCanvas(createFacePartCanvas(alignedCanvas, "eyes")),
    embedAlignedCanvas(createFacePartCanvas(alignedCanvas, "nose")),
    embedAlignedCanvas(createFacePartCanvas(alignedCanvas, "mouth")),
  ]);
  return {
    embedding,
    alignedCanvas,
    parts: { eyes, nose, mouth },
  };
}

export function compareFaceResemblanceDescriptors(
  a: FaceResemblanceDescriptor,
  b: FaceResemblanceDescriptor,
): FaceResemblanceComparison {
  const cosine = cosineSimilarity(a.embedding, b.embedding);
  const parts = {
    eyes: {
      cosine: cosineSimilarity(a.parts.eyes, b.parts.eyes),
      score: 0,
    },
    nose: {
      cosine: cosineSimilarity(a.parts.nose, b.parts.nose),
      score: 0,
    },
    mouth: {
      cosine: cosineSimilarity(a.parts.mouth, b.parts.mouth),
      score: 0,
    },
  };

  parts.eyes.score = similarityScoreFromCosine(parts.eyes.cosine);
  parts.nose.score = similarityScoreFromCosine(parts.nose.cosine);
  parts.mouth.score = similarityScoreFromCosine(parts.mouth.cosine);

  return {
    cosine,
    score: similarityScoreFromCosine(cosine),
    parts,
    partMeanScore: (parts.eyes.score + parts.nose.score + parts.mouth.score) / 3,
  };
}
