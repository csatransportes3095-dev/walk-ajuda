(() => {
  'use strict';

  const TOOLBAR_ID = 'h2ads-schedule-toolbar';
  const FILTER_KEY = 'h2ads.schedule.filter.v1';
  const VALID_FILTERS = new Set(['all', 'confirmed', 'pending']);
  let activeFilter = readFilter();
  let observer = null;
  let refreshTimer = null;

  function readFilter() {
    try {
      const value = window.localStorage.getItem(FILTER_KEY) || 'all';
      return VALID_FILTERS.has(value) ? value : 'all';
    } catch (_) {
      return 'all';
    }
  }

  function saveFilter(value) {
    activeFilter = VALID_FILTERS.has(value) ? value : 'all';
    try { window.localStorage.setItem(FILTER_KEY, activeFilter); } catch (_) {}
  }

  function workspace() {
    return document.querySelector('.h2ads-workspace');
  }

  function groupSections(root) {
    const toggles = Array.from(root.querySelectorAll('button[title="Abrir grupo"], button[title="Recolher grupo"]'));
    return Array.from(new Set(toggles.map((button) => button.closest('section.mb-4')).filter(Boolean)));
  }

  function rememberAndExpandGroups(root) {
    for (const section of groupSections(root)) {
      if (!section.dataset.h2adsScheduleWasExpanded) {
        const openButton = section.querySelector('button[title="Abrir grupo"]');
        section.dataset.h2adsScheduleWasExpanded = openButton ? '0' : '1';
      }
      const openButton = section.querySelector('button[title="Abrir grupo"]');
      if (openButton) openButton.click();
    }
  }

  function restoreGroups(root) {
    for (const section of groupSections(root)) {
      const wasExpanded = section.dataset.h2adsScheduleWasExpanded;
      if (wasExpanded === '0') {
        const closeButton = section.querySelector('button[title="Recolher grupo"]');
        if (closeButton) closeButton.click();
      }
      delete section.dataset.h2adsScheduleWasExpanded;
      section.hidden = false;
    }
  }

  function updateToolbarState(root) {
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar) return;
    const cards = Array.from(root.querySelectorAll('article[data-h2ads-schedule-state]'));
    const confirmedCount = cards.filter((card) => card.dataset.h2adsScheduleState === 'confirmed').length;
    const pendingCount = cards.filter((card) => card.dataset.h2adsScheduleState === 'pending').length;
    const counts = { all: cards.length, confirmed: confirmedCount, pending: pendingCount };

    for (const button of toolbar.querySelectorAll('button[data-h2ads-schedule-filter]')) {
      const filter = button.dataset.h2adsScheduleFilter || 'all';
      const selected = filter === activeFilter;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.className = selected
        ? 'rounded-xl border border-cyan-300/70 bg-cyan-400 px-3 py-2 text-[11px] font-black text-[#041018] shadow-[0_0_22px_rgba(34,211,238,0.28)]'
        : 'rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black text-slate-200 hover:border-cyan-300/40 hover:bg-cyan-400/10';
      const label = filter === 'confirmed' ? 'AGENDAMENTOS CONFIRMADOS' : filter === 'pending' ? 'AGUARDANDO AGENDAMENTO' : 'TODOS';
      button.textContent = `${label} (${counts[filter] || 0})`;
    }
  }

  function applyCards(root) {
    const cards = Array.from(root.querySelectorAll('article[data-h2ads-schedule-state]'));

    for (const card of cards) {
      const state = card.dataset.h2adsScheduleState || 'none';
      const visible = activeFilter === 'all' || state === activeFilter;
      card.hidden = !visible;
      if (activeFilter !== 'confirmed') card.style.order = '';
    }

    if (activeFilter === 'confirmed') {
      const grids = Array.from(new Set(cards.map((card) => card.parentElement).filter(Boolean)));
      for (const grid of grids) {
        const scheduled = cards
          .filter((card) => card.parentElement === grid && !card.hidden)
          .sort((a, b) => String(a.dataset.h2adsScheduleSort || '9999-12-31T23:59').localeCompare(String(b.dataset.h2adsScheduleSort || '9999-12-31T23:59')));
        scheduled.forEach((card, index) => { card.style.order = String(index); });
      }
    }

    for (const section of groupSections(root)) {
      if (activeFilter === 'all') {
        section.hidden = false;
        continue;
      }
      const sectionCards = Array.from(section.querySelectorAll('article[data-h2ads-schedule-state]'));
      section.hidden = sectionCards.length > 0 && sectionCards.every((card) => card.hidden);
    }

    updateToolbarState(root);
  }

  function scheduleApply(root) {
    if (refreshTimer) window.clearTimeout(refreshTimer);
    applyCards(root);
    for (const delay of [80, 220, 500, 900, 1400]) {
      window.setTimeout(() => {
        const current = workspace();
        if (current) applyCards(current);
      }, delay);
    }
    refreshTimer = window.setTimeout(() => {
      const current = workspace();
      if (current) applyCards(current);
    }, 2200);
  }

  function setFilter(value) {
    const root = workspace();
    if (!root) return;
    saveFilter(value);
    if (activeFilter === 'all') {
      for (const card of root.querySelectorAll('article[data-h2ads-schedule-state]')) {
        card.hidden = false;
        card.style.order = '';
      }
      restoreGroups(root);
      scheduleApply(root);
      return;
    }
    rememberAndExpandGroups(root);
    scheduleApply(root);
  }

  function ensureToolbar(root) {
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) return toolbar;

    toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.className = 'fixed bottom-4 left-1/2 z-[80] w-[calc(100%-24px)] max-w-[760px] -translate-x-1/2 rounded-2xl border border-cyan-400/30 bg-[#07101D]/95 p-3 shadow-2xl backdrop-blur-xl lg:bottom-auto lg:left-auto lg:right-6 lg:top-24 lg:w-auto lg:max-w-none lg:translate-x-0';
    toolbar.innerHTML = `
      <div class="mb-2 flex items-center justify-between gap-3">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Agendamentos H2ADS</p>
          <p class="mt-0.5 text-[10px] font-semibold text-slate-400">Filtro visual. Não move grupos e não altera proxy.</p>
        </div>
        <button type="button" data-h2ads-schedule-close class="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black text-slate-400 hover:text-white" title="Ocultar filtros">×</button>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" data-h2ads-schedule-filter="all"></button>
        <button type="button" data-h2ads-schedule-filter="confirmed"></button>
        <button type="button" data-h2ads-schedule-filter="pending"></button>
      </div>`;

    document.body.appendChild(toolbar);
    toolbar.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (!target) return;
      if (target.hasAttribute('data-h2ads-schedule-close')) {
        toolbar.hidden = true;
        return;
      }
      const value = target.getAttribute('data-h2ads-schedule-filter');
      if (value && VALID_FILTERS.has(value)) setFilter(value);
    });

    updateToolbarState(root);
    return toolbar;
  }

  function sync() {
    const root = workspace();
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (!root) {
      if (toolbar) toolbar.remove();
      return;
    }
    const ensured = ensureToolbar(root);
    if (ensured) ensured.hidden = false;
    scheduleApply(root);
  }

  window.addEventListener('h2ads:schedule-data-changed', sync);
  window.addEventListener('storage', (event) => {
    if (event.key !== FILTER_KEY) return;
    activeFilter = readFilter();
    sync();
  });

  observer = new MutationObserver(() => sync());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  sync();
})();
