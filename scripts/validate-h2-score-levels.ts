import { getH2ScoreLevel, clampH2Score } from "../server/loans/h2Score";

const config = {
  onTimePoints: 4,
  eveningPoints: 1,
  nightPoints: 0,
  afterDuePoints: -5,
  initialPoints: 40,
  bronzeMin: 0,
  prataMin: 60,
  ouroMin: 90,
  diamanteMin: 100,
};

const expectations: Array<[number, string]> = [
  [0, "bronze"],
  [40, "bronze"],
  [59, "bronze"],
  [60, "prata"],
  [89, "prata"],
  [90, "ouro"],
  [99, "ouro"],
  [100, "diamante"],
];

for (const [points, expected] of expectations) {
  const level = getH2ScoreLevel(points, config);
  if (level.slug !== expected) throw new Error(`Falha em ${points}: esperado ${expected}, obtido ${level.slug}`);
}

if (clampH2Score(-5) !== 0 || clampH2Score(101) !== 100) {
  throw new Error("A proteção de limite de pontos não foi aplicada corretamente.");
}

const promotion = getH2ScoreLevel(60, config);
const demotion = getH2ScoreLevel(59, config);
if (promotion.slug !== "prata" || demotion.slug !== "bronze") {
  throw new Error("Falha no cenário de promoção/rebaixamento Bronze ↔ Prata.");
}

console.log("H2 Score: faixas, limites, promoção e rebaixamento validados.");
