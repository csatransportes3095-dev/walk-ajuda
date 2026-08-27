import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertH2AdsSchemaStatementSafe } from "./h2adsSchemaMigration";

const projectRoot = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(projectRoot, file), "utf8");

describe("fundação multi-Worker H2 Ads", () => {
  it("mantém três tabelas H2 Ads idempotentes e sem comandos destrutivos", () => {
    const statements = read("drizzle/0140_h2ads_browser_workers.sql").split("--> statement-breakpoint").map(item => item.trim()).filter(Boolean);
    expect(statements).toHaveLength(3);
    statements.forEach(assertH2AdsSchemaStatementSafe);
    expect(statements.join("\n")).toContain("h2ads_browser_workers");
    expect(statements.join("\n")).toContain("h2ads_worker_pairing_codes");
    expect(statements.join("\n")).toContain("h2ads_instance_worker_assignments");
  });

  it("usa códigos de uso único, token com hash e heartbeat sem devolver segredo", () => {
    const source = read("server/h2ads.ts");
    const route = read("server/h2adsWorkerRoute.ts");
    expect(source).toContain("timingSafeEqual");
    expect(source).toContain("codeHash");
    expect(source).toContain("tokenHash");
    expect(source).toContain("isNull(h2AdsWorkerPairingCodes.usedAt)");
    expect(route).toContain("/api/h2ads/worker/claim");
    expect(route).toContain("/api/h2ads/worker/heartbeat");
    expect(route).toContain("/api/h2ads/worker/windows-agent.ps1");
    expect(route).toContain("Cache-Control");
    expect(route).not.toContain("console.log");
  });

  it("prepara o agente Windows sem iniciar ou automatizar browsers", () => {
    const script = read("workers/windows/H2AdsWorker.ps1");
    expect(script).toContain("ConvertFrom-SecureString");
    expect(script).toContain("ConvertTo-SecureString");
    expect(script).toContain("Register-ScheduledTask");
    expect(script).toContain("/api/h2ads/worker/heartbeat");
    for (const prohibited of ["chrome.exe", "msedge.exe", "playwright", "selenium", "puppeteer", "Start-Process.*chrome"]) {
      expect(script.toLowerCase()).not.toContain(prohibited.toLowerCase());
    }
  });
});
