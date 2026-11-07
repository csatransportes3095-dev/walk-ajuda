import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateAndroidAgentReport, h2AndroidAvdName } from "./h2AndroidAgentStore";

const read = (path: string) => readFileSync(path, "utf8");

describe("H2 Android - operacao real pelo ADM", () => {
  it("aceita relatorio de instancias ligado e bloqueia nomes arbitrarios", () => {
    const report = validateAndroidAgentReport({
      computerName: "WALKARTS", windowsVersion: "Windows 11",
      agentVersion: "0.2.0", sdkDetected: true, adbDetected: true,
      emulatorDetected: true, avdNames: ["H2Android_01"], emulatorDevices: [],
      runningAvds: ["H2Android_01"], ramGb: 32, logicalProcessors: 20,
      virtualizationEnabled: true,
    });
    expect(report.runningAvds).toEqual(["H2Android_01"]);
    expect(h2AndroidAvdName.test("H2Android_01")).toBe(true);
    for (const evil of ["../H2AdsWorker", "emulator-5554", "H2Android_01;dir", "foo"]) {
      expect(h2AndroidAvdName.test(evil)).toBe(false);
    }
  });

  it("permite so comandos explicitos autenticados e nao faz execucao remota arbitraria", () => {
    const router = read("server/routers/h2Android.ts");
    const store = read("server/h2AndroidAgentStore.ts");
    const routes = read("server/h2AndroidAgentRoute.ts");
    const windows = read("workers/windows/H2AndroidControl.ps1");
    expect(router).toContain("control: adminProcedure");
    expect(router).toContain('z.literal("start")');
    expect(router).toContain('z.literal("stop")');
    expect(router).toContain('z.literal("proxy")');
    expect(router).toContain('z.literal("tap")');
    expect(router).toContain('z.literal("key")');
    expect(store).toContain("h2_android_commands");
    expect(store).toContain("tokenHash");
    expect(store).toContain("commandType = 'start'");
    expect(routes).toContain('"/api/h2-android/agent/pull"');
    expect(routes).toContain('"/api/h2-android/screen/:agentId/:avdName"');
    expect(routes).toContain("isAdminJwtValid");
    expect(windows).toContain("H2-CheckName");
    expect(windows).toContain("Run-H2Control");
    expect(windows).toContain("Capture-H2Screen");
    expect(windows).toContain("Get-H2RunningAvds");
    expect(windows).toContain("swiftshader_indirect");
    expect(windows).not.toContain("H2AdsWorker");
    expect(windows).not.toContain("Invoke-Expression");
    expect(windows).not.toContain("iex ");
  });

  it("prepara agente e API para controle pelo site independente", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    const packageService = read("server/h2AndroidInstallerZip.ts");
    const router = read("server/routers/h2Android.ts");
    const adminPage = read("client/src/pages/AdminH2Android.tsx");
    expect(agent).toContain('Test-Path -LiteralPath $ConfigPath');
    expect(agent).toContain("Pareamento existente preservado");
    expect(agent).toContain("Run-H2Control");
    expect(agent).toContain("Capture-H2Screen");
    expect(packageService).toContain('H2AndroidControl.ps1');
    expect(router).toContain("control: adminProcedure");
    expect(router).toContain("createPairingCode: adminProcedure");
    expect(adminPage).not.toContain("H2AndroidLiveManager");
    expect(adminPage).not.toContain("controle verdadeiro no site");
  });
});
