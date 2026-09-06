(() => {
  'use strict';

  const ENDPOINT = '/api/trpc/orderStatus.listOrders?batch=1&input=' + encodeURIComponent(JSON.stringify({ 0: { json: null } }));
  const PANEL_CLASS = 'h2-commission-product-info';
  let ordersByNumber = new Map();
  let loading = false;
  let loadedAt = 0;
  let scheduled = false;

  const normalize = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const formatProductValue = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return 'Não informado';
    if (/^R\$/i.test(raw)) return raw;

    let cleaned = raw.replace(/R\$/gi, '').replace(/\s/g, '');
    if (cleaned.includes(',')) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric)) return raw;
    return numeric.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const productLabel = (order) => {
    const parts = [order?.serviceName, order?.serviceOption]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return parts.join(' › ') || 'Produto não informado';
  };

  const readRows = async () => {
    if (loading) return;
    if (ordersByNumber.size > 0 && Date.now() - loadedAt < 30000) return;
    loading = true;
    try {
      const response = await fetch(ENDPOINT, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rows = payload?.[0]?.result?.data?.json || [];
      const next = new Map();
      for (const order of Array.isArray(rows) ? rows : []) {
        const number = Number(order?.orderNumber || 0);
        if (!number) continue;
        if (!next.has(number)) next.set(number, []);
        next.get(number).push(order);
      }
      ordersByNumber = next;
      loadedAt = Date.now();
      apply();
    } catch (error) {
      console.warn('[H2 Comissões] Não foi possível carregar os valores dos produtos:', error);
    } finally {
      loading = false;
    }
  };

  const findOrder = (number, row) => {
    const candidates = ordersByNumber.get(number) || [];
    if (candidates.length <= 1) return candidates[0] || null;

    const rowText = normalize(row?.textContent);
    return candidates.find((order) => {
      const service = normalize(order?.serviceName);
      const option = normalize(order?.serviceOption);
      return (!service || rowText.includes(service)) && (!option || rowText.includes(option));
    }) || candidates[0] || null;
  };

  const createPanel = () => {
    const panel = document.createElement('div');
    panel.className = `${PANEL_CLASS} rounded-lg border border-blue-500/25 bg-blue-500/5 px-2.5 py-2`;
    panel.style.cssText = 'margin-top:6px;margin-bottom:4px;display:flex;flex-direction:column;gap:5px;';
    return panel;
  };

  const setPanelContent = (panel, name, value) => {
    const signature = `${name}||${value}`;
    if (panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    panel.innerHTML = '';

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:flex-start;gap:7px;min-width:0;';
    const nameLabel = document.createElement('span');
    nameLabel.textContent = '📦 PRODUTO:';
    nameLabel.style.cssText = 'font-size:11px;font-weight:800;color:#94a3b8;white-space:nowrap;';
    const nameValue = document.createElement('span');
    nameValue.textContent = name;
    nameValue.style.cssText = 'font-size:12px;font-weight:800;color:#dbeafe;line-height:1.35;overflow-wrap:anywhere;';
    nameRow.append(nameLabel, nameValue);

    const valueRow = document.createElement('div');
    valueRow.style.cssText = 'display:flex;align-items:center;gap:7px;min-width:0;';
    const valueLabel = document.createElement('span');
    valueLabel.textContent = '💵 VALOR DO PRODUTO:';
    valueLabel.style.cssText = 'font-size:11px;font-weight:800;color:#94a3b8;white-space:nowrap;';
    const valueText = document.createElement('span');
    valueText.textContent = value;
    valueText.style.cssText = value === 'Não informado'
      ? 'font-size:12px;font-weight:800;color:#94a3b8;'
      : 'font-size:12px;font-weight:900;color:#4ade80;';
    valueRow.append(valueLabel, valueText);

    panel.append(nameRow, valueRow);
  };

  const apply = () => {
    scheduled = false;
    if (!location.pathname.startsWith('/admin/commissions')) return;

    const orderButtons = Array.from(document.querySelectorAll('button')).filter((button) => /^#\d+$/.test(String(button.textContent || '').trim()));
    for (const button of orderButtons) {
      const number = Number(String(button.textContent || '').replace(/\D/g, ''));
      if (!number) continue;

      const row = button.closest('div.px-4.py-3.flex.items-start.gap-3');
      const info = button.closest('div.flex-1.min-w-0.space-y-1');
      const metaRow = button.parentElement;
      if (!row || !info || !metaRow) continue;

      const order = findOrder(number, row);
      const name = order ? productLabel(order) : 'Produto não informado';
      const value = order ? formatProductValue(order.pricePaid) : 'Não informado';

      let panel = info.querySelector(`.${PANEL_CLASS}`);
      if (!panel) {
        panel = createPanel();
        info.insertBefore(panel, metaRow);
      }
      setPanelContent(panel, name, value);
    }
  };

  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => setTimeout(apply, 20));
  };

  const boot = () => {
    if (location.pathname.startsWith('/admin/commissions')) void readRows();
    scheduleApply();

    const root = document.getElementById('root');
    if (root) {
      new MutationObserver(() => {
        if (location.pathname.startsWith('/admin/commissions')) {
          if (ordersByNumber.size === 0) void readRows();
          scheduleApply();
        }
      }).observe(root, { childList: true, subtree: true });
    }

    window.addEventListener('focus', () => {
      if (!location.pathname.startsWith('/admin/commissions')) return;
      void readRows();
      scheduleApply();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
