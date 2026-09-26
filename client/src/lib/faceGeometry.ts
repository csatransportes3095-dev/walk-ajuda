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
  cheeks: number;
  jaw: number;
  chin: number;
  mouth: number;
  proportions: number;
  measurements: number;
  symmetry: number;
  structure: number;
};

export type GeometryComparison = {
  similarity: number;
  rawSimilarity: number;
  rawLandmarkSimilarity: number;
  proportionsSimilarity: number;
  symmetrySimilarity: number;
  criticalFloor: number;
  criticalMean: number;
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

// Regiões exclusivamente faciais. Nenhum ponto de cabelo, fundo ou orelha entra.
export const CHEEKS = [
  234,93,132,58,172,205,50,187,
  454,323,361,288,397,425,280,411,
];
export const JAW = [
  172,136,150,149,176,148,152,
  377,400,378,379,365,397,
];
export const CHIN = [176,148,152,377,400,175,199,200,18];

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

type MeasurementSpec = {
  label: string;
  numerator: [number, number];
  denominator: [number, number];
};

const EXACT_MEASUREMENTS: MeasurementSpec[] = [
  { label: "largura/altura rosto", numerator: [234,454], denominator: [10,152] },
  { label: "maxilar/bochechas", numerator: [172,397], denominator: [234,454] },
  { label: "queixo/bochechas", numerator: [148,377], denominator: [234,454] },
  { label: "distancia olhos/rosto", numerator: [133,362], denominator: [234,454] },
  { label: "olho esquerdo/rosto", numerator: [33,133], denominator: [234,454] },
  { label: "olho direito/rosto", numerator: [362,263], denominator: [234,454] },
  { label: "nariz/rosto", numerator: [98,327], denominator: [234,454] },
  { label: "altura nariz/rosto", numerator: [168,2], denominator: [10,152] },
  { label: "boca/rosto", numerator: [61,291], denominator: [234,454] },
  { label: "nariz-boca/rosto", numerator: [2,13], denominator: [10,152] },
  { label: "boca-queixo/rosto", numerator: [13,152], denominator: [10,152] },
  { label: "testa-ponte/rosto", numerator: [10,168], denominator: [10,152] },
  { label: "ponte-nariz/rosto", numerator: [168,2], denominator: [10,152] },
  { label: "nariz-queixo/rosto", numerator: [2,152], denominator: [10,152] },
  { label: "sobrancelha esquerda/olho", numerator: [70,33], denominator: [33,133] },
  { label: "sobrancelha direita/olho", numerator: [300,263], denominator: [362,263] },
  { label: "bochecha esquerda/nariz", numerator: [234,1], denominator: [234,454] },
  { label: "bochecha direita/nariz", numerator: [454,1], denominator: [234,454] },
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

// Escala visual/intuitiva: mantém distância entre rostos diferentes sem transformar
// uma semelhança moderada em 0-5%. É propositalmente mais legível do que a escala
// interna bruta do MediaPipe.
function intuitiveCalibrate(score: number) {
  const s = clamp(score);
  if (s <= 60) return 0;
  if (s <= 70) return (s - 60) * 3.0;             // 60..70 => 0..30
  if (s <= 80) return 30 + (s - 70) * 3.0;        // 70..80 => 30..60
  if (s <= 90) return 60 + (s - 80) * 2.8;        // 80..90 => 60..88
  return 88 + (s - 90) * 1.2;                     // 90..100 => 88..100
}

function weightedMean(entries: Array<[number, number]>) {
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  return clamp(entries.reduce((sum, [score, weight]) => sum + score * weight, 0) / totalWeight);
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

function exactMeasurementSimilarity(master: FaceLandmark[], candidate: FaceLandmark[]) {
  const scores: number[] = [];

  for (const spec of EXACT_MEASUREMENTS) {
    const masterDen = Math.max(1e-6, distance(master[spec.denominator[0]], master[spec.denominator[1]]));
    const candidateDen = Math.max(1e-6, distance(candidate[spec.denominator[0]], candidate[spec.denominator[1]]));
    const masterRatio = distance(master[spec.numerator[0]], master[spec.numerator[1]]) / masterDen;
    const candidateRatio = distance(candidate[spec.numerator[0]], candidate[spec.numerator[1]]) / candidateDen;
    const logError = Math.abs(Math.log(Math.max(1e-6, masterRatio) / Math.max(1e-6, candidateRatio)));
    scores.push(100 * Math.exp(-5.0 * logError));
  }

  scores.sort((a,b) => a-b);
  // Mantém a maior parte das medidas, mas reduz o impacto de uma única medida
  // distorcida por ângulo ou expressão.
  const retained = scores.slice(Math.floor(scores.length * 0.06));
  return retained.reduce((sum, score) => sum + score, 0) / Math.max(1, retained.length);
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
  const measurements = exactMeasurementSimilarity(master, candidate);

  const expressionDelta = expressionDifference(master, candidate);

  const rawRegions: RegionScores = {
    global: rawLandmarkSimilarity,
    eyes: regionSimilarity(master, candidate, EYES, 4.8, 0.04),
    brows: regionSimilarity(master, candidate, BROWS, 4.3, 0.03),
    nose: regionSimilarity(master, candidate, NOSE, 5.2, 0.03),
    oval: regionSimilarity(master, candidate, FACE_OVAL, 4.7, 0.03),
    cheeks: regionSimilarity(master, candidate, CHEEKS, 5.0, 0.02),
    jaw: regionSimilarity(master, candidate, JAW, 5.4, 0.02),
    chin: regionSimilarity(master, candidate, CHIN, 5.6, 0.02),
    mouth: regionSimilarity(master, candidate, MOUTH, 3.1, 0.06),
    proportions,
    measurements,
    symmetry,
    structure,
  };

  // A interface exibe uma escala calibrada para leitura humana. Ela continua
  // severa, mas deixa uma faixa útil para "semelhança parcial" e "chega perto".
  const regions: RegionScores = {
    global: intuitiveCalibrate(rawRegions.global),
    eyes: intuitiveCalibrate(rawRegions.eyes),
    brows: intuitiveCalibrate(rawRegions.brows),
    nose: intuitiveCalibrate(rawRegions.nose),
    oval: intuitiveCalibrate(rawRegions.oval),
    cheeks: intuitiveCalibrate(rawRegions.cheeks),
    jaw: intuitiveCalibrate(rawRegions.jaw),
    chin: intuitiveCalibrate(rawRegions.chin),
    mouth: intuitiveCalibrate(rawRegions.mouth),
    proportions: intuitiveCalibrate(rawRegions.proportions),
    measurements: intuitiveCalibrate(rawRegions.measurements),
    symmetry: intuitiveCalibrate(rawRegions.symmetry),
    structure: intuitiveCalibrate(rawRegions.structure),
  };

  // Componentes críticos. Uma única região pode ficar distorcida por ângulo,
  // óculos, expressão ou recorte; por isso o pior componente não pode zerar
  // sozinho todo o rosto. Já duas ou mais regiões fracas derrubam a nota.
  const criticalEntries: Array<[number, number]> = [
    [regions.eyes, 0.13],
    [regions.nose, 0.16],
    [regions.cheeks, 0.10],
    [regions.jaw, 0.12],
    [regions.chin, 0.10],
    [regions.structure, 0.13],
    [regions.measurements, 0.12],
    [regions.proportions, 0.08],
    [regions.global, 0.06],
  ];

  const sortedCritical = [...criticalEntries].sort((a, b) => a[0] - b[0]);
  const criticalScores = sortedCritical.map(([score]) => score);
  const criticalFloor = criticalScores[0] ?? 0;
  const secondWeakest = criticalScores[1] ?? criticalFloor;

  const fullCriticalMean = weightedMean(criticalEntries);
  const weakestEntry = sortedCritical[0];
  const robustEntries = criticalEntries.filter((entry) => entry !== weakestEntry);
  const robustCriticalMean = weightedMean(robustEntries);

  // 85% do resultado vem do conjunto sem o único pior ponto; 10% ainda preserva
  // o impacto do pior ponto e 5% usa regiões mais variáveis como apoio.
  const secondary = weightedMean([
    [regions.brows, 0.35],
    [regions.symmetry, 0.35],
    [regions.mouth, 0.30],
  ]);

  let rawSimilarity =
    robustCriticalMean * 0.85 +
    fullCriticalMean * 0.10 +
    secondary * 0.05;

  const severeCount = criticalScores.filter((score) => score < 35).length;
  const weakCount = criticalScores.filter((score) => score < 50).length;
  const moderateWeakCount = criticalScores.filter((score) => score < 60).length;

  // Dois pontos anatômicos muito ruins são evidência bem mais forte do que um
  // único ponto ruim isolado.
  if (severeCount >= 3) rawSimilarity -= 30;
  else if (severeCount >= 2) rawSimilarity -= 20;
  else if (severeCount === 1 && secondWeakest < 50) rawSimilarity -= 10;

  if (weakCount >= 3) rawSimilarity -= 10;
  else if (weakCount >= 2) rawSimilarity -= 6;

  if (moderateWeakCount >= 4) rawSimilarity -= 5;

  // RMS alto após alinhamento = formato global não encaixou bem.
  if (rmsError > 0.085) rawSimilarity -= clamp((rmsError - 0.085) * 120, 0, 8);

  let similarity = clamp(rawSimilarity);

  // Tetos dependem do SEGUNDO pior componente, não apenas do pior. Isso evita
  // que uma região isolada derrube artificialmente uma comparação razoável.
  if (secondWeakest < 30) similarity = Math.min(similarity, 44);
  else if (secondWeakest < 40) similarity = Math.min(similarity, 54);
  else if (secondWeakest < 50) similarity = Math.min(similarity, 64);
  else if (secondWeakest < 58) similarity = Math.min(similarity, 72);

  const criticalMean = robustCriticalMean;

  return {
    similarity,
    rawSimilarity: clamp(rawSimilarity),
    rawLandmarkSimilarity,
    proportionsSimilarity: proportions,
    symmetrySimilarity: symmetry,
    criticalFloor,
    criticalMean,
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
