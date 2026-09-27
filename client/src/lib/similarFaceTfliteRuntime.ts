import {
  SIMILAR_FACE_REFERENCE,
  createDetectorRetryCanvas,
  createDetectorSquareCanvas,
  createReferenceAligned112,
  detectorCanvasToFloatInput,
  recognizerCanvasToFloatInput,
  resizeReferenceDetector640,
  parseDetectorRows,
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

const JSZIP_SCRIPT = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
const TF_CORE_SCRIPT = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.22.0/dist/tf-core.min.js";
const TF_CPU_SCRIPT = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu@4.22.0/dist/tf-backend-cpu.min.js";
const TFLITE_SCRIPT = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.10/dist/tf-tflite.min.js";
const TFLITE_WASM_ROOT = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.10/wasm/";

const MODEL_KEY = new Uint8Array([
  0x5e, 0x1f, 0x11, 0x2c, 0xc8, 0x6e, 0x3f, 0xf1,
  0x23, 0xa8, 0x2e, 0xff, 0x21, 0x21, 0xf2, 0x11,
]);

const CACHE_DB = "h2-similar-face-runtime";
const CACHE_STORE = "models";
const CACHE_DETECTOR = "fd_f32_v1";
const CACHE_RECOGNIZER = "fr_f16_v1";
const CACHE_STORAGE_NAME = "h2-similar-face-models-v1";
const CACHE_STORAGE_PREFIX = "/__h2-similar-face-model/";

let modulesPromise: Promise<RuntimeModules> | null = null;

function loadScriptOnce(src: string, globalCheck: () => boolean) {
  if (globalCheck()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-h2-src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Falha ao carregar ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.h2Src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(script);
  });
}

async function getModules(): Promise<RuntimeModules> {
  if (!modulesPromise) {
    modulesPromise = (async () => {
      await loadScriptOnce(TF_CORE_SCRIPT, () => Boolean((window as any).tf));
      await loadScriptOnce(TF_CPU_SCRIPT, () => {
        const tf = (window as any).tf;
        return Boolean(tf?.findBackend?.("cpu"));
      });
      await loadScriptOnce(TFLITE_SCRIPT, () => Boolean((window as any).tflite));

      const tf: any = (window as any).tf;
      const tflite: any = (window as any).tflite;
      if (!tf || !tflite) {
        throw new Error("Runtime TensorFlow/TFLite não inicializado.");
      }
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
    throw new Error("Componente do motor H2 Face não foi reconhecido.");
  }
  return out;
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // O navegador pode recusar persistência; o cache normal continua funcionando.
  }
}

function cacheStorageRequest(key: string) {
  return new Request(`${CACHE_STORAGE_PREFIX}${encodeURIComponent(key)}`, {
    method: "GET",
    cache: "no-store",
  });
}

async function cacheStoragePut(key: string, bytes: Uint8Array) {
  try {
    const cache = await caches.open(CACHE_STORAGE_NAME);
    const owned = Uint8Array.from(bytes);
    await cache.put(
      cacheStorageRequest(key),
      new Response(owned.buffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      }),
    );
  } catch {
    // Cache Storage é redundância; IndexedDB segue como principal.
  }
}

async function cacheStorageGet(key: string) {
  try {
    const cache = await caches.open(CACHE_STORAGE_NAME);
    const response = await cache.match(cacheStorageRequest(key));
    if (!response) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function cacheStorageClear() {
  try {
    await caches.delete(CACHE_STORAGE_NAME);
  } catch {
    // Ignora falha de limpeza.
  }
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
  await loadScriptOnce(JSZIP_SCRIPT, () => Boolean((window as any).JSZip));
  const JSZip: any = (window as any).JSZip;
  if (!JSZip) throw new Error("JSZip não inicializado.");
  const xapk = await JSZip.loadAsync(await file.arrayBuffer());

  const baseName = Object.keys(xapk.files).find((name) =>
    /com\.consisai\.face_album\.apk$/i.test(name),
  );
  if (!baseName) {
    throw new Error("Arquivo principal do motor H2 Face não encontrado.");
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
  const ownedBytes = Uint8Array.from(bytes);
  const blob = new Blob([ownedBytes.buffer], { type: "application/octet-stream" });
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

function detectionArea(detection: SimilarFaceDetection) {
  return Math.max(0, detection.x2 - detection.x1) *
    Math.max(0, detection.y2 - detection.y1);
}

function selectNativePrimaryFace(detections: SimilarFaceDetection[]) {
  return [...detections].sort((a, b) => {
    const areaDiff = detectionArea(b) - detectionArea(a);
    if (areaDiff !== 0) return areaDiff;
    return b.score - a.score;
  })[0];
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
  // Fluxo nativo do APK:
  // 1) imagem original -> quadrado preto com cópia no canto superior esquerdo
  // 2) resize para 640x640
  // 3) se falhar, adiciona 20% de borda NA imagem 640 e redimensiona de novo
  // 4) o alinhamento 112x112 usa exatamente a imagem 640 que foi detectada
  const firstSquare = createDetectorSquareCanvas(source);
  const firstDetectorCanvas = await resizeReferenceDetector640(firstSquare);

  const retryLetterboxed = createDetectorRetryCanvas(firstDetectorCanvas);
  const retryDetectorCanvas = await resizeReferenceDetector640(retryLetterboxed);

  const attempts = [firstDetectorCanvas, retryDetectorCanvas];

  for (const detectorCanvas of attempts) {
    const input = detectorCanvasToFloatInput(detectorCanvas);
    const raw = await runModel(model, input, [...SIMILAR_FACE_REFERENCE.detectorInput]);
    const detections = parseDetectorRows(raw);
    if (detections.length) {
      const primary = selectNativePrimaryFace(detections);
      return {
        detectorCanvas,
        detection: primary,
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
    const { detectorCanvas, detection } = await detectFivePoints(detectorModel, canvas);
    const aligned = await createReferenceAligned112(detectorCanvas, detection.landmarks);
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
  await requestPersistentStorage();
  await Promise.all([
    cachePut(CACHE_DETECTOR, models.detector),
    cachePut(CACHE_RECOGNIZER, models.recognizer),
    cacheStoragePut(CACHE_DETECTOR, models.detector),
    cacheStoragePut(CACHE_RECOGNIZER, models.recognizer),
  ]);
  return await createRuntime(models.detector, models.recognizer, "H2 Face • armazenamento persistente local");
}

export async function loadCachedSimilarFaceRuntime() {
  await requestPersistentStorage();

  let [detector, recognizer] = await Promise.all([
    cacheGet(CACHE_DETECTOR),
    cacheGet(CACHE_RECOGNIZER),
  ]);

  if (!detector || !recognizer) {
    [detector, recognizer] = await Promise.all([
      cacheStorageGet(CACHE_DETECTOR),
      cacheStorageGet(CACHE_RECOGNIZER),
    ]);

    if (detector && recognizer) {
      await Promise.all([
        cachePut(CACHE_DETECTOR, detector),
        cachePut(CACHE_RECOGNIZER, recognizer),
      ]);
    }
  }

  if (!detector || !recognizer) return null;
  return await createRuntime(detector, recognizer, "H2 Face • armazenamento persistente local");
}

async function fetchH2FaceServerModel(kind: "detector" | "recognizer") {
  try {
    const response = await fetch(`/api/h2-face/model/${kind}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "force-cache",
    });
    if (!response.ok) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.length < 8 ||
      bytes[4] !== 0x54 ||
      bytes[5] !== 0x46 ||
      bytes[6] !== 0x4c ||
      bytes[7] !== 0x33
    ) {
      throw new Error("Componente H2 Face inválido.");
    }
    return bytes;
  } catch {
    return null;
  }
}

export async function loadAutomaticH2FaceRuntime() {
  const cached = await loadCachedSimilarFaceRuntime();
  if (cached) return cached;

  const [detector, recognizer] = await Promise.all([
    fetchH2FaceServerModel("detector"),
    fetchH2FaceServerModel("recognizer"),
  ]);

  if (!detector || !recognizer) return null;

  await requestPersistentStorage();
  await Promise.all([
    cachePut(CACHE_DETECTOR, detector),
    cachePut(CACHE_RECOGNIZER, recognizer),
    cacheStoragePut(CACHE_DETECTOR, detector),
    cacheStoragePut(CACHE_RECOGNIZER, recognizer),
  ]);

  return await createRuntime(detector, recognizer, "H2 Face • pronto");
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

  await cacheStorageClear();
}
