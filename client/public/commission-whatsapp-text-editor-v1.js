(() => {
  'use strict';

  if (window.__H2_COMMISSION_TEXT_EDITOR__) return;

  const VERSION = '3.0.0';
  const PAGE_PREFIX = '/admin/commissions';
  const BUTTON_ID = 'h2-commission-text-editor-button';
  const MODAL_ID = 'h2-commission-text-editor-modal';

  const ICON = {
    paid: String.fromCodePoint(0x2705),
    party: String.fromCodePoint(0x1f389),
    card: String.fromCodePoint(0x1f4b3),
    user: String.fromCodePoint(0x1f464),
    phone: String.fromCodePoint(0x1f4f1),
    money: String.fromCodePoint(0x1f4b0),
  };

  const DEFAULTS = {
    confirmed: [
      `${ICON.party} *INDICAÇÃO CONFIRMADA*`,
      '',
      'Olá, {indicador}!',
      '',
      'Sua indicação deu certo.',
      '',
      `${ICON.user} *Cliente indicado:* {cliente}`,
      `${ICON.phone} *Telefone:* {telefone}`,
      '{comissao}',
      '',
      '{status_pagamento}',
      '',
      `Obrigado pela indicação! ${ICON.party}`,
    ].join('\n'),
    pix: [
      `${ICON.card} *DADOS PARA PAGAMENTO DA COMISSÃO*`,
      '',
      'Olá, {indicador}!',
      '',
      'Sua comissão está pronta para pagamento.',
      '{valor_comissao}',
      '',
      'Por favor, envie sua *chave PIX* para realizarmos o pagamento.',
      '',
      'Obrigado!',
    ].join('\n'),
    paid: [
      `${ICON.paid} *COMISSÃO PAGA*`,
      '',
      'Olá, {indicador}!',
      '',
      'Sua comissão foi paga com sucesso.',
      `${ICON.user} *Cliente indicado:* {cliente}`,
      '{valor_pago}',
      '',
      `Obrigado pela indicação! ${ICON.party}`,
    ].join('\n'),
  };

  const state = {
    loaded: false,
    loading: null,
    messages: { ...DEFAULTS },
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
    const payload = await response.json();
    const envelope = normalizeApiResponse(payload);
    const serverError = envelope?.error?.json?.message || envelope?.error?.message;

    if (!response.ok || serverError) {
      throw new Error(serverError || `Erro ${response.status}.`);
    }

    return envelope?.result?.data?.json ?? envelope?.result?.data ?? null;
  }

  function notify(message, isError = false) {
    document.getElementById('h2-commission-editor-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'h2-commission-editor-toast';
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483647',
      maxWidth: '390px', padding: '12px 16px', borderRadius: '12px',
      fontFamily: 'Arial,sans-serif', fontSize: '13px', fontWeight: '800',
      color: '#fff', background: isError ? '#991b1b' : '#166534',
      boxShadow: '0 12px 35px rgba(0,0,0,.4)',
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
  }

  async function loadTemplates(force = false) {
    if (state.loaded && !force) return state.messages;
    if (state.loading && !force) return state.loading;

    state.loading = trpc('whatsappTemplates.commissionTemplates', null, 'GET')
      .then((data) => {
        state.messages = {
          confirmed: String(data?.confirmed || DEFAULTS.confirmed),
          pix: String(data?.pix || DEFAULTS.pix),
          paid: String(data?.paid || DEFAULTS.paid),
        };
        state.loaded = true;
        return state.messages;
      })
      .finally(() => { state.loading = null; });

    return state.loading;
  }

  async function saveTemplates(next) {
    const data = await trpc('whatsappTemplates.saveCommissionTemplates', next, 'POST');
    state.messages = { ...data.templates };
    state.loaded = true;
  }

  async function requestServerWhatsappUrl(sourceUrl) {
    const data = await trpc('whatsappTemplates.buildCommissionWhatsappUrl', { sourceUrl: String(sourceUrl) }, 'POST');
    const url = String(data?.url || '');

    if (!url.startsWith('https://wa.me/') || /[^\x00-\x7F]/.test(url)) {
      throw new Error('O servidor não devolveu uma URL WhatsApp ASCII válida.');
    }

    return url;
  }

  function isCommissionWhatsappUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(String(value), location.href);
      if (url.hostname !== 'wa.me') return false;
      const text = url.searchParams.get('text') || '';
      const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      return plain.includes('INDICACAO CONFIRMADA') ||
        plain.includes('DADOS PARA PAGAMENTO DA COMISSAO') ||
        plain.includes('COMISSAO PAGA');
    } catch (_) {
      return false;
    }
  }

  function modalStyles() {
    if (document.getElementById('h2-commission-editor-style')) return;
    const style = document.createElement('style');
    style.id = 'h2-commission-editor-style';
    style.textContent = `
      #${MODAL_ID}{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.78);display:flex;align-items:flex-start;justify-content:center;padding:22px 12px;overflow:auto;font-family:Arial,sans-serif}
      #${MODAL_ID} .box{width:min(760px,100%);background:#0b1220;color:#f8fafc;border:1px solid #334155;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.6);overflow:hidden}
      #${MODAL_ID} .head{padding:18px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between;gap:12px}
      #${MODAL_ID} .title{font-size:18px;font-weight:900;margin:0}
      #${MODAL_ID} .close{border:1px solid #475569;background:#111827;color:#e2e8f0;border-radius:9px;padding:8px 12px;font-weight:800;cursor:pointer}
      #${MODAL_ID} .body{padding:18px 20px;display:flex;flex-direction:column;gap:18px}
      #${MODAL_ID} .safe{border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.08);color:#bbf7d0;border-radius:12px;padding:10px 12px;font-size:11px;line-height:1.5}
      #${MODAL_ID} .section{display:flex;flex-direction:column;gap:7px}
      #${MODAL_ID} .label{font-size:13px;font-weight:900;color:#fbbf24}
      #${MODAL_ID} .help{font-size:11px;line-height:1.4;color:#94a3b8}
      #${MODAL_ID} textarea{width:100%;box-sizing:border-box;min-height:170px;resize:vertical;border:1px solid #475569;border-radius:12px;background:#020617;color:#f8fafc;padding:12px;font:500 13px/1.5 Arial,sans-serif;outline:none}
      #${MODAL_ID} textarea:focus{border-color:#f59e0b;box-shadow:0 0 0 2px rgba(245,158,11,.2)}
      #${MODAL_ID} .actions{padding:16px 20px;border-top:1px solid #334155;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
      #${MODAL_ID} .action{border:0;border-radius:10px;padding:10px 15px;font-weight:900;cursor:pointer}
      #${MODAL_ID} .restore{background:#334155;color:#f8fafc;margin-right:auto}
      #${MODAL_ID} .cancel{background:#475569;color:#fff}
      #${MODAL_ID} .save{background:#f59e0b;color:#111827}
      #${MODAL_ID} .save:disabled{opacity:.55;cursor:wait}
    `;
    document.head.appendChild(style);
  }

  function editorSection(label, help, type) {
    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = `<div class="label">${label}</div><div class="help">${help}</div>`;
    const textarea = document.createElement('textarea');
    textarea.dataset.templateType = type;
    textarea.value = state.messages[type] || DEFAULTS[type];
    section.appendChild(textarea);
    return section;
  }

  async function openEditor() {
    if (document.getElementById(MODAL_ID)) return;

    try {
      await loadTemplates(false);
    } catch (error) {
      notify(error?.message || 'Falha ao carregar os textos.', true);
      return;
    }

    modalStyles();
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;

    const box = document.createElement('div');
    box.className = 'box';

    const head = document.createElement('div');
    head.className = 'head';
    const title = document.createElement('h2');
    title.className = 'title';
    title.textContent = 'Editar textos dos envios';
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = 'Fechar';
    close.onclick = () => overlay.remove();
    head.append(title, close);

    const body = document.createElement('div');
    body.className = 'body';
    const safe = document.createElement('div');
    safe.className = 'safe';
    safe.textContent = 'Novo fluxo: o texto é validado e salvo no servidor; no envio, o servidor lê o template do banco, monta a mensagem, valida Unicode, faz o encode uma única vez e devolve ao navegador somente uma URL ASCII do WhatsApp.';
    body.append(
      safe,
      editorSection('INDICAÇÃO CONFIRMADA', 'Variáveis: {indicador}, {cliente}, {telefone}, {comissao}, {status_pagamento}', 'confirmed'),
      editorSection('PEDIR PIX', 'Variáveis: {indicador}, {valor_comissao}', 'pix'),
      editorSection('COMISSÃO PAGA', 'Variáveis: {indicador}, {cliente}, {valor_pago}', 'paid'),
    );

    const actions = document.createElement('div');
    actions.className = 'actions';

    const restore = document.createElement('button');
    restore.className = 'action restore';
    restore.textContent = 'Restaurar padrões';
    restore.onclick = () => {
      for (const type of ['confirmed', 'pix', 'paid']) {
        const area = body.querySelector(`textarea[data-template-type="${type}"]`);
        if (area) area.value = DEFAULTS[type];
      }
    };

    const cancel = document.createElement('button');
    cancel.className = 'action cancel';
    cancel.textContent = 'Cancelar';
    cancel.onclick = () => overlay.remove();

    const save = document.createElement('button');
    save.className = 'action save';
    save.textContent = 'Salvar textos';
    save.onclick = async () => {
      const next = {};
      for (const type of ['confirmed', 'pix', 'paid']) {
        next[type] = String(body.querySelector(`textarea[data-template-type="${type}"]`)?.value || '').trim();
        if (!next[type]) {
          notify('Nenhum texto pode ficar vazio.', true);
          return;
        }
      }

      save.disabled = true;
      save.textContent = 'Validando e salvando...';
      try {
        await saveTemplates(next);
        notify('Textos salvos e validados em UTF-8 pelo servidor.');
        overlay.remove();
      } catch (error) {
        notify(error?.message || 'Falha ao salvar os textos.', true);
        save.disabled = false;
        save.textContent = 'Salvar textos';
      }
    };

    actions.append(restore, cancel, save);
    box.append(head, body, actions);
    overlay.appendChild(box);
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
      border: '1px solid rgba(245,158,11,.55)', borderRadius: '10px', padding: '9px 13px',
      background: 'rgba(245,158,11,.14)', color: '#fbbf24', fontSize: '12px',
      fontWeight: '900', cursor: 'pointer',
    });
    button.addEventListener('click', openEditor);
    wrap.appendChild(button);
    page.insertBefore(wrap, page.firstChild);
  }

  const nativeOpen = window.open.bind(window);
  window.open = function h2CommissionServerWindowOpen(url, target, features) {
    if (!onCommissionPage() || !isCommissionWhatsappUrl(url)) {
      return nativeOpen(url, target, features);
    }

    const pending = nativeOpen('about:blank', target || '_blank', features);
    if (pending?.document) {
      pending.document.title = 'Preparando WhatsApp';
      pending.document.body.innerHTML = '<p style="font-family:Arial;padding:20px">Preparando mensagem segura...</p>';
    }

    requestServerWhatsappUrl(url)
      .then((safeUrl) => {
        if (pending && !pending.closed) pending.location.replace(safeUrl);
        else nativeOpen(safeUrl, '_blank', 'noopener,noreferrer');
      })
      .catch((error) => {
        if (pending && !pending.closed) pending.close();
        notify(error?.message || 'O envio foi bloqueado por falha de integridade Unicode.', true);
      });

    return pending;
  };

  document.addEventListener('click', (event) => {
    if (!onCommissionPage()) return;
    const anchor = event.target?.closest?.('a[href*="wa.me/"]');
    if (!anchor || !isCommissionWhatsappUrl(anchor.href)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const pending = nativeOpen('about:blank', '_blank', 'noopener,noreferrer');
    requestServerWhatsappUrl(anchor.href)
      .then((safeUrl) => {
        if (pending && !pending.closed) pending.location.replace(safeUrl);
        else nativeOpen(safeUrl, '_blank', 'noopener,noreferrer');
      })
      .catch((error) => {
        if (pending && !pending.closed) pending.close();
        notify(error?.message || 'O envio foi bloqueado por falha de integridade Unicode.', true);
      });
  }, true);

  async function boot() {
    ensureButton();
    if (onCommissionPage()) {
      try { await loadTemplates(false); } catch (_) {}
    }
    const root = document.getElementById('root');
    if (root) new MutationObserver(ensureButton).observe(root, { childList: true, subtree: true });
  }

  window.__H2_COMMISSION_TEXT_EDITOR__ = VERSION;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else void boot();
})();
