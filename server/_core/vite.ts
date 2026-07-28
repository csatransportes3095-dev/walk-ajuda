import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { getSettings } from "../db";
import { ENV } from "./env";

async function getOgMeta(): Promise<{ title: string; description: string; imageUrl: string | null }> {
  try {
    const settings = await getSettings(['og_title', 'og_description', 'og_image_url']);
    return {
      title: settings['og_title'] ?? 'WALK AJUDA',
      description: settings['og_description'] ?? 'WALK AJUDA',
      imageUrl: settings['og_image_url'] ?? '/og-image.png',
    };
  } catch {
    return { title: 'WALK AJUDA', description: 'WALK AJUDA', imageUrl: '/og-image.png' };
  }
}

function injectOgMeta(html: string, og: { title: string; description: string; imageUrl: string | null }, origin: string): string {
  // Use the dynamic image URL from the database; fall back to /og-image.jpg proxy route
  let imgSrc: string | null = null;
  if (og.imageUrl) {
    if (og.imageUrl.startsWith('http')) {
      imgSrc = og.imageUrl;
    } else if (og.imageUrl.startsWith('/manus-storage/')) {
      // Serve via our proxy route so WhatsApp can fetch without redirects
      imgSrc = `${origin}/og-image.jpg`;
    } else {
      imgSrc = `${origin}${og.imageUrl}`;
    }
  }
  const imageTag = imgSrc
    ? `<meta property="og:image" content="${imgSrc}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:image" content="${imgSrc}" />`
    : '';
  const metaTags = `
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${origin}/" />
    <meta property="og:title" content="${og.title}" />
    <meta property="og:description" content="${og.description}" />
    <meta property="og:site_name" content="${og.title}" />
    ${imageTag}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${og.title}" />
    <meta name="twitter:description" content="${og.description}" />`;
  // Remove old static OG tags and inject fresh ones
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
      const og = await getOgMeta();
      const origin = `${req.protocol}://${req.get('host')}`;
      template = injectOgMeta(template, og, origin);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
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

  app.use(express.static(distPath));

  // fall through to index.html with dynamic OG meta tags
  app.use("*", async (req, res) => {
    try {
      let html = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const og = await getOgMeta();
      const origin = `${req.protocol}://${req.get('host')}`;
      html = injectOgMeta(html, og, origin);
      res.set("Content-Type", "text/html").send(html);
    } catch {
      res.sendFile(path.resolve(distPath, "index.html"));
    }
  });
}
