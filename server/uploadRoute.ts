/**
 * uploadRoute.ts — Upload de vídeo em chunks via presigned PUT para S3
 *
 * Fluxo:
 *   1. POST /api/upload/init-chunked  → cria sessão no banco, retorna uploadId + array de presigned PUT URLs
 *   2. PUT  /api/upload/chunk-proxy   → recebe chunk do browser, faz PUT streaming para S3 (sem buffer em memória)
 *   3. POST /api/upload/finalize-chunked → baixa chunks do S3 em paralelo, monta arquivo final, salva no banco
 *
 * Por que funciona em produção:
 *   - Cada chunk é 20MB → abaixo do limite do Cloudflare (~100MB)
 *   - O servidor não armazena o arquivo inteiro em RAM (streaming)
 *   - O finalize baixa os chunks em paralelo → rápido mesmo com muitos chunks
 *   - Sessões ficam no banco → funciona com múltiplas instâncias do Cloud Run
 */
import type { Express, Request, Response } from "express";
import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { parse as parseCookieHeader } from "cookie";
import { storagePut, storageGet } from "./storage";
import { addOrderFile, getDb } from "./db";
import { uploadSessions } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "./_core/env";

const jsonParser = express.json({ limit: "2mb" });
// Limite maior para upload base64 (imagem comprimida ~base64 cresce ~33%)
const jsonParserBig = express.json({ limit: "40mb" });

// 25MB por chunk — suporta chunks de até 20MB com margem de segurança
const uploadChunk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// 20MB para uploads diretos (imagens, PDFs) — UI permite até 15MB, margem de segurança
const uploadDirect = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
function isAdminRequest(req: Request): boolean {
  try {
    const cookieHeader = req.headers.cookie || "";
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies.admin_token;
    if (!token) return false;
    const secret = process.env.JWT_SECRET || "admin-secret-fallback";
    const payload = jwt.verify(token, secret) as { sub: string; role: string };
    return payload.role === "admin";
  } catch {
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveFileExt(mimeType: string, originalFilename?: string): { ext: string; contentType: string } {
  const map: Record<string, { ext: string; contentType: string }> = {
    "image/jpeg":      { ext: "jpg",  contentType: "image/jpeg" },
    "image/jpg":       { ext: "jpg",  contentType: "image/jpeg" },
    "image/png":       { ext: "png",  contentType: "image/png" },
    "image/gif":       { ext: "gif",  contentType: "image/gif" },
    "image/webp":      { ext: "webp", contentType: "image/webp" },
    "image/heic":      { ext: "jpg",  contentType: "image/jpeg" },
    "image/heif":      { ext: "jpg",  contentType: "image/jpeg" },
    "application/pdf": { ext: "pdf",  contentType: "application/pdf" },
    "video/mp4":       { ext: "mp4",  contentType: "video/mp4" },
    "video/webm":      { ext: "webm", contentType: "video/webm" },
    "video/quicktime": { ext: "mov",  contentType: "video/quicktime" },
    "video/x-msvideo": { ext: "avi",  contentType: "video/x-msvideo" },
    "video/mpeg":      { ext: "mpeg", contentType: "video/mpeg" },
    "video/ogg":       { ext: "ogv",  contentType: "video/ogg" },
  };
  if (map[mimeType]) return map[mimeType];
  if ((!mimeType || mimeType === 'application/octet-stream') && originalFilename) {
    const ext = originalFilename.split('.').pop()?.toLowerCase() || '';
    const extMap: Record<string, { ext: string; contentType: string }> = {
      'jpg': { ext: 'jpg', contentType: 'image/jpeg' },
      'jpeg': { ext: 'jpg', contentType: 'image/jpeg' },
      'png': { ext: 'png', contentType: 'image/png' },
      'gif': { ext: 'gif', contentType: 'image/gif' },
      'webp': { ext: 'webp', contentType: 'image/webp' },
      'pdf': { ext: 'pdf', contentType: 'application/pdf' },
      'heic': { ext: 'jpg', contentType: 'image/jpeg' },
      'heif': { ext: 'jpg', contentType: 'image/jpeg' },
      'mp4': { ext: 'mp4', contentType: 'video/mp4' },
    };
    if (extMap[ext]) return extMap[ext];
  }
  return { ext: "jpg", contentType: "image/jpeg" };
}

function makeSafeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/gi, "");
}

/** Obtém presigned PUT URL do Forge API para um path no S3 */
async function getPresignedPutUrl(relKey: string): Promise<string> {
  const baseUrl = (ENV.forgeApiUrl || "").replace(/\/+$/, "");
  const apiKey = ENV.forgeApiKey;
  const url = new URL(`${baseUrl}/v1/storage/presign/put`);
  url.searchParams.set("path", relKey.replace(/^\/+/, ""));
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Failed to get presigned PUT URL: ${resp.status} ${msg}`);
  }
  const data = await resp.json() as { url: string };
  return data.url;
}

/** Obtém presigned GET URL do Forge API para um path no S3 (mesmo bucket do presign/put) */
async function getPresignedGetUrl(relKey: string): Promise<string> {
  const baseUrl = (ENV.forgeApiUrl || "").replace(/\/+$/, "");
  const apiKey = ENV.forgeApiKey;
  const url = new URL(`${baseUrl}/v1/storage/presign/get`);
  url.searchParams.set("path", relKey.replace(/^\/+/, ""));
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Failed to get presigned GET URL: ${resp.status} ${msg}`);
  }
  const data = await resp.json() as { url: string };
  return data.url;
}

export function registerUploadRoute(app: Express) {

  // ─── CHUNK UPLOAD: Inicializa sessão e retorna uploadId ─────────────────────
  app.post("/api/upload/init-chunked", jsonParser, async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { registrationId, customerPhone, label, fromAdmin, mimeType, totalChunks } = req.body;
      if (!registrationId || !customerPhone || !label || !mimeType || !totalChunks) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }
      const r = resolveFileExt(mimeType);
      const safeLabel = makeSafeLabel(label);
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const prefix = fromAdmin === "1" || fromAdmin === 1 ? "admin-docs" : "order-docs";
      const fileKey = `${prefix}/${customerPhone}-${safeLabel}-${randomSuffix}.${r.ext}`;
      const uploadId = `${Date.now()}-${randomSuffix}`;
      const total = Number(totalChunks);

      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      await db.insert(uploadSessions).values({
        uploadId,
        registrationId: String(registrationId),
        customerPhone,
        label,
        fromAdmin: String(fromAdmin ?? "0"),
        mimeType,
        ext: r.ext,
        contentType: r.contentType,
        fileKey,
        totalChunks: total,
        receivedChunks: 0,
      });
      res.json({ uploadId });
    } catch (err: any) {
      console.error("[UploadRoute] init-chunked error:", err);
      res.status(500).json({ error: err?.message ?? "Init failed" });
    }
  });

  // ─── CHUNK UPLOAD: Recebe chunk e faz PUT streaming para S3 ─────────────────
  app.post(
    "/api/upload/chunk",
    uploadChunk.single("chunk"),
    async (req: Request, res: Response) => {
      try {
        if (!isAdminRequest(req)) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        const chunk = req.file;
        if (!chunk) {
          res.status(400).json({ error: "No chunk provided" });
          return;
        }
        const { uploadId, chunkIndex } = req.body;
        if (!uploadId || chunkIndex === undefined) {
          res.status(400).json({ error: "Missing uploadId or chunkIndex" });
          return;
        }
        const idx = Number(chunkIndex);

        // Carregar sessão do banco
        const db = await getDb();
        if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
        const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
        const session = sessions[0];
        if (!session) {
          res.status(404).json({ error: "Upload session not found or expired" });
          return;
        }

        // Obter presigned PUT URL e fazer upload do chunk diretamente para S3
        const chunkKey = `chunks/${uploadId}/${idx}`;
        const presignedUrl = await getPresignedPutUrl(chunkKey);

        const putResp = await fetch(presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: new Uint8Array(chunk.buffer),
        });
        if (!putResp.ok) {
          const msg = await putResp.text().catch(() => putResp.statusText);
          throw new Error(`S3 PUT failed for chunk ${idx}: ${putResp.status} ${msg}`);
        }

        // Atualizar contador no banco
        const newCount = session.receivedChunks + 1;
        await db.update(uploadSessions)
          .set({ receivedChunks: newCount })
          .where(eq(uploadSessions.uploadId, uploadId));

        res.json({ received: newCount, total: session.totalChunks });
      } catch (err: any) {
        console.error("[UploadRoute] chunk error:", err);
        res.status(500).json({ error: err?.message ?? "Chunk upload failed" });
      }
    }
  );

  // ─── CHUNK UPLOAD: Finaliza — baixa chunks em paralelo, monta e salva ───────
  app.post("/api/upload/finalize-chunked", jsonParser, async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { uploadId } = req.body;
      if (!uploadId) {
        res.status(400).json({ error: "Missing uploadId" });
        return;
      }

      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
      const session = sessions[0];
      if (!session) {
        res.status(404).json({ error: "Upload session not found or expired" });
        return;
      }
      if (session.receivedChunks < session.totalChunks) {
        res.status(400).json({ error: `Missing chunks: received ${session.receivedChunks}/${session.totalChunks}` });
        return;
      }

      // Baixar todos os chunks do S3 em PARALELO
      // IMPORTANTE: usar presign/get (mesmo bucket do presign/put), não storageGet
      const chunkKeys = Array.from({ length: session.totalChunks }, (_, i) => `chunks/${uploadId}/${i}`);
      const chunkBuffers = await Promise.all(
        chunkKeys.map(async (chunkKey, i) => {
          const presignedGetUrl = await getPresignedGetUrl(chunkKey);
          const resp = await fetch(presignedGetUrl);
          if (!resp.ok) throw new Error(`Failed to download chunk ${i}: ${resp.status}`);
          return Buffer.from(await resp.arrayBuffer());
        })
      );

      const fullBuffer = Buffer.concat(chunkBuffers);

      // Salvar arquivo final no S3
      const { url } = await storagePut(session.fileKey, fullBuffer, session.contentType);

      // Salvar no banco de dados
      await addOrderFile({
        registrationId: Number(session.registrationId),
        customerPhone: session.customerPhone,
        label: session.label,
        fileUrl: url,
        fileKey: session.fileKey,
        mimeType: session.contentType,
        fromAdmin: String(session.fromAdmin) === "1" ? 1 : 0,
      });

      // Limpar sessão do banco
      await db.delete(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));

      res.json({ success: true, fileUrl: url });
    } catch (err: any) {
      console.error("[UploadRoute] finalize-chunked error:", err);
      res.status(500).json({ error: err?.message ?? "Finalize failed" });
    }
  });

   // ─── CLIENT UPLOAD: Upload direto de arquivo pelo cliente (sem auth de admin) ─────
  // Usado para enviar documentos e comprovante PIX antes de finalizar o pedido
  // Retorna a URL do arquivo salvo no S3 para ser referenciada no payload do pedido
  app.post(
    "/api/upload/client-file",
    (req: Request, res: Response, next: import('express').NextFunction) => {
      uploadDirect.single("file")(req, res, (err: any) => {
        if (err) {
          // Multer error (e.g. LIMIT_FILE_SIZE) — return JSON instead of HTML
          const msg = err.code === 'LIMIT_FILE_SIZE'
            ? 'Arquivo muito grande. Máximo 20MB.'
            : (err.message || 'Erro no upload');
          res.status(400).json({ error: msg });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "No file provided" });
          return;
        }
        const { label, phone } = req.body;
        if (!label) {
          res.status(400).json({ error: "Missing label" });
          return;
        }
        const r = resolveFileExt(file.mimetype, file.originalname);
        const safeLabel = makeSafeLabel(label);
        const safePhone = (phone || "desconhecido").replace(/\D/g, "").slice(-11);
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `order-docs/${safePhone}-${safeLabel}-${randomSuffix}.${r.ext}`;
        const { url } = await storagePut(fileKey, file.buffer, r.contentType);
        res.json({ success: true, fileUrl: url, fileKey, mimeType: r.contentType });
      } catch (err: any) {
        console.error("[UploadRoute] client-file error:", err);
        res.status(500).json({ error: err?.message ?? "Upload failed" });
      }
    }
  );

  // ─── DIRECT UPLOAD: Para imagens e PDFs (≤20MB) ────────────────────────
  app.post(
    "/api/upload/admin-file",
    (req: Request, res: Response, next: import('express').NextFunction) => {
      uploadDirect.single("file")(req, res, (err: any) => {
        if (err) {
          const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande. Máximo 20MB.' : (err.message || 'Erro no upload');
          res.status(400).json({ error: msg });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        if (!isAdminRequest(req)) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "No file provided" });
          return;
        }
        const { registrationId, customerPhone, label, fromAdmin } = req.body;
        if (!registrationId || !customerPhone || !label) {
          res.status(400).json({ error: "Missing required fields" });
          return;
        }
        const r = resolveFileExt(file.mimetype, file.originalname);
        const safeLabel = makeSafeLabel(label);
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const prefix = fromAdmin === "1" || fromAdmin === 1 ? "admin-docs" : "order-docs";
        const fileKey = `${prefix}/${customerPhone}-${safeLabel}-${randomSuffix}.${r.ext}`;
        const { url } = await storagePut(fileKey, file.buffer, r.contentType);
        await addOrderFile({
          registrationId: Number(registrationId),
          customerPhone,
          label,
          fileUrl: url,
          fileKey,
          mimeType: r.contentType,
          fromAdmin: fromAdmin === "1" || fromAdmin === 1 ? 1 : 0,
        });
        res.json({ success: true, fileUrl: url });
      } catch (err: any) {
        console.error("[UploadRoute] error:", err);
        res.status(500).json({ error: err?.message ?? "Upload failed" });
      }
    }
  );

  // ─── ADMIN MEDIA UPLOAD V2: Frontend envia chunks DIRETO para S3 ──────────
  // Fluxo:
  //   1. POST /api/upload/init-media → cria sessão, retorna uploadId + presigned PUT URLs para cada chunk
  //   2. Frontend envia cada chunk DIRETO para S3 (sem passar pelo backend)
  //   3. POST /api/upload/confirm-chunk → frontend confirma que chunk foi enviado
  //   4. POST /api/upload/finalize-media → backend monta o arquivo final em background
  //   5. GET /api/upload/media-job-status?jobId=X → polling do status

  app.post("/api/upload/init-media", jsonParser, async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const { mimeType, filename, totalChunks } = req.body;
      if (!mimeType || !totalChunks) { res.status(400).json({ error: "Missing mimeType or totalChunks" }); return; }
      const r = resolveFileExt(mimeType, filename);
      const safeName = makeSafeLabel(filename || "media");
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `admin-media/${safeName}-${randomSuffix}.${r.ext}`;
      const uploadId = `media-${Date.now()}-${randomSuffix}`;
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }

      // Gerar presigned PUT URLs para todos os chunks
      const presignedUrls: string[] = [];
      for (let i = 0; i < Number(totalChunks); i++) {
        const chunkKey = `chunks/${uploadId}/${i}`;
        const url = await getPresignedPutUrl(chunkKey);
        presignedUrls.push(url);
      }

      await db.insert(uploadSessions).values({
        uploadId,
        registrationId: "0",
        customerPhone: "admin",
        label: safeName,
        fromAdmin: "1",
        mimeType,
        ext: r.ext,
        contentType: r.contentType,
        fileKey,
        totalChunks: Number(totalChunks),
        receivedChunks: 0,
        jobStatus: "uploading",
      });
      res.json({ uploadId, fileKey, presignedUrls });
    } catch (err: any) {
      console.error("[UploadRoute] init-media error:", err);
      res.status(500).json({ error: err?.message ?? "Init failed" });
    }
  });

  // Frontend confirma que um chunk foi enviado com sucesso para S3
  app.post("/api/upload/confirm-chunk", jsonParser, async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const { uploadId, chunkIndex } = req.body;
      if (!uploadId || chunkIndex === undefined) { res.status(400).json({ error: "Missing fields" }); return; }
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
      const session = sessions[0];
      if (!session) { res.status(404).json({ error: "Session not found" }); return; }
      const newCount = session.receivedChunks + 1;
      await db.update(uploadSessions).set({ receivedChunks: newCount }).where(eq(uploadSessions.uploadId, uploadId));
      res.json({ received: newCount, total: session.totalChunks });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Confirm failed" });
    }
  });

  // Manter endpoint antigo chunk-media para compatibilidade (redireciona para S3)
  app.post(
    "/api/upload/chunk-media",
    uploadChunk.single("chunk"),
    async (req: Request, res: Response) => {
      try {
        if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
        const chunk = req.file;
        if (!chunk) { res.status(400).json({ error: "No chunk" }); return; }
        const { uploadId, chunkIndex } = req.body;
        if (!uploadId || chunkIndex === undefined) { res.status(400).json({ error: "Missing fields" }); return; }
        const idx = Number(chunkIndex);
        const db = await getDb();
        if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
        const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
        const session = sessions[0];
        if (!session) { res.status(404).json({ error: "Session not found" }); return; }
        const chunkKey = `chunks/${uploadId}/${idx}`;
        const presignedUrl = await getPresignedPutUrl(chunkKey);
        const putResp = await fetch(presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: new Uint8Array(chunk.buffer),
        });
        if (!putResp.ok) throw new Error(`S3 PUT failed: ${putResp.status}`);
        const newCount = session.receivedChunks + 1;
        await db.update(uploadSessions).set({ receivedChunks: newCount }).where(eq(uploadSessions.uploadId, uploadId));
        res.json({ received: newCount, total: session.totalChunks });
      } catch (err: any) {
        console.error("[UploadRoute] chunk-media error:", err);
        res.status(500).json({ error: err?.message ?? "Chunk failed" });
      }
    }
  );

  // finalize-media: processa em BACKGROUND, retorna jobId imediatamente
  // O processamento (baixar chunks do S3, concatenar, re-upload) roda em background
  // O frontend faz polling em /api/upload/media-job-status
  app.post("/api/upload/finalize-media", jsonParser, async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const { uploadId, filename, fileSize, videoSlug } = req.body;
      if (!uploadId) { res.status(400).json({ error: "Missing uploadId" }); return; }
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
      const session = sessions[0];
      if (!session) { res.status(404).json({ error: "Session not found" }); return; }
      if (session.receivedChunks < session.totalChunks) {
        res.status(400).json({ error: `Missing chunks: ${session.receivedChunks}/${session.totalChunks}` });
        return;
      }

      // Processamento SÍNCRONO — aguarda S3 upload antes de responder
      // Isso evita loop infinito de polling quando o servidor reinicia em produção serverless
      const slugNorm = (videoSlug || "").toString().trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const finalSlug = slugNorm || null;

      console.log(`[finalize-media] Montando ${session.totalChunks} chunks para ${session.fileKey}`);
      const buffers: Buffer[] = [];
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkKey = `chunks/${uploadId}/${i}`;
        const presignedGetUrl = await getPresignedGetUrl(chunkKey);
        const resp = await fetch(presignedGetUrl);
        if (!resp.ok) throw new Error(`Falha ao baixar chunk ${i}: ${resp.status}`);
        buffers.push(Buffer.from(await resp.arrayBuffer()));
      }
      const fullBuffer = Buffer.concat(buffers);
      console.log(`[finalize-media] Buffer: ${fullBuffer.length} bytes. Enviando S3...`);
      const { url } = await storagePut(session.fileKey, fullBuffer, session.contentType);
      console.log(`[finalize-media] S3 OK: ${url}`);

      // Salvar no banco
      const { adminMediaFiles } = await import("../drizzle/schema");
      await db.insert(adminMediaFiles).values({
        name: filename || session.label,
        fileKey: session.fileKey,
        url,
        mimeType: session.mimeType,
        fileSize: fileSize || fullBuffer.length,
        videoSlug: finalSlug,
      });

      // Marcar sessão como completed
      await db.update(uploadSessions)
        .set({ jobStatus: "completed", jobUrl: url, jobError: finalSlug })
        .where(eq(uploadSessions.uploadId, uploadId));
      console.log(`[finalize-media] COMPLETED: ${url}`);

      // Responder com resultado final — sem polling necessário
      const friendlyUrl = finalSlug ? `https://walkajuda.com/video/${finalSlug}` : url;
      res.json({ success: true, status: "completed", videoUrl: friendlyUrl, videoSlug: finalSlug });
    } catch (err: any) {
      console.error("[UploadRoute] finalize-media error:", err);
      res.status(500).json({ error: err?.message ?? "Finalize failed" });
    }
  });

  // Polling: status do job (lê do banco — funciona em qualquer instância)
  // Status: uploading → processing → completed | failed
  app.get("/api/upload/media-job-status", async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const jobId = req.query.jobId as string;
      if (!jobId) { res.status(400).json({ error: "Missing jobId" }); return; }
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const rows = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, jobId));
      const row = rows[0];
      if (!row) {
        // Sessão já foi limpa — buscar na tabela de mídias
        const { adminMediaFiles } = await import("../drizzle/schema");
        const { desc } = await import("drizzle-orm");
        const recent = await db.select().from(adminMediaFiles).orderBy(desc(adminMediaFiles.uploadedAt)).limit(1);
        if (recent[0]) {
          const m = recent[0];
          const vUrl = m.url; // Sempre URL direta do arquivo
          res.json({ status: "completed", videoUrl: vUrl, videoSlug: m.videoSlug });
        } else {
          res.json({ status: "completed", videoUrl: "", videoSlug: null });
        }
        return;
      }
      const st = row.jobStatus ?? "processing";
      if (st === "completed") {
        res.json({ status: "completed", videoUrl: row.jobUrl ?? "", videoSlug: row.jobError ?? null });
      } else if (st === "failed") {
        res.json({ status: "failed", error: row.jobError ?? "Erro desconhecido" });
      } else {
        // uploading ou processing
        res.json({ status: st });
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Status check failed" });
    }
  });

  // Listar mídias salvas no banco
  app.get("/api/upload/media-list", async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const db = await getDb();
      if (!db) { res.json([]); return; }
      const { adminMediaFiles } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      const list = await db.select().from(adminMediaFiles).orderBy(desc(adminMediaFiles.uploadedAt)).limit(50);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "List failed" });
    }
  });

  // Deletar mídia do banco (não remove do S3 — key fica inacessível)
  app.delete("/api/upload/media-delete/:id", async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const id = Number(req.params.id);
      if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const { adminMediaFiles } = await import("../drizzle/schema");
      const { eq: eqOp } = await import("drizzle-orm");
      await db.delete(adminMediaFiles).where(eqOp(adminMediaFiles.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Delete failed" });
    }
  });

  // ─── ADMIN IMAGE UPLOAD (direto, sem chunks — até 15MB) ──────────────────────
  app.post("/api/upload/admin-image", uploadDirect.single("file"), async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const file = req.file;
      if (!file) { res.status(400).json({ error: "No file" }); return; }
      const { slug } = req.body || {};
      const r = resolveFileExt(file.mimetype, file.originalname);
      const safeName = makeSafeLabel(file.originalname || "imagem");
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `admin-media/${safeName}-${randomSuffix}.${r.ext}`;
      const { url } = await storagePut(fileKey, file.buffer, r.contentType);
      // Salvar no banco
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const { adminMediaFiles } = await import("../drizzle/schema");
      const slugNorm = (slug || "").toString().trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const finalSlug = slugNorm || null;
      await db.insert(adminMediaFiles).values({
        name: file.originalname || "imagem",
        fileKey,
        url,
        mimeType: r.contentType,
        fileSize: file.size,
        videoSlug: finalSlug,
      });
      res.json({ success: true, url, fileKey, slug: finalSlug });
    } catch (err: any) {
      console.error("[UploadRoute] admin-image error:", err);
      res.status(500).json({ error: err?.message ?? "Upload failed" });
    }
  });

  // ─── CLIENT UPLOAD via JSON base64 (robusto em produção/celular) ──────────────
  // O browser comprime a imagem para JPEG e envia como base64 dentro de JSON.
  // O servidor decodifica e usa storagePut direto — SEM multer, SEM multipart.
  // Isso elimina a causa real das falhas de upload no celular:
  //   - parsing de multipart no proxy (Cloudflare/Cloud Run)
  //   - multer com memoryStorage e limites de body
  // Como a imagem é comprimida no cliente (~100-400KB), o base64 fica leve.
  app.post("/api/upload/client-file-base64", jsonParserBig, async (req: Request, res: Response) => {
    try {
      const { label, phone, data, mimeType, filename } = req.body || {};
      if (!label) { res.status(400).json({ error: "Missing label" }); return; }
      if (!data || typeof data !== "string") { res.status(400).json({ error: "No file data" }); return; }
      // Aceita tanto data URI ("data:image/jpeg;base64,....") quanto base64 puro
      const base64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) { res.status(400).json({ error: "Empty file" }); return; }
      if (buffer.length > 20 * 1024 * 1024) { res.status(400).json({ error: "Arquivo muito grande. Máximo 20MB." }); return; }
      const r = resolveFileExt(mimeType || "image/jpeg", filename);
      const safeLabel = makeSafeLabel(label);
      const safePhone = (phone || "desconhecido").replace(/\D/g, "").slice(-11);
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `order-docs/${safePhone}-${safeLabel}-${randomSuffix}.${r.ext}`;
      const { url } = await storagePut(fileKey, buffer, r.contentType);
      res.json({ success: true, fileUrl: url, fileKey, mimeType: r.contentType });
    } catch (err: any) {
      console.error("[UploadRoute] client-file-base64 error:", err);
      res.status(500).json({ error: err?.message ?? "Upload failed" });
    }
  });
}
