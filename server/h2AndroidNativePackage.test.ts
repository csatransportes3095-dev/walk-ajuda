import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getAndroidNativeOfflineZip, getAndroidWindowsInstallerZip } from "./h2AndroidInstallerZip";

describe("H2 Android native package only through ADM", () => {
  it("packages only the native agent and its prerequisites", async () => {
    const zip = await getAndroidNativeOfflineZip();
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(11);
    for (const name of [
      "Instalar-H2-Android-Nativo.cmd", "H2NativeAgent.ps1",
      "H2NativeControl.ps1", "H2NativeCore.psm1",
      "H2NativeIsoBootstrap.ps1", "H2NativeInstalledBoot.ps1", "README.md",
    ]) {
      expect(zip.includes(Buffer.from(name))).toBe(true);
    }
    expect(zip.includes(Buffer.from("H2AndroidAgent.ps1"))).toBe(false);
    expect(zip.includes(Buffer.from("Instalar-H2-Android.cmd"))).toBe(false);
  });

  it("keeps the existing v0.2.0 agent installer unchanged", async () => {
    const zip = await getAndroidWindowsInstallerZip();
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(3);
    expect(zip.includes(Buffer.from("H2AndroidAgent.ps1"))).toBe(true);
    expect(zip.includes(Buffer.from("H2AndroidControl.ps1"))).toBe(true);
  });

  it("limits native download to the authenticated H2 Android endpoint", () => {
    const route = readFileSync("server/h2AndroidAgentRoute.ts", "utf8");
    const panel = readFileSync("client/src/pages/AdminH2Android.tsx", "utf8");
    const policy = readFileSync("server/siteAccessPolicy.ts", "utf8");
    expect(route).toContain('"/api/h2-android/agent/installer.zip"');
    expect(route).toContain("isAdminJwtValid");
    expect(route).toContain("getAndroidNativeOfflineZip()");
    expect(route).not.toContain("getAndroidWindowsInstallerZip()");
    expect(panel).toContain('/api/h2-android/agent/installer.zip');
    expect(panel).not.toContain('installer.zip?engine=native');
    expect(policy).toContain('pathname === "/api/h2-android/agent/installer.zip"');
  });
});
