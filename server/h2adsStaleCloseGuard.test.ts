import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/h2adsWorkerRoute.ts"), "utf8");
const browserSessionSource = fs.readFileSync(path.resolve(process.cwd(), "workers/windows/browser-session.mjs"), "utf8");

describe("H2ADS stale close guard", () => {
  it("reenvia somente launch_browser claimed obsoleto", () => {
    expect(source).toContain('eq(h2AdsWorkerBrowserCommands.command, "launch_browser")');
    expect(source).toContain('.set({ status: "queued", claimedAt: null })');
  });

  it("cancela close_browser claimed obsoleto em vez de reencaminhar", () => {
    expect(source).toContain('eq(h2AdsWorkerBrowserCommands.command, "close_browser")');
    expect(source).toContain('.set({ status: "cancelled", completedAt: new Date() })');
  });

  it("cancela close_browser queued antigo para nao atingir sessao nova", () => {
    expect(source).toContain('eq(h2AdsWorkerBrowserCommands.status, "queued")');
    expect(source).toContain('lt(h2AdsWorkerBrowserCommands.createdAt, staleBrowserCutoff)');
  });

  it("concilia prepare_browser vencido em vez de reenviar cegamente", () => {
    const core = fs.readFileSync(path.resolve(process.cwd(), "server/h2ads.ts"), "utf8");
    expect(source).toContain("expireH2AdsStalledPreparationsForWorker(workerId)");
    expect(source).not.toContain('lt(h2AdsWorkerCommands.claimedAt, new Date(now - STALE_PREPARATION_COMMAND_MS))');
    expect(core).toContain('errorCategory: "preparation_timeout"');
    expect(core).toContain('lt(h2AdsInstanceBrowserRuns.lastChangedAt, cutoff)');
    expect(core).toContain('eq(h2AdsWorkerCommands.status, command.status)');
    expect(core).toContain('eq(h2AdsWorkerCommands.status, "claimed")');
    expect(core).toContain("latest.completedAt.getTime() > cutoff.getTime()");
    expect(core).toContain('eq(h2AdsInstanceBrowserRuns.state, "preparing")');
  });

  it("carrega a extensao de privacy guard para Google, Bing, Uber e outras paginas de challenge quando abre o Chrome", () => {
    expect(browserSessionSource).toContain("createGoogleSorryPrivacyGuard");
    expect(browserSessionSource).toContain("--load-extension=");
    expect(browserSessionSource).toContain("*://*/*");
    expect(browserSessionSource).toContain("not-a-bot");
    expect(browserSessionSource).toContain("confirm");
    expect(browserSessionSource).toContain("captcha|challenge|verify|verification");
    expect(browserSessionSource).toContain("googleSorryPrivacyGuard: \"enabled\"");
  });

  it("nao altera browser-session, firewall ou privacy guard nesta correcao", () => {
    expect(source).not.toContain("H2ADS_BROWSER_EXECUTABLE");
    expect(source).not.toContain("New-NetFirewallRule");
    expect(source).not.toContain("triggerKillSwitch");
  });
});
