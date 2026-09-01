import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const viteSource = fs.readFileSync('server/_core/vite.ts', 'utf8');
const indexSource = fs.readFileSync('client/index.html', 'utf8');
const cssSource = fs.readFileSync('client/src/index.css', 'utf8');
const swSource = fs.readFileSync('client/public/sw.js', 'utf8');

describe('H2 global boot recovery', () => {
  it('não devolve SPA HTML para bundle Vite ausente', () => {
    const assetGuard = viteSource.indexOf("app.use('/assets'");
    const spaFallback = viteSource.lastIndexOf('app.use("*", async (req, res) =>');
    expect(assetGuard).toBeGreaterThan(-1);
    expect(spaFallback).toBeGreaterThan(assetGuard);
    expect(viteSource).toContain(".status(404)");
    expect(viteSource).toContain("Asset not found");
  });

  it('não permite cachear index.html de produção', () => {
    expect(viteSource).toContain("'Cache-Control': 'no-store, max-age=0, must-revalidate'");
    expect(viteSource).toContain("'Cloudflare-CDN-Cache-Control': 'no-store'");
  });

  it('possui watchdog anterior ao módulo principal', () => {
    const watchdog = indexSource.indexOf('H2 BOOT WATCHDOG v1');
    const main = indexSource.indexOf('src="/src/main.tsx"');
    expect(watchdog).toBeGreaterThan(-1);
    expect(main).toBeGreaterThan(watchdog);
    expect(indexSource).toContain('navigator.serviceWorker.getRegistrations');
    expect(indexSource).toContain('caches.delete');
    expect(indexSource).toContain("recover('boot-timeout')");
  });

  it('usa o novo fundo H2 Colombia e não o fundo Walk Ajuda antigo', () => {
    expect(cssSource).toContain("background-image: url('/h2-colombia-background.webp')");
    expect(cssSource).not.toContain("background-image: url('/bg-novidade.jpg')");
    expect(fs.existsSync('client/public/h2-colombia-background.webp')).toBe(true);
    expect(fs.statSync('client/public/h2-colombia-background.webp').size).toBeGreaterThan(10000);
  });

  it('service worker v107 não cacheia HTML e conhece o novo fundo', () => {
    expect(swSource).toContain("walk-ajuda-v107-assets");
    expect(swSource).toContain("'/h2-colombia-background.webp'");
    expect(swSource).toContain("fetch(event.request, { cache: 'no-store' })");
  });
});
