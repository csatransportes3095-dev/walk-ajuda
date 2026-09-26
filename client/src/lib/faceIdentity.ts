export type FaceIdentityDescriptor = {
  embedding: number[];
  detectionScore: number | null;
  internalConsistency: number | null;
  sampleCount: number;
};

export type FaceIdentityComparison = {
  rawSimilarity: number;
  distance: number | null;
};

type HumanFace = {
  embedding?: number[] | Float32Array;
  score?: number;
};

type HumanResult = {
  face?: HumanFace[];
};

type HumanInstance = {
  load: () => Promise<unknown>;
  warmup?: () => Promise<unknown>;
  detect: (input: HTMLCanvasElement) => Promise<HumanResult>;
  match: {
    similarity: (a: number[], b: number[], options?: Record<string, unknown>) => number;
    distance?: (a: number[], b: number[], options?: Record<string, unknown>) => number;
  };
};

const HUMAN_VERSION = "3.3.6";
const HUMAN_MODULE_URL = `https://cdn.jsdelivr.net/npm/@vladmandic/human@${HUMAN_VERSION}/dist/human.esm.js`;
const HUMAN_MODEL_BASE = `https://cdn.jsdelivr.net/npm/@vladmandic/human@${HUMAN_VERSION}/models/`;

let enginePromise: Promise<HumanInstance> | null = null;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function normalizeEmbedding(values: number[]) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 1e-12) return [...values];
  return values.map((value) => value / norm);
}

export function averageEmbeddings(embeddings: number[][]) {
  if (!embeddings.length) return [];
  const normalized = embeddings.map(normalizeEmbedding);
  const length = normalized[0].length;
  const compatible = normalized.filter((embedding) => embedding.length === length);
  if (!compatible.length) return [];

  const average = Array.from({ length }, (_, index) =>
    compatible.reduce((sum, embedding) => sum + embedding[index], 0) / compatible.length
  );
  return normalizeEmbedding(average);
}

async function getIdentityEngine(): Promise<HumanInstance> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const module: any = await import(/* @vite-ignore */ HUMAN_MODULE_URL);
      const HumanCtor = module.Human || module.default?.Human || module.default;
      if (!HumanCtor) throw new Error("Motor de vetor facial indisponível.");

      const human: HumanInstance = new HumanCtor({
        backend: "webgl",
        cacheSensitivity: 0,
        modelBasePath: HUMAN_MODEL_BASE,
        filter: {
          enabled: true,
          equalization: false,
          flip: false,
        },
        face: {
          enabled: true,
          detector: {
            rotation: true,
            return: true,
            maxDetected: 2,
            minConfidence: 0.58,
          },
          mesh: { enabled: true },
          attention: { enabled: false },
          iris: { enabled: false },
          description: { enabled: true },
          emotion: { enabled: false },
          antispoof: { enabled: false },
          liveness: { enabled: false },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
        segmentation: { enabled: false },
      });

      await human.load();
      try {
        await human.warmup?.();
      } catch {
        // Warmup é apenas otimização. A inferência real continua válida sem ele.
      }
      return human;
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

async function extractSingleEmbedding(
  human: HumanInstance,
  canvas: HTMLCanvasElement,
): Promise<{ embedding: number[]; score: number | null } | null> {
  const result = await human.detect(canvas);
  const faces = result.face || [];

  if (faces.length === 0) return null;
  if (faces.length > 1) {
    throw new Error("O motor de identidade encontrou mais de um rosto.");
  }

  const embedding = normalizeEmbedding(Array.from(faces[0].embedding || []));
  if (embedding.length < 128 || embedding.some((value) => !Number.isFinite(value))) {
    throw new Error("Não foi possível gerar um vetor facial confiável.");
  }

  return {
    embedding,
    score: Number.isFinite(faces[0].score) ? Number(faces[0].score) : null,
  };
}

export async function extractIdentityDescriptor(
  canvas: HTMLCanvasElement,
  fallbackCanvas?: HTMLCanvasElement,
): Promise<FaceIdentityDescriptor> {
  const human = await getIdentityEngine();

  const primary = await extractSingleEmbedding(human, canvas);
  const fallback = fallbackCanvas
    ? await extractSingleEmbedding(human, fallbackCanvas)
    : null;

  const samples = [primary, fallback].filter(
    (sample): sample is { embedding: number[]; score: number | null } => Boolean(sample)
  );

  if (!samples.length) {
    throw new Error("O motor de identidade não encontrou um rosto mesmo após o recorte de recuperação.");
  }

  const embedding = averageEmbeddings(samples.map((sample) => sample.embedding));
  if (embedding.length < 128) {
    throw new Error("Não foi possível consolidar um vetor facial confiável.");
  }

  const validScores = samples
    .map((sample) => sample.score)
    .filter((score): score is number => score !== null && Number.isFinite(score));

  let internalConsistency: number | null = null;
  if (samples.length >= 2) {
    internalConsistency = clamp01(
      Number(human.match.similarity(samples[0].embedding, samples[1].embedding))
    );
  }

  return {
    embedding,
    detectionScore: validScores.length
      ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
      : null,
    internalConsistency,
    sampleCount: samples.length,
  };
}

export async function compareIdentityDescriptors(
  master: FaceIdentityDescriptor,
  candidate: FaceIdentityDescriptor,
): Promise<FaceIdentityComparison> {
  const human = await getIdentityEngine();
  const rawSimilarity = clamp01(Number(human.match.similarity(master.embedding, candidate.embedding)));
  const rawDistance = human.match.distance
    ? Number(human.match.distance(master.embedding, candidate.embedding))
    : Number.NaN;

  return {
    rawSimilarity,
    distance: Number.isFinite(rawDistance) ? rawDistance : null,
  };
}
