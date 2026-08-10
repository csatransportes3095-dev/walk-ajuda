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
import { isIpBlocked, getSetting } from "../db";
import { broadcastEmailHandler } from "../broadcastEmailHandler";
import { sendMail } from "./mailer";
import path from "path";
import fs from "fs";

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

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Register upload route BEFORE body parsers so multer can handle multipart streams correctly
  registerUploadRoute(app);
  registerApkDownloadRoute(app);
  ensureApkTable().catch(console.error);
  // Corrigir allowedPaymentTypes de clientes existentes para respeitar o perfil
  (async () => {
    try {
      const { getDb } = await import('../db');
      const { sql: drizzleSql } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return;
      const qRows = async (d: any, q: any) => { const [rows] = await d.execute(q); return rows as any[]; };
      const profiles = await qRows(db, drizzleSql`SELECT slug, defaultPaymentTypes FROM loanProfiles`);
      let totalFixed = 0;
      for (const profile of profiles) {
        const profileModes = (profile.defaultPaymentTypes || 'diario').split(',').map((t: string) => t.trim()).filter(Boolean);
        const clients = await qRows(db, drizzleSql`SELECT id, allowedPaymentTypes FROM loanClients WHERE profileSlug=${profile.slug}`);
        for (const client of clients) {
          const clientModes = (client.allowedPaymentTypes || 'diario').split(',').map((t: string) => t.trim()).filter(Boolean);
          const filtered = clientModes.filter((m: string) => profileModes.includes(m));
          const newModes = filtered.length > 0 ? filtered.join(',') : profileModes[0];
          if (newModes !== client.allowedPaymentTypes) {
            await db.execute(drizzleSql`UPDATE loanClients SET allowedPaymentTypes=${newModes}, updatedAt=NOW() WHERE id=${client.id}`);
            totalFixed++;
          }
        }
      }
      if (totalFixed > 0) console.log(`[Startup] Corrigidos ${totalFixed} clientes com allowedPaymentTypes fora do perfil`);
    } catch (e: any) { console.warn('[Startup] Erro ao corrigir allowedPaymentTypes:', e.message); }
  })();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));
  // Garantir charset UTF-8 em todas as respostas para evitar quebra de encoding
  app.use((_req, res, next) => {
    const origJson = res.json.bind(res);
    res.json = function(body) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return origJson(body);
    };
    next();
  });
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
      // Buscar a imagem do S3/CDN e fazer proxy
      const https = await import('https');
      const http = await import('http');
      const urlMod = await import('url');
      const parsedUrl = new urlMod.URL(imageUrl);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      protocol.get(imageUrl, (imgRes) => {
        res.set('Content-Type', imgRes.headers['content-type'] || 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=86400');
        imgRes.pipe(res);
      }).on('error', () => res.redirect(302, imageUrl));
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
      if (!db) { res.status(503).send("Banco indisponível"); return; }
      const rows = await db.select().from(adminMediaFiles).where(eqOp(adminMediaFiles.videoSlug, slug)).limit(1);
      if (!rows.length) { res.status(404).send("<h2>Imagem não encontrada</h2>"); return; }
      const media = rows[0];
      const imageUrl = (media as any).url || '';
      if (!imageUrl) { res.status(502).send("URL da imagem não encontrada"); return; }
      const title = media.name.replace(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|avi)$/i, "");
      // Se for vídeo, redirecionar para /video/:slug
      if (media.mimeType.startsWith('video/')) { res.redirect(301, `/video/${slug}`); return; }
      const canonicalUrl = `https://h2colombiano.com/foto/${slug}`;
      const proxyImageUrl = `https://h2colombiano.com/foto-img/${slug}`;
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - H2 COLOMBIANO</title><meta property="og:title" content="${title}"><meta property="og:description" content="H2 COLOMBIANO - Atendimento rapido para motoristas de app"><meta property="og:image" content="${proxyImageUrl}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:type" content="website"><meta property="og:url" content="${canonicalUrl}"><meta property="og:site_name" content="H2 COLOMBIANO"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:image" content="${imageUrl}"><meta name="twitter:description" content="H2 COLOMBIANO - Atendimento rápido para motoristas de app"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}img{width:100%;max-width:900px;max-height:100vh;object-fit:contain}</style></head><body><img src="${imageUrl}" alt="${title}"></body></html>`);
    } catch (err) {
      console.error('[FotoRoute] dynamic error:', err);
      res.status(500).send("Erro interno");
    }
  });

  app.get("/video/:slug", async (req, res) => {
    const { slug } = req.params;
    // Rota especial /video/tutorial usa fileKey fixo (tratada separadamente abaixo via redirect)
    if (slug === "tutorial") { res.redirect(307, "/video/tutorial"); return; }
    try {
      const { getDb } = await import('../db');
      const { adminMediaFiles } = await import('../../drizzle/schema');
      const { eq: eqOp } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) { res.status(503).send("Banco indisponível"); return; }
      const rows = await db.select().from(adminMediaFiles).where(eqOp(adminMediaFiles.videoSlug, slug)).limit(1);
      if (!rows.length) { res.status(404).send("<h2>Vídeo não encontrado</h2>"); return; }
      const media = rows[0];
      // Usar a URL direta do CloudFront salva no banco (sem assinatura, acesso público)
      const videoUrl = (media as any).url || '';
      if (!videoUrl) { res.status(502).send("URL do vídeo não encontrada"); return; }
      const title = media.name.replace(/\.(mp4|webm|mov|avi)$/i, "");
      const canonicalUrl = `https://h2colombiano.com/video/${slug}`;
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - H2 COLOMBIANO</title><meta property="og:title" content="${title}"><meta property="og:description" content="H2 COLOMBIANO - Atendimento rápido para motoristas de app"><meta property="og:type" content="video.other"><meta property="og:url" content="${canonicalUrl}"><meta property="og:site_name" content="H2 COLOMBIANO"><meta property="og:video" content="${videoUrl}"><meta property="og:video:secure_url" content="${videoUrl}"><meta property="og:video:type" content="${media.mimeType || 'video/mp4'}"><meta property="og:video:width" content="1280"><meta property="og:video:height" content="720"><meta property="og:image" content="${videoUrl}"><meta name="twitter:card" content="player"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="H2 COLOMBIANO - Atendimento rápido para motoristas de app"><meta name="twitter:player" content="${canonicalUrl}"><meta name="twitter:player:width" content="1280"><meta name="twitter:player:height" content="720"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}video{width:100%;max-width:900px;max-height:100vh}</style></head><body><video controls autoplay playsinline preload="auto"><source src="${videoUrl}" type="${media.mimeType || 'video/mp4'}">Seu browser não suporta vídeo HTML5.</video></body></html>`);
    } catch (err) {
      console.error('[VideoRoute] dynamic error:', err);
      res.status(500).send("Erro interno");
    }
  });

  // Rota de vídeos públicos â€” página HTML com player nativo
  app.get("/video/tutorial", async (_req, res) => {
    try {
      const { ENV } = await import('./env');
      const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl!.replace(/\/+$/, "") + "/");
      forgeUrl.searchParams.set("path", "tutorial_fe1af5d4.mp4");
      const forgeResp = await fetch(forgeUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
      if (!forgeResp.ok) { res.status(502).send("Erro ao obter vídeo"); return; }
      const { url } = await forgeResp.json() as { url: string };
      if (!url) { res.status(502).send("URL inválida"); return; }
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tutorial H2 COLOMBIANO</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}video{width:100%;max-width:900px;max-height:100vh}</style></head><body><video controls autoplay playsinline preload="auto"><source src="${url}" type="video/mp4">Seu browser não suporta vídeo HTML5.</video></body></html>`);
    } catch (err) {
      console.error('[VideoRoute] error:', err);
      res.status(500).send("Erro interno");
    }
  });

  // === ZOHO OAUTH CALLBACK - troca código por refresh token automaticamente ===
  app.get("/api/zoho-oauth-callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;

    const errorHtml = (msg: string) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Erro</title></head><body style="font-family:sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px;background:#1e293b;border-radius:12px;max-width:500px"><h2 style="color:#ef4444">âŒ Erro na autorização</h2><p style="color:#94a3b8;margin:16px 0">${msg}</p><p style="color:#64748b;font-size:13px">Feche esta aba e tente novamente.</p></div></body></html>`;
    const successHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sucesso</title></head><body style="font-family:sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px;background:#1e293b;border-radius:12px;max-width:500px"><h2 style="color:#22c55e">âœ… Token gerado com sucesso!</h2><p style="color:#94a3b8;margin:16px 0">Configuração Zoho salva. Volte para o painel e clique em <strong>Atualizar</strong>.</p><p style="color:#64748b;font-size:13px">Pode fechar esta aba.</p><script>setTimeout(()=>window.close(),3000)</script></div></body></html>`;

    if (error) { res.send(errorHtml(`Zoho retornou: ${error}`)); return; }
    if (!code || !state) { res.send(errorHtml('Parâmetros inválidos na resposta do Zoho.')); return; }

    try {
      console.log('[ZohoOAuth] Iniciando callback com state:', state.substring(0, 8));
      
      const { getPendingZohoOAuth, deletePendingZohoOAuth, createZohoOAuthConfig } = await import('../db');
      
      let pending;
      try {
        pending = await getPendingZohoOAuth(state);
        console.log('[ZohoOAuth] getPendingZohoOAuth resultado:', pending ? 'encontrado' : 'não encontrado');
      } catch (e) {
        console.error('[ZohoOAuth] Erro ao recuperar sessão:', e);
        res.send(errorHtml(`Erro ao recuperar sessão: ${String(e)}`));
        return;
      }
      
      if (!pending) { 
        res.send(errorHtml('Sessão expirada (mais de 10 min). Tente novamente.')); 
        return; 
      }

      console.log('[ZohoOAuth] Trocando código por refresh token');
      // Trocar código por refresh token
      const params = new URLSearchParams({
        code,
        client_id: pending.zohoClientId,
        client_secret: pending.zohoClientSecret,
        redirect_uri: pending.redirectUri,
        grant_type: 'authorization_code',
        access_type: 'offline',
      });
      const tokenRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const tokenData = await tokenRes.json() as { refresh_token?: string; error?: string };
      console.log('[ZohoOAuth] Resposta Zoho token:', tokenData.refresh_token ? 'OK' : `ERRO: ${tokenData.error}`);
      
      if (!tokenData.refresh_token) { 
        res.send(errorHtml(`Zoho não retornou refresh_token: ${tokenData.error || 'erro desconhecido'}`)); 
        return; 
      }

      console.log('[ZohoOAuth] Salvando configuração no banco');
      // Salvar configuração completa no banco
      try {
        await createZohoOAuthConfig({
          name: pending.name,
          zohoOrgId: pending.zohoOrgId,
          zohoClientId: pending.zohoClientId,
          zohoClientSecret: pending.zohoClientSecret,
          zohoRefreshToken: tokenData.refresh_token,
        });
        console.log('[ZohoOAuth] Configuração salva com sucesso');
      } catch (e) {
        console.error('[ZohoOAuth] Erro ao salvar configuração:', e);
        res.send(errorHtml(`Erro ao salvar configuração: ${String(e)}`));
        return;
      }

      console.log('[ZohoOAuth] Deletando sessão temporária');
      await deletePendingZohoOAuth(state);
      console.log('[ZohoOAuth] Sucesso!');
      res.send(successHtml);
    } catch (err) {
      console.error('[ZohoOAuth] Callback error:', err);
      res.send(errorHtml(`Erro interno: ${err instanceof Error ? err.message : String(err)}`));
    }
  });

  // Endpoint de teste para debugar sessão OAuth
  app.get("/api/zoho-test-session", async (req, res) => {
    try {
      const { savePendingZohoOAuth, getPendingZohoOAuth } = await import('../db');
      const crypto = await import('crypto');
      
      const testSessionId = (crypto as any).randomBytes(8).toString('hex');
      const testData = {
        name: 'TEST_walk1',
        zohoOrgId: '931276368',
        zohoClientId: '1000.G5IJGPRDWJB7OI7OCMBW23R5B4LU1X',
        zohoClientSecret: '3d7bc5d567aa563b34476c838dcfabd97d117f5b0a',
        redirectUri: 'https://h2colombiano.com/api/zoho-oauth-callback',
      };

      console.log('[ZohoTestSession] 1. Salvando sessão:', { sessionId: testSessionId, data: testData });
      await savePendingZohoOAuth(testSessionId, testData);
      console.log('[ZohoTestSession] 2. Sessão salva');

      console.log('[ZohoTestSession] 3. Recuperando sessão...');
      const retrieved = await getPendingZohoOAuth(testSessionId);
      console.log('[ZohoTestSession] 4. Sessão recuperada:', retrieved ? 'SIM' : 'NÃƒO');

      if (!retrieved) {
        res.json({
          ok: false,
          step: 'retrieve',
          message: 'Falha ao recuperar sessão após salvar',
          sessionId: testSessionId,
          dataSaved: testData,
          dataRetrieved: null,
        });
        return;
      }

      const clientSecretMatch = retrieved.zohoClientSecret === testData.zohoClientSecret;
      console.log('[ZohoTestSession] 5. ClientSecret match:', clientSecretMatch);
      console.log('[ZohoTestSession]    Esperado:', testData.zohoClientSecret);
      console.log('[ZohoTestSession]    Recuperado:', retrieved.zohoClientSecret);

      if (!clientSecretMatch) {
        res.json({
          ok: false,
          step: 'data_integrity',
          message: 'ClientSecret foi corrompido ao salvar/recuperar',
          sessionId: testSessionId,
          dataSaved: testData,
          dataRetrieved: retrieved,
          comparison: {
            secretLength: { saved: testData.zohoClientSecret.length, retrieved: retrieved.zohoClientSecret.length },
            secretMatch: clientSecretMatch,
          },
        });
        return;
      }

      res.json({
        ok: true,
        message: 'Sessão salva e recuperada com sucesso',
        sessionId: testSessionId,
        dataSaved: testData,
        dataRetrieved: retrieved,
      });
    } catch (err) {
      console.error('[ZohoTestSession] Erro:', err);
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Pixel de rastreamento de abertura de e-mail
  app.get("/api/email-open/:trackingId", async (req, res) => {
    const { trackingId } = req.params;
    try {
      const { getDb } = await import('../db');
      const db = await getDb();
      if (db && trackingId) {
        const { sql } = await import('drizzle-orm');
        const now = Date.now();
        const safeId = trackingId.replace(/[^a-zA-Z0-9_-]/g, '');
        await db.execute(sql.raw(`UPDATE emailTracking SET openedAt = COALESCE(openedAt, ${now}), openCount = openCount + 1 WHERE trackingId = '${safeId}'`));
      }
    } catch (_) { /* silenciar erros */ }
    // Retornar pixel 1x1 transparente
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
    res.send(pixel);
  });

  app.post("/api/email/test", async (_req, res) => {
    try {
      await sendMail({
        to: "h2@h2colombiano.com",
        subject: "Teste de SMTP H2 COLOMBIANO",
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.12)"><h1 style="margin:0 0 16px;color:#0f172a">Teste de SMTP H2 COLOMBIANO</h1><p style="margin:0 0 12px;color:#334155">Este é um e-mail de teste enviado pelo endpoint <strong>/api/email/test</strong>.</p><p style="margin:0;color:#475569">Se você receber este e-mail, a configuração SMTP está funcionando.</p></div>`,
      });
      res.json({ ok: true, message: "Email de teste enviado para h2@h2colombiano.com" });
    } catch (error) {
      console.error('[EmailTest] erro ao enviar e-mail de teste:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  // ===== MANIFESTO PWA DINÃ‚MICO =====
  // Retorna manifest.json com o ícone atual configurado pelo ADM
  app.get("/manifest.json", async (_req, res) => {
    try {
      const loginImageUrl = await getSetting("login_image_url");
      // Usa a imagem do ADM se disponível, senão usa os ícones estáticos
      const iconUrl = loginImageUrl || "/icon-192.png";
      const iconUrl512 = loginImageUrl || "/icon-512.png";
      const appName = (await getSetting("login_title")) || "H2 COLOMBIANO";
      const manifest = {
        id: "/",
        name: appName,
        short_name: appName,
        description: "Atendimento rápido para motoristas de app - Uber, 99 e InDrive",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0a0a1a",
        theme_color: "#0ea5e9",
        icons: [
          { src: iconUrl,    sizes: "192x192", type: "image/png", purpose: "any" },
          { src: iconUrl,    sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: iconUrl512, sizes: "512x512", type: "image/png", purpose: "any" },
          { src: iconUrl512, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          {
            name: "Fazer Pedido",
            short_name: "Pedido",
            description: "Acessar o site para fazer um novo pedido",
            url: "/",
            icons: [{ src: iconUrl, sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Acompanhar Pedido",
            short_name: "Acompanhar",
            description: "Consultar o status do seu pedido pelo telefone",
            url: "/acompanhar",
            icons: [{ src: iconUrl, sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Planilha de Gastos",
            short_name: "Gastos",
            description: "Controle seus ganhos e gastos como motorista",
            url: "/gastos",
            icons: [{ src: iconUrl, sizes: "192x192", type: "image/png" }],
          },
        ],
      };
      res.set("Content-Type", "application/manifest+json");
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.json(manifest);
    } catch (err) {
      // Fallback: serve o manifest estático
      const staticPath = path.join(process.cwd(), "client", "public", "manifest.json");
      if (fs.existsSync(staticPath)) {
        res.set("Content-Type", "application/manifest+json");
        res.sendFile(staticPath);
      } else {
        res.status(500).json({ error: "manifest not found" });
      }
    }
  });

  // Heartbeat: processar fila de e-mail em massa
  app.post("/api/scheduled/broadcastEmail", broadcastEmailHandler);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    await serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Inicializar formulários fixos automaticamente
    setTimeout(async () => {
      try {
        const { autoInitBuiltinForms } = await import('../routers/consultas');
        await autoInitBuiltinForms();
      } catch (e) {
        // silencioso — não crítico
      }
    }, 3000);

    // Keep-alive: ping a cada 10 minutos para evitar cold start do Render
    const SITE_URL = process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
    setInterval(async () => {
      try {
        const https = await import('https');
        const http = await import('http');
        const url = new URL(`${SITE_URL}/api/trpc/system.health`);
        const client = url.protocol === 'https:' ? https : http;
        (client as any).get(url.toString(), (res: any) => {
          res.resume(); // consumir resposta
          console.log(`[keep-alive] ping ${url.toString()} → ${res.statusCode}`);
        }).on('error', () => { /* silencioso */ });
      } catch { /* silencioso */ }
    }, 10 * 60 * 1000); // 10 minutos
  });
}

startServer().catch(console.error);
