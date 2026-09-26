import {
  SIMILAR_FACE_REFERENCE,
  applySimilarFaceNms,
  createDetectorRetryCanvas,
  createDetectorSquareCanvas,
  createReferenceAligned112,
  detectorCanvasToFloatInput,
  recognizerCanvasToFloatInput,
  resizeReferenceDetector640,
  similarFaceScorePercent,
  cosineSimilarity512,
  type SimilarFaceDetection,
} from "./similarFaceReference";

type TensorLike = {
  data: () => Promise<Float32Array | Int32Array | Uint8Array>;
  dataSync?: () => Float32Array | Int32Array | Uint8Array;
  dispose?: () => void;
  shape?: number[];
};

type TfliteModelLike = {
  predict: (input: any) => TensorLike | TensorLike[] | Record<string, TensorLike>;
};

type RuntimeModules = {
  tf: any;
  tflite: any;
};

export type SimilarFaceRuntime = {
  compareFiles: (left: File, right: File) => Promise<{
    cosine: number;
    score: number;
    leftEmbedding: Float32Array;
    rightEmbedding: Float32Array;
  }>;
  embedFile: (file: File) => Promise<Float32Array>;
  sourceLabel: string;
};

const JSZIP_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
const TF_CORE_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.22.0/+esm";
const TF_CPU_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu@4.22.0/+esm";
const TFLITE_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.10/+esm";
const TFLITE_WASM_ROOT = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.10/dist/";

const MODEL_KEY = new Uint8Array([
  0x5e, 0x1f, 0x11, 0x2c, 0xc8, 0x6e, 0x3f, 0xf1,
  0x23, 0xa8, 0x2e, 0xff, 0x21, 0x21, 0xf2, 0x11,
]);

const CACHE_DB = "h2-similar-face-runtime";
const CACHE_STORE = "models";
const CACHE_DETECTOR = "fd_f32_v1";
const CACHE_RECOGNIZER = "fr_f16_v1";

let modulesPromise: Promise<RuntimeModules> | null = null;

async function getModules(): Promise<RuntimeModules> {
  if (!modulesPromise) {
    modulesPromise = (async () => {
      await import(/* @vite-ignore */ TF_CPU_URL);
      const tf: any = await import(/* @vite-ignore */ TF_CORE_URL);
      const tflite: any = await import(/* @vite-ignore */ TFLITE_URL);
      if (typeof tflite.setWasmPath === "function") {
        tflite.setWasmPath(TFLITE_WASM_ROOT);
      }
      await tf.setBackend("cpu");
      await tf.ready();
      return { tf, tflite };
    })().catch((error) => {
      modulesPromise = null;
      throw error;
    });
  }
  return modulesPromise;
}

function decryptModel(input: Uint8Array) {
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    out[i] = input[i] ^ MODEL_KEY[i % MODEL_KEY.length];
  }
  if (
    out.length < 8 ||
    out[4] !== 0x54 ||
    out[5] !== 0x46 ||
    out[6] !== 0x4c ||
    out[7] !== 0x33
  ) {
    throw new Error("Modelo TFLite extraído do XAPK não foi reconhecido.");
  }
  return out;
}

async function openCache() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CACHE_STORE)) {
        request.result.createObjectStore(CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cachePut(key: string, bytes: Uint8Array) {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      tx.objectStore(CACHE_STORE).put(bytes.buffer.slice(0), key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Cache é opcional.
  }
}

async function cacheGet(key: string) {
  try {
    const db = await openCache();
    const result = await new Promise<ArrayBuffer | null>((resolve) => {
      const tx = db.transaction(CACHE_STORE, "readonly");
      const req = tx.objectStore(CACHE_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    db.close();
    return result ? new Uint8Array(result) : null;
  } catch {
    return null;
  }
}

async function extractModelsFromXapk(file: File) {
  const zipModule: any = await import(/* @vite-ignore */ JSZIP_URL);
  const JSZip = zipModule.default || zipModule;
  const xapk = await JSZip.loadAsync(await file.arrayBuffer());

  const baseName = Object.keys(xapk.files).find((name) =>
    /com\.consisai\.face_album\.apk$/i.test(name),
  );
  if (!baseName) {
    throw new Error("APK principal do Similar Face não encontrado dentro do XAPK.");
  }

  const apkBytes = await xapk.files[baseName].async("uint8array");
  const apk = await JSZip.loadAsync(apkBytes);

  const detectorName = Object.keys(apk.files).find((name) => /assets\/models\/fd_f32\.bin$/i.test(name));
  const recognizerName = Object.keys(apk.files).find((name) => /assets\/models\/fr_f16\.bin$/i.test(name));
  if (!detectorName || !recognizerName) {
    throw new Error("Modelos fd_f32.bin/fr_f16.bin não encontrados no APK.");
  }

  const detectorEncrypted = await apk.files[detectorName].async("uint8array");
  const recognizerEncrypted = await apk.files[recognizerName].async("uint8array");
  return {
    detector: decryptModel(detectorEncrypted),
    recognizer: decryptModel(recognizerEncrypted),
  };
}

async function loadTfliteModel(bytes: Uint8Array) {
  const { tflite } = await getModules();
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  try {
    return await tflite.loadTFLiteModel(url, { numThreads: 1 }) as TfliteModelLike;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fileToCanvas(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    bitmap = await createImageBitmap(file);
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new Error("Não foi possível abrir a imagem.");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

function unwrapTensor(output: TensorLike | TensorLike[] | Record<string, TensorLike>) {
  if (Array.isArray(output)) return output[0];
  if (output && typeof output === "object" && "data" in output) return output as TensorLike;
  const values = Object.values(output || {});
  if (!values.length) throw new Error("O modelo TFLite não retornou saída.");
  return values[0] as TensorLike;
}

async function tensorData(tensor: TensorLike) {
  if (typeof tensor.dataSync === "function") {
    return tensor.dataSync();
  }
  return await tensor.data();
}

async function runModel(model: TfliteModelLike, values: Float32Array, shape: number[]) {
  const { tf } = await getModules();
  const input = tf.tensor(values, shape, "float32");
  try {
    const prediction = model.predict(input);
    const tensor = unwrapTensor(prediction);
    const data = await tensorData(tensor);
    tensor.dispose?.();
    return Float32Array.from(data as ArrayLike<number>);
  } finally {
    input.dispose?.();
  }
}

function mapDetectionToSquare(
  detection: SimilarFaceDetection,
  squareSide: number,
) {
  const scale = squareSide / 640;
  return {
    ...detection,
    x1: detection.x1 * scale,
    y1: detection.y1 * scale,
    x2: detection.x2 * scale,
    y2: detection.y2 * scale,
    landmarks: detection.landmarks.map((p) => ({
      x: p.x * scale,
      y: p.y * scale,
    })),
  };
}

function parseRawDetections(raw: Float32Array) {
  const rows: SimilarFaceDetection[] = [];
  const width = SIMILAR_FACE_REFERENCE.detectorOutput[1];

  for (let offset = 0; offset + width <= raw.length; offset += width) {
    const score = raw[offset + 4];
    if (!(score > SIMILAR_FACE_REFERENCE.detectorScoreThreshold)) continue;
    rows.push({
      x1: raw[offset],
      y1: raw[offset + 1],
      x2: raw[offset + 2],
      y2: raw[offset + 3],
      score,
      landmarks: [
        { x: raw[offset + 5], y: raw[offset + 6] },
        { x: raw[offset + 7], y: raw[offset + 8] },
        { x: raw[offset + 9], y: raw[offset + 10] },
        { x: raw[offset + 11], y: raw[offset + 12] },
        { x: raw[offset + 13], y: raw[offset + 14] },
      ],
    });
  }

  return applySimilarFaceNms(rows);
}

async function jpegRoundTrip112(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("Falha ao criar JPEG intermediário.")),
      "image/jpeg",
      SIMILAR_FACE_REFERENCE.jpegQuality,
    );
  });
  const bitmap = await createImageBitmap(blob);
  try {
    const output = document.createElement("canvas");
    output.width = 112;
    output.height = 112;
    const ctx = output.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Falha ao reabrir JPEG intermediário.");
    ctx.drawImage(bitmap, 0, 0, 112, 112);
    return output;
  } finally {
    bitmap.close();
  }
}

async function detectFivePoints(model: TfliteModelLike, source: HTMLCanvasElement) {
  const firstSquare = createDetectorSquareCanvas(source);

  const attempts = [
    firstSquare,
    createDetectorRetryCanvas(firstSquare),
  ];

  for (const square of attempts) {
    const resized = resizeReferenceDetector640(square);
    const input = detectorCanvasToFloatInput(resized);
    const raw = await runModel(model, input, [...SIMILAR_FACE_REFERENCE.detectorInput]);
    const detections = parseRawDetections(raw);
    if (detections.length) {
      return {
        square,
        detection: mapDetectionToSquare(detections[0], square.width),
      };
    }
  }

  throw new Error("O detector de referência não encontrou um rosto completo.");
}

async function createRuntime(detectorBytes: Uint8Array, recognizerBytes: Uint8Array, sourceLabel: string): Promise<SimilarFaceRuntime> {
  const [detectorModel, recognizerModel] = await Promise.all([
    loadTfliteModel(detectorBytes),
    loadTfliteModel(recognizerBytes),
  ]);

  const embedFile = async (file: File) => {
    const canvas = await fileToCanvas(file);
    const { square, detection } = await detectFivePoints(detectorModel, canvas);
    const aligned = createReferenceAligned112(square, detection.landmarks);
    const jpeg = await jpegRoundTrip112(aligned);
    const input = recognizerCanvasToFloatInput(jpeg);
    const raw = await runModel(recognizerModel, input, [...SIMILAR_FACE_REFERENCE.recognizerInput]);
    if (raw.length < 512) {
      throw new Error("O reconhecedor retornou embedding incompleto.");
    }
    return raw.slice(0, 512);
  };

  return {
    sourceLabel,
    embedFile,
    compareFiles: async (left: File, right: File) => {
      const [leftEmbedding, rightEmbedding] = await Promise.all([
        embedFile(left),
        embedFile(right),
      ]);
      const cosine = cosineSimilarity512(leftEmbedding, rightEmbedding);
      return {
        cosine,
        score: similarFaceScorePercent(cosine),
        leftEmbedding,
        rightEmbedding,
      };
    },
  };
}

export async function loadSimilarFaceRuntimeFromXapk(file: File) {
  const models = await extractModelsFromXapk(file);
  await Promise.all([
    cachePut(CACHE_DETECTOR, models.detector),
    cachePut(CACHE_RECOGNIZER, models.recognizer),
  ]);
  return await createRuntime(models.detector, models.recognizer, "Similar Face 1.0.27 • XAPK local");
}

export async function loadCachedSimilarFaceRuntime() {
  const [detector, recognizer] = await Promise.all([
    cacheGet(CACHE_DETECTOR),
    cacheGet(CACHE_RECOGNIZER),
  ]);
  if (!detector || !recognizer) return null;
  return await createRuntime(detector, recognizer, "Similar Face 1.0.27 • cache local");
}

export async function clearCachedSimilarFaceRuntime() {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      tx.objectStore(CACHE_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignora falha de limpeza.
  }
}
