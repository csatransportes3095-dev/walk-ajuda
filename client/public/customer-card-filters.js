(() => {
  'use strict';

  const FILTER_BAR_ID = 'h2-customer-card-filters';
  const EMPTY_ID = 'h2-customer-filter-empty';
  const LOAN_ENDPOINT = '/api/trpc/loans.listClients?batch=1&input=' + encodeURIComponent(JSON.stringify({ 0: { json: {} } }));
  const ACTIVE_ORDER_LABELS = [
    'pedido recebido',
    'pagamento aprovado',
    'em andamento',
    'montagens documentos',
    'foto de perfil aprovada',
    'conta ativa',
    'aguardando ficar ativa',
    'ag. liberacao foto',
    'foto em analise',
    'login liberando',
  ];

  let selectedFilter = 'all';
  let scheduled = false;
  let activeLoanPhones = new Set();
  let loanDataLoaded = false;

  const normalize = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const normalizePhone = (value) => {
    let digits = String(value || '').replace(/\D/g, '');
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
    return digits;
  };

  const isCustomerSearchInput = (element) => {
    if (!(element instanceof HTMLInputElement)) return false;
    const placeholder = normalize(element.getAttribute('placeholder'));
    return placeholder.includes('buscar por nome') || placeholder.includes('*nº cadastro') || placeholder.includes('*n cadastro') || placeholder.includes('*cadastro');
  };

  const getSearchInput = () => Array.from(document.querySelectorAll('input')).find(isCustomerSearchInput) || null;

  const getCustomerCards = () => {
    const seen = new Set();
    const cards = [];
    for (const button of Array.from(document.querySelectorAll('button'))) {
      if (normalize(button.textContent) !== 'ver dados e controles') continue;
      const card = button.closest('div.rounded-2xl.overflow-hidden');
      if (card && !seen.has(card)) {
        seen.add(card);
        cards.push(card);
      }
    }
    return cards;
  };

  const getCardPhoneCandidates = (card) => {
    const matches = String(card.textContent || '').match(/(?:\+?55\s*)?\d{10,11}/g) || [];
    return [...new Set(matches.map(normalizePhone).filter((value) => value.length >= 10))];
  };

  const phoneMatches = (left, right) => {
    const a = normalizePhone(left);
    const b = normalizePhone(right);
    if (!a || !b) return false;
    return a === b || a.endsWith(b) || b.endsWith(a);
  };

  const cardHasActiveLoan = (card) => {
    const candidates = getCardPhoneCandidates(card);
    for (const phone of candidates) {
      for (const activePhone of activeLoanPhones) {
        if (phoneMatches(phone, activePhone)) return true;
      }
    }
    return false;
  };

  const getOrderState = (card) => {
    const text = normalize(card.textContent);
    const delivered = text.includes('pedido entregue');
    const cancelled = text.includes('cancelado');
    const explicitActive = ACTIVE_ORDER_LABELS.some((label) => text.includes(label));
    const hasOrderNumber = /pedido:\s*#\d+/i.test(String(card.textContent || ''));
    const inProgress = explicitActive || (hasOrderNumber && !delivered && !cancelled);
    return { delivered, inProgress };
  };

  const matchSearch = (card, rawTerm) => {
    const term = normalize(rawTerm);
    if (!term) return true;
    return normalize(card.textContent).includes(term);
  };

  const matchStatusFilter = (card) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'loan') return cardHasActiveLoan(card);
    const orderState = getOrderState(card);
    if (selectedFilter === 'progress') return orderState.inProgress;
    if (selectedFilter === 'delivered') return orderState.delivered;
    return true;
  };

  const getSearchRow = (input) => {
    if (!input) return null;
    const directParent = input.parentElement?.parentElement;
    if (directParent && directParent instanceof HTMLElement) return directParent;
    return input.parentElement;
  };

  const buttonTheme = {
    all: { border: '#3b82f6', bg: 'rgba(59,130,246,.16)', active: '#2563eb', text: '#dbeafe' },
    loan: { border: '#eab308', bg: 'rgba(234,179,8,.14)', active: '#a16207', text: '#fef3c7' },
    progress: { border: '#06b6d4', bg: 'rgba(6,182,212,.13)', active: '#0e7490', text: '#cffafe' },
    delivered: { border: '#22c55e', bg: 'rgba(34,197,94,.13)', active: '#15803d', text: '#dcfce7' },
  };

  const createFilterButton = (key, label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.filterKey = key;
    button.dataset.baseLabel = label;
    button.style.cssText = [
      'min-height:38px',
      'padding:8px 12px',
      'border-radius:12px',
      'border:1px solid transparent',
      'font-size:12px',
      'font-weight:800',
      'cursor:pointer',
      'transition:all .15s ease',
      'white-space:nowrap',
    ].join(';');
    button.addEventListener('click', () => {
      selectedFilter = key;
      scheduleApply();
    });
    return button;
  };

  const ensureFilterBar = () => {
    const input = getSearchInput();
    if (!input) return null;
    let bar = document.getElementById(FILTER_BAR_ID);
    if (bar) return bar;

    const row = getSearchRow(input);
    if (!row || !row.parentElement) return null;

    bar = document.createElement('div');
    bar.id = FILTER_BAR_ID;
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;margin-bottom:2px;';
    bar.appendChild(createFilterButton('all', 'Todos'));
    bar.appendChild(createFilterButton('loan', '💳 Empréstimo ativo'));
    bar.appendChild(createFilterButton('progress', '🔄 Pedidos em andamento'));
    bar.appendChild(createFilterButton('delivered', '✅ Pedidos entregues'));
    row.insertAdjacentElement('afterend', bar);
    return bar;
  };

  const updateButtons = (counts) => {
    const bar = ensureFilterBar();
    if (!bar) return;
    const values = {
      all: counts.all,
      loan: loanDataLoaded ? counts.loan : '...',
      progress: counts.progress,
      delivered: counts.delivered,
    };

    bar.querySelectorAll('button[data-filter-key]').forEach((button) => {
      const key = button.dataset.filterKey;
      const theme = buttonTheme[key] || buttonTheme.all;
      const active = key === selectedFilter;
      const label = button.dataset.baseLabel || '';
      const nextText = `${label} (${values[key]})`;
      if (button.textContent !== nextText) button.textContent = nextText;
      button.style.borderColor = theme.border;
      button.style.background = active ? theme.active : theme.bg;
      button.style.color = '#ffffff';
      button.style.boxShadow = active ? `0 0 0 1px ${theme.border}, 0 4px 14px rgba(0,0,0,.22)` : 'none';
    });
  };

  const applyFilters = () => {
    scheduled = false;
    const input = getSearchInput();
    const cards = getCustomerCards();
    if (!input || cards.length === 0) {
      ensureFilterBar();
      return;
    }

    const rawTerm = String(input.value || '').trim();
    const counts = { all: cards.length, loan: 0, progress: 0, delivered: 0 };
    let visible = 0;

    for (const card of cards) {
      const orderState = getOrderState(card);
      const hasLoan = cardHasActiveLoan(card);
      if (hasLoan) counts.loan += 1;
      if (orderState.inProgress) counts.progress += 1;
      if (orderState.delivered) counts.delivered += 1;

      const searchOk = matchSearch(card, rawTerm);
      const statusOk = matchStatusFilter(card);
      const show = searchOk && statusOk;
      card.style.display = show ? '' : 'none';
      card.dataset.h2CustomerVisible = show ? '1' : '0';
      if (show) visible += 1;
    }

    updateButtons(counts);

    let empty = document.getElementById(EMPTY_ID);
    if (visible === 0) {
      if (!empty) {
        empty = document.createElement('div');
        empty.id = EMPTY_ID;
        empty.style.cssText = 'grid-column:1/-1;text-align:center;padding:28px 12px;color:#94a3b8;font-weight:800;';
        empty.textContent = 'Nenhum cliente encontrado neste filtro';
        const grid = cards[0]?.parentElement;
        if (grid) grid.appendChild(empty);
      }
    } else if (empty) {
      empty.remove();
    }
  };

  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => setTimeout(applyFilters, 0));
  };

  const loadActiveLoans = async () => {
    try {
      const response = await fetch(LOAN_ENDPOINT, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rows = payload?.[0]?.result?.data?.json || [];
      const phones = new Set();
      for (const row of rows) {
        const openAmount = Number(row?.openAmount || 0);
        if (openAmount <= 0) continue;
        const phone = normalizePhone(row?.phone);
        if (phone) phones.add(phone);
      }
      activeLoanPhones = phones;
      loanDataLoaded = true;
      scheduleApply();
    } catch (error) {
      console.warn('[H2 Customer Filters] Não foi possível carregar empréstimos ativos:', error);
      loanDataLoaded = true;
      scheduleApply();
    }
  };

  document.addEventListener('input', (event) => {
    if (!isCustomerSearchInput(event.target)) return;
    scheduleApply();
  }, true);

  document.addEventListener('click', () => setTimeout(scheduleApply, 0), true);

  const boot = () => {
    ensureFilterBar();
    scheduleApply();
    loadActiveLoans();

    const root = document.getElementById('root');
    if (root) {
      new MutationObserver(() => scheduleApply()).observe(root, { childList: true, subtree: true });
    }

    window.addEventListener('focus', () => {
      loadActiveLoans();
      scheduleApply();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
