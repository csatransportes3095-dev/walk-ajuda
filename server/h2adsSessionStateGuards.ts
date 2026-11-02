/**
 * Transicoes seguras do H2ADS. Um comando administrativo atrasado nao pode
 * transformar uma sessao com Chrome aberto em "queued", "preparing" ou "blocked".
 * A efetivacao deve usar comparacao atomica de estado no banco.
 */
export const H2ADS_REPREPARABLE_STATES = [
  "not_prepared",
  "proxy_verified",
  "blocked",
  "closed",
] as const;

export type H2AdsBrowserState =
  | (typeof H2ADS_REPREPARABLE_STATES)[number]
  | "queued"
  | "preparing"
  | "browser_open";

export function canRequestH2AdsPreparation(state: H2AdsBrowserState | null): boolean {
  return state === null || H2ADS_REPREPARABLE_STATES.some(allowed => allowed === state);
}

export function canClaimH2AdsPreparation(state: H2AdsBrowserState | null): boolean {
  return state === "queued";
}

export function canFinishH2AdsPreparation(state: H2AdsBrowserState | null): boolean {
  return state === "preparing";
}

export function shouldWriteH2AdsBrowserCommandState(
  command: "launch_browser" | "close_browser",
  result: "browser_open" | "closed" | "blocked",
  current: H2AdsBrowserState | null,
): boolean {
  // Falha ao fechar NUNCA significa que o Chrome saiu.
  if (command === "close_browser" && result === "blocked") return false;
  // Respostas antigas de launch/close nao substituem uma nova sessao aberta.
  if (command === "launch_browser" && result === "blocked" && current === "browser_open") return false;
  if (command === "close_browser" && result === "closed" && current !== "browser_open") return false;
  return true;
}
