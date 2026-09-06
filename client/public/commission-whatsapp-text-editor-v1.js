(() => {
  'use strict';

  const VERSION = '1.0.0';
  const PAGE_PREFIX = '/admin/commissions';
  const BUTTON_ID = 'h2-commission-text-editor-button';
  const MODAL_ID = 'h2-commission-text-editor-modal';

  const SPECS = {
    confirmed: {
      key: 'commission_indication_confirmed',
      title: 'COMISSAO - INDICACAO CONFIRMADA',
      label: 'INDICACAO CONFIRMADA',
      help: 'Variaveis: {indicador}, {cliente}, {telefone}, {comissao}, {status_pagamento}',
      defaultMessage: `*INDICAÇÃO CONFIRMADA*

Olá, {indicador}!

Sua indicação deu certo.

*Cliente indicado:* {cliente}
*Telefone:* {telefone}
{comissao}

{status_pagamento}

Obrigado pela indicação!`,
    },
    pix: {
      key: 'commission_request_pix',
      title: 'COMISSAO - PEDIR PIX',
      label: 'PEDIR PIX',
      help: 'Variaveis: {indicador}, {valor_comissao}',
      defaultMessage: `*DADOS PARA PAGAMENTO DA COMISSÃO*

Olá, {indicador}!

Sua comissão está pronta para pagamento.
{valor_comissao}

Por favor, envie sua *chave PIX* para realizarmos o pagamento.

Obrigado!`,
    },
    paid: {
      key: 'commission_paid',
      title: 'COMISSAO - PAGAMENTO CONFIRMADO',
      label: 'COMISSAO PAGA',
      help: 'Variaveis: {indicador}, {cliente}, {valor_pago}',
      defaultMessage: `*COMISSÃO PAGA*

Olá, {indicador}!

Sua comissão foi paga com sucesso.
*Cliente indicado:* {cliente}
{valor_pago}

Obrigado pela indicação!`,
    },
  };

  const state = {
    rows: [],
    loaded: false,
    loading: null,
    messages: Object.fromEntries(Object.entries(SPECS).map(([type, spec]) => [type, spec.defaultMessage])),
  };

  function onCommissionPage() {
    return location.pathname.startsWith(PAGE_PREFIX);
  }

  function normalizeApiResponse(payload) {
    if (Array.isArray(payload)) return payload[0];
    if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, '0')) return payload[0];
    return payload;
  }

  async function trpc(path, input, method = 'GET') {
    const batchInput = { 0: { json: input ?? null } };
    let url = `/api/trpc/${path}?batch=1`;
    const options = {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    };

    if (method === 'GET') {
      url += `&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(batchInput);
    }

    const response = await fetch(url, options);
    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new Error(`Falha ao ler resposta do servidor (${response.status}).`);
    }

    const envelope = normalizeApiResponse(payload);
    const serverError = envelope?.error?.json?.message || envelope?.error?.message;
    if (!response.ok || serverError) {
      throw new Error(serverError || `Erro ${response.status} ao salvar os textos.`);
    }

    return envelope?.result?.data?.json ?? envelope?.result?.data ?? null;
  }

  function rowFor(type) {
    const spec = SPECS[type];
    return state.rows
      .filter((row) => String(row?.statusKey || '') === spec.key)
      .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0] || null;
  }

  async function loadTemplates(force = false) {
    if (state.loaded && !force) return state.messages;
    if (state.loading && !force) return state.loading;

    state.loading = (async () => {
      const rows = await trpc('whatsappTemplates.list', null, 'GET');
      state.rows = Array.isArray(rows) ? rows : [];
      for (const type of Object.keys(SPECS)) {
        const row = rowFor(type);
        state.messages[type] = String(row?.message || '').trim() || SPECS[type].defaultMessage;
      }
      state.loaded = true;
      return state.messages;
    })();

    try {
      return await state.loading;
    } finally {
      state.loading = null;
    }
  }

  async function saveOne(type, message) {
    const spec = SPECS[type];
    const current = rowFor(type);
    const clean = String(message || '').trim();
    if (!clean) throw new Error(`O texto de ${spec.label} nao pode ficar vazio.`);

    if (current) {
      await trpc('whatsappTemplates.update', {
        id: Number(current.id),
        title: spec.title,
        statusKey: spec.key,
        message: clean,
        sortOrder: Number(current.sortOrder || 0),
        isDefault: 1,
      }, 'POST');
    } else {
      await trpc('whatsappTemplates.create', {
        title: spec.title,
        statusKey: spec.key,
        message: clean,
        sortOrder: 0,
        isDefault: 1,
      }, 'POST');
    }
  }

  function applyTemplate(template, values) {
    let result = String(template || '');
    for (const [key, value] of Object.entries(values || {})) {
      result = result.split(`{${key}}`).join(String(value ?? ''));
    }
    return result
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function stripMarks(value) {
    return String(value || '')
      .replace(/\uFFFD/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '')
      .trim();
  }

  function lineValue(text, label) {
    const lines = String(text || '').split(/\r?\n/);
    const labelLower = label.toLocaleLowerCase('pt-BR');
    for (const raw of lines) {
      const clean = stripMarks(raw).replace(/\*/g, '').trim();
      const lower = clean.toLocaleLowerCase('pt-BR');
      const index = lower.indexOf(labelLower);
      if (index < 0) continue;
      return clean.slice(index + label.length).replace(/^\s*/, '').trim();
    }
    return '';
  }

  function extractName(text) {
    const match = String(text || '').match(/Ol[aá],\s*([^!\n]+)!/i);
    return match ? match[1].trim() : '';
  }

  function detectType(text) {
    const clean = stripMarks(text).toLocaleUpperCase('pt-BR');
    if (clean.includes('DADOS PARA PAGAMENTO DA COMISSÃO')) return 'pix';
    if (clean.includes('COMISSÃO PAGA')) return 'paid';
    if (clean.includes('INDICAÇÃO CONFIRMADA')) return 'confirmed';
    return null;
  }

  function variablesFromOriginal(type, text) {
    const indicador = extractName(text);
    if (type === 'confirmed') {
      const commission = lineValue(text, 'Comissão:');
      const paidStatus = /Pagamento da comissão confirmado/i.test(text)
        ? '*Pagamento da comissão confirmado.*'
        : 'A comissão será paga em breve.';
      return {
        indicador,
        cliente: lineValue(text, 'Cliente indicado:'),
        telefone: lineValue(text, 'Telefone:'),
        comissao: commission ? `*Comissão:* ${commission}` : '',
        status_pagamento: paidStatus,
      };
    }
    if (type === 'pix') {
      const value = lineValue(text, 'Valor da comissão:');
      return {
        indicador,
        valor_comissao: value ? `*Valor da comissão:* ${value}` : '',
      };
    }
    if (type === 'paid') {
      const value = lineValue(text, 'Valor pago:');
      return {
        indicador,
        cliente: lineValue(text, 'Cliente indicado:'),
        valor_pago: value ? `*Valor pago:* ${value}` : '',
      };
    }
    return {};
  }

  function rebuildWhatsappUrl(input) {
    if (input == null) return input;
    const raw = String(input);
    if (!raw.includes('wa.me/')) return input;

    try {
      const url = new URL(raw, location.href);
      if (url.hostname !== 'wa.me') return input;
      const original = url.searchParams.get('text') || '';
      const type = detectType(original);
      if (!type) return input;

      const template = state.messages[type] || SPECS[type].defaultMessage;
      const finalText = applyTemplate(template, variablesFromOriginal(type, original));
      const phonePath = url.pathname.replace(/^\/+/, '');
      return `${url.protocol}//${url.host}/${phonePath}?text=${encodeURIComponent(finalText)}`;
    } catch (_) {
      return input;
    }
  }

  function notify(message, isError = false) {
    const old = document.getElementById('h2-commission-editor-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.id = 'h2-commission-editor-toast';
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '2147483647',
      maxWidth: '360px',
      padding: '12px 16px',
      borderRadius: '12px',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      fontWeight: '800',
      color: '#fff',
      background: isError ? '#991b1b' : '#166534',
      boxShadow: '0 12px 35px rgba(0,0,0,.4)',
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function modalStyles() {
    if (document.getElementById('h2-commission-editor-style')) return;
    const style = document.createElement('style');
    style.id = 'h2-commission-editor-style';
    style.textContent = `
      #${MODAL_ID}{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.78);display:flex;align-items:flex-start;justify-content:center;padding:22px 12px;overflow:auto;font-family:Arial,sans-serif}
      #${MODAL_ID} .h2-editor-box{width:min(760px,100%);background:#0b1220;color:#f8fafc;border:1px solid #334155;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.6);overflow:hidden}
      #${MODAL_ID} .h2-editor-head{padding:18px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between;gap:12px}
      #${MODAL_ID} .h2-editor-title{font-size:18px;font-weight:900;margin:0}
      #${MODAL_ID} .h2-editor-close{border:1px solid #475569;background:#111827;color:#e2e8f0;border-radius:9px;padding:8px 12px;font-weight:800;cursor:pointer}
      #${MODAL_ID} .h2-editor-body{padding:18px 20px;display:flex;flex-direction:column;gap:18px}
      #${MODAL_ID} .h2-editor-section{display:flex;flex-direction:column;gap:7px}
      #${MODAL_ID} .h2-editor-label{font-size:13px;font-weight:900;color:#fbbf24}
      #${MODAL_ID} .h2-editor-help{font-size:11px;line-height:1.4;color:#94a3b8}
      #${MODAL_ID} textarea{width:100%;box-sizing:border-box;min-height:170px;resize:vertical;border:1px solid #475569;border-radius:12px;background:#020617;color:#f8fafc;padding:12px;font:500 13px/1.5 Arial,sans-serif;outline:none}
      #${MODAL_ID} textarea:focus{border-color:#f59e0b;box-shadow:0 0 0 2px rgba(245,158,11,.2)}
      #${MODAL_ID} .h2-editor-actions{padding:16px 20px;border-top:1px solid #334155;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
      #${MODAL_ID} .h2-editor-action{border:0;border-radius:10px;padding:10px 15px;font-weight:900;cursor:pointer}
      #${MODAL_ID} .h2-restore{background:#334155;color:#f8fafc;margin-right:auto}
      #${MODAL_ID} .h2-cancel{background:#475569;color:#fff}
      #${MODAL_ID} .h2-save{background:#f59e0b;color:#111827}
      #${MODAL_ID} .h2-save:disabled{opacity:.55;cursor:wait}
      @media(max-width:600px){#${MODAL_ID}{padding:8px}#${MODAL_ID} .h2-editor-head,#${MODAL_ID} .h2-editor-body,#${MODAL_ID} .h2-editor-actions{padding-left:12px;padding-right:12px}#${MODAL_ID} textarea{min-height:190px}}
    `;
    document.head.appendChild(style);
  }

  function createTextarea(type) {
    const spec = SPECS[type];
    const section = document.createElement('div');
    section.className = 'h2-editor-section';

    const label = document.createElement('div');
    label.className = 'h2-editor-label';
    label.textContent = spec.label;

    const help = document.createElement('div');
    help.className = 'h2-editor-help';
    help.textContent = spec.help;

    const area = document.createElement('textarea');
    area.dataset.templateType = type;
    area.spellcheck = true;
    area.value = state.messages[type] || spec.defaultMessage;

    section.append(label, help, area);
    return section;
  }

  async function openEditor() {
    if (document.getElementById(MODAL_ID)) return;
    try {
      await loadTemplates(false);
    } catch (error) {
      console.error('[H2 Commission Text Editor] falha ao carregar:', error);
      notify(error?.message || 'Nao foi possivel carregar os textos salvos.', true);
      return;
    }

    modalStyles();
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;

    const box = document.createElement('div');
    box.className = 'h2-editor-box';

    const head = document.createElement('div');
    head.className = 'h2-editor-head';
    const title = document.createElement('h2');
    title.className = 'h2-editor-title';
    title.textContent = 'Editar textos dos envios';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'h2-editor-close';
    close.textContent = 'Fechar';
    close.onclick = () => overlay.remove();
    head.append(title, close);

    const body = document.createElement('div');
    body.className = 'h2-editor-body';
    body.append(createTextarea('confirmed'), createTextarea('pix'), createTextarea('paid'));

    const actions = document.createElement('div');
    actions.className = 'h2-editor-actions';
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'h2-editor-action h2-restore';
    restore.textContent = 'Restaurar padroes';
    restore.onclick = () => {
      for (const type of Object.keys(SPECS)) {
        const area = body.querySelector(`textarea[data-template-type="${type}"]`);
        if (area) area.value = SPECS[type].defaultMessage;
      }
      notify('Padroes carregados. Clique em Salvar textos para confirmar.');
    };

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'h2-editor-action h2-cancel';
    cancel.textContent = 'Cancelar';
    cancel.onclick = () => overlay.remove();

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'h2-editor-action h2-save';
    save.textContent = 'Salvar textos';
    save.onclick = async () => {
      const next = {};
      for (const type of Object.keys(SPECS)) {
        const area = body.querySelector(`textarea[data-template-type="${type}"]`);
        next[type] = String(area?.value || '').trim();
        if (!next[type]) {
          notify(`O texto de ${SPECS[type].label} nao pode ficar vazio.`, true);
          area?.focus();
          return;
        }
      }

      save.disabled = true;
      save.textContent = 'Salvando...';
      try {
        for (const type of Object.keys(SPECS)) await saveOne(type, next[type]);
        await loadTemplates(true);
        notify('Textos salvos. Os proximos envios ja usarao esta configuracao.');
        overlay.remove();
      } catch (error) {
        console.error('[H2 Commission Text Editor] falha ao salvar:', error);
        notify(error?.message || 'Erro ao salvar os textos.', true);
        save.disabled = false;
        save.textContent = 'Salvar textos';
      }
    };

    actions.append(restore, cancel, save);
    box.append(head, body, actions);
    overlay.appendChild(box);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function ensureButton() {
    if (!onCommissionPage() || document.getElementById(BUTTON_ID)) return;
    const page = document.querySelector('div.max-w-3xl.mx-auto.px-4.py-4.space-y-4');
    if (!page) return;

    const wrap = document.createElement('div');
    wrap.id = BUTTON_ID;
    wrap.style.display = 'flex';
    wrap.style.justifyContent = 'flex-end';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Editar textos dos envios';
    Object.assign(button.style, {
      border: '1px solid rgba(245,158,11,.55)',
      borderRadius: '10px',
      padding: '9px 13px',
      background: 'rgba(245,158,11,.14)',
      color: '#fbbf24',
      fontSize: '12px',
      fontWeight: '900',
      cursor: 'pointer',
    });
    button.addEventListener('click', openEditor);
    wrap.appendChild(button);
    page.insertBefore(wrap, page.firstChild);
  }

  const previousOpen = window.open;
  if (typeof previousOpen === 'function') {
    window.open = function h2CommissionTextEditorWindowOpen(url, target, features) {
      return previousOpen.call(window, rebuildWhatsappUrl(url), target, features);
    };
  }

  function repairAnchor(event) {
    if (!onCommissionPage()) return;
    const target = event.target;
    const anchor = target && typeof target.closest === 'function'
      ? target.closest('a[href*="wa.me/"]')
      : null;
    if (!anchor) return;
    const next = rebuildWhatsappUrl(anchor.href);
    if (typeof next === 'string' && next !== anchor.href) anchor.href = next;
  }

  document.addEventListener('pointerdown', repairAnchor, true);
  document.addEventListener('click', repairAnchor, true);

  async function boot() {
    ensureButton();
    if (onCommissionPage()) {
      try {
        await loadTemplates(false);
      } catch (error) {
        console.warn('[H2 Commission Text Editor] usando textos padrao ate conseguir carregar o banco:', error);
      }
    }

    const root = document.getElementById('root');
    if (root) new MutationObserver(ensureButton).observe(root, { childList: true, subtree: true });
    window.addEventListener('popstate', () => setTimeout(ensureButton, 30));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else void boot();

  window.__H2_COMMISSION_TEXT_EDITOR__ = VERSION;
})();
