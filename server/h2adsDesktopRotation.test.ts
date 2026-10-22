import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(projectRoot, file), "utf8");

describe("melhorias operacionais H2 Ads", () => {
  it("usa quatro instâncias por linha em desktop largo e amplia a área útil", () => {
    const source = read("client/src/pages/H2Ads.tsx");
    expect(source).toContain("2xl:grid-cols-4");
    expect(source.match(/max-w-\[1800px\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("edita somente a rotação sem devolver credenciais protegidas ao navegador", () => {
    const ui = read("client/src/pages/H2Ads.tsx");
    const router = read("server/routers/h2ads.ts");
    const service = read("server/h2ads.ts");
    expect(ui).toContain("Tempo de rotação (minutos)");
    expect(ui).toContain("updateProxyRotation");
    expect(router).toContain("updateProxyRotation: adminProcedure");
    expect(router).toContain("h2AdsUpdateProxyRotationSchema");
    expect(service).toContain("rotationMinutes");
    for (const operation of ["listDashboard", "saveProxyCredential", "updateProxyRotation", "validateProxy"]) {
      expect(router).toContain(`${operation}: adminProcedure`);
    }
  });

  it("mantém o mesmo IP durante a sessão aberta e preserva o kill switch", () => {
    const worker = read("workers/windows/H2AdsWorker.ps1");
    const session = read("workers/windows/browser-session.mjs");
    expect(worker).toContain("Start-Sleep -Seconds 2");
    expect(worker).toContain('$AgentVersion = "1.4.1"');
    expect(worker).toContain("H2ADS Dedicated Chrome - Block Direct IPv4");
    expect(worker).toContain("H2ADS Dedicated Chrome - Block Direct IPv6");
    expect(session).toContain('proxyRotationPolicy: "between_sessions_only"');
    expect(session).not.toContain("rotationMinutes * 60_000");
    expect(session).toContain('directBrowserEgress: "blocked_by_windows_firewall"');
    expect(session).toContain("await suspendProxyTraffic");
  });
});
