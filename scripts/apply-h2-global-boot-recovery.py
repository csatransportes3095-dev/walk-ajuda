from pathlib import Path

# 1) Fundo global: usar exatamente a nova arte H2 Colombia já adicionada ao public.
css_path = Path('client/src/index.css')
css = css_path.read_text(encoding='utf-8')
old_bg = "background-image: url('/bg-novidade.jpg');"
new_bg = "background-image: url('/h2-colombia-background.webp');"
if old_bg not in css:
    raise SystemExit('ERRO: fundo global antigo não encontrado')
css_path.write_text(css.replace(old_bg, new_bg, 1), encoding='utf-8')

# 2) Produção: nunca responder index.html quando um bundle /assets/* com hash não existe.
# Isso evita o navegador receber HTML no lugar de JS/CSS e ficar somente no fundo.
vite_path = Path('server/_core/vite.ts')
vite = vite_path.read_text(encoding='utf-8')
static_anchor = '''  }));\n\n  // fall through to index.html with dynamic OG meta tags\n  app.use("*", async (req, res) => {'''
static_replacement = '''  }));\n\n  // CRÍTICO: um HTML antigo pode apontar para um bundle Vite com hash que já saiu do deploy.\n  // Se esse asset não existir, NUNCA devolver o SPA index.html (HTML) como se fosse JS/CSS.\n  // O 404 permite ao watchdog do cliente limpar SW/cache e buscar a versão atual.\n  app.use('/assets', (_req, res) => {\n    res.status(404).set({\n      'Cache-Control': 'no-store, max-age=0, must-revalidate',\n      'CDN-Cache-Control': 'no-store',\n      'Cloudflare-CDN-Cache-Control': 'no-store',\n      'Pragma': 'no-cache',\n      'Expires': '0',\n    }).type('text/plain').send('Asset not found');\n  });\n\n  // fall through to index.html with dynamic OG meta tags\n  app.use("*", async (req, res) => {'''
if static_anchor not in vite:
    raise SystemExit('ERRO: âncora do SPA fallback de produção não encontrada')
vite = vite.replace(static_anchor, static_replacement, 1)

old_send = '''      html = injectOgMeta(html, og, req.originalUrl || req.path);\n      res.set("Content-Type", "text/html; charset=utf-8").send(html);\n    } catch {\n      res.sendFile(path.resolve(distPath, "index.html"));\n    }'''
new_send = '''      html = injectOgMeta(html, og, req.originalUrl || req.path);\n      res.set({\n        'Content-Type': 'text/html; charset=utf-8',\n        'Cache-Control': 'no-store, max-age=0, must-revalidate',\n        'CDN-Cache-Control': 'no-store',\n        'Cloudflare-CDN-Cache-Control': 'no-store',\n        'Pragma': 'no-cache',\n        'Expires': '0',\n      }).send(html);\n    } catch {\n      res.set({\n        'Cache-Control': 'no-store, max-age=0, must-revalidate',\n        'CDN-Cache-Control': 'no-store',\n        'Cloudflare-CDN-Cache-Control': 'no-store',\n        'Pragma': 'no-cache',\n        'Expires': '0',\n      });\n      res.sendFile(path.resolve(distPath, "index.html"));\n    }'''
if old_send not in vite:
    raise SystemExit('ERRO: envio do index.html de produção não encontrado')
vite = vite.replace(old_send, new_send, 1)
vite_path.write_text(vite, encoding='utf-8')

# 3) Watchdog inline: funciona mesmo se o JavaScript principal não chegar a carregar.
html_path = Path('client/index.html')
html = html_path.read_text(encoding='utf-8')
module_line = '    <script type="module" src="/src/main.tsx"></script>'
watchdog = r'''    <script>
      // H2 BOOT WATCHDOG v1
      // Se um deploy trocar os hashes dos bundles enquanto o navegador ainda tem HTML/SW antigo,
      // recupera uma única vez automaticamente em vez de deixar o usuário preso só na imagem de fundo.
      (() => {
        const RETRY_KEY = 'h2_boot_recovery_v1';
        let recoveryStarted = false;

        const rootMounted = () => {
          const root = document.getElementById('root');
          return !!root && root.childElementCount > 0;
        };

        const clearRuntimeCaches = async () => {
          try {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map((reg) => reg.unregister()));
            }
          } catch (_) {}
          try {
            if ('caches' in window) {
              const names = await caches.keys();
              await Promise.all(names.map((name) => caches.delete(name)));
            }
          } catch (_) {}
        };

        const showRecovery = () => {
          const root = document.getElementById('root');
          if (!root) return;
          root.innerHTML = `
            <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(2,6,23,.82);font-family:Arial,sans-serif;color:white;text-align:center">
              <div style="max-width:440px;padding:28px;border:1px solid rgba(250,204,21,.45);border-radius:20px;background:rgba(3,7,18,.94);box-shadow:0 20px 60px rgba(0,0,0,.45)">
                <div style="font-size:28px;margin-bottom:10px">H2 COLOMBIANO</div>
                <div style="font-size:15px;line-height:1.5;color:#d1d5db;margin-bottom:18px">A versão do sistema foi atualizada e o navegador não conseguiu concluir o carregamento.</div>
                <button id="h2-boot-reload" style="border:0;border-radius:12px;padding:12px 20px;background:#eab308;color:#111827;font-weight:800;cursor:pointer">RECARREGAR SISTEMA</button>
              </div>
            </div>`;
          document.getElementById('h2-boot-reload')?.addEventListener('click', async () => {
            sessionStorage.removeItem(RETRY_KEY);
            await clearRuntimeCaches();
            const url = new URL(location.href);
            url.searchParams.set('_h2boot', String(Date.now()));
            location.replace(url.toString());
          });
        };

        const recover = async (reason) => {
          if (recoveryStarted || rootMounted()) return;
          recoveryStarted = true;
          const alreadyRetried = sessionStorage.getItem(RETRY_KEY) === '1';
          if (alreadyRetried) {
            showRecovery();
            return;
          }
          sessionStorage.setItem(RETRY_KEY, '1');
          console.warn('[H2 Boot Recovery]', reason);
          await clearRuntimeCaches();
          const url = new URL(location.href);
          url.searchParams.set('_h2boot', String(Date.now()));
          location.replace(url.toString());
        };

        // Erro de bundle/stylesheet: recuperar rápido, sem esperar o timeout geral.
        window.addEventListener('error', (event) => {
          const target = event.target;
          const assetUrl = target?.src || target?.href || '';
          if (typeof assetUrl === 'string' && assetUrl.includes('/assets/')) {
            setTimeout(() => recover('asset-load-error'), 50);
          }
        }, true);

        // Se React montar normalmente, limpar a trava de retry para futuros deploys.
        const observer = new MutationObserver(() => {
          if (rootMounted()) {
            sessionStorage.removeItem(RETRY_KEY);
            observer.disconnect();
          }
        });
        const root = document.getElementById('root');
        if (root) observer.observe(root, { childList: true });

        setTimeout(() => recover('boot-timeout'), 12000);
      })();
    </script>
    <script type="module" src="/src/main.tsx"></script>'''
if module_line not in html:
    raise SystemExit('ERRO: script principal main.tsx não encontrado')
html_path.write_text(html.replace(module_line, watchdog, 1), encoding='utf-8')

# 4) Forçar atualização do Service Worker e pré-cachear o novo fundo H2 (não HTML).
sw_path = Path('client/public/sw.js')
sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace('Service Worker v106', 'Service Worker v107', 1)
sw = sw.replace("const CACHE_NAME = 'walk-ajuda-v106-assets';", "const CACHE_NAME = 'walk-ajuda-v107-assets';", 1)
icon_anchor = "        '/h2-brand-512.png',\n"
if icon_anchor not in sw:
    raise SystemExit('ERRO: âncora de precache do SW não encontrada')
sw = sw.replace(icon_anchor, icon_anchor + "        '/h2-colombia-background.webp',\n", 1)
cache_match_anchor = "    url.pathname.startsWith('/h2-brand-') ||\n"
if cache_match_anchor not in sw:
    raise SystemExit('ERRO: âncora de assets estáticos do SW não encontrada')
sw = sw.replace(cache_match_anchor, cache_match_anchor + "    url.pathname === '/h2-colombia-background.webp' ||\n", 1)
sw_path.write_text(sw, encoding='utf-8')

# 5) Teste de regressão estrutural.
test_path = Path('server/globalBootRecovery.test.ts')
test_path.write_text(r'''import { describe, expect, it } from 'vitest';
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
''', encoding='utf-8')

print('Patch global de boot/cache/fundo aplicado com sucesso.')
