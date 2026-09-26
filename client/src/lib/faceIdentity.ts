export type FaceIdentityDescriptor = {
  embedding: number[];
  detectionScore: number | null;
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
          equalization: true,
          flip: false,
        },
        face: {
          enabled: true,
          detector: {
            rotation: true,
            return: true,
            maxDetected: 2,
            minConfidence: 0.72,
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

export async function extractIdentityDescriptor(canvas: HTMLCanvasElement): Promise<FaceIdentityDescriptor> {
  const human = await getIdentityEngine();
  const result = await human.detect(canvas);
  const faces = result.face || [];

  if (faces.length === 0) {
    throw new Error("O motor de identidade não encontrou um rosto.");
  }
  if (faces.length > 1) {
    throw new Error("O motor de identidade encontrou mais de um rosto.");
  }

  const embedding = Array.from(faces[0].embedding || []);
  if (embedding.length < 128 || embedding.some((value) => !Number.isFinite(value))) {
    throw new Error("Não foi possível gerar um vetor facial confiável.");
  }

  return {
    embedding,
    detectionScore: Number.isFinite(faces[0].score) ? Number(faces[0].score) : null,
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
