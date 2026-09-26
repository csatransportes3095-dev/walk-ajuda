import { useMemo, useRef, useState } from "react";
import AdminHeader from "@/components/AdminHeader";
import { AlertTriangle, FolderOpen, ImagePlus, Play, RotateCcw, ScanFace, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { compareFaceGeometry, evaluateFaceGeometryQuality, type FaceLandmark, type RegionScores } from "@/lib/faceGeometry";
import { createCanonicalFaceCanvases } from "@/lib/facePreprocess";
import { analyzeFaceCaptureQuality, confidenceLabel, type FaceCaptureQuality } from "@/lib/faceQuality";
import { extractIdentityDescriptor, compareIdentityDescriptors, type FaceIdentityDescriptor } from "@/lib/faceIdentity";
import { decideFaceMatch, type MatchVerdict } from "@/lib/faceMatchDecision";

type CandidatePhoto = {
  id: string;
  file: File;
  preview: string;
};

type ComparisonResult = {
  id: string;
  name: string;
  preview: string;
  similarity: number | null;
  reliability: number | null;
  criticalFloor?: number;
  criticalMean?: number;
  geometryScore?: number;
  identityScore?: number;
  identityRaw?: number;
  identityDistance?: number | null;
  verdict?: MatchVerdict;
  verdictDetail?: string;
  regions?: RegionScores;
  masterCaptureQuality?: FaceCaptureQuality;
  candidateCaptureQuality?: FaceCaptureQuality;
  warnings: string[];
  error?: string;
};

type PairwiseResult = {
  id: string;
  leftName: string;
  rightName: string;
  leftPreview: string;
  rightPreview: string;
  similarity: number;
  reliability: number;
};

type AnalyzedFaceForPairs = {
  id: string;
  name: string;
  preview: string;
  detected: DetectedFace;
  identity: FaceIdentityDescriptor;
};

type ImageQuality = {
  score: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  warnings: string[];
};

type DetectedFace = {
  landmarks: FaceLandmark[];
  aspectRatio: number;
  imageQuality: ImageQuality;
  captureQuality: FaceCaptureQuality;
  canvas: HTMLCanvasElement;
  identityCanvas: HTMLCanvasElement;
  identityFallbackCanvas: HTMLCanvasElement;
};

type FaceLandmarkerInstance = {
  detect: (image: HTMLCanvasElement) => {
    faceLandmarks?: FaceLandmark[][];
  };
};

const MP_VERSION = "1.0.1";
const MP_MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/+esm`;
const MP_WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let faceLandmarkerPromise: Promise<FaceLandmarkerInstance> | null = null;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

async function getFaceLandmarker(): Promise<FaceLandmarkerInstance> {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const visionModule: any = await import(/* @vite-ignore */ MP_MODULE_URL);
      const vision = await visionModule.FilesetResolver.forVisionTasks(MP_WASM_ROOT);

      try {
        return await visionModule.FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MP_MODEL_URL, delegate: "GPU" },
          runningMode: "IMAGE",
          numFaces: 3,
          minFaceDetectionConfidence: 0.82,
          minFacePresenceConfidence: 0.82,
          minTrackingConfidence: 0.82,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true,
        });
      } catch {
        // Fallback para máquinas/navegadores sem WebGL/GPU compatível.
        return await visionModule.FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MP_MODEL_URL, delegate: "CPU" },
          runningMode: "IMAGE",
          numFaces: 3,
          minFaceDetectionConfidence: 0.82,
          minFacePresenceConfidence: 0.82,
          minTrackingConfidence: 0.82,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true,
        });
      }
    })();
  }
  return faceLandmarkerPromise;
}

function calculateImageQuality(canvas: HTMLCanvasElement, landmarks?: FaceLandmark[]): ImageQuality {
  const sample = document.createElement("canvas");
  const maxSide = 420;

  let sx = 0;
  let sy = 0;
  let sw = canvas.width;
  let sh = canvas.height;

  if (landmarks?.length) {
    const xs = landmarks.map((p) => p.x);
    const ys = landmarks.map((p) => p.y);
    const minX = Math.max(0, Math.min(...xs));
    const maxX = Math.min(1, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxY = Math.min(1, Math.max(...ys));
    const padX = (maxX - minX) * 0.18;
    const padY = (maxY - minY) * 0.18;
    const x1 = Math.max(0, minX - padX);
    const x2 = Math.min(1, maxX + padX);
    const y1 = Math.max(0, minY - padY);
    const y2 = Math.min(1, maxY + padY);
    sx = Math.floor(x1 * canvas.width);
    sy = Math.floor(y1 * canvas.height);
    sw = Math.max(1, Math.ceil((x2 - x1) * canvas.width));
    sh = Math.max(1, Math.ceil((y2 - y1) * canvas.height));
  }

  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  sample.width = Math.max(32, Math.round(sw * scale));
  sample.height = Math.max(32, Math.round(sh * scale));
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { score: 70, brightness: 0, contrast: 0, sharpness: 0, warnings: ["qualidade da imagem não medida"] };

  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sample.width, sample.height);
  const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
  const gray = new Float32Array(sample.width * sample.height);
  let sum = 0;
  let sumSq = 0;

  for (let p = 0, i = 0; i < data.length; i += 4, p += 1) {
    const g = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    gray[p] = g;
    sum += g;
    sumSq += g * g;
  }

  const n = gray.length || 1;
  const brightness = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - brightness * brightness));

  // Variância do Laplaciano: indicador simples de nitidez/desfoque.
  let lapSum = 0;
  let lapSumSq = 0;
  let lapN = 0;
  for (let y = 1; y < sample.height - 1; y += 1) {
    for (let x = 1; x < sample.width - 1; x += 1) {
      const k = y * sample.width + x;
      const lap = gray[k - sample.width] + gray[k + sample.width] + gray[k - 1] + gray[k + 1] - 4 * gray[k];
      lapSum += lap;
      lapSumSq += lap * lap;
      lapN += 1;
    }
  }
  const lapMean = lapSum / Math.max(1, lapN);
  const sharpness = Math.sqrt(Math.max(0, lapSumSq / Math.max(1, lapN) - lapMean * lapMean));

  let score = 100;
  const warnings: string[] = [];
  if (brightness < 55) { score -= 24; warnings.push("foto muito escura"); }
  else if (brightness < 75) { score -= 10; warnings.push("foto escura"); }
  if (brightness > 220) { score -= 22; warnings.push("foto muito clara/estourada"); }
  else if (brightness > 200) { score -= 9; warnings.push("foto muito clara"); }
  if (contrast < 24) { score -= 18; warnings.push("baixo contraste"); }
  if (sharpness < 8) { score -= 32; warnings.push("foto desfocada"); }
  else if (sharpness < 13) { score -= 14; warnings.push("nitidez baixa"); }

  return { score: clamp(score), brightness, contrast, sharpness, warnings };
}

async function fileToCanvas(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    bitmap = await createImageBitmap(file);
  }

  const maxSide = 1800;
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) {
    bitmap.close();
    throw new Error("Não foi possível preparar a imagem.");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return {
    canvas,
    aspectRatio: canvas.width / Math.max(1, canvas.height),
  };
}

async function detectFace(file: File): Promise<DetectedFace | null> {
  const model = await getFaceLandmarker();
  const prepared = await fileToCanvas(file);
  const result = model.detect(prepared.canvas);
  const faces = result.faceLandmarks || [];

  if (faces.length > 1) {
    throw new Error("A foto contém mais de um rosto. Use uma imagem com apenas uma pessoa.");
  }

  const face = faces[0];
  if (!face || face.length < 468) return null;

  const landmarks = face.slice(0, Math.min(478, face.length));
  const canonical = createCanonicalFaceCanvases(prepared.canvas, landmarks);

  return {
    landmarks,
    aspectRatio: prepared.aspectRatio,
    imageQuality: calculateImageQuality(prepared.canvas, face),
    captureQuality: analyzeFaceCaptureQuality(prepared.canvas, landmarks, prepared.aspectRatio),
    canvas: prepared.canvas,
    identityCanvas: canonical.primary,
    identityFallbackCanvas: canonical.fallback,
  };
}

function formatScore(score: number | null) {
  return score === null ? "—" : `${score.toFixed(1)}%`;
}

function scoreLabel(score: number | null) {
  if (score === null) return "Sem leitura";
  if (score >= 90) return "Muito alta";
  if (score >= 75) return "Alta";
  if (score >= 60) return "Moderada";
  if (score >= 40) return "Parcial";
  return "Baixa";
}

function verdictFor(result: ComparisonResult) {
  if (result.similarity === null || !result.verdict) {
    return { label: "INCONCLUSIVO", detail: result.error || "Não houve leitura suficiente para comparar.", tone: "text-slate-300 border-white/10 bg-white/5" };
  }

  if (result.verdict === "strong") {
    return { label: "FORTEMENTE COMPATÍVEL", detail: result.verdictDetail || "Vetor facial e geometria concordam fortemente.", tone: "text-emerald-200 border-emerald-400/25 bg-emerald-500/10" };
  }
  if (result.verdict === "near") {
    return { label: "CHEGA PERTO", detail: result.verdictDetail || "Existe aproximação relevante, mas ainda há diferenças.", tone: "text-cyan-200 border-cyan-400/25 bg-cyan-500/10" };
  }
  if (result.verdict === "partial") {
    return { label: "SEMELHANÇA PARCIAL", detail: result.verdictDetail || "Há alguns sinais de semelhança, mas não uma correspondência forte.", tone: "text-amber-200 border-amber-400/25 bg-amber-500/10" };
  }
  if (result.verdict === "inconclusive") {
    return { label: "INCONCLUSIVO", detail: result.verdictDetail || "A qualidade da leitura ainda não é suficiente.", tone: "text-amber-200 border-amber-400/25 bg-amber-500/10" };
  }
  return { label: "BAIXA COMPATIBILIDADE", detail: result.verdictDetail || "O vetor facial e a geometria não sustentam uma correspondência forte.", tone: "text-red-200 border-red-400/25 bg-red-500/10" };
}

const H2_LOGO = "/h2-brand-192.png";

function qualifiesForGoodUse(result: ComparisonResult) {
  return (result.similarity ?? 0) >= 64 && (result.criticalMean ?? 0) >= 64;
}

export default function AdminSimilarity() {
  const masterInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [masterPreview, setMasterPreview] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidatePhoto[]>([]);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [pairwiseResults, setPairwiseResults] = useState<PairwiseResult[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: "" });
  const [masterQuality, setMasterQuality] = useState<{ score: number; warnings: string[]; imageScore: number; capture: FaceCaptureQuality } | null>(null);

  const rankedResults = useMemo(
    () =>
      [...results].sort((a, b) => {
        const aPreferred = qualifiesForGoodUse(a) ? 1 : 0;
        const bPreferred = qualifiesForGoodUse(b) ? 1 : 0;

        // Preferências pulsantes sempre aparecem primeiro.
        if (aPreferred !== bPreferred) return bPreferred - aPreferred;

        // Dentro do mesmo grupo, maior resultado final primeiro.
        const similarityDiff = (b.similarity ?? -1) - (a.similarity ?? -1);
        if (similarityDiff !== 0) return similarityDiff;

        // Desempate: maior conjunto crítico primeiro.
        return (b.criticalMean ?? -1) - (a.criticalMean ?? -1);
      }),
    [results]
  );

  const setMaster = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida.");
      return;
    }
    if (masterPreview) URL.revokeObjectURL(masterPreview);
    setMasterFile(file);
    setMasterPreview(URL.createObjectURL(file));
    setMasterQuality(null);
    setResults([]);
  };

  const addFiles = (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      toast.error("Nenhuma imagem válida foi selecionada.");
      return;
    }

    setCandidates((current) => {
      const existing = new Set(current.map((item) => `${item.file.name}|${item.file.size}|${item.file.lastModified}`));
      const added = imageFiles
        .filter((file) => !existing.has(`${file.name}|${file.size}|${file.lastModified}`))
        .map((file) => ({
          id: crypto.randomUUID(),
          file,
          preview: URL.createObjectURL(file),
        }));
      return [...current, ...added];
    });
    setResults([]);
  };

  const removeCandidate = (id: string) => {
    setCandidates((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((item) => item.id !== id);
    });
    setResults((current) => current.filter((item) => item.id !== id));
  };

  const clearMaster = () => {
    if (masterPreview) URL.revokeObjectURL(masterPreview);
    setMasterFile(null);
    setMasterPreview(null);
    setMasterQuality(null);
    setResults([]);
    if (masterInputRef.current) masterInputRef.current.value = "";
  };

  const clearCandidates = () => {
    candidates.forEach((item) => URL.revokeObjectURL(item.preview));
    setCandidates([]);
    setResults([]);
    setPairwiseResults([]);
    setProgress({ current: 0, total: 0, name: "" });
    if (filesInputRef.current) filesInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const clearAll = () => {
    if (masterPreview) URL.revokeObjectURL(masterPreview);
    candidates.forEach((item) => URL.revokeObjectURL(item.preview));
    setMasterFile(null);
    setMasterPreview(null);
    setCandidates([]);
    setResults([]);
    setPairwiseResults([]);
    setMasterQuality(null);
    setProgress({ current: 0, total: 0, name: "" });
  };

  const analyze = async () => {
    if (!masterFile) {
      toast.error("Selecione a Foto Mestre.");
      return;
    }
    if (!candidates.length) {
      toast.error("Selecione pelo menos uma foto para comparar.");
      return;
    }

    setAnalyzing(true);
    setResults([]);
    setPairwiseResults([]);
    setProgress({ current: 0, total: candidates.length, name: "Preparando motor facial..." });

    try {
      const masterDetected = await detectFace(masterFile);
      if (!masterDetected) {
        toast.error("Não foi possível detectar um rosto completo na Foto Mestre.");
        return;
      }

      const masterGeometryQ = evaluateFaceGeometryQuality(masterDetected.landmarks, masterDetected.aspectRatio);
      const masterCombinedQuality = clamp(masterGeometryQ.score * 0.72 + masterDetected.imageQuality.score * 0.28);
      const masterWarnings = Array.from(new Set([...masterGeometryQ.warnings, ...masterDetected.imageQuality.warnings]));
      const masterQ = {
        score: masterCombinedQuality,
        warnings: masterWarnings,
        imageScore: masterDetected.imageQuality.score,
        capture: masterDetected.captureQuality,
      };
      setMasterQuality(masterQ);

      if (masterQ.score < 45) {
        toast.error("A Foto Mestre está com qualidade insuficiente. Use uma foto mais nítida, frontal e bem iluminada.");
        return;
      }

      setProgress({ current: 0, total: candidates.length, name: "Gerando vetor facial da Foto Mestre..." });
      let masterIdentity: FaceIdentityDescriptor;
      try {
        masterIdentity = await extractIdentityDescriptor(masterDetected.identityCanvas, masterDetected.identityFallbackCanvas);
      } catch (error: any) {
        toast.error(error?.message || "Não foi possível gerar o vetor facial da Foto Mestre.");
        return;
      }

      const nextResults: ComparisonResult[] = [];
      const analyzedFaces: AnalyzedFaceForPairs[] = [
        {
          id: "master",
          name: masterFile.name,
          preview: masterPreview || "",
          detected: masterDetected,
          identity: masterIdentity,
        },
      ];

      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        setProgress({ current: index + 1, total: candidates.length, name: candidate.file.name });

        try {
          const candidateDetected = await detectFace(candidate.file);
          if (!candidateDetected) {
            nextResults.push({
              id: candidate.id,
              name: candidate.file.name,
              preview: candidate.preview,
              similarity: null,
              reliability: null,
              warnings: ["Nenhum rosto completo detectado"],
              error: "Rosto não detectado",
            });
            setResults([...nextResults]);
            continue;
          }

          const candidateGeometryQ = evaluateFaceGeometryQuality(candidateDetected.landmarks, candidateDetected.aspectRatio);
          const candidateCombinedQuality = clamp(candidateGeometryQ.score * 0.72 + candidateDetected.imageQuality.score * 0.28);
          const qualityWarnings = Array.from(new Set([...candidateGeometryQ.warnings, ...candidateDetected.imageQuality.warnings]));
          const comparison = compareFaceGeometry(
            masterDetected.landmarks,
            candidateDetected.landmarks,
            masterDetected.aspectRatio,
            candidateDetected.aspectRatio,
          );

          setProgress({ current: index + 1, total: candidates.length, name: `${candidate.file.name} • vetor facial` });
          const candidateIdentity = await extractIdentityDescriptor(candidateDetected.identityCanvas, candidateDetected.identityFallbackCanvas);
          analyzedFaces.push({
            id: candidate.id,
            name: candidate.file.name,
            preview: candidate.preview,
            detected: candidateDetected,
            identity: candidateIdentity,
          });
          const identityComparison = await compareIdentityDescriptors(masterIdentity, candidateIdentity);

          const captureReliability = Math.min(masterDetected.captureQuality.score, candidateDetected.captureQuality.score);
          const reliability = clamp(
            captureReliability * 0.65 +
            Math.min(masterQ.score, candidateCombinedQuality) * 0.35
          );
          const decision = decideFaceMatch({
            identityRawSimilarity: identityComparison.rawSimilarity,
            geometrySimilarity: comparison.similarity,
            geometryCriticalMean: comparison.criticalMean,
            geometryCriticalFloor: comparison.criticalFloor,
            globalScore: comparison.regions.global,
            eyesScore: comparison.regions.eyes,
            noseScore: comparison.regions.nose,
            ovalScore: comparison.regions.oval,
            cheeksScore: comparison.regions.cheeks,
            jawScore: comparison.regions.jaw,
            chinScore: comparison.regions.chin,
            proportionsScore: comparison.regions.proportions,
            measurementsScore: comparison.regions.measurements,
            structureScore: comparison.regions.structure,
            symmetryScore: comparison.regions.symmetry,
            reliability,
          });

          if (reliability < 40) {
            nextResults.push({
              id: candidate.id,
              name: candidate.file.name,
              preview: candidate.preview,
              similarity: null,
              reliability,
              warnings: Array.from(new Set([...masterQ.warnings.map((w) => `Mestre: ${w}`), ...qualityWarnings])),
              error: "Qualidade insuficiente para uma comparação confiável",
            });
            setResults([...nextResults]);
            continue;
          }

          nextResults.push({
            id: candidate.id,
            name: candidate.file.name,
            preview: candidate.preview,
            similarity: decision.finalScore,
            reliability,
            criticalFloor: comparison.criticalFloor,
            criticalMean: comparison.criticalMean,
            geometryScore: comparison.similarity,
            identityScore: decision.identityScore,
            identityRaw: decision.identityRawSimilarity,
            identityDistance: identityComparison.distance,
            verdict: decision.verdict,
            verdictDetail: decision.detail,
            regions: comparison.regions,
            masterCaptureQuality: masterDetected.captureQuality,
            candidateCaptureQuality: candidateDetected.captureQuality,
            warnings: Array.from(new Set([...masterQ.warnings.map((w) => `Mestre: ${w}`), ...qualityWarnings])),
          });
          setResults([...nextResults]);
        } catch (error: any) {
          nextResults.push({
            id: candidate.id,
            name: candidate.file.name,
            preview: candidate.preview,
            similarity: null,
            reliability: null,
            warnings: [],
            error: error?.message || "Erro na análise",
          });
          setResults([...nextResults]);
        }
      }

      if (analyzedFaces.length >= 3) {
        const pairs: PairwiseResult[] = [];
        for (let i = 0; i < analyzedFaces.length; i += 1) {
          for (let j = i + 1; j < analyzedFaces.length; j += 1) {
            const left = analyzedFaces[i];
            const right = analyzedFaces[j];

            const pairGeometry = compareFaceGeometry(
              left.detected.landmarks,
              right.detected.landmarks,
              left.detected.aspectRatio,
              right.detected.aspectRatio,
            );
            const pairIdentity = await compareIdentityDescriptors(left.identity, right.identity);
            const pairReliability = clamp(
              Math.min(left.detected.captureQuality.score, right.detected.captureQuality.score) * 0.65 +
              Math.min(left.detected.imageQuality.score, right.detected.imageQuality.score) * 0.35
            );
            const pairDecision = decideFaceMatch({
              identityRawSimilarity: pairIdentity.rawSimilarity,
              geometrySimilarity: pairGeometry.similarity,
              geometryCriticalMean: pairGeometry.criticalMean,
              geometryCriticalFloor: pairGeometry.criticalFloor,
              globalScore: pairGeometry.regions.global,
              eyesScore: pairGeometry.regions.eyes,
              noseScore: pairGeometry.regions.nose,
              ovalScore: pairGeometry.regions.oval,
              cheeksScore: pairGeometry.regions.cheeks,
              jawScore: pairGeometry.regions.jaw,
              chinScore: pairGeometry.regions.chin,
              proportionsScore: pairGeometry.regions.proportions,
              measurementsScore: pairGeometry.regions.measurements,
              structureScore: pairGeometry.regions.structure,
              symmetryScore: pairGeometry.regions.symmetry,
              reliability: pairReliability,
            });

            pairs.push({
              id: `${left.id}::${right.id}`,
              leftName: left.name,
              rightName: right.name,
              leftPreview: left.preview,
              rightPreview: right.preview,
              similarity: pairDecision.finalScore,
              reliability: pairReliability,
            });
          }
        }
        pairs.sort((a, b) => b.similarity - a.similarity);
        setPairwiseResults(pairs);
      }

      toast.success("Comparação concluída.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível iniciar a análise facial.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06070d] text-white">
      <style>{`
        @keyframes h2-neon-pulse {
          0%, 100% {
            border-color: rgba(34, 211, 238, .42);
            box-shadow: 0 0 0 rgba(34,211,238,0), 0 0 18px rgba(34,211,238,.14), inset 0 0 22px rgba(34,211,238,.035);
          }
          50% {
            border-color: rgba(74, 222, 128, .92);
            box-shadow: 0 0 14px rgba(34,211,238,.42), 0 0 34px rgba(74,222,128,.28), inset 0 0 32px rgba(34,211,238,.08);
          }
        }
        @keyframes h2-good-badge-pulse {
          0%, 100% { opacity: .82; transform: scale(1); text-shadow: 0 0 8px rgba(74,222,128,.45); }
          50% { opacity: 1; transform: scale(1.035); text-shadow: 0 0 16px rgba(34,211,238,.9), 0 0 24px rgba(74,222,128,.75); }
        }
        .h2-good-use-card { animation: h2-neon-pulse 1.45s ease-in-out infinite; }
        .h2-good-use-badge { animation: h2-good-badge-pulse 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .h2-good-use-card, .h2-good-use-badge { animation: none !important; }
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
        <img
          src={H2_LOGO}
          alt=""
          aria-hidden="true"
          className="w-[58vw] max-w-[820px] min-w-[320px] select-none object-contain opacity-[0.035] sm:opacity-[0.045]"
        />
      </div>

      <div className="relative z-10">
        <AdminHeader title="Similaridade Facial" icon={<ScanFace className="h-5 w-5" />} backTo="/admin/codes" />

        <header className="border-b border-cyan-400/10 bg-gradient-to-r from-black/55 via-[#0b1220]/80 to-black/55">
          <div className="mx-auto flex w-full max-w-[1920px] items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <img src={H2_LOGO} alt="H2 Colombiano" className="h-16 w-16 shrink-0 rounded-2xl object-contain ring-1 ring-cyan-300/25 shadow-lg shadow-cyan-950/40 sm:h-20 sm:w-20" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300 sm:text-xs">H2 COLOMBIANO</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Comparador de Similaridade Facial</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400 sm:text-sm">Análise biofacial local com vetor facial, geometria e medidas estruturais.</p>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1920px] space-y-5 px-3 py-4 sm:px-5 sm:py-5 lg:px-8 xl:px-10">
        <section className="rounded-2xl border border-cyan-400/20 bg-[#07141a]/90 p-4 shadow-lg shadow-black/20 sm:p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
            <div>
              <h2 className="font-bold text-cyan-100">Processamento local</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                As fotos selecionadas não são enviadas para R2 nem gravadas no banco. Antes do vetor facial, o sistema mascara tudo fora do oval real da face: fundo, cabelo e orelhas ficam com peso zero. A comparação combina embedding facial com medidas de olhos, sobrancelhas, nariz, boca, bochechas, maxilar, queixo e proporções 3D.
              </p>
            </div>
          </div>
        </section>

        <section className="grid min-w-0 gap-5 lg:grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-400/25 bg-white/[0.035] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Referência</p>
                  <h2 className="text-lg font-black">Foto Mestre</h2>
                </div>
                {masterFile && (
                  <button
                    type="button"
                    onClick={clearMaster}
                    className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                    title="Remover Foto Mestre"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => masterInputRef.current?.click()}
                className="flex min-h-[250px] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-amber-400/35 bg-black/25 transition hover:border-amber-300/70 hover:bg-amber-400/5"
              >
                {masterPreview ? (
                  <img src={masterPreview} alt="Foto Mestre" className="max-h-[360px] w-full object-contain" />
                ) : (
                  <div className="px-6 text-center">
                    <ImagePlus className="mx-auto h-12 w-12 text-amber-300/65" />
                    <p className="mt-3 font-bold">Selecionar Foto Mestre</p>
                    <p className="mt-1 text-xs text-slate-500">Preferência: rosto frontal, bem iluminado e sem corte.</p>
                  </div>
                )}
              </button>
              <input
                ref={masterInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  setMaster(e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />

              {masterQuality && (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Qualidade da leitura</span>
                    <strong>{masterQuality.score.toFixed(0)}%</strong>
                  </div>
                  {masterQuality.warnings.length > 0 && (
                    <p className="mt-2 text-xs text-amber-300">{masterQuality.warnings.join(" • ")}</p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Comparação</p>
              <h2 className="mt-1 text-lg font-black">Fotos para comparar</h2>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => filesInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-3 text-sm font-bold text-cyan-100 hover:bg-cyan-400/15"
                >
                  <ImagePlus className="h-4 w-4" /> Fotos
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-400/10 px-3 py-3 text-sm font-bold text-violet-100 hover:bg-violet-400/15"
                >
                  <FolderOpen className="h-4 w-4" /> Pasta
                </button>
              </div>

              <input
                ref={filesInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                {...({ webkitdirectory: "", directory: "" } as any)}
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-400">{candidates.length} imagem(ns) selecionada(s)</span>
                  {results.length > 0 && <span className="text-[11px] font-bold text-cyan-300">{results.length} resultado(s)</span>}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
                  <button
                    type="button"
                    onClick={clearMaster}
                    disabled={!masterFile}
                    className="flex items-center justify-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2.5 text-xs font-black text-amber-200 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <X className="h-3.5 w-3.5" /> Limpar Mestre
                  </button>
                  <button
                    type="button"
                    onClick={clearCandidates}
                    disabled={candidates.length === 0}
                    className="flex items-center justify-center gap-2 rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2.5 text-xs font-black text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpar Comparações
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={!masterFile && candidates.length === 0 && results.length === 0}
                    className="flex items-center justify-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/5 px-3 py-2.5 text-xs font-black text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Limpar Tudo
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={analyzing || !masterFile || candidates.length === 0}
                onClick={analyze}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3.5 font-black text-white shadow-lg shadow-cyan-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {analyzing ? <RotateCcw className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                {analyzing ? "Analisando..." : "Analisar Similaridade"}
              </button>

              {analyzing && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                    <span className="truncate pr-3">{progress.name}</span>
                    <span>{progress.current}/{progress.total}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-400 transition-all"
                      style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 3}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {candidates.length > 0 && results.length === 0 && !analyzing && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {candidates.map((candidate) => (
                    <div key={candidate.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      <img src={candidate.preview} alt={candidate.file.name} className="aspect-square w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeCandidate(candidate.id)}
                        className="absolute right-2 top-2 rounded-lg bg-black/70 p-1.5 text-white opacity-80 hover:bg-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <p className="truncate px-2 py-2 text-[11px] text-slate-300">{candidate.file.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rankedResults.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Ranking</p>
                    <h2 className="text-xl font-black">Resultado biofacial</h2>
                  </div>
                  <span className="text-xs text-slate-500">Preferências pulsantes primeiro</span>
                </div>

                {rankedResults.map((result, index) => (
                  <article
                    key={result.id}
                    className={`overflow-hidden rounded-2xl border bg-white/[0.035] transition-shadow ${qualifiesForGoodUse(result) ? "h2-good-use-card border-cyan-300/60" : "border-white/10"}`}
                  >
                    {qualifiesForGoodUse(result) && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-300/25 bg-gradient-to-r from-emerald-500/15 via-cyan-400/10 to-emerald-500/15 px-4 py-2.5">
                        <div className="h2-good-use-badge flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
                          <ShieldCheck className="h-4 w-4 text-cyan-300" />
                          % BOA PARA USO
                        </div>
                        <div className="text-[11px] font-bold text-cyan-100/85">
                          Final {formatScore(result.similarity)} • Crítico {result.criticalMean?.toFixed(1)}%
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-4 p-4 sm:flex-row">
                      <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl bg-black/40 sm:h-28 sm:w-28">
                        <img src={result.preview} alt={result.name} className="h-full w-full object-cover" />
                        <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-1 text-xs font-black">#{index + 1}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="max-w-full truncate text-sm font-bold text-slate-300" title={result.name}>{result.name}</p>
                        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
                          <div>
                            <p className="text-4xl font-black tracking-tight text-cyan-300">{formatScore(result.similarity)}</p>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{scoreLabel(result.similarity)} compatibilidade biofacial</p>
                          </div>
                          {result.identityScore !== undefined && (
                            <div className="mb-1 rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2">
                              <p className="text-[10px] uppercase text-slate-500">Vetor facial</p>
                              <p className="text-sm font-black text-emerald-200">{result.identityScore.toFixed(1)}%</p>
                            </div>
                          )}
                          {result.geometryScore !== undefined && (
                            <div className="mb-1 rounded-lg border border-violet-400/20 bg-violet-500/5 px-3 py-2">
                              <p className="text-[10px] uppercase text-slate-500">Geometria</p>
                              <p className="text-sm font-black text-violet-200">{result.geometryScore.toFixed(1)}%</p>
                            </div>
                          )}
                          {result.reliability !== null && (
                            <div className="mb-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                              <p className="text-[10px] uppercase text-slate-500">Confiabilidade da leitura</p>
                              <p className="text-sm font-black">{result.reliability.toFixed(0)}%</p>
                            </div>
                          )}
                        </div>

                        {!result.error && result.similarity !== null && (() => {
                          const verdict = verdictFor(result);
                          return (
                            <div className={`mt-3 rounded-xl border px-3 py-2 ${verdict.tone}`}>
                              <p className="text-xs font-black tracking-wide">{verdict.label}</p>
                              <p className="mt-1 text-xs leading-5 opacity-85">{verdict.detail}</p>
                              <p className="mt-1 text-[10px] opacity-65">
                                {result.identityRaw !== undefined ? `Embedding bruto: ${(result.identityRaw * 100).toFixed(1)}% • ` : ""}
                                {result.criticalFloor !== undefined ? `Elo geométrico: ${result.criticalFloor.toFixed(1)}%` : ""}
                                {result.criticalMean !== undefined ? ` • Conjunto crítico: ${result.criticalMean.toFixed(1)}%` : ""}
                              </p>
                            </div>
                          );
                        })()}

                        {result.error && (
                          <p className="mt-2 flex items-center gap-2 text-sm font-bold text-red-300">
                            <AlertTriangle className="h-4 w-4" /> {result.error}
                          </p>
                        )}
                        {result.warnings.length > 0 && (
                          <p className="mt-2 text-xs text-amber-300">{result.warnings.join(" • ")}</p>
                        )}
                      </div>
                    </div>

                    {result.regions && (
                      <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
                        {[
                          ["Global", result.regions.global],
                          ["Olhos", result.regions.eyes],
                          ["Sobrancelhas", result.regions.brows],
                          ["Nariz", result.regions.nose],
                          ["Oval facial", result.regions.oval],
                          ["Bochechas", result.regions.cheeks],
                          ["Maxilar", result.regions.jaw],
                          ["Queixo", result.regions.chin],
                          ["Boca", result.regions.mouth],
                          ["Proporções", result.regions.proportions],
                          ["Medidas exatas", result.regions.measurements],
                          ["Simetria", result.regions.symmetry],
                          ["Estrutura", result.regions.structure],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="bg-[#0c0d14] px-3 py-3 text-center">
                            <p className="text-[10px] uppercase text-slate-500">{label}</p>
                            <p className="mt-1 text-sm font-black">{Number(value).toFixed(1)}%</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            {candidates.length === 0 && (
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <div>
                  <ScanFace className="mx-auto h-16 w-16 text-white/15" />
                  <h2 className="mt-4 text-xl font-black text-white/70">Comparador facial</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                    Selecione uma Foto Mestre e depois as fotos — ou uma pasta inteira — que serão comparadas com ela.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
        </main>
      </div>
    </div>
  );
}
