(() => {
  'use strict';

  // LEGADO DESATIVADO.
  // Este arquivo permanece apenas para compatibilidade com HTML antigo que ainda
  // possa referencia-lo. Nao esconde mais nenhum filtro de /admin/orders.
  function restoreLegacyHiddenFilters() {
    if (!location.pathname.startsWith('/admin/orders')) return;

    document.querySelectorAll('[data-h2-hidden-unused-filter="1"]').forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      element.style.removeProperty('display');
      element.removeAttribute('aria-hidden');
      element.removeAttribute('data-h2-hidden-unused-filter');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restoreLegacyHiddenFilters, { once: true });
  } else {
    restoreLegacyHiddenFilters();
  }

  window.addEventListener('load', restoreLegacyHiddenFilters, { once: true });
})();
