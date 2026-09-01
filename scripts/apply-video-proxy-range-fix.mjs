import fs from 'node:fs';

const path = 'server/_core/index.ts';
let src = fs.readFileSync(path, 'utf8');
const oldRoute = `  app.get("/video/:slug", async (req, res) => {
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
  });`;

const newRoute = `  app.get("/video/:slug", async (req, res) => {
    const { slug } = req.params;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 30_000);
    try {
      const { getDb } = await import('../db');
      const { adminMediaFiles } = await import('../../drizzle/schema');
      const { eq: eqOp } = await import('drizzle-orm');
      const { Readable } = await import('node:stream');
      const db = await getDb();
      if (!db) { res.status(503).end(); return; }
      const rows = await db.select().from(adminMediaFiles).where(eqOp(adminMediaFiles.videoSlug, slug)).limit(1);
      if (!rows.length) { res.status(404).end(); return; }
      const media = rows[0] as any;
      const videoUrl = media.url || '';
      if (!videoUrl) { res.status(502).end(); return; }

      const headers: Record<string, string> = {};
      if (req.headers.range) headers.Range = req.headers.range;
      const upstream = await fetch(videoUrl, { redirect: 'follow', headers, signal: abort.signal });
      if (!upstream.ok && upstream.status !== 206) {
        console.error('[PublicVideo] upstream status', upstream.status, 'slug', slug);
        res.status(upstream.status === 404 ? 404 : 502).end();
        return;
      }
      if (!upstream.body) { res.status(502).end(); return; }

      res.status(upstream.status === 206 ? 206 : 200);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || media.mimeType || 'video/mp4');
      res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      for (const name of ['content-length', 'content-range', 'etag', 'last-modified'] as const) {
        const value = upstream.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      Readable.fromWeb(upstream.body as any).pipe(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PublicVideo] falha', slug, message);
      if (!res.headersSent) res.status(message.toLowerCase().includes('abort') ? 504 : 500).end();
    } finally {
      clearTimeout(timeout);
    }
  });`;

if (!src.includes(oldRoute)) throw new Error('Rota /video/:slug esperada nao encontrada');
src = src.replace(oldRoute, newRoute);
fs.writeFileSync(path, src);

fs.writeFileSync('server/publicVideoRange.test.ts', `import { describe, expect, it } from "vitest";\nimport fs from "node:fs";\nconst src = fs.readFileSync("server/_core/index.ts", "utf8");\ndescribe("public video proxy", () => {\n  it("faz streaming same-origin com suporte a range", () => {\n    expect(src).toContain("if (req.headers.range) headers.Range = req.headers.range");\n    expect(src).toContain("Readable.fromWeb(upstream.body as any).pipe(res)");\n    expect(src).toContain("res.setHeader('Accept-Ranges'");\n    expect(src).toContain("res.setHeader('Access-Control-Allow-Origin', '*')");\n    expect(src).not.toContain("res.redirect(videoUrl)");\n  });\n});\n`);
console.log('video proxy patch applied');
