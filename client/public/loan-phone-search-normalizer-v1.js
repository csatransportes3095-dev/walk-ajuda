(() => {
  'use strict';

  const VERSION = '1.0.0';
  const TARGET_PLACEHOLDERS = new Set([
    'Buscar por nome, CPF ou telefone...',
    'Buscar por nome ou telefone...',
  ]);

  let clientsCache = null;
  let clientsCacheAt = 0;
  let loadingClients = null;

  function isLoanAdminPage() {
    return location.pathname.includes('/admin/') && /loan|emprest/i.test(location.pathname + ' ' + document.title + ' ' + document.body?.innerText?.slice(0, 300));
  }

  function normalizeLocalPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      digits = digits.slice(2);
    }
    return digits;
  }

  function isPhonePaste(value) {
    const digits = normalizeLocalPhone(value);
    return digits.length === 10 || digits.length === 11;
  }

  function setReactInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor?.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function normalizeApiResponse(payload) {
    const envelope = Array.isArray(payload) ? payload[0] : payload?.[0] ?? payload;
    const error = envelope?.error?.json?.message || envelope?.error?.message;
    if (error) throw new Error(error);
    return envelope?.result?.data?.json ?? envelope?.result?.data ?? [];
  }

  async function loadAllLoanClients() {
    const now = Date.now();
    if (Array.isArray(clientsCache) && now - clientsCacheAt < 30000) return clientsCache;
    if (loadingClients) return loadingClients;

    loadingClients = (async () => {
      const input = encodeURIComponent(JSON.stringify({ 0: { json: {} } }));
      const response = await fetch(`/api/trpc/loans.listClients?batch=1&input=${input}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(`Falha ao localizar cliente (${response.status}).`);
      const rows = normalizeApiResponse(payload);
      clientsCache = Array.isArray(rows) ? rows : [];
      clientsCacheAt = Date.now();
      return clientsCache;
    })();

    try {
      return await loadingClients;
    } finally {
      loadingClients = null;
    }
  }

  async function resolvePastedPhone(input, pastedText) {
    const wanted = normalizeLocalPhone(pastedText);

    // Resposta imediata na tela enquanto buscamos o formato exato salvo no cadastro.
    setReactInputValue(input, wanted);

    try {
      const clients = await loadAllLoanClients();
      const match = clients.find((client) => normalizeLocalPhone(client?.phone) === wanted);
      if (!match?.phone) return;

      // Usa exatamente o formato gravado no banco. Assim os filtros atuais de
      // Clientes e Empréstimos continuam intactos e passam a localizar o cadastro.
      setReactInputValue(input, String(match.phone));
      input.dataset.h2PhoneResolved = '1';
    } catch (error) {
      console.warn(`[H2 Loan Phone Search ${VERSION}]`, error);
      // Mantém os dígitos locais no campo; nenhuma outra função é alterada.
    }
  }

  document.addEventListener('paste', (event) => {
    if (!isLoanAdminPage()) return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!TARGET_PLACEHOLDERS.has(input.placeholder)) return;

    const pastedText = event.clipboardData?.getData('text') || '';
    if (!isPhonePaste(pastedText)) return;

    event.preventDefault();
    void resolvePastedPhone(input, pastedText);
  }, true);

  window.__H2_LOAN_PHONE_SEARCH_NORMALIZER__ = VERSION;
})();
