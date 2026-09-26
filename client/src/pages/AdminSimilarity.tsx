import { useMemo, useRef, useState } from "react";
import AdminHeader from "@/components/AdminHeader";
import { AlertTriangle, FolderOpen, ImagePlus, Play, RotateCcw, ScanFace, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type Landmark = { x: number; y: number; z: number };
type FaceMeshResults = { multiFaceLandmarks?: Landmark[][] };
type FaceMeshInstance = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (callback: (results: FaceMeshResults) => void) => void;
  send: (input: { image: HTMLCanvasElement }) => Promise<void>;
};

type CandidatePhoto = {
  id: string;
  file: File;
  preview: string;
};

type RegionScores = {
  global: number;
  eyes: number;
  brows: number;
  nose: number;
  oval: number;
  mouth: number;
  proportions: number;
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

const MP_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh";
const SCRIPT_ID = "h2-mediapipe-face-mesh";

const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const LEFT_EYE = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246];
const RIGHT_EYE = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398];
const LEFT_BROW = [70,63,105,66,107,55,65,52,53,46];
const RIGHT_BROW = [336,296,334,293,300,285,295,282,283,276];
const NOSE = [1,2,4,5,6,19,20,45,48,64,94,98,115,168,195,197,220,275,278,294,327,344,440];
const MOUTH = [61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78];
const EYES = [...LEFT_EYE, ...RIGHT_EYE];
const BROWS = [...LEFT_BROW, ...RIGHT_BROW];
const GLOBAL_STABLE = Array.from(new Set([...FACE_OVAL, ...EYES, ...BROWS, ...NOSE]));

const PROPORTION_PAIRS: Array<[number, number]> = [
  [234,454],
  [10,152],
  [33,133],
  [362,263],
  [61,291],
  [98,327],
  [168,2],
  [70,300],
  [127,356],
  [172,397],
  [58,288],
  [93,323],
];

let faceMeshPromise: Promise<FaceMeshInstance> | null = null;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function meanPoint(points: Landmark[], indices: number[]) {
  const total = indices.reduce(
    (acc, index) => {
      acc.x += points[index].x;
      acc.y += points[index].y;
      acc.z += points[index].z;
      return acc;
    },
    { x: 0, y: 0, z: 0 }
  );
  const n = indices.length || 1;
  return { x: total.x / n, y: total.y / n, z: total.z / n };
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const current = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (current?.dataset.loaded === "true") return resolve();
    if (current) {
      current.addEventListener("load", () => resolve(), { once: true });
      current.addEventListener("error", () => reject(new Error("Falha ao carregar o motor facial.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Falha ao carregar o motor facial."));
    document.head.appendChild(script);
  });
}

async function getFaceMesh() {
  if (!faceMeshPromise) {
    faceMeshPromise = (async () => {
      await loadScript(`${MP_ROOT}/face_mesh.js`);
      const FaceMeshCtor = (window as any).FaceMesh;
      if (!FaceMeshCtor) throw new Error("MediaPipe FaceMesh indisponível.");

      const model: FaceMeshInstance = new FaceMeshCtor({
        locateFile: (file: string) => `${MP_ROOT}/${file}`,
      });
      model.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        selfieMode: false,
        minDetectionConfidence: 0.75,
        minTrackingConfidence: 0.75,
      });
      return model;
    })();
  }
  return faceMeshPromise;
}

async function fileToCanvas(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const maxSide = 1600;
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
  return canvas;
}

async function detectFace(file: File): Promise<Landmark[] | null> {
  const model = await getFaceMesh();
  const canvas = await fileToCanvas(file);

  return await new Promise<Landmark[] | null>(async (resolve, reject) => {
    let finished = false;
    const timeout = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("Tempo excedido ao analisar a face."));
    }, 20000);

    model.onResults((results) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      const face = results.multiFaceLandmarks?.[0];
      resolve(face && face.length >= 468 ? face.slice(0, 468) : null);
    });

    try {
      await model.send({ image: canvas });
    } catch (error) {
      if (!finished) {
        finished = true;
        window.clearTimeout(timeout);
        reject(error);
      }
    }
  });
}

function normalizeFace(points: Landmark[]) {
  const leftEye = meanPoint(points, [33, 133]);
  const rightEye = meanPoint(points, [362, 263]);
  const center = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
    z: (leftEye.z + rightEye.z) / 2,
  };
  const eyeDistance = Math.max(0.0001, distance(leftEye, rightEye));
  const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: (dx * cos + dy * sin) / eyeDistance,
      y: (-dx * sin + dy * cos) / eyeDistance,
      z: (point.z - center.z) / eyeDistance,
    };
  });
}

function alignCandidate(master: Landmark[], candidate: Landmark[]) {
  const mc = meanPoint(master, GLOBAL_STABLE);
  const cc = meanPoint(candidate, GLOBAL_STABLE);
  let a = 0;
  let b = 0;
  let denom = 0;

  for (const index of GLOBAL_STABLE) {
    const cx = candidate[index].x - cc.x;
    const cy = candidate[index].y - cc.y;
    const mx = master[index].x - mc.x;
    const my = master[index].y - mc.y;
    a += cx * mx + cy * my;
    b += cx * my - cy * mx;
    denom += cx * cx + cy * cy;
  }

  const magnitude = Math.hypot(a, b) || 1;
  const scale = denom > 0 ? magnitude / denom : 1;
  const cos = a / magnitude;
  const sin = b / magnitude;

  return candidate.map((point) => {
    const x = point.x - cc.x;
    const y = point.y - cc.y;
    return {
      x: scale * (cos * x - sin * y) + mc.x,
      y: scale * (sin * x + cos * y) + mc.y,
      z: point.z * scale,
    };
  });
}

function regionSimilarity(master: Landmark[], candidate: Landmark[], indices: number[], sensitivity = 3.15) {
  if (!indices.length) return 0;
  let sumSquares = 0;
  for (const index of indices) {
    const dx = master[index].x - candidate[index].x;
    const dy = master[index].y - candidate[index].y;
    const dz = (master[index].z - candidate[index].z) * 0.15;
    sumSquares += dx * dx + dy * dy + dz * dz;
  }
  const rms = Math.sqrt(sumSquares / indices.length);
  return clamp(100 * Math.exp(-sensitivity * rms));
}

function proportionSimilarity(master: Landmark[], candidate: Landmark[]) {
  let total = 0;
  for (const [a, b] of PROPORTION_PAIRS) {
    const m = distance(master[a], master[b]);
    const c = distance(candidate[a], candidate[b]);
    const denominator = Math.max(0.0001, (m + c) / 2);
    const relativeError = Math.abs(m - c) / denominator;
    total += clamp(100 * (1 - relativeError * 2.2));
  }
  return total / PROPORTION_PAIRS.length;
}

function evaluateQuality(points: Landmark[]) {
  const xs = FACE_OVAL.map((i) => points[i].x);
  const ys = FACE_OVAL.map((i) => points[i].y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const coverage = Math.sqrt(Math.max(0, width * height));

  const leftEye = meanPoint(points, [33, 133]);
  const rightEye = meanPoint(points, [362, 263]);
  const roll = Math.abs(Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI);

  const nose = points[1];
  const leftCheek = points[234];
  const rightCheek = points[454];
  const leftDistance = distance(nose, leftCheek);
  const rightDistance = distance(nose, rightCheek);
  const yawAsymmetry = Math.abs(leftDistance - rightDistance) / Math.max(0.0001, leftDistance + rightDistance);

  let score = 100;
  const warnings: string[] = [];

  if (coverage < 0.23) {
    score -= clamp((0.23 - coverage) * 180, 0, 32);
    warnings.push("Rosto pequeno na imagem");
  }
  if (roll > 10) {
    score -= clamp((roll - 10) * 1.4, 0, 24);
    warnings.push("Rosto inclinado");
  }
  if (yawAsymmetry > 0.13) {
    score -= clamp((yawAsymmetry - 0.13) * 150, 0, 32);
    warnings.push("Rosto de lado / perspectiva forte");
  }

  return { score: clamp(score), warnings };
}

function compareFaces(masterRaw: Landmark[], candidateRaw: Landmark[]) {
  const master = normalizeFace(masterRaw);
  const candidate = alignCandidate(master, normalizeFace(candidateRaw));

  const regions: RegionScores = {
    global: regionSimilarity(master, candidate, GLOBAL_STABLE, 2.85),
    eyes: regionSimilarity(master, candidate, EYES, 3.25),
    brows: regionSimilarity(master, candidate, BROWS, 3.05),
    nose: regionSimilarity(master, candidate, NOSE, 3.35),
    oval: regionSimilarity(master, candidate, FACE_OVAL, 3.0),
    mouth: regionSimilarity(master, candidate, MOUTH, 2.45),
    proportions: proportionSimilarity(master, candidate),
  };

  const similarity =
    regions.global * 0.20 +
    regions.eyes * 0.20 +
    regions.nose * 0.20 +
    regions.oval * 0.20 +
    regions.brows * 0.08 +
    regions.mouth * 0.05 +
    regions.proportions * 0.07;

  return { similarity: clamp(similarity), regions };
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
  const [masterQuality, setMasterQuality] = useState<{ score: number; warnings: string[] } | null>(null);

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
      const masterLandmarks = await detectFace(masterFile);
      if (!masterLandmarks) {
        toast.error("Não foi possível detectar um rosto completo na Foto Mestre.");
        return;
      }

      const masterQ = evaluateQuality(masterLandmarks);
      setMasterQuality(masterQ);
      const nextResults: ComparisonResult[] = [];

      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        setProgress({ current: index + 1, total: candidates.length, name: candidate.file.name });

        try {
          const candidateLandmarks = await detectFace(candidate.file);
          if (!candidateLandmarks) {
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

          const quality = evaluateQuality(candidateLandmarks);
          const comparison = compareFaces(masterLandmarks, candidateLandmarks);
          const reliability = clamp((masterQ.score + quality.score) / 2);

          nextResults.push({
            id: candidate.id,
            name: candidate.file.name,
            preview: candidate.preview,
            similarity: comparison.similarity,
            reliability,
            regions: comparison.regions,
            warnings: Array.from(new Set([...masterQ.warnings.map((w) => `Mestre: ${w}`), ...quality.warnings])),
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
                As fotos selecionadas não são enviadas para R2 nem gravadas no banco. A rota usa 468 pontos faciais no navegador e calcula um índice geométrico próprio. O resultado é uma medida de semelhança de geometria facial, não uma confirmação de identidade.
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
                      <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 sm:grid-cols-4 lg:grid-cols-7">
                        {[
                          ["Global", result.regions.global],
                          ["Olhos", result.regions.eyes],
                          ["Sobrancelhas", result.regions.brows],
                          ["Nariz", result.regions.nose],
                          ["Maxilar / oval", result.regions.oval],
                          ["Boca", result.regions.mouth],
                          ["Proporções", result.regions.proportions],
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
