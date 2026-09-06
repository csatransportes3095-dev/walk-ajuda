(() => {
  'use strict';

  if (window.__H2_COMMISSION_POPUP_BRIDGE__) return;
  window.__H2_COMMISSION_POPUP_BRIDGE__ = '1.0.0';

  const browserOpen = window.open.bind(window);

  window.open = function h2CommissionPopupBridge(url, target, features) {
    const rawUrl = url == null ? '' : String(url);
    const rawTarget = target == null ? '' : String(target);
    const rawFeatures = features == null ? '' : String(features);

    // O fluxo seguro de Comissoes abre primeiro about:blank durante o clique do
    // usuario e, apos o servidor devolver a URL ASCII validada, navega a MESMA
    // aba para wa.me. Com noopener/noreferrer alguns navegadores retornam null
    // para window.open(), deixando a aba em branco e impedindo o redirect.
    if (rawUrl === 'about:blank' && (rawTarget === '_blank' || rawTarget === '')) {
      const cleanedFeatures = rawFeatures
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part && !/^noopener(?:=|$)/i.test(part) && !/^noreferrer(?:=|$)/i.test(part))
        .join(',');

      const child = browserOpen(rawUrl, rawTarget || '_blank', cleanedFeatures || undefined);
      try {
        if (child) child.opener = null;
      } catch (_) {}
      return child;
    }

    return browserOpen(url, target, features);
  };
})();
