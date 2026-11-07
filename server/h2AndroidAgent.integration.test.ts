import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isAndroidAgentOnline, normalizeAndroidPairingCode, validateAndroidAgentReport } from "./h2AndroidAgentStore";

const read = (path: string) => readFileSync(path, "utf8");

describe("H2 Android Agent - conexao segura e independente", () => {
  it("valida codigo de pareamento de 128 bits sem aceitar codigos fracos", () => {
    const code = "A3E84A799AFB4468B21D9970A213EE2A";
    expect(normalizeAndroidPairingCode(code)).toBe(code);
    expect(normalizeAndroidPairingCode("A3E8-4A79-9AFB-4468-B21D-9970-A213-EE2A")).toBe(code);
    for (const invalid of ["123456", "A".repeat(31), "G".repeat(32), "", null]) {
      expect(normalizeAndroidPairingCode(invalid)).toBeNull();
    }
  });

  it("heartbeat online expira e relatorios nao incluem campos arbitrarios", () => {
    const now = Date.now();
    expect(isAndroidAgentOnline(new Date(now - 60_000), now)).toBe(true);
    expect(isAndroidAgentOnline(new Date(now - 91_000), now)).toBe(false);
    expect(isAndroidAgentOnline(null, now)).toBe(false);
    const report = {
      computerName: "DESKTOP-H2", windowsVersion: "Windows 11",
      agentVersion: "0.1.0", sdkDetected: false, adbDetected: false,
      emulatorDetected: false, avdNames: [], emulatorDevices: [],
      ramGb: 32, logicalProcessors: 16, virtualizationEnabled: true,
    };
    expect(validateAndroidAgentReport(report)).toMatchObject(report);
    expect(() => validateAndroidAgentReport({ ...report, adminToken: "fake" })).toThrow();
    expect(() => validateAndroidAgentReport({ ...report, avdNames: Array(21).fill("a") })).toThrow();
  });

  it("separa endpoints e dados do H2 ADS, com autenticacao independente", () => {
    const store = read("server/h2AndroidAgentStore.ts");
    const routes = read("server/h2AndroidAgentRoute.ts");
    const windows = read("workers/windows/H2AndroidAgent.ps1");
    const entry = read("server/_core/index.ts");
    const policy = read("server/siteAccessPolicy.ts");
    expect(store).toContain("h2_android_agents");
    expect(store).toContain("h2_android_agent_pairings");
    expect(store).toContain('createHash("sha256")');
    expect(store).toContain("UPDATE h2_android_agent_pairings");
    expect(store).toContain("claimedAt IS NULL AND expiresAt > NOW()");
    expect(routes).toContain("registerH2AndroidAgentRoutes");
    expect(routes).toContain("isAdminJwtValid");
    expect(routes).toContain('"/api/h2-android/agent/heartbeat"');
    expect(entry).toContain("registerH2AndroidAgentRoutes(app)");
    expect(policy).toContain('"/api/h2-android/agent/heartbeat"');
    expect(windows).toContain('H2AndroidAgent');
    expect(windows).toContain('H2AndroidAgent.ps1');
    expect(windows).not.toContain("H2AdsWorker.ps1");
    expect(windows).not.toContain("Start-Process emulator");
    expect(routes).not.toContain("eval(");
  });

  it("continua limitando a cinco perfis ativos sem afirmar que existem emuladores ativos", () => {
    const router = read("server/routers/h2Android.ts");
    expect(router).toContain("H2_ANDROID_MAX_RUNNING = 5");
    expect(router).toContain("agent.runningAvds.length");
    expect(router).toContain("control: adminProcedure");
    expect(router).toContain("issueAndroidPairingCode");
    expect(router).toContain("revokeAndroidAgent");
  });
});
