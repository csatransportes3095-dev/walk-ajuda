import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getAndroidFirstAvdWizardZip } from "./h2AndroidInstallerZip";

describe("H2 Android - primeiro AVD com consentimento", () => {
  it("monta ZIP executavel por Windows com 2 arquivos separados do agente", async () => {
    const zip = await getAndroidFirstAvdWizardZip();
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 12)).toBe(2);
    expect(zip.includes(Buffer.from("Preparar-Primeiro-Android.cmd"))).toBe(true);
    expect(zip.includes(Buffer.from("Preparar-H2Android-01.ps1"))).toBe(true);
  });

  it("pede confirmacao antes de instalar imagem, criar AVD e iniciar", () => {
    const ps = readFileSync("workers/windows/Preparar-H2Android-01.ps1", "utf8");
    const cmd = readFileSync("workers/windows/Preparar-Primeiro-Android.cmd", "utf8");
    expect(ps).toContain("Confirm-Action");
    expect((ps.match(/Confirm-Action /g) || []).length).toBeGreaterThanOrEqual(4);
    expect(ps).toContain("system-images;android-35;google_apis_playstore;x86_64");
    expect(ps).toContain("-accel-check");
    expect(ps).toContain("$running.Count -ge 5");
    expect(ps).toContain("$existing");
    expect(ps).toContain("if ($CheckOnly)");
    expect(cmd).toContain("pause");
    expect(cmd).toContain("-File");
    expect(cmd).not.toContain("H2AdsWorker");
  });

  it("API e painel exigem ADM e utilizam rota /adm/android", () => {
    const api = readFileSync("server/h2AndroidAgentRoute.ts", "utf8");
    const access = readFileSync("server/siteAccessPolicy.ts", "utf8");
    const ui = readFileSync("client/src/pages/AdminH2Android.tsx", "utf8");
    expect(api).toContain('"/api/h2-android/agent/first-avd.zip"');
    expect(api).toContain("isAdminJwtValid");
    expect(access).toContain('pathname === "/api/h2-android/agent/first-avd.zip"');
    expect(ui).toContain('download="Preparar-Primeiro-Android.zip"');
  });
});
