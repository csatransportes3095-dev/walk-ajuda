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

// ─── Rota Express de download ─────────────────────────────────────────────────
export function registerApkDownloadRoute(app: Express) {

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
