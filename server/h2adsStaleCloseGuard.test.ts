import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/h2adsWorkerRoute.ts"), "utf8");

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

  it("nao altera browser-session, firewall ou privacy guard nesta correcao", () => {
    expect(source).not.toContain("H2ADS_BROWSER_EXECUTABLE");
    expect(source).not.toContain("New-NetFirewallRule");
    expect(source).not.toContain("triggerKillSwitch");
  });
});
