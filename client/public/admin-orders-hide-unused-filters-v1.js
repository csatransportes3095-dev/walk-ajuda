(() => {
  'use strict';

  const UNUSED = ['Sem Agendamento', 'Ag. Ficar Ativa'];
  let timer = 0;

  function hideUnusedFilters() {
    if (!location.pathname.startsWith('/admin/orders')) return;
    document.querySelectorAll('button').forEach((button) => {
      const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
      if (UNUSED.some(label => text.includes(label))) {
        button.style.setProperty('display', 'none', 'important');
        button.setAttribute('aria-hidden', 'true');
        button.setAttribute('data-h2-hidden-unused-filter', '1');
      }
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(hideUnusedFilters, 40);
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('load', schedule);
  document.addEventListener('DOMContentLoaded', schedule);
  schedule();
})();
