import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const H2_AUTO_FIXED_CERTIFICATE = "3215b6d6b643ae6b57ffaf6e4854a40be267d4816166255872410c696384b393";
export type H2AutoApkRelease = {
  packageName: "com.h2colombiano.auto";
  apkFile: string;
  versionName: string;
  versionCode: number;
  sha256: string;
  certificateSha256: string;
  commit: string;
  workflowRun: number;
  publishedAt: string;
};

/** Promotion is fail-closed: never fall back to an obsolete/debug installer. */
export function resolveH2AutoInstaller(publicDirectory: string): { release: H2AutoApkRelease; filePath: string; size: number } {
  const downloads = path.resolve(publicDirectory, "downloads");
  const raw = JSON.parse(fs.readFileSync(path.join(downloads, "h2-auto-release.json"), "utf8"));
  if (raw.packageName !== "com.h2colombiano.auto" ||
      !/^H2_AUTO_[0-9_]+_INSTALAR\.apk$/.test(raw.apkFile ?? "") ||
      !Number.isInteger(raw.versionCode) || raw.versionCode < 16 ||
      typeof raw.versionName !== "string" || raw.versionName.length > 80 ||
      !/^[a-f0-9]{64}$/.test(raw.sha256 ?? "") ||
      raw.certificateSha256 !== H2_AUTO_FIXED_CERTIFICATE ||
      !/^[a-f0-9]{40}$/.test(raw.commit ?? "") ||
      !Number.isSafeInteger(raw.workflowRun) || raw.workflowRun < 1) {
    throw new Error("Invalid H2 AUTO release metadata");
  }
  const filePath = path.resolve(downloads, raw.apkFile);
  if (path.dirname(filePath) !== downloads) throw new Error("Invalid installer path");
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < 35000 || stat.size > 50 * 1024 * 1024) throw new Error("Invalid installer size");
  const digest = createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  if (digest !== raw.sha256) throw new Error("Installer integrity mismatch");
  return { release: raw as H2AutoApkRelease, filePath, size: stat.size };
}
