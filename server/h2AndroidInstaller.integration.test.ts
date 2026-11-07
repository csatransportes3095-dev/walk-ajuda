import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { packAndroidWindowsInstaller, getAndroidWindowsInstallerZip } from "./h2AndroidInstallerZip";

describe("H2 Android: instalador Windows no ADM", () => {
  it("gera um ZIP valido e extrai os dois arquivos esperados", async () => {
    const buffer = await getAndroidWindowsInstallerZip();
    expect(buffer.readUInt32LE(0)).toBe(0x04034b50);
    expect(buffer.readUInt32LE(buffer.length - 22)).toBe(0x06054b50);
    expect(buffer.readUInt16LE(buffer.length - 22 + 10)).toBe(2);
    expect(buffer.includes(Buffer.from("Instalar-H2-Android.cmd"))).toBe(true);
    expect(buffer.includes(Buffer.from("H2AndroidAgent.ps1"))).toBe(true);
    expect(buffer.length).toBeGreaterThan(5000);
  });

  it("recusa nomes arbitrarios no ZIP", () => {
    expect(() => packAndroidWindowsInstaller([{ name: "../rogue.cmd", content: Buffer.from("hello") }])).toThrow();
  });

  it("libera somente o download ADM e nao altera o H2 ADS", () => {
    const route = readFileSync("server/h2AndroidAgentRoute.ts", "utf8");
    const policy = readFileSync("server/siteAccessPolicy.ts", "utf8");
    const ui = readFileSync("client/src/pages/AdminH2Android.tsx", "utf8");
    const agent = readFileSync("workers/windows/H2AndroidAgent.ps1", "utf8");
    const launcher = readFileSync("workers/windows/Instalar-H2-Android.cmd", "utf8");
    expect(route).toContain('"/api/h2-android/agent/installer.zip"');
    expect(route).toContain("isAdminJwtValid");
    expect(policy).toContain('pathname === "/api/h2-android/agent/installer.zip"');
    expect(ui).toContain('download="Instalador-H2-Android.zip"');
    expect(ui).toContain("Instalar-H2-Android.cmd");
    expect(agent).toContain('Start-Process -FilePath');
    expect(agent).toContain("Register-ScheduledTask");
    expect(agent).toContain("H2 Android Agent.lnk");
    expect(launcher).toContain("-Install");
    expect(launcher).not.toContain("H2AdsWorker");
  });
});
