// Force UTC timezone before any imports to ensure consistent date handling
// This prevents Drizzle ORM from misinterpreting MySQL timestamps based on server locale
process.env.TZ = "UTC";

import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { registerUploadRoute } from "../uploadRoute";
import { registerApkDownloadRoute, ensureApkTable } from "../routers/apk";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { isIpBlocked, getSetting, getDb } from "../db";
import { broadcastEmailHandler } from "../broadcastEmailHandler";
import { registerPingRoute } from "./pingRoute";
import { registerRaffleIntegrityRoutes } from "../raffleIntegrityRoutes";
import { registerH2AdsWorkerRoute } from "../h2adsWorkerRoute";
import { sendMail } from "./mailer";
import { ensureCustomerIdentityInfrastructure, reconcileLegacyLoanPermissions } from "../customerAccess";
import { getSharePreviewProfile, sharePreviewProxyPath, type SharePreviewProfileId } from "../sharePreviewProfiles";
import { publicSiteUrl } from "../../shared/publicLinks";
import { bootstrapCardInvoices } from "../cardsBilling";
import { getBackupDownload, getBackupDownloadName } from "../routers/backup";
import { logProcessDiagnostic, reconcileBackupsAfterRestart } from "../backupService";
import path from "path";
import fs from "fs";

let fatalProcessExitScheduled = false;

function scheduleFatalProcessExit() {
  if (fatalProcessExitScheduled) return;
  fatalProcessExitScheduled = true;
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 0).unref?.();
}

async function ensureZohoOAuthInfrastructure() {
  const db = await getDb();
  if (!db) return;
  const { sql } = await import("drizzle-orm");

  // Bancos restaurados podem conter uma versao antiga/incompleta desta tabela.
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS zohoOAuthConfigs (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    zohoOrgId VARCHAR(64) NOT NULL,
    zohoClientId VARCHAR(256) NOT NULL,
    zohoClientSecret VARCHAR(256) NOT NULL,
    zohoRefreshToken VARCHAR(512) NOT NULL,
    domain VARCHAR(255) NOT NULL DEFAULT 'h2colombiano.com',
    isActive INT NOT NULL DEFAULT 1,
    status ENUM('active','inactive','error') NOT NULL DEFAULT 'inactive',
    lastError TEXT NULL,
    lastTestAt BIGINT NULL,
    createdAt BIGINT NOT NULL DEFAULT 0,
    updatedAt BIGINT NOT NULL DEFAULT 0
  )`));

  const columns = [
    "domain VARCHAR(255) NOT NULL DEFAULT 'h2colombiano.com'",
    "isActive INT NOT NULL DEFAULT 1",
    "status ENUM('active','inactive','error') NOT NULL DEFAULT 'inactive'",
    "lastError TEXT NULL",
    "lastTestAt BIGINT NULL",
    "createdAt BIGINT NOT NULL DEFAULT 0",
    "updatedAt BIGINT NOT NULL DEFAULT 0",
  ];

  for (const definition of columns) {
    try {
      await db.execute(sql.raw(`ALTER TABLE zohoOAuthConfigs ADD COLUMN IF NOT EXISTS ${definition}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column|already exists/i.test(message)) {
        console.warn(`[ZohoOAuth] nao foi possivel garantir coluna ${definition.split(" ")[0]}:`, message);
      }
    }
  }
}

function registerProcessDiagnostics() {
  process.on("uncaughtException", (error) => {
    logProcessDiagnostic("uncaughtException", { error: error instanceof Error ? error.stack || error.message : String(error) });
    scheduleFatalProcessExit();
  });
  process.on("unhandledRejection", (reason) => {
    logProcessDiagnostic("unhandledRejection", { error: reason instanceof Error ? reason.stack || reason.message : String(reason) });
    scheduleFatalProcessExit();
  });
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    const handler = () => {
      logProcessDiagnostic("signal", { signal });
      process.removeListener(signal, handler);
      process.kill(process.pid, signal);
    };
    process.on(signal, handler);
  }
}

registerProcessDiagnostics();

/** Extrai o IP real do cliente, respeitando proxies (Cloudflare, Cloud Run) */
export function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",");
    return ips[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

async function getPublicPreviewMeta(profileId: SharePreviewProfileId, canonicalUrl: string) {
  const profile = await getSharePreviewProfile(profileId);
  const imageBaseUrl = profile.imageUrl
    ? (profile.imageUrl.startsWith('/') ? publicSiteUrl(profile.imageUrl) : publicSiteUrl(sharePreviewProxyPath(profileId)))
    : null;
  const imageUrl = imageBaseUrl
    ? `${imageBaseUrl}${imageBaseUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(profile.imageVersion)}`
    : null;
  return { profile, canonicalUrl, imageUrl };
}

function renderPublicPreviewTags(meta: Awaited<ReturnType<typeof getPublicPreviewMeta>>, titleOverride?: string) {
  const title = escapeHtml(titleOverride || meta.profile.title);
  const description = escapeHtml(meta.profile.summary);
  const image = meta.imageUrl ? `<meta property="og:image" content="${escapeHtml(meta.imageUrl)}"><meta property="og:image:type" content="${escapeHtml(meta.profile.imageType || 'image/jpeg')}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${escapeHtml(meta.imageUrl)}">` : '';
  return `<meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}"><meta property="og:site_name" content="H2 COLOMBIANO">${image}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}">`;
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Register upload route BEFORE body parsers so multer can handle multipart streams correctly
  // A camada de identidade deve estar pronta antes de qualquer rota aceitar cadastro ou login.
  try {
    await ensureCustomerIdentityInfrastructure();
  } catch (error) {
    console.error('[CustomerIdentity] infraestrutura não inicializada:', error);
  }
  try {
    await ensureZohoOAuthInfrastructure();
  } catch (error) {
    console.error('[ZohoOAuth] infraestrutura nao reparada:', error);
  }
  // A migração de cartões cria primeiro cópias de backup e só depois prepara faturas históricas.
  // Ela é executada sem bloquear a abertura da API; as rotas de cartão também aguardam a mesma
  // operação compartilhada quando necessário. Assim, uma reconciliação longa não derruba o site no deploy.
  void bootstrapCardInvoices().catch((error) => {
    console.error('[CardsBilling] infraestrutura de faturas não inicializada:', error);
  });
  // Reconciliador assíncrono: aplica as rotas do ADM a todos os registros legados de Empréstimos.
  void reconcileLegacyLoanPermissions().then((total) => {
    console.log(`[LoanAccess] permissões reconciliadas para ${total} clientes.`);
  }).catch((error) => {
    console.error('[LoanAccess] reconciliação de permissões não concluída:', error);
  });
  void reconcileBackupsAfterRestart().then((total) => {
    if (total > 0) console.warn(`[Backup] ${total} execução(ões) abandonada(s) marcada(s) como falha técnica.`);
  }).catch((error) => {
    console.error('[Backup] reconciliação de execuções abandonadas não concluída:', error);
  });
  registerUploadRoute(app);
  registerApkDownloadRoute(app);
  app.get("/api/admin/backups/:id/download", async (req, res) => {
    try {
      const artifact = await getBackupDownload(req, req.params.id);
      if (!artifact) {
        res.status(404).json({ error: "Backup não encontrado ou não autorizado." });
        return;
      }
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${getBackupDownloadName(artifact.id)}"`);
      res.setHeader("Cache-Control", "no-store, private");
      if (artifact.fileSize !== null && artifact.fileSize !== undefined) {
        res.setHeader("Content-Length", String(artifact.fileSize));
      }
      artifact.body.pipe(res);
    } catch (error) {
      console.error("[Backup] falha no download administrativo:", error instanceof Error ? error.message : String(error));
      if (!res.headersSent) res.status(500).json({ error: "Não foi possível baixar o backup." });
    }
  });
  ensureApkTable().catch(console.error);
  // Modos de pagamento gravados na ficha individual do cliente pelo ADM são
  // prioritários. A inicialização não pode filtrá-los ou regravá-los pelo perfil.
  // O perfil continua sendo usado apenas como padrão de criação de novos clientes.
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));
  // Integridade do sorteio vem antes do tRPC: uma entrada confirmada não pode
  // ser apagada nem por uma aba antiga do painel administrativo.
  registerRaffleIntegrityRoutes(app);
  registerH2AdsWorkerRoute(app);
  // Garantir charset UTF-8 em todas as respostas para evitar quebra de encoding
  app.use((_req, res, next) => {
    const origJson = res.json.bind(res);
    res.json = function(body) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return origJson(body);
    };
    next();
  });
  registerPingRoute(app);

  registerStorageProxy(app);

  // Middleware de bloqueio de IP â€” bloqueia antes de qualquer rota de negócio
  app.use(async (req, res, next) => {
    // Não bloquear rotas admin (frontend) nem qualquer chamada tRPC de admin autenticado
    if (req.path.startsWith("/admin") || req.path.startsWith("/api/trpc/admin")) {
      return next();
    }
    // Não bloquear chamadas tRPC se o cookie admin_token estiver presente e válido
    const cookieHeader = req.headers.cookie || '';
    if (cookieHeader.includes('admin_token=')) {
      return next();
    }
    const ip = getClientIp(req);
    if (ip && ip !== "unknown") {
      try {
        const blocked = await isIpBlocked(ip);
        if (blocked) {
          res.status(403).json({ error: "Acesso bloqueado. Entre em contato pelo WhatsApp." });
          return;
        }
      } catch (e) { /* silenciar erros de verificação */ }
    }
    next();
  });

  // Link exclusivo de compartilhamento: força uma nova leitura do WhatsApp sem alterar o acesso real.
  app.get("/link/acompanhamento", async (_req, res) => {
    const canonicalUrl = publicSiteUrl("/link/acompanhamento");
    const preview = await getPublicPreviewMeta("tracking", canonicalUrl);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(preview.profile.title)}</title>${renderPublicPreviewTags(preview)}<meta http-equiv="refresh" content="0;url=/acompanhar"><style>body{font-family:system-ui,sans-serif;background:#070711;color:#fff;min-height:100vh;display:grid;place-items:center;margin:0}p{color:#bcb9d6}</style></head><body><p>Abrindo acompanhamento…</p><script>window.location.replace('/acompanhar')</script></body></html>`);
  });

  // Rota dinâmica de vídeos â€” busca fileKey no banco pelo slug
  // Rota pública para imagens com slug amigável: /foto/:slug
  // Proxy público da imagem para WhatsApp preview (og:image)
  app.get("/foto-img/:slug", async (req, res) => {
    const { slug } = req.params;
    try {
      const { getDb } = await import('../db');
      const { adminMediaFiles } = await import('../../drizzle/schema');
      const { eq: eqOp } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) { res.status(503).end(); return; }
      const rows = await db.select().from(adminMediaFiles).where(eqOp(adminMediaFiles.videoSlug, slug)).limit(1);
      if (!rows.length) { res.status(404).end(); return; }
      const imageUrl = (rows[0] as any).url || '';
      if (!imageUrl) { res.status(502).end(); return; }
      // Buscar a imagem com redirecionamento seguido e responder diretamente.
      // O WhatsApp precisa de uma imagem pública, rápida, com Content-Type e Content-Length.
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 8_000);
      try {
        const imageResponse = await fetch(imageUrl, { redirect: 'follow', signal: abort.signal });
        if (!imageResponse.ok) { res.status(502).end(); return; }
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        if (!contentType.toLowerCase().startsWith('image/')) { res.status(415).end(); return; }
        const declaredLength = Number(imageResponse.headers.get('content-length') || '0');
        const maxPreviewBytes = 5 * 1024 * 1024;
        if (declaredLength > maxPreviewBytes) { res.status(413).end(); return; }
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        if (buffer.length === 0 || buffer.length > maxPreviewBytes) { res.status(413).end(); return; }
        res.status(200);
        res.set('Content-Type', contentType);
        res.set('Content-Length', String(buffer.length));
        res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        res.end(buffer);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      res.status(500).end();
    }
  });

  app.get("/foto/:slug", async (req, res) => {
    const { slug } = req.params;
    try {
      const { getDb } = await import('../db');
      const { adminMediaFiles } = await import('../../drizzle/schema');
      const { eq: eqOp } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) { res.status(503).end(); return; }
      const rows = await db.select().from(adminMediaFiles).where(eqOp(adminMediaFiles.videoSlug, slug)).limit(1);
      if (!rows.length) { res.status(404).end(); return; }
      const imageUrl = (rows[0] as any).url || '';
      if (!imageUrl) { res.status(502).end(); return; }
      res.redirect(imageUrl);
    } catch (err) {
      res.status(500).end();
    }
  });

  app.get("/video/:slug", async (req, res) => {
    const { slug } = req.params;
    try {
      const { getDb } = await import('../db');
      const { adminMediaFiles } = await import('../../drizzle/schema');
      const { eq: eqOp } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) { res.status(503).end(); return; }
      const rows = await db.select().from(adminMediaFiles).where(eqOp(adminMediaFiles.videoSlug, slug)).limit(1);
      if (!rows.length) { res.status(404).end(); return; }
      const videoUrl = (rows[0] as any).url || '';
      if (!videoUrl) { res.status(502).end(); return; }
      res.redirect(videoUrl);
    } catch (err) {
      res.status(500).end();
    }
  });

  // Endpoint para broadcast email em background
  app.post("/api/broadcast/email", broadcastEmailHandler);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = Number(process.env.PORT || 3000);
  const port = await findAvailablePort(preferredPort);
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
