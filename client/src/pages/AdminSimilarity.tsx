import { useMemo, useRef, useState } from "react";
import AdminHeader from "@/components/AdminHeader";
import { AlertTriangle, FolderOpen, ImagePlus, Play, RotateCcw, ScanFace, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { compareFaceGeometry, evaluateFaceGeometryQuality, type FaceLandmark, type RegionScores } from "@/lib/faceGeometry";

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
  regions?: RegionScores;
  warnings: string[];
  error?: string;
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

function calculateImageQuality(canvas: HTMLCanvasElement): ImageQuality {
  const sample = document.createElement("canvas");
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  sample.width = Math.max(32, Math.round(canvas.width * scale));
  sample.height = Math.max(32, Math.round(canvas.height * scale));
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { score: 70, brightness: 0, contrast: 0, sharpness: 0, warnings: ["qualidade da imagem não medida"] };

  ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
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
    imageQuality: calculateImageQuality(canvas),
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

  return {
    landmarks: face.slice(0, Math.min(478, face.length)),
    aspectRatio: prepared.aspectRatio,
    imageQuality: prepared.imageQuality,
  };
}

function formatScore(score: number | null) {
  return score === null ? "—" : `${score.toFixed(1)}%`;
}

function scoreLabel(score: number | null) {
  if (score === null) return "Sem leitura";
  if (score >= 90) return "Muito alta";
  if (score >= 80) return "Alta";
  if (score >= 70) return "Moderada";
  return "Baixa";
}

export default function AdminSimilarity() {
  const masterInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [masterPreview, setMasterPreview] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidatePhoto[]>([]);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: "" });
  const [masterQuality, setMasterQuality] = useState<{ score: number; warnings: string[]; imageScore: number } | null>(null);

  const rankedResults = useMemo(
    () => [...results].sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1)),
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

  const clearAll = () => {
    if (masterPreview) URL.revokeObjectURL(masterPreview);
    candidates.forEach((item) => URL.revokeObjectURL(item.preview));
    setMasterFile(null);
    setMasterPreview(null);
    setCandidates([]);
    setResults([]);
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
      const masterQ = { score: masterCombinedQuality, warnings: masterWarnings, imageScore: masterDetected.imageQuality.score };
      setMasterQuality(masterQ);
      const nextResults: ComparisonResult[] = [];

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
          const reliability = clamp(Math.min(masterQ.score, candidateCombinedQuality) * 0.72 + ((masterQ.score + candidateCombinedQuality) / 2) * 0.28);

          nextResults.push({
            id: candidate.id,
            name: candidate.file.name,
            preview: candidate.preview,
            similarity: comparison.similarity,
            reliability,
            regions: comparison.regions,
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

      toast.success("Comparação concluída.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível iniciar a análise facial.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080910] text-white">
      <AdminHeader title="Similaridade Facial" icon={<ScanFace className="h-5 w-5" />} backTo="/admin/codes" />

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
            <div>
              <h2 className="font-bold text-cyan-100">Processamento local</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                As fotos selecionadas não são enviadas para R2 nem gravadas no banco. A rota usa até 478 pontos faciais 3D no navegador, alinhamento rígido de pose e cálculo geométrico robusto. O resultado é uma medida de semelhança de geometria facial, não uma confirmação de identidade.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
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
                    onClick={() => {
                      if (masterPreview) URL.revokeObjectURL(masterPreview);
                      setMasterFile(null);
                      setMasterPreview(null);
                      setMasterQuality(null);
                      setResults([]);
                    }}
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
                    <span className="text-slate-400">Qualidade geométrica</span>
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

              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-400">{candidates.length} imagem(ns) selecionada(s)</span>
                {candidates.length > 0 && (
                  <button type="button" onClick={clearAll} className="flex items-center gap-1.5 text-xs font-bold text-red-300 hover:text-red-200">
                    <Trash2 className="h-3.5 w-3.5" /> Limpar
                  </button>
                )}
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
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
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Ranking</p>
                    <h2 className="text-xl font-black">Resultado da geometria</h2>
                  </div>
                  <span className="text-xs text-slate-500">Maior similaridade primeiro</span>
                </div>

                {rankedResults.map((result, index) => (
                  <article key={result.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                    <div className="flex gap-4 p-4">
                      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-black/40">
                        <img src={result.preview} alt={result.name} className="h-full w-full object-cover" />
                        <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-1 text-xs font-black">#{index + 1}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-300">{result.name}</p>
                        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
                          <div>
                            <p className="text-4xl font-black tracking-tight text-cyan-300">{formatScore(result.similarity)}</p>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{scoreLabel(result.similarity)} similaridade geométrica</p>
                          </div>
                          {result.reliability !== null && (
                            <div className="mb-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                              <p className="text-[10px] uppercase text-slate-500">Confiabilidade da leitura</p>
                              <p className="text-sm font-black">{result.reliability.toFixed(0)}%</p>
                            </div>
                          )}
                        </div>

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
                      <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 sm:grid-cols-4 lg:grid-cols-9">
                        {[
                          ["Global", result.regions.global],
                          ["Olhos", result.regions.eyes],
                          ["Sobrancelhas", result.regions.brows],
                          ["Nariz", result.regions.nose],
                          ["Maxilar / oval", result.regions.oval],
                          ["Boca", result.regions.mouth],
                          ["Proporções", result.regions.proportions],
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
  );
}
