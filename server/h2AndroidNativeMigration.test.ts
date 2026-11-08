import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getAndroidNativeOfflineZip } from "./h2AndroidInstallerZip";

describe("H2 Android Native - migracao segura do agente", () => {
  it("inclui agente nativo e instalador em ZIP servido no ADM", async () => {
    const zip = await getAndroidNativeOfflineZip();
    const count = zip.readUInt16LE(zip.length - 22 + 10);
    expect(count).toBe(11);
    for (const name of [
      "Instalar-H2-Android-Nativo.cmd", "H2NativeAgent.ps1",
      "H2NativeControl.ps1", "H2NativeCore.psm1",
      "H2NativeIsoBootstrap.ps1", "H2NativeInstalledBoot.ps1",
    ]) expect(zip.includes(Buffer.from(name))).toBe(true);
    expect(zip.includes(Buffer.from("H2AndroidControl.ps1"))).toBe(false);
  });

  it("reaproveita identidade H2 sem tocar H2 ADS nem rodar motor legado", () => {
    const agent = readFileSync("workers/windows/h2-native/H2NativeAgent.ps1", "utf8");
    const motor = readFileSync("workers/windows/h2-native/H2NativeControl.ps1", "utf8");
    const ui = readFileSync("client/src/components/H2AndroidLiveManager.tsx", "utf8");
    const route = readFileSync("server/routers/h2Android.ts", "utf8");
    expect(agent).toContain('$TaskName="H2 Android Agent"');
    expect(agent).toContain('"agent.json"');
    expect(agent).toContain("if(!$status.ready)");
    expect(agent).toContain("Get-H2AgentConfig|Out-Null");
    expect(motor).toContain("Get-H2NativeOwnedVm");
    expect(motor).toContain('("create","start","stop")');
    expect(ui).toContain('agent.agentVersion === "0.3.0-native"');
    expect(ui).toContain("Tela remota nativa ainda indisponivel");
    expect(route).toContain("isoSha256: input.isoSha256");
    expect(agent).not.toContain("H2AdsWorker");
    expect(agent).not.toContain("emulator.exe");
    expect(agent).not.toContain("adb.exe");
  });
});
