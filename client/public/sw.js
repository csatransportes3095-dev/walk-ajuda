// Service Worker v105 — ícones H2 renovados, com PWA de Cartões preservado
const CACHE_NAME = 'walk-ajuda-v105-h2brand';
const CARTOES_CACHE = 'meus-cartoes-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Apenas cacheia a raiz e o manifesto dinâmico
      // Os ícones PWA são carregados dinamicamente pelo manifesto do servidor
      return cache.addAll([
        '/',
        '/cartoes',
        '/manifest.json',
        '/manifest-admin.json',
        '/manifest.webmanifest',
        '/h2-brand-16.png',
        '/h2-brand-32.png',
        '/h2-brand-150.png',
        '/h2-brand-180.png',
        '/h2-brand-192.png',
        '/h2-brand-512.png',
        '/icon-192x192.png',
        '/icon-512x512.png',
        '/apple-touch-icon.png',
      ]).catch(() => {
        // Ignorar erros de pré-cache — o app ainda funciona online
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remover caches antigos (versões anteriores)
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== CARTOES_CACHE)
          .map(name => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

// Estratégia: Network First — sempre tenta a rede, cai para cache se offline
self.addEventListener('fetch', (event) => {
  // Ignorar requisições não-GET e de outras origens
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('manus-storage')) return;

  // Não cachear chamadas de API
  if (event.request.url.includes('/api/')) return;

  // Não interceptar rotas de mídia pública (foto/video) — servidas pelo backend com OG tags
  if (event.request.url.includes('/foto/') || event.request.url.includes('/video/')) return;

  // Cache First para ícones PWA e manifest
  const url = new URL(event.request.url);
  if (
    url.pathname.endsWith('.webmanifest') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/manifest-admin.json' ||
    url.pathname.startsWith('/h2-brand-') ||
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

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cachear resposta válida
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline: retornar do cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Fallback para a página principal se for navegação
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
