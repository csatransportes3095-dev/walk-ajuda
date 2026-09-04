(() => {
  'use strict';

  const TOOLBAR_ID = 'h2ads-schedule-toolbar';
  const FILTER_KEY = 'h2ads.schedule.filter.v1';
  const VALID_FILTERS = new Set(['all', 'confirmed', 'pending']);
  let activeFilter = readFilter();
  let applying = false;
  let syncScheduled = false;

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

  function syncMarkers(root) {
    for (const marker of root.querySelectorAll('[data-h2ads-schedule-marker]')) {
      const card = marker.closest('article');
      if (!card) continue;
      card.dataset.h2adsScheduleState = marker.dataset.h2adsScheduleState || 'none';
      card.dataset.h2adsScheduleSort = marker.dataset.h2adsScheduleSort || '9999-12-31T23:59';
    }
  }

  function rememberAndExpandGroups(root) {
    for (const section of groupSections(root)) {
      if (!section.dataset.h2adsScheduleWasExpanded) {
        section.dataset.h2adsScheduleWasExpanded = section.querySelector('button[title="Abrir grupo"]') ? '0' : '1';
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
    const counts = {
      all: cards.length,
      confirmed: cards.filter((card) => card.dataset.h2adsScheduleState === 'confirmed').length,
      pending: cards.filter((card) => card.dataset.h2adsScheduleState === 'pending').length,
    };

    for (const button of toolbar.querySelectorAll('button[data-h2ads-schedule-filter]')) {
      const filter = button.dataset.h2adsScheduleFilter || 'all';
      const selected = filter === activeFilter;
      const nextPressed = selected ? 'true' : 'false';
      if (button.getAttribute('aria-pressed') !== nextPressed) button.setAttribute('aria-pressed', nextPressed);
      const nextClass = selected
        ? 'rounded-xl border border-cyan-300/70 bg-cyan-400 px-3 py-2 text-[11px] font-black text-[#041018] shadow-[0_0_22px_rgba(34,211,238,0.28)]'
        : 'rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black text-slate-200 hover:border-cyan-300/40 hover:bg-cyan-400/10';
      if (button.className !== nextClass) button.className = nextClass;
      const label = filter === 'confirmed' ? 'AGENDAMENTOS CONFIRMADOS' : filter === 'pending' ? 'AGUARDANDO AGENDAMENTO' : 'TODOS';
      const nextText = `${label} (${counts[filter] || 0})`;
      if (button.textContent !== nextText) button.textContent = nextText;
    }
  }

  function applyCards(root) {
    if (applying) return;
    applying = true;
    try {
      syncMarkers(root);
      const cards = Array.from(root.querySelectorAll('article[data-h2ads-schedule-state]'));

      for (const card of cards) {
        const state = card.dataset.h2adsScheduleState || 'none';
        const visible = activeFilter === 'all' || state === activeFilter;
        if (card.hidden === visible) card.hidden = !visible;
        if (activeFilter !== 'confirmed' && card.style.order) card.style.order = '';
      }

      if (activeFilter === 'confirmed') {
        const grids = Array.from(new Set(cards.map((card) => card.parentElement).filter(Boolean)));
        for (const grid of grids) {
          const scheduled = cards
            .filter((card) => card.parentElement === grid && !card.hidden)
            .sort((a, b) => String(a.dataset.h2adsScheduleSort || '9999-12-31T23:59').localeCompare(String(b.dataset.h2adsScheduleSort || '9999-12-31T23:59')));
          scheduled.forEach((card, index) => {
            const nextOrder = String(index);
            if (card.style.order !== nextOrder) card.style.order = nextOrder;
          });
        }
      }

      for (const section of groupSections(root)) {
        if (activeFilter === 'all') {
          if (section.hidden) section.hidden = false;
          continue;
        }
        const sectionCards = Array.from(section.querySelectorAll('article[data-h2ads-schedule-state]'));
        const hideSection = sectionCards.length > 0 && sectionCards.every((card) => card.hidden);
        if (section.hidden !== hideSection) section.hidden = hideSection;
      }

      updateToolbarState(root);
    } finally {
      applying = false;
    }
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    window.setTimeout(() => {
      syncScheduled = false;
      sync();
    }, 60);
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
    } else {
      rememberAndExpandGroups(root);
    }
    applyCards(root);
  }

  function ensureToolbar(root) {
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) return toolbar;

    toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.className = 'fixed bottom-4 left-1/2 z-[80] w-[calc(100%-24px)] max-w-[820px] -translate-x-1/2 rounded-2xl border border-cyan-400/30 bg-[#07101D]/95 p-3 shadow-2xl backdrop-blur-xl lg:bottom-auto lg:left-auto lg:right-6 lg:top-24 lg:w-auto lg:max-w-none lg:translate-x-0';
    toolbar.innerHTML = `
      <div class="mb-2 flex items-center justify-between gap-3">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Agendamentos H2ADS</p>
          <p class="mt-0.5 text-[10px] font-semibold text-slate-400">Separado dos grupos · não altera proxy, Worker ou posição real das instâncias.</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" data-h2ads-schedule-filter="all"></button>
        <button type="button" data-h2ads-schedule-filter="confirmed"></button>
        <button type="button" data-h2ads-schedule-filter="pending"></button>
      </div>`;

    document.body.appendChild(toolbar);
    toolbar.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('button[data-h2ads-schedule-filter]') : null;
      if (!target) return;
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
    ensureToolbar(root);
    applyCards(root);
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== FILTER_KEY) return;
    activeFilter = readFilter();
    const root = workspace();
    if (root) {
      if (activeFilter === 'all') restoreGroups(root);
      else rememberAndExpandGroups(root);
      applyCards(root);
    }
  });

  const observer = new MutationObserver(() => {
    if (!applying) scheduleSync();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  sync();
})();
