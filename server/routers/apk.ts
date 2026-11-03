/**
 * apk.ts — Gerenciamento do APK Android
 * - Migração automática da tabela apk_releases
 * - Endpoint de upload (admin only) via uploadRoute.ts
 * - Endpoint público GET /api/app/download com headers corretos
 * - tRPC: getLatest, saveRelease
 */
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { buildR2PublicUrl } from "../r2Storage";
import type { Express, Request, Response } from "express";
import { createHash } from "node:crypto";

// ─── Migração automática ──────────────────────────────────────────────────────
let _migrated = false;
export async function ensureApkTable() {
  if (_migrated) return;
  _migrated = true;
  const db = await getDb() as any;
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS apk_releases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL DEFAULT 'Colombiano.apk',
        r2Key VARCHAR(512) NOT NULL,
        publicUrl TEXT NOT NULL,
        fileSize BIGINT NULL,
        version VARCHAR(64) NULL,
        uploadedAt BIGINT NOT NULL,
        isActive TINYINT(1) NOT NULL DEFAULT 1
      )
    `));
  } catch (e) {
    console.error("[APK] ensureApkTable error:", e);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export async function getActiveApk() {
  await ensureApkTable();
  const db = await getDb() as any;
  const rows = await db.execute(sql.raw(
    `SELECT id, filename, r2Key, publicUrl, fileSize, version, uploadedAt FROM apk_releases WHERE isActive = 1 ORDER BY uploadedAt DESC LIMIT 1`
  )) as unknown as Array<Array<{ id: number; filename: string; r2Key: string; publicUrl: string; fileSize: number | null; version: string | null; uploadedAt: number }>>;
  const row = Array.isArray(rows[0]) ? rows[0][0] : (rows as any)[0];
  return row || null;
}

export async function saveApkRelease(opts: { filename: string; r2Key: string; publicUrl: string; fileSize: number; version?: string }) {
  await ensureApkTable();
  const db = await getDb() as any;
  // Desativar releases anteriores
  await db.execute(sql.raw(`UPDATE apk_releases SET isActive = 0`));
  // Inserir novo release
  await db.execute(sql.raw(
    `INSERT INTO apk_releases (filename, r2Key, publicUrl, fileSize, version, uploadedAt, isActive) VALUES ('${opts.filename}', '${opts.r2Key}', '${opts.publicUrl}', ${opts.fileSize}, ${opts.version ? `'${opts.version}'` : 'NULL'}, ${Date.now()}, 1)`
  ));
}

// Versão atual do APK publicada — incrementar a cada novo upload
// O UpdateChecker do app compara esse versionCode com o BuildConfig.VERSION_CODE
const CURRENT_APK_VERSION_CODE = 2;
const CURRENT_APK_VERSION_NAME = "2.0.0";


/** H2 AUTO: release independent from Colombiano and Driver Pro. */
type H2AutoApkRelease = {
  r2Key: string;
  sha256: string;
  fileSize: number;
  versionName: string;
  versionCode: number;
  uploadedAt: number;
};
let h2AutoReleaseTableReady = false;

export async function ensureH2AutoReleaseTable() {
  if (h2AutoReleaseTableReady) return;
  const db = await getDb() as any;
  await db.execute(sql.raw(
    "CREATE TABLE IF NOT EXISTS h2_auto_apk_releases (" +
    "id INT AUTO_INCREMENT PRIMARY KEY, " +
    "r2Key VARCHAR(512) NOT NULL, " +
    "sha256 CHAR(64) NOT NULL, " +
    "fileSize BIGINT NOT NULL, " +
    "versionName VARCHAR(64) NOT NULL, " +
    "versionCode INT NOT NULL, " +
    "uploadedAt BIGINT NOT NULL, " +
    "isActive TINYINT(1) NOT NULL DEFAULT 1)"
  ));
  h2AutoReleaseTableReady = true;
}

export async function getH2AutoApkRelease(): Promise<H2AutoApkRelease | null> {
  await ensureH2AutoReleaseTable();
  const db = await getDb() as any;
  const result = await db.execute(sql.raw(
    "SELECT r2Key, sha256, fileSize, versionName, versionCode, uploadedAt " +
    "FROM h2_auto_apk_releases WHERE isActive = 1 ORDER BY id DESC LIMIT 1"
  )) as any;
  const row = Array.isArray(result[0]) ? result[0][0] : result[0];
  if (!row) return null;
  return {
    r2Key: String(row.r2Key),
    sha256: String(row.sha256),
    fileSize: Number(row.fileSize),
    versionName: String(row.versionName),
    versionCode: Number(row.versionCode),
    uploadedAt: Number(row.uploadedAt),
  };
}

export async function saveH2AutoApkRelease(input: H2AutoApkRelease) {
  if (!/^app\/h2-auto\/[0-9]+-[a-f0-9]{64}\.apk$/.test(input.r2Key) ||
      !/^[a-f0-9]{64}$/.test(input.sha256) ||
      !/^1\.[0-9]{1,3}$/.test(input.versionName) ||
      !Number.isInteger(input.versionCode) || input.versionCode < 61 ||
      !Number.isInteger(input.fileSize) || input.fileSize < 32768) {
    throw new Error("Metadados do APK H2 AUTO inválidos");
  }
  await ensureH2AutoReleaseTable();
  const db = await getDb() as any;
  await db.transaction(async (tx: any) => {
    await tx.execute(sql.raw("UPDATE h2_auto_apk_releases SET isActive = 0 WHERE isActive = 1"));
    await tx.execute(sql`INSERT INTO h2_auto_apk_releases
      (r2Key, sha256, fileSize, versionName, versionCode, uploadedAt, isActive)
      VALUES (${input.r2Key}, ${input.sha256}, ${input.fileSize},
              ${input.versionName}, ${input.versionCode}, ${input.uploadedAt}, 1)`);
  });
}

// ─── Rota Express de download ─────────────────────────────────────────────────
export function registerApkDownloadRoute(app: Express) {
  // Public stable URL, served by H2 Colombiano / R2; no GitHub login or redirect.
  const downloadH2Auto = async (_req: Request, res: Response) => {
    try {
      const release = await getH2AutoApkRelease();
      if (!release) {
        res.setHeader("Cache-Control", "no-store");
        res.status(404).json({ error: "H2 AUTO ainda não publicado no ADM." });
        return;
      }
      const { r2GetObjectBuffer } = await import("../r2Storage");
      const buffer = await r2GetObjectBuffer(release.r2Key);
      const actualSha256 = createHash("sha256").update(buffer).digest("hex");
      if (buffer.length !== release.fileSize || actualSha256 !== release.sha256) {
        res.status(503).json({ error: "Integridade do APK não confirmada. Download bloqueado." });
        return;
      }
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", 'attachment; filename="H2-AUTO-' + release.versionName + '.apk"');
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(buffer);
    } catch (error) {
      console.error("[H2 AUTO APK] Falha ao baixar:", error);
      res.status(500).json({ error: "Falha ao disponibilizar APK H2 AUTO." });
    }
  };
  app.get("/baixar-h2-auto", downloadH2Auto);
  app.get("/api/h2-auto/download", downloadH2Auto);


  // Endpoint de versão — usado pelo UpdateChecker do APK
  app.get('/api/app/version', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      versionCode: CURRENT_APK_VERSION_CODE,
      versionName: CURRENT_APK_VERSION_NAME,
      downloadUrl: '/api/app/download',
    });
  });

  // Endpoint de versão Driver Pro
  app.get('/api/app/version-pro', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      versionCode: 1,
      versionName: '1.0.0',
      downloadUrl: '/api/app/download-pro',
    });
  });

  // Download Driver Pro
  app.get('/api/app/download-pro', async (_req: Request, res: Response) => {
    try {
      const apk = await getActiveApkPro();
      if (!apk) {
        res.status(404).json({ error: 'Nenhum APK Driver Pro disponível. Faça upload pelo painel ADM.' });
        return;
      }
      const { r2GetObjectBuffer } = await import('../r2Storage');
      const buffer = await r2GetObjectBuffer(apk.r2Key);
      res.setHeader('Content-Disposition', `attachment; filename="${apk.filename}"`);
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Length', buffer.length.toString());
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } catch (err: any) {
      console.error('[APK-PRO] download error:', err);
      res.status(500).json({ error: err?.message ?? 'Erro ao baixar APK Driver Pro' });
    }
  });

  app.get('/api/app/download', async (_req: Request, res: Response) => {
    try {
      const apk = await getActiveApk();
      if (!apk) {
        res.status(404).json({ error: 'Nenhum APK disponível. Faça upload pelo painel ADM.' });
        return;
      }
      // Fazer proxy do arquivo via R2 (sem redirecionar para URL pública que pode ser privada)
      const { r2GetObjectBuffer } = await import('../r2Storage');
      const buffer = await r2GetObjectBuffer(apk.r2Key);
      res.setHeader('Content-Disposition', `attachment; filename="${apk.filename}"`);
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Length', buffer.length.toString());
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } catch (err: any) {
      console.error('[APK] download error:', err);
      res.status(500).json({ error: err?.message ?? 'Erro ao baixar APK' });
    }
  });
}

// ─── Driver Pro ─────────────────────────────────────────────────────────────
let _migratedPro = false;
export async function ensureApkProTable() {
  if (_migratedPro) return;
  _migratedPro = true;
  const db = await getDb() as any;
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS apk_pro_releases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL DEFAULT 'H2DriverPro.apk',
        r2Key VARCHAR(512) NOT NULL,
        publicUrl TEXT NOT NULL,
        fileSize BIGINT NULL,
        version VARCHAR(64) NULL,
        uploadedAt BIGINT NOT NULL,
        isActive TINYINT(1) NOT NULL DEFAULT 1
      )
    `));
  } catch (e) {
    console.error('[APK-PRO] ensureApkProTable error:', e);
  }
}

export async function getActiveApkPro() {
  await ensureApkProTable();
  const db = await getDb() as any;
  const rows = await db.execute(sql.raw(
    `SELECT id, filename, r2Key, publicUrl, fileSize, version, uploadedAt FROM apk_pro_releases WHERE isActive = 1 ORDER BY uploadedAt DESC LIMIT 1`
  )) as unknown as Array<Array<{ id: number; filename: string; r2Key: string; publicUrl: string; fileSize: number | null; version: string | null; uploadedAt: number }>>;
  const row = Array.isArray(rows[0]) ? rows[0][0] : (rows as any)[0];
  return row || null;
}

export async function saveApkProRelease(opts: { filename: string; r2Key: string; publicUrl: string; fileSize: number; version?: string }) {
  await ensureApkProTable();
  const db = await getDb() as any;
  await db.execute(sql.raw(`UPDATE apk_pro_releases SET isActive = 0`));
  await db.execute(sql.raw(
    `INSERT INTO apk_pro_releases (filename, r2Key, publicUrl, fileSize, version, uploadedAt, isActive) VALUES ('${opts.filename}', '${opts.r2Key}', '${opts.publicUrl}', ${opts.fileSize}, ${opts.version ? `'${opts.version}'` : 'NULL'}, ${Date.now()}, 1)`
  ));
}

// ─── tRPC router ─────────────────────────────────────────────────────────────
export const apkRouter = router({
  getH2AutoRelease: publicProcedure.query(async () => {
    const release = await getH2AutoApkRelease();
    if (!release) return null;
    return {
      versionName: release.versionName,
      versionCode: release.versionCode,
      fileSize: release.fileSize,
      sha256: release.sha256,
      uploadedAt: release.uploadedAt,
      downloadUrl: "/baixar-h2-auto",
    };
  }),
  getLatest: publicProcedure.query(async () => {
    const apk = await getActiveApk();
    if (!apk) return null;
    return {
      filename: apk.filename,
      publicUrl: apk.publicUrl,
      fileSize: apk.fileSize,
      version: apk.version,
      uploadedAt: apk.uploadedAt,
      downloadUrl: '/api/app/download',
    };
  }),
});
