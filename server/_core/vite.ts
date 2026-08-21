import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { getSettings } from "../db";
import { getSharePreviewProfile, isSharePreviewProfileId, sharePreviewProfileForPath, sharePreviewProxyPath } from "../sharePreviewProfiles";
import { ENV } from "./env";
import { publicSiteUrl } from "../../shared/publicLinks";

async function getOgMeta(requestPath: string): Promise<{ title: string; description: string; imageUrl: string | null; imageVersion: string; imageType?: string; imageWidth?: number; imageHeight?: number }> {
  const profileId = sharePreviewProfileForPath(requestPath);
  const profile = await getSharePreviewProfile(profileId);
  // A imagem padrão do escudo é estática e rápida. Imagens escolhidas pelo ADM passam
  // pelo proxy do próprio domínio para que o WhatsApp tenha Content-Type/Length estáveis.
  const imageUrl = profile.imageUrl
    ? (profile.imageUrl.startsWith('/') ? profile.imageUrl : sharePreviewProxyPath(profileId))
    : null;
  return {
    title: profile.title,
    description: profile.summary,
    imageUrl,
    imageVersion: profile.imageVersion,
    imageType: profile.imageType || undefined,
    imageWidth: profile.imageUrl?.endsWith('.png') ? 512 : 1200,
    imageHeight: profile.imageUrl?.endsWith('.png') ? 512 : 630,
  };
}

type OpenGraphMeta = {
  title: string;
  description: string;
  imageUrl: string | null;
  imageVersion?: string;
  imageType?: string;
  imageWidth?: number;
  imageHeight?: number;
  canonicalUrl: string;
};

/**
 * Cada link de agendamento precisa de uma identidade própria e de uma miniatura leve.
 * Não inclui nome, telefone ou foto do cliente nos metadados para não expor dados pessoais no preview.
 */
export function resolveOpenGraphMeta(
  og: { title: string; description: string; imageUrl: string | null; imageVersion?: string },
  requestPath: string,
): OpenGraphMeta {
  const pathname = `/${String(requestPath || '/').split('?')[0].replace(/^\/+/, '')}`;
  const canonicalUrl = publicSiteUrl(pathname);
  return { ...og, canonicalUrl };
}

function inferImageType(imageUrl: string): string {
  const normalized = imageUrl.toLowerCase().split('?')[0];
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export function injectOgMeta(
  html: string,
  og: { title: string; description: string; imageUrl: string | null; imageVersion?: string },
  requestPath: string,
): string {
  const meta = resolveOpenGraphMeta(og, requestPath);
  // Add ?v= to make WhatsApp fetch a new preview after a deliberate image change.
  const ver = meta.imageVersion || '1';
  let imgSrc: string | null = null;
  if (meta.imageUrl) {
    if (meta.imageUrl.startsWith('http')) {
      const sep = meta.imageUrl.includes('?') ? '&' : '?';
      imgSrc = `${meta.imageUrl}${sep}v=${ver}`;
    } else if (meta.imageUrl.startsWith('/manus-storage/')) {
      imgSrc = `${publicSiteUrl('/og-image.jpg')}?v=${ver}`;
    } else {
      imgSrc = `${publicSiteUrl(meta.imageUrl)}?v=${ver}`;
    }
  }
  const imageTag = imgSrc
    ? `<meta property="og:image" content="${imgSrc}" />
    <meta property="og:image:type" content="${meta.imageType || inferImageType(imgSrc)}" />
    <meta property="og:image:width" content="${meta.imageWidth || 1200}" />
    <meta property="og:image:height" content="${meta.imageHeight || 630}" />
    <meta name="twitter:image" content="${imgSrc}" />`
    : '';
  const metaTags = `
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${meta.canonicalUrl}" />
    <meta property="og:title" content="${meta.title}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:site_name" content="${meta.title}" />
    ${imageTag}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${meta.title}" />
    <meta name="twitter:description" content="${meta.description}" />`;
  // Remove old static OG tags and inject fresh ones.
  const cleaned = html
    .replace(/<meta property="og:[^"]+"[^>]*\/>/g, '')
    .replace(/<meta name="twitter:[^"]+"[^>]*\/>/g, '');
  return cleaned.replace('</head>', `${metaTags}\n  </head>`);
}

// Proxy route: serve OG image directly (no redirect) so WhatsApp can fetch it
// WhatsApp requires: Content-Length header, fast response (<4s), image <5MB

// Exported so uploadImage mutation can bust the cache immediately after upload
export let ogImageCache: { buffer: Buffer; contentType: string; fetchedAt: number } | null = null;
export function bustOgImageCache() { ogImageCache = null; }
const sharePreviewImageCache = new Map<string, { version: string; buffer: Buffer; contentType: string; fetchedAt: number }>();

function isSupportedPreviewImage(contentType: string) {
  return /^image\/(jpeg|png|webp|gif)$/i.test(contentType.split(';')[0].trim());
}

function registerOgImageProxy(app: Express) {
  // Cache the image buffer in memory to serve instantly
  const CACHE_TTL = 3600_000; // 1 hour

  async function fetchOgImage(): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const settings = await getSettings(['og_image_url']);
      const imageUrl = settings['og_image_url'];
      if (!imageUrl) return null;

      let fetchUrl = imageUrl;
      if (imageUrl.startsWith('/manus-storage/')) {
        // Use presign/get API to get a signed CloudFront URL (same as storageProxy)
        const key = imageUrl.replace('/manus-storage/', '');
        if (!ENV.forgeApiUrl || !ENV.forgeApiKey) return null;
        const forgeUrl = new URL('v1/storage/presign/get', ENV.forgeApiUrl.replace(/\/+$/, '') + '/');
        forgeUrl.searchParams.set('path', key);
        const forgeResp = await fetch(forgeUrl, {
          headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
        });
        if (!forgeResp.ok) return null;
        const { url } = (await forgeResp.json()) as { url: string };
        if (!url) return null;
        fetchUrl = url;
      } else if (imageUrl.startsWith('/')) {
        return null;
      }
      // fetchUrl is now an absolute URL (CloudFront signed or external)
      const imgRes = await fetch(fetchUrl, { redirect: 'follow' });
      if (!imgRes.ok) return null;
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      return { buffer, contentType };
    } catch (e) {
      console.error('[OG Image Proxy] fetch error:', e);
      return null;
    }
  }

  app.get('/share-preview/:profileId', async (req, res, next) => {
    const profileId = req.params.profileId;
    if (!isSharePreviewProfileId(profileId)) return next();
    try {
      const profile = await getSharePreviewProfile(profileId);
      if (!profile.imageUrl) return res.status(404).end();
      if (profile.imageUrl.startsWith('/')) return res.redirect(302, publicSiteUrl(profile.imageUrl));

      const cached = sharePreviewImageCache.get(profileId);
      if (cached && cached.version === profile.imageVersion && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Content-Length', cached.buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        return res.end(cached.buffer);
      }

      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 10_000);
      try {
        const imageResponse = await fetch(profile.imageUrl, { redirect: 'follow', signal: abort.signal });
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        const declaredLength = Number(imageResponse.headers.get('content-length') || '0');
        const maxBytes = 5 * 1024 * 1024;
        if (!imageResponse.ok || !isSupportedPreviewImage(contentType) || declaredLength > maxBytes) {
          return res.status(502).end();
        }
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        if (!buffer.length || buffer.length > maxBytes) return res.status(502).end();
        sharePreviewImageCache.set(profileId, { version: profile.imageVersion, buffer, contentType, fetchedAt: Date.now() });
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        return res.end(buffer);
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return res.status(502).end();
    }
  });

  app.get('/og-image.jpg', async (_req, res, next) => {
    try {
      // Serve from cache if fresh
      if (ogImageCache && (Date.now() - ogImageCache.fetchedAt) < CACHE_TTL) {
        res.setHeader('Content-Type', ogImageCache.contentType);
        res.setHeader('Content-Length', ogImageCache.buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=14400');
        return res.end(ogImageCache.buffer);
      }
      // Fetch fresh
      const result = await fetchOgImage();
      if (!result) return next();
      ogImageCache = { ...result, fetchedAt: Date.now() };
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Length', result.buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=14400');
      return res.end(result.buffer);
    } catch {
      next();
    }
  });

  // Also handle .png extension for backwards compatibility
  app.get('/og-image.png', async (_req, res, next) => {
    try {
      if (ogImageCache && (Date.now() - ogImageCache.fetchedAt) < CACHE_TTL) {
        res.setHeader('Content-Type', ogImageCache.contentType);
        res.setHeader('Content-Length', ogImageCache.buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=14400');
        return res.end(ogImageCache.buffer);
      }
      const result = await fetchOgImage();
      if (!result) return next();
      ogImageCache = { ...result, fetchedAt: Date.now() };
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Length', result.buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=14400');
      return res.end(result.buffer);
    } catch {
      next();
    }
  });
}

export async function setupVite(app: Express, server: Server) {
  registerOgImageProxy(app);
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      // Inject dynamic OG meta tags
      const og = await getOgMeta(req.originalUrl || req.path);
      template = injectOgMeta(template, og, req.originalUrl || req.path);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export async function serveStatic(app: Express) {
  registerOgImageProxy(app);

  // Serve og.jpg with strong cache headers so Cloudflare caches it (no cold start for WhatsApp)
  app.get('/og.jpg', (_req, res, next) => {
    const distPath2 = process.env.NODE_ENV === 'development'
      ? path.resolve(import.meta.dirname, '../..', 'dist', 'public')
      : path.resolve(import.meta.dirname, 'public');
    const ogPath = path.resolve(distPath2, 'og.jpg');
    if (!fs.existsSync(ogPath)) return next();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('CDN-Cache-Control', 'public, max-age=86400');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'public, max-age=86400');
    return res.sendFile(ogPath);
  });

  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Rota de download do APK Android — redireciona para o arquivo no R2
  app.get('/download/app', async (_req, res) => {
    try {
      const { buildR2PublicUrl } = await import('../r2Storage.js');
      const apkUrl = buildR2PublicUrl('app/Colombiano.apk');
      res.redirect(302, apkUrl);
    } catch {
      res.status(404).json({ error: 'APK not found' });
    }
  });

  app.use(express.static(distPath, {
    // A raiz precisa chegar ao fallback abaixo para receber og:title/og:image dinâmicos.
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return;
      }

      // Somente bundles versionados pelo Vite: um novo deploy gera outro hash,
      // portanto o navegador nunca reaproveita JavaScript ou CSS de uma versão antiga.
      const isVersionedAsset = /[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(filePath);
      if (isVersionedAsset) {
        const cacheControl = 'public, max-age=31536000, immutable';
        res.setHeader('Cache-Control', cacheControl);
        res.setHeader('CDN-Cache-Control', cacheControl);
        res.setHeader('Cloudflare-CDN-Cache-Control', cacheControl);
      }
    }
  }));

  // fall through to index.html with dynamic OG meta tags
  app.use("*", async (req, res) => {
    try {
      let html = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const og = await getOgMeta(req.originalUrl || req.path);
      html = injectOgMeta(html, og, req.originalUrl || req.path);
      res.set("Content-Type", "text/html; charset=utf-8").send(html);
    } catch {
      res.sendFile(path.resolve(distPath, "index.html"));
    }
  });
}
