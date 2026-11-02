import { describe, expect, it } from "vitest";
import { canRequestH2AdsPreparation, canClaimH2AdsPreparation, canFinishH2AdsPreparation, shouldWriteH2AdsBrowserCommandState } from "./h2adsSessionStateGuards";
import fs from "node:fs";

describe("H2ADS - sessao ativa nao pode ser apagada por comandos antigos", () => {
  it("proibe preparar quando Chrome esta aberto ou comando esta em andamento", () => {
    for (const s of ["browser_open", "queued", "preparing"] as const) expect(canRequestH2AdsPreparation(s)).toBe(false);
    for (const s of ["not_prepared","closed","proxy_verified","blocked"] as const) expect(canRequestH2AdsPreparation(s)).toBe(true);
  });
  it("aceita reivindicacao e finalizacao somente nos respectivos estados", () => {
    expect(canClaimH2AdsPreparation("queued")).toBe(true);
    expect(canClaimH2AdsPreparation("browser_open")).toBe(false);
    expect(canFinishH2AdsPreparation("preparing")).toBe(true);
    expect(canFinishH2AdsPreparation("browser_open")).toBe(false);
  });
  it("erro ao fechar nao transforma navegador aberto em bloqueado", () => {
    expect(shouldWriteH2AdsBrowserCommandState("close_browser","blocked","browser_open")).toBe(false);
    expect(shouldWriteH2AdsBrowserCommandState("launch_browser","blocked","browser_open")).toBe(false);
    expect(shouldWriteH2AdsBrowserCommandState("close_browser","closed","browser_open")).toBe(true);
  });
  it("usa atualizacao condicional no banco e preserva guardas de protecao", () => {
    const src=fs.readFileSync("server/h2ads.ts","utf8");
    expect(src).toContain('eq(h2AdsInstanceBrowserRuns.state, "queued")');
    expect(src).toContain('eq(h2AdsInstanceBrowserRuns.state, "preparing")');
    expect(src).toContain("H2ADS_REPREPARABLE_STATES");
    const worker=fs.readFileSync("workers/windows/H2AdsWorker.ps1","utf8");
    expect(worker).toContain("AddMinutes(-5)");
    expect(worker).toContain("Test-H2AdsProfileBusy $profileDirectory");
  });
});
