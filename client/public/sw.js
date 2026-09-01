// Service Worker v107 — evita HTML antigo apontando para assets/CSS removidos
const CACHE_NAME = 'walk-ajuda-v107-assets';
const CARTOES_CACHE = 'meus-cartoes-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Nunca pré-cachear páginas HTML/navegações. Depois de um deploy, um HTML
      // antigo pode apontar para CSS/JS com hash que já não existe no servidor.
      return cache.addAll([
        '/manifest.json',
        '/manifest-admin.json',
        '/manifest.webmanifest',
        '/h2-brand-16.png',
        '/h2-brand-32.png',
        '/h2-brand-150.png',
        '/h2-brand-180.png',
        '/h2-brand-192.png',
        '/h2-brand-512.png',
        '/h2-colombia-background.webp',
        '/icon-192x192.png',
        '/icon-512x512.png',
        '/apple-touch-icon.png',
      ]).catch(() => {
        // Ignorar erro de pré-cache. O site continua funcionando online.
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== CARTOES_CACHE)
          .map(name => caches.delete(name))
      );

      // Limpar qualquer HTML que tenha ficado no cache preservado de Cartões.
      try {
        const cartoesCache = await caches.open(CARTOES_CACHE);
        const keys = await cartoesCache.keys();
        await Promise.all(keys.map((request) => {
          if (request.mode === 'navigate' || new URL(request.url).pathname === '/cartoes') {
            return cartoesCache.delete(request);
          }
          return Promise.resolve(false);
        }));
      } catch (_) {}

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('manus-storage')) return;
  if (event.request.url.includes('/api/')) return;
  if (event.request.url.includes('/foto/') || event.request.url.includes('/video/')) return;

  const url = new URL(event.request.url);

  // Navegação/HTML: sempre rede e nunca cache. Esse é o ponto principal da correção.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() =>
        new Response(
          '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title></head><body><p>Sem conexão com o servidor. Verifique sua internet e tente novamente.</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
        )
      )
    );
    return;
  }

  // Ícones e manifestos podem continuar em cache, pois não apontam para bundles versionados.
  if (
    url.pathname.endsWith('.webmanifest') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/manifest-admin.json' ||
    url.pathname.startsWith('/h2-brand-') ||
    url.pathname === '/h2-colombia-background.webp' ||
    url.pathname.match(/\/icon-\d+x\d+\.png$/) ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/favicon-32x32.png' ||
    url.pathname === '/favicon-16x16.png' ||
    url.pathname === '/mstile-150x150.png'
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // CSS/JS e demais assets: rede primeiro. Cache só como fallback offline.
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || new Response('Offline', { status: 503 })))
  );
});
