import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const worker = fs.readFileSync(path.resolve(process.cwd(), "workers/windows/H2AdsWorker.ps1"), "utf8");
const route = fs.readFileSync(path.resolve(process.cwd(), "server/h2adsWorkerRoute.ts"), "utf8");
const ui = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/H2Ads.tsx"), "utf8");

describe("H2ADS final privacy guard", () => {
  it("exige Worker 1.4.3 ou superior para comandos de navegador", () => {
    expect(route).toContain('const MIN_BROWSER_AGENT_VERSION = "1.4.3"');
    expect(route).toContain("compareVersions(agentVersion, MIN_BROWSER_AGENT_VERSION) < 0");
  });

  it("valida firewall IPv4 e IPv6 no Chrome dedicado", () => {
    expect(worker).toContain('H2ADS Dedicated Chrome - Block Direct IPv4');
    expect(worker).toContain('H2ADS Dedicated Chrome - Block Direct IPv6');
    expect(worker).toContain('Direction Outbound');
    expect(worker).toContain('Action Block');
    expect(worker).toContain('Get-NetFirewallApplicationFilter');
    expect(worker).toContain('$DedicatedChromePath');
  });

  it("impede preparar no painel com Worker antigo", () => {
    expect(ui).toContain("workerVersionOk");
    expect(ui).toContain("atualizar para 1.4.3+");
  });
});
