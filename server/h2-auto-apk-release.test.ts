import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { H2_AUTO_FIXED_CERTIFICATE, resolveH2AutoInstaller } from "./h2-auto-apk-release";

const directories: string[] = [];
function fixture(overrides: Record<string, unknown> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "h2-auto-release-test-"));
  directories.push(root);
  const downloads = path.join(root, "downloads");
  fs.mkdirSync(downloads);
  const bytes = Buffer.alloc(40000, 1);
  const metadata = {
    packageName: "com.h2colombiano.auto", apkFile: "H2_AUTO_1_16_INSTALAR.apk",
    versionName: "1.16-audio-safe", versionCode: 16,
    certificateSha256: H2_AUTO_FIXED_CERTIFICATE,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    commit: "a".repeat(40), workflowRun: 123, publishedAt: "2026-10-26T19:00:00Z",
    ...overrides,
  };
  fs.writeFileSync(path.join(downloads, "H2_AUTO_1_16_INSTALAR.apk"), bytes);
  fs.writeFileSync(path.join(downloads, "h2-auto-release.json"), JSON.stringify(metadata));
  return { root, downloads };
}
afterEach(() => { for (const p of directories.splice(0)) fs.rmSync(p, { recursive: true, force: true }); });
describe("H2 AUTO promoted installer", () => {
  it("serves only a matching verified release", () => {
    expect(resolveH2AutoInstaller(fixture().root).release.versionCode).toBe(16);
  });
  it("rejects an obsolete release", () => { expect(() => resolveH2AutoInstaller(fixture({ versionCode: 9 }).root)).toThrow(); });
  it("rejects path traversal", () => { expect(() => resolveH2AutoInstaller(fixture({ apkFile: "../app.apk" }).root)).toThrow(); });
  it("rejects another signing channel", () => { expect(() => resolveH2AutoInstaller(fixture({ certificateSha256: "0".repeat(64) }).root)).toThrow(); });
  it("rejects integrity mismatch", () => { expect(() => resolveH2AutoInstaller(fixture({ sha256: "0".repeat(64) }).root)).toThrow(); });
  it("does not fall back to the old debug APK without metadata", () => {
    const { root, downloads } = fixture();
    fs.unlinkSync(path.join(downloads, "h2-auto-release.json"));
    fs.writeFileSync(path.join(downloads, "H2_AUTO_1_9_INSTALAR.apk"), Buffer.alloc(40000));
    expect(() => resolveH2AutoInstaller(root)).toThrow();
  });
});
