(() => {
  'use strict';

  const rawPath = window.location.pathname || '/';
  let decodedPath = rawPath;
  try { decodedPath = decodeURIComponent(rawPath); } catch (_) {}
  const path = decodedPath.toLowerCase();

  // Alias digitado com acento: leva para a rota oficial sem acento.
  if (path === '/empréstimo') {
    window.location.replace('/emprestimo' + window.location.search + window.location.hash);
    return;
  }

  // Rotas conhecidas do H2. Qualquer rota pública fora desta lista não deve cair
  // no WelcomeScreen/PasswordGate antigo; vai para a entrada atual do sistema.
  const exact = new Set([
    '/', '/login', '/foto', '/sorteio', '/acompanhar', '/revendedor',
    '/pre-cadastro', '/consultar-cadastro', '/atualizarcadastro', '/locadora',
    '/gastos', '/emprestimo', '/cartoes', '/gerador-chassi', '/ajuda',
    '/video/tutorial', '/tutorial', '/bot', '/app', '/app-pro', '/vip', '/404'
  ]);

  const prefixes = [
    '/admin/', '/h2ads', '/revendedor/', '/agendar/', '/orcamento/', '/recibo/',
    '/locadora/', '/cartoes/', '/video/', '/r/'
  ];

  const known = exact.has(path) || prefixes.some(prefix => path.startsWith(prefix));
  if (!known) {
    const target = new URL('/login', window.location.origin);
    target.searchParams.set('rota_invalida', rawPath);
    window.location.replace(target.toString());
  }
})();
