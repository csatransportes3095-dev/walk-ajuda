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

  it("reduz a espera do comando local e mantém rotação por reconexão do relay", () => {
    const worker = read("workers/windows/H2AdsWorker.ps1");
    const session = read("workers/windows/browser-session.mjs");
    expect(worker).toContain("Start-Sleep -Seconds 2");
    expect(worker).toContain('$AgentVersion = "1.3.3"');
    expect(session).toContain("setInterval");
    expect(session).toContain("rotationMinutes * 60_000");
    expect(session).toContain("relay.close(true)");
  });
});
