(() => {
  'use strict';

  // LEGADO DESATIVADO (2026-09-14)
  // O filtro de agendamento agora e renderizado nativamente pelo H2Ads.tsx.
  // Este arquivo permanece apenas como tombstone para navegadores que ainda
  // carreguem um index.html antigo. Nao observa DOM, nao clica em grupos,
  // nao esconde cards e nao altera a ordem das instancias.
  const TOOLBAR_ID = 'h2ads-schedule-toolbar';
  const FILTER_KEY = 'h2ads.schedule.filter.v1';

  try { window.localStorage.removeItem(FILTER_KEY); } catch (_) {}

  const cleanup = () => {
    document.getElementById(TOOLBAR_ID)?.remove();

    const root = document.querySelector('.h2ads-workspace');
    if (!root) return;

    for (const section of root.querySelectorAll('section.mb-4')) {
      section.hidden = false;
      delete section.dataset.h2adsScheduleWasExpanded;
    }

    for (const card of root.querySelectorAll('article[data-h2ads-schedule-state]')) {
      card.hidden = false;
      card.style.order = '';
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanup, { once: true });
  } else {
    cleanup();
  }
})();
