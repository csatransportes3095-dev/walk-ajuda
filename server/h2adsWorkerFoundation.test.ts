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
    expect(route.toLowerCase()).toContain("x-h2ads-agent-version");
    expect(route).toContain("STALE_BROWSER_COMMAND_MS");
    expect(route).toContain("Cache-Control");
    expect(route).not.toContain("console.log");
  });

  it("permite somente sessão local manual e continua sem automação de sites", () => {
    const script = read("workers/windows/H2AdsWorker.ps1");
    const runner = read("workers/windows/browser-runner.mjs");
    const session = read("workers/windows/browser-session.mjs");
    expect(script).toContain('$AgentVersion = "1.3.4"');
    expect(script).toContain("ConvertFrom-SecureString");
    expect(script).toContain("ConvertTo-SecureString");
    expect(script).toContain("Read-Host");
    expect(script).toContain("AsSecureString");
    expect(script).toContain("Código de pareamento inválido");
    expect(script).toContain("Register-ScheduledTask");
    expect(script).toContain("/api/h2ads/worker/heartbeat");
    expect(script).toContain("/api/h2ads/worker/commands/next");
    expect(script).toContain("X-H2ADS-Agent-Version");
    expect(script).toContain("Acquire-WorkerMutex");
    expect(script).toContain("Stop-ExistingWorkerProcesses");
    expect(script).toContain("Complete-LocalCommandFailure");
    expect(script).toContain("ProxyChainPackagePath");
    expect(script).toContain("Initialize-InstanceProfile");
    expect(script).toContain("Start-Sleep -Seconds 2");
    expect(session).toContain("rotationMinutes");
    expect(session).toContain("relay.close(true)");
    expect(runner).toContain('host: "127.0.0.1"');
    expect(runner).toContain("https://api.ipify.org?format=json");
    expect(runner).not.toContain("console.log");
    expect(session).toContain("createInstanceLabelPage");
    expect(session).toContain("labelPageUrl");
    expect(session).toContain("privacyGuardPreflight");
    expect(session).toContain("--proxy-server=http://127.0.0.1:");
    expect(session).toContain("--user-data-dir=");
    expect(session).toContain("/api/h2ads/worker/runs/");
    for (const prohibited of ["playwright", "selenium", "puppeteer", "page.goto", "browser.newpage", "console.log"]) {
      expect(script.toLowerCase()).not.toContain(prohibited.toLowerCase());
      expect(runner.toLowerCase()).not.toContain(prohibited.toLowerCase());
      expect(session.toLowerCase()).not.toContain(prohibited.toLowerCase());
    }
  });

  it("mantém a fila de preparação em tabelas H2 Ads idempotentes e isoladas", () => {
    const statements = read("drizzle/0141_h2ads_browser_preparation.sql").split("--> statement-breakpoint").map(item => item.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    statements.forEach(assertH2AdsSchemaStatementSafe);
    expect(statements.join("\n")).toContain("h2ads_instance_browser_runs");
    expect(statements.join("\n")).toContain("h2ads_worker_commands");
    expect(statements.join("\n")).not.toMatch(/\b(clients|orders|loans|expenses|cards)\b/i);
  });

  it("cria uma fila manual isolada e idempotente sem alterar a fila de preparação publicada", () => {
    const statements = read("drizzle/0142_h2ads_browser_manual_commands.sql").split("--> statement-breakpoint").map(item => item.trim()).filter(Boolean);
    expect(statements).toHaveLength(1);
    statements.forEach(assertH2AdsSchemaStatementSafe);
    expect(statements.join("\n")).toContain("h2ads_worker_browser_commands");
    expect(statements.join("\n")).not.toContain("ALTER TABLE");
    expect(statements.join("\n")).not.toContain("h2ads_worker_commands`");
  });
});
