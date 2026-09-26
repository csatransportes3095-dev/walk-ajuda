export type FaceLandmark = { x: number; y: number; z: number };

export type FaceQuality = {
  score: number;
  rollDeg: number;
  yawAsymmetry: number;
  coverage: number;
  warnings: string[];
};

export type RegionScores = {
  global: number;
  eyes: number;
  brows: number;
  nose: number;
  oval: number;
  mouth: number;
  proportions: number;
  symmetry: number;
  structure: number;
};

export type GeometryComparison = {
  similarity: number;
  rawLandmarkSimilarity: number;
  proportionsSimilarity: number;
  symmetrySimilarity: number;
  rmsError: number;
  regions: RegionScores;
};

export const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
export const LEFT_EYE = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246];
export const RIGHT_EYE = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398];
export const LEFT_IRIS = [468,469,470,471,472];
export const RIGHT_IRIS = [473,474,475,476,477];
export const LEFT_BROW = [70,63,105,66,107,55,65,52,53,46];
export const RIGHT_BROW = [336,296,334,293,300,285,295,282,283,276];
export const NOSE = [1,2,4,5,6,19,20,45,48,64,94,98,115,168,195,197,220,275,278,294,327,344,440];
export const MOUTH = [61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78];

export const EYES = [...LEFT_EYE, ...RIGHT_EYE, ...LEFT_IRIS, ...RIGHT_IRIS];
export const BROWS = [...LEFT_BROW, ...RIGHT_BROW];

// Pontos mais estáveis para alinhamento rígido: contorno, nariz e cantos dos olhos.
// Boca e pálpebras ficam fora porque mudam muito com expressão/piscada.
export const ALIGNMENT_STABLE = Array.from(new Set([
  ...FACE_OVAL,
  ...NOSE,
  33, 133, 362, 263,
  70, 107, 336, 300,
  127, 234, 454, 356,
  10, 152,
]));

const GLOBAL_STABLE = Array.from(new Set([
  ...FACE_OVAL,
  ...NOSE,
  33, 133, 362, 263,
  ...LEFT_BROW,
  ...RIGHT_BROW,
]));

const PROPORTION_PAIRS: Array<[number, number]> = [
  [234,454], // largura da face
  [10,152],  // altura da face
  [33,133], [362,263], // largura dos olhos
  [33,362], [133,263], // distâncias oculares
  [61,291], // largura da boca
  [98,327], // largura do nariz
  [168,2],  // comprimento ponte-nariz
  [10,168], [2,152], // terços verticais
  [70,300], [127,356], [172,397], [58,288], [93,323],
  [234,1], [454,1], // nariz/bochechas
  [61,1], [291,1],  // cantos boca/nariz
  [33,1], [263,1],  // olhos/nariz
  [10,1], [1,152],
];

const STRUCTURE_ANCHORS = [
  10, 152, 234, 454, 127, 356, 172, 397, 58, 288, 93, 323,
  33, 133, 362, 263, 70, 107, 336, 300,
  168, 1, 2, 98, 327, 61, 291, 13, 14,
];

const SYMMETRY_PAIRS: Array<[[number, number],[number, number]]> = [
  [[33,133],[362,263]],
  [[234,1],[454,1]],
  [[127,168],[356,168]],
  [[70,168],[300,168]],
  [[61,1],[291,1]],
  [[172,152],[397,152]],
  [[58,152],[288,152]],
  [[93,152],[323,152]],
];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function add(a: FaceLandmark, b: FaceLandmark): FaceLandmark {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: FaceLandmark, b: FaceLandmark): FaceLandmark {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul(a: FaceLandmark, s: number): FaceLandmark {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dot(a: FaceLandmark, b: FaceLandmark) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function distance(a: FaceLandmark, b: FaceLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function distance2d(a: FaceLandmark, b: FaceLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function meanPoint(points: FaceLandmark[], indices: number[]) {
  const valid = indices.filter((i) => points[i]);
  if (!valid.length) return { x: 0, y: 0, z: 0 };
  const total = valid.reduce((acc, index) => add(acc, points[index]), { x: 0, y: 0, z: 0 });
  return mul(total, 1 / valid.length);
}

function eyeCenters(points: FaceLandmark[]) {
  const hasIris = points.length >= 478;
  if (hasIris) {
    return {
      left: meanPoint(points, LEFT_IRIS),
      right: meanPoint(points, RIGHT_IRIS),
    };
  }
  return {
    left: meanPoint(points, [33,133]),
    right: meanPoint(points, [362,263]),
  };
}

// Corrige o fato de x/y serem normalizados pelas dimensões da imagem.
// Sem isto, a mesma face em retrato e paisagem pode mudar de geometria aparente.
export function correctImageAspect(points: FaceLandmark[], aspectRatio: number) {
  const aspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  return points.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z * aspect }));
}

// Normalização inicial: centro nos olhos e unidade = distância interocular.
export function normalizeFace(points: FaceLandmark[], aspectRatio = 1) {
  const corrected = correctImageAspect(points, aspectRatio);
  const { left, right } = eyeCenters(corrected);
  const center = mul(add(left, right), 0.5);
  const scale = Math.max(1e-6, distance(left, right));
  return corrected.map((p) => mul(sub(p, center), 1 / scale));
}

type Mat3 = [[number,number,number],[number,number,number],[number,number,number]];

function matVec(m: Mat3, v: FaceLandmark): FaceLandmark {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  };
}

function quaternionToMatrix(q: [number,number,number,number]): Mat3 {
  const [w,x,y,z] = q;
  return [
    [1 - 2*(y*y + z*z), 2*(x*y - z*w), 2*(x*z + y*w)],
    [2*(x*y + z*w), 1 - 2*(x*x + z*z), 2*(y*z - x*w)],
    [2*(x*z - y*w), 2*(y*z + x*w), 1 - 2*(x*x + y*y)],
  ];
}

// Horn absolute orientation: encontra a rotação 3D ótima sem depender de biblioteca externa.
function bestRotation(master: FaceLandmark[], candidate: FaceLandmark[], indices: number[]): Mat3 {
  const mCenter = meanPoint(master, indices);
  const cCenter = meanPoint(candidate, indices);

  let sxx=0, sxy=0, sxz=0, syx=0, syy=0, syz=0, szx=0, szy=0, szz=0;
  for (const i of indices) {
    const c = sub(candidate[i], cCenter);
    const m = sub(master[i], mCenter);
    sxx += c.x*m.x; sxy += c.x*m.y; sxz += c.x*m.z;
    syx += c.y*m.x; syy += c.y*m.y; syz += c.y*m.z;
    szx += c.z*m.x; szy += c.z*m.y; szz += c.z*m.z;
  }

  const trace = sxx + syy + szz;
  const n = [
    [trace, syz-szy, szx-sxz, sxy-syx],
    [syz-szy, sxx-syy-szz, sxy+syx, szx+sxz],
    [szx-sxz, sxy+syx, -sxx+syy-szz, syz+szy],
    [sxy-syx, szx+sxz, syz+szy, -sxx-syy+szz],
  ];

  let q = [1,0,0,0];
  for (let iter=0; iter<40; iter++) {
    const next = n.map((row) => row.reduce((sum, value, j) => sum + value*q[j], 0));
    const norm = Math.hypot(...next) || 1;
    q = next.map((v) => v / norm);
  }
  return quaternionToMatrix(q as [number,number,number,number]);
}

export function alignCandidate3d(master: FaceLandmark[], candidate: FaceLandmark[]) {
  const indices = ALIGNMENT_STABLE.filter((i) => master[i] && candidate[i]);
  const mCenter = meanPoint(master, indices);
  const cCenter = meanPoint(candidate, indices);
  const rotation = bestRotation(master, candidate, indices);

  let numerator = 0;
  let denominator = 0;
  for (const i of indices) {
    const c = matVec(rotation, sub(candidate[i], cCenter));
    const m = sub(master[i], mCenter);
    numerator += dot(m, c);
    denominator += dot(c, c);
  }
  const scale = denominator > 1e-9 ? numerator / denominator : 1;

  return candidate.map((p) => add(mul(matVec(rotation, sub(p, cCenter)), scale), mCenter));
}

function pointErrors(master: FaceLandmark[], candidate: FaceLandmark[], indices: number[], zWeight = 0.35) {
  const errors: number[] = [];
  for (const i of indices) {
    if (!master[i] || !candidate[i]) continue;
    const dx = master[i].x - candidate[i].x;
    const dy = master[i].y - candidate[i].y;
    const dz = (master[i].z - candidate[i].z) * zWeight;
    errors.push(Math.hypot(dx, dy, dz));
  }
  return errors;
}

function robustRms(errors: number[], trimFraction = 0.1) {
  if (!errors.length) return 1;
  const sorted = [...errors].sort((a,b) => a-b);
  const keep = Math.max(1, Math.ceil(sorted.length * (1 - trimFraction)));
  const retained = sorted.slice(0, keep);
  return Math.sqrt(retained.reduce((sum, e) => sum + e*e, 0) / retained.length);
}

function errorToSimilarity(error: number, sensitivity: number) {
  return clamp(100 * Math.exp(-sensitivity * Math.max(0, error)));
}

function regionSimilarity(master: FaceLandmark[], candidate: FaceLandmark[], indices: number[], sensitivity: number, trim = 0.08) {
  return errorToSimilarity(robustRms(pointErrors(master, candidate, indices), trim), sensitivity);
}

function proportionSimilarity(master: FaceLandmark[], candidate: FaceLandmark[]) {
  const scores: number[] = [];
  for (const [a,b] of PROPORTION_PAIRS) {
    const m = Math.max(1e-6, distance(master[a], master[b]));
    const c = Math.max(1e-6, distance(candidate[a], candidate[b]));
    const logError = Math.abs(Math.log(m / c));
    scores.push(100 * Math.exp(-2.75 * logError));
  }
  scores.sort((a,b) => a-b);
  const trimmed = scores.slice(Math.floor(scores.length * 0.08));
  return trimmed.reduce((sum, s) => sum+s, 0) / Math.max(1, trimmed.length);
}

function symmetrySimilarity(master: FaceLandmark[], candidate: FaceLandmark[]) {
  const values: number[] = [];
  for (const [[la,lb],[ra,rb]] of SYMMETRY_PAIRS) {
    const ml = distance(master[la], master[lb]);
    const mr = distance(master[ra], master[rb]);
    const cl = distance(candidate[la], candidate[lb]);
    const cr = distance(candidate[ra], candidate[rb]);
    const ma = (ml - mr) / Math.max(1e-6, ml + mr);
    const ca = (cl - cr) / Math.max(1e-6, cl + cr);
    values.push(100 * Math.exp(-5.5 * Math.abs(ma-ca)));
  }
  return values.reduce((sum, s) => sum+s, 0) / Math.max(1, values.length);
}

function structuralSimilarity(master: FaceLandmark[], candidate: FaceLandmark[]) {
  const errors: number[] = [];
  for (let i = 0; i < STRUCTURE_ANCHORS.length; i += 1) {
    for (let j = i + 1; j < STRUCTURE_ANCHORS.length; j += 1) {
      const a = STRUCTURE_ANCHORS[i];
      const b = STRUCTURE_ANCHORS[j];
      const m = Math.max(1e-6, distance(master[a], master[b]));
      const c = Math.max(1e-6, distance(candidate[a], candidate[b]));
      errors.push(Math.abs(Math.log(m / c)));
    }
  }
  errors.sort((a,b) => a-b);
  // Descarta 8% dos pares mais discrepantes para reduzir efeito de expressão/oclusão pontual.
  const keep = Math.max(1, Math.floor(errors.length * 0.92));
  const retained = errors.slice(0, keep);
  const rms = Math.sqrt(retained.reduce((sum, e) => sum + e*e, 0) / retained.length);
  return clamp(100 * Math.exp(-4.2 * rms));
}

function expressionDifference(master: FaceLandmark[], candidate: FaceLandmark[]) {
  const mouthWidthM = Math.max(1e-6, distance(master[61], master[291]));
  const mouthWidthC = Math.max(1e-6, distance(candidate[61], candidate[291]));
  const openM = distance(master[13], master[14]) / mouthWidthM;
  const openC = distance(candidate[13], candidate[14]) / mouthWidthC;
  return Math.abs(openM - openC);
}

export function compareFaceGeometry(
  masterRaw: FaceLandmark[],
  candidateRaw: FaceLandmark[],
  masterAspect = 1,
  candidateAspect = 1,
): GeometryComparison {
  const master = normalizeFace(masterRaw, masterAspect);
  const candidate = alignCandidate3d(master, normalizeFace(candidateRaw, candidateAspect));

  const globalErrors = pointErrors(master, candidate, GLOBAL_STABLE);
  const rmsError = robustRms(globalErrors, 0.10);
  const rawLandmarkSimilarity = errorToSimilarity(rmsError, 3.0);
  const proportions = proportionSimilarity(master, candidate);
  const symmetry = symmetrySimilarity(master, candidate);
  const structure = structuralSimilarity(master, candidate);

  const expressionDelta = expressionDifference(master, candidate);
  const mouthWeight = expressionDelta > 0.10 ? 0.015 : expressionDelta > 0.055 ? 0.03 : 0.05;
  const stableWeight = 0.91 - mouthWeight;

  const regions: RegionScores = {
    global: rawLandmarkSimilarity,
    eyes: regionSimilarity(master, candidate, EYES, 3.5, 0.10),
    brows: regionSimilarity(master, candidate, BROWS, 3.15, 0.08),
    nose: regionSimilarity(master, candidate, NOSE, 3.65, 0.08),
    oval: regionSimilarity(master, candidate, FACE_OVAL, 3.25, 0.08),
    mouth: regionSimilarity(master, candidate, MOUTH, 2.4, 0.12),
    proportions,
    symmetry,
    structure,
  };

  const stableBlend =
    regions.global * 0.17 +
    regions.eyes * 0.15 +
    regions.nose * 0.19 +
    regions.oval * 0.17 +
    regions.brows * 0.05 +
    regions.proportions * 0.08 +
    regions.symmetry * 0.03 +
    regions.structure * 0.16;

  const stableNormalized = stableBlend / 1.0;
  const similarity = clamp(stableNormalized * stableWeight + regions.mouth * mouthWeight + stableNormalized * (1 - stableWeight - mouthWeight));

  return {
    similarity,
    rawLandmarkSimilarity,
    proportionsSimilarity: proportions,
    symmetrySimilarity: symmetry,
    rmsError,
    regions,
  };
}

export function evaluateFaceGeometryQuality(pointsRaw: FaceLandmark[], aspectRatio = 1): FaceQuality {
  const points = correctImageAspect(pointsRaw, aspectRatio);
  const oval = FACE_OVAL.map((i) => points[i]).filter(Boolean);
  const xs = oval.map((p) => p.x);
  const ys = oval.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const coverage = Math.sqrt(Math.max(0, width * height));

  const { left, right } = eyeCenters(points);
  const rollDeg = Math.abs(Math.atan2(right.y-left.y, right.x-left.x) * 180 / Math.PI);

  const nose = points[1];
  const leftCheek = points[234];
  const rightCheek = points[454];
  const leftDistance = distance2d(nose, leftCheek);
  const rightDistance = distance2d(nose, rightCheek);
  const yawAsymmetry = Math.abs(leftDistance-rightDistance) / Math.max(1e-6, leftDistance+rightDistance);

  const minX = Math.min(...xs) / Math.max(1e-6, aspectRatio);
  const maxX = Math.max(...xs) / Math.max(1e-6, aspectRatio);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  let score = 100;
  const warnings: string[] = [];

  if (coverage < 0.24) {
    score -= clamp((0.24-coverage)*170, 0, 30);
    warnings.push("rosto pequeno");
  }
  if (rollDeg > 8) {
    score -= clamp((rollDeg-8)*1.4, 0, 22);
    warnings.push("rosto inclinado");
  }
  if (yawAsymmetry > 0.12) {
    score -= clamp((yawAsymmetry-0.12)*165, 0, 35);
    warnings.push("perspectiva lateral forte");
  }
  if (minX < 0.015 || maxX > 0.985 || minY < 0.015 || maxY > 0.985) {
    score -= 18;
    warnings.push("rosto muito próximo da borda/cortado");
  }

  return { score: clamp(score), rollDeg, yawAsymmetry, coverage, warnings };
}
