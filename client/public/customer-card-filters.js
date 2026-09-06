(() => {
  'use strict';

  const FILTER_BAR_ID = 'h2-customer-card-filters';
  const EMPTY_ID = 'h2-customer-filter-empty';
  const STYLE_ID = 'h2-customer-filter-style';
  const LOAN_ENDPOINT = '/api/trpc/loans.listClients?batch=1&input=' + encodeURIComponent(JSON.stringify({ 0: { json: {} } }));
  const CUSTOMER_ENDPOINT = '/api/trpc/customers.list?batch=1&input=' + encodeURIComponent(JSON.stringify({ 0: { json: null } }));

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
  let loanDataLoaded = false;
  let customerDataLoaded = false;
  let applying = false;
  let scheduled = false;

  // O filtro anterior ligava empréstimo apenas pelo telefone exibido no cartão.
  // Isso falhava quando o telefone do cadastro principal e o do módulo de empréstimos
  // tinham formatação/DDD antigos diferentes. Agora cruzamos telefone + CPF + nº cadastro.
  let loanCustomerNumbers = new Set();
  let loanPhones = new Set();
  let loanCpfs = new Set();
  let orderStateByCustomerNumber = new Map();
  let orderStateByPhone = new Map();
  let orderStateByCpf = new Map();
  let customerRowsCache = [];
  let loanRowsCache = [];

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

  const normalizeCpf = (value) => String(value || '').replace(/\D/g, '').slice(-11);

  const installStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `[data-h2-filter-hidden="1"]{display:none!important}#${FILTER_BAR_ID} button{-webkit-tap-highlight-color:transparent}`;
    document.head.appendChild(style);
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

  const getCardCustomerNumber = (card) => {
    const text = String(card.textContent || '');
    const match = text.match(/\*(\d{1,12})/);
    return match ? match[1] : '';
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

  const getCustomerOrderState = (customer) => {
    const openOrders = Array.isArray(customer?.openOrders) ? customer.openOrders : [];
    const latestStatus = normalize(customer?.latestStatus).replace(/\s+/g, '_');
    const delivered = latestStatus === 'pedido_entregue';
    const inProgress = openOrders.some((order) => {
      const status = normalize(order?.latestStatus).replace(/\s+/g, '_');
      return status !== 'pedido_entregue' && status !== 'cancelado' && status !== 'reprovado';
    });
    return { delivered, inProgress };
  };

  const rebuildIdentityIndexes = () => {
    const customerNumberByPhone = new Map();
    const customerNumberByCpf = new Map();

    orderStateByCustomerNumber = new Map();
    orderStateByPhone = new Map();
    orderStateByCpf = new Map();

    for (const customer of customerRowsCache) {
      const number = customer?.customerNumber != null ? String(customer.customerNumber) : '';
      const phone = normalizePhone(customer?.phone);
      const cpf = normalizeCpf(customer?.cpf);
      const state = getCustomerOrderState(customer);

      if (number) orderStateByCustomerNumber.set(number, state);
      if (phone) {
        customerNumberByPhone.set(phone, number);
        orderStateByPhone.set(phone, state);
      }
      if (cpf) {
        customerNumberByCpf.set(cpf, number);
        orderStateByCpf.set(cpf, state);
      }
    }

    const numbers = new Set();
    const phones = new Set();
    const cpfs = new Set();

    for (const loan of loanRowsCache) {
      // Mantém o mesmo critério usado pela cor amarela atual do cartão: cliente que
      // possui registro de empréstimo. Assim nenhum cartão amarelo fica fora do filtro.
      if (Number(loan?.totalLoans || 0) <= 0) continue;

      const phone = normalizePhone(loan?.phone);
      const cpf = normalizeCpf(loan?.cpf);
      if (phone) phones.add(phone);
      if (cpf) cpfs.add(cpf);

      const byPhone = phone ? customerNumberByPhone.get(phone) : '';
      const byCpf = cpf ? customerNumberByCpf.get(cpf) : '';
      if (byPhone) numbers.add(String(byPhone));
      if (byCpf) numbers.add(String(byCpf));
    }

    loanCustomerNumbers = numbers;
    loanPhones = phones;
    loanCpfs = cpfs;
  };

  const cardHasLoan = (card) => {
    const customerNumber = getCardCustomerNumber(card);
    if (customerNumber && loanCustomerNumbers.has(customerNumber)) return true;

    for (const phone of getCardPhoneCandidates(card)) {
      for (const loanPhone of loanPhones) {
        if (phoneMatches(phone, loanPhone)) return true;
      }
    }
    return false;
  };

  const getOrderStateFromCard = (card) => {
    const number = getCardCustomerNumber(card);
    if (number && orderStateByCustomerNumber.has(number)) return orderStateByCustomerNumber.get(number);

    for (const phone of getCardPhoneCandidates(card)) {
      if (orderStateByPhone.has(phone)) return orderStateByPhone.get(phone);
      for (const [savedPhone, state] of orderStateByPhone.entries()) {
        if (phoneMatches(phone, savedPhone)) return state;
      }
    }

    // Fallback somente enquanto a API ainda está carregando.
    const raw = String(card.textContent || '');
    const text = normalize(raw);
    const delivered = text.includes('pedido entregue');
    const cancelled = text.includes('cancelado') || text.includes('reprovado');
    const explicitActive = ACTIVE_ORDER_LABELS.some((label) => text.includes(label));
    const hasOrderNumber = /pedido:\s*#\d+/i.test(raw);
    return { delivered, inProgress: !delivered && !cancelled && (explicitActive || hasOrderNumber) };
  };

  const matchSearch = (card, rawTerm) => {
    const term = normalize(rawTerm);
    if (!term) return true;
    return normalize(card.textContent).includes(term);
  };

  const matchStatusFilter = (card) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'loan') return cardHasLoan(card);
    const state = getOrderStateFromCard(card);
    if (selectedFilter === 'progress') return !!state?.inProgress;
    if (selectedFilter === 'delivered') return !!state?.delivered;
    return true;
  };

  const buttonTheme = {
    all: { border: '#3b82f6', bg: 'rgba(59,130,246,.16)', active: '#2563eb' },
    loan: { border: '#eab308', bg: 'rgba(234,179,8,.14)', active: '#a16207' },
    progress: { border: '#06b6d4', bg: 'rgba(6,182,212,.13)', active: '#0e7490' },
    delivered: { border: '#22c55e', bg: 'rgba(34,197,94,.13)', active: '#15803d' },
  };

  const createFilterButton = (key, label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.filterKey = key;
    button.dataset.baseLabel = label;
    button.style.cssText = 'min-height:38px;padding:8px 12px;border-radius:12px;border:1px solid transparent;font-size:12px;font-weight:800;cursor:pointer;transition:background .15s ease,border-color .15s ease;white-space:nowrap;';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedFilter = key;
      applyFilters();
    });
    return button;
  };

  const ensureFilterBar = () => {
    const input = getSearchInput();
    if (!input) return null;
    let bar = document.getElementById(FILTER_BAR_ID);
    if (bar) return bar;

    const row = input.parentElement?.parentElement || input.parentElement;
    if (!row?.parentElement) return null;

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
      loan: loanDataLoaded && customerDataLoaded ? counts.loan : '...',
      progress: customerDataLoaded ? counts.progress : '...',
      delivered: customerDataLoaded ? counts.delivered : '...',
    };

    for (const button of bar.querySelectorAll('button[data-filter-key]')) {
      const key = button.dataset.filterKey || 'all';
      const theme = buttonTheme[key] || buttonTheme.all;
      const active = key === selectedFilter;
      button.textContent = `${button.dataset.baseLabel || ''} (${values[key]})`;
      button.style.borderColor = theme.border;
      button.style.background = active ? theme.active : theme.bg;
      button.style.color = '#fff';
      button.style.boxShadow = active ? `0 0 0 1px ${theme.border},0 4px 14px rgba(0,0,0,.22)` : 'none';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  };

  const applyFilters = () => {
    if (applying) return;
    applying = true;
    try {
      installStyle();
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
        const orderState = getOrderStateFromCard(card);
        const hasLoan = cardHasLoan(card);
        if (hasLoan) counts.loan += 1;
        if (orderState?.inProgress) counts.progress += 1;
        if (orderState?.delivered) counts.delivered += 1;

        const show = matchSearch(card, rawTerm) && matchStatusFilter(card);
        card.dataset.h2FilterHidden = show ? '0' : '1';
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
          cards[0]?.parentElement?.appendChild(empty);
        }
      } else if (empty) {
        empty.remove();
      }
    } finally {
      applying = false;
    }
  };

  const scheduleApply = (delay = 30) => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      applyFilters();
    }, delay);
  };

  const readTrpcRows = async (url) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return payload?.[0]?.result?.data?.json || [];
  };

  const loadFilterData = async () => {
    const [customersResult, loansResult] = await Promise.allSettled([
      readTrpcRows(CUSTOMER_ENDPOINT),
      readTrpcRows(LOAN_ENDPOINT),
    ]);

    if (customersResult.status === 'fulfilled') {
      customerRowsCache = Array.isArray(customersResult.value) ? customersResult.value : [];
      customerDataLoaded = true;
    } else {
      console.warn('[H2 Customer Filters] Não foi possível carregar cadastros principais:', customersResult.reason);
    }

    if (loansResult.status === 'fulfilled') {
      loanRowsCache = Array.isArray(loansResult.value) ? loansResult.value : [];
      loanDataLoaded = true;
    } else {
      console.warn('[H2 Customer Filters] Não foi possível carregar clientes de empréstimos:', loansResult.reason);
    }

    rebuildIdentityIndexes();
    applyFilters();
  };

  document.addEventListener('input', (event) => {
    if (!isCustomerSearchInput(event.target)) return;
    scheduleApply(0);
  }, true);

  const boot = () => {
    installStyle();
    ensureFilterBar();
    applyFilters();
    loadFilterData();

    const root = document.getElementById('root');
    if (root) {
      new MutationObserver((mutations) => {
        if (applying) return;
        const structuralChange = mutations.some((mutation) => mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length));
        if (structuralChange) scheduleApply(40);
      }).observe(root, { childList: true, subtree: true });
    }

    window.addEventListener('focus', () => {
      loadFilterData();
      scheduleApply(0);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
