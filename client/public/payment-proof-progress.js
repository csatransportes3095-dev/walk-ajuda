(() => {
  'use strict';

  const STYLE_ID = 'h2-payment-proof-progress-style';
  const PROGRESS_CLASS = 'h2-payment-proof-progress';
  const ACTIVE_TEXT = ['Preparando comprovante...', 'Enviando comprovante...'];
  const trackers = new Map();
  let lastDetail = null;

  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${PROGRESS_CLASS} {
        width: 100%;
        margin-top: 8px;
        padding: 10px 12px;
        border: 1px solid rgba(250, 204, 21, 0.35);
        border-radius: 10px;
        background: rgba(10, 10, 10, 0.48);
        box-sizing: border-box;
        pointer-events: none;
      }
      .${PROGRESS_CLASS}__row {
        display: flex;
        align-items: center;
        gap: 9px;
        color: #fde68a;
        font-size: 12px;
        font-weight: 800;
      }
      .${PROGRESS_CLASS}__dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: #facc15;
        box-shadow: 0 0 10px rgba(250, 204, 21, 0.7);
        animation: h2UploadPulse 1s ease-in-out infinite;
      }
      .${PROGRESS_CLASS}__sub {
        margin-top: 5px;
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.35;
      }
      @keyframes h2UploadPulse {
        0%,100% { opacity: .35; transform: scale(.85); }
        50% { opacity: 1; transform: scale(1.15); }
      }
    `;
    document.head.appendChild(style);
  };

  const isActiveLabel = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const text = (element.textContent || '').trim();
    return ACTIVE_TEXT.some(label => text.includes(label));
  };

  const describeStage = (detail) => {
    if (!detail) return { title: 'Preparando arquivo...', sub: 'Aguarde alguns segundos.' };
    if (detail.stage === 'preparing') return { title: 'Preparando arquivo...', sub: 'Reduzindo a imagem para ocupar menos espaço.' };
    if (detail.stage === 'uploading') return { title: 'Enviando comprovante...', sub: 'Transferindo o arquivo com segurança.' };
    if (detail.stage === 'retrying') return { title: 'Tentando novamente...', sub: `Nova tentativa automática${detail.attempt ? ` (${detail.attempt}/4)` : ''}.` };
    if (detail.stage === 'confirming') return { title: 'Confirmando envio...', sub: 'O servidor está validando e gerando a URL do arquivo.' };
    if (detail.stage === 'uploaded') return { title: 'Comprovante enviado.', sub: 'Arquivo armazenado e URL confirmada.' };
    if (detail.stage === 'failed') return { title: 'Não foi possível concluir.', sub: detail.message || 'Tente enviar novamente.' };
    return { title: 'Processando comprovante...', sub: 'Aguarde.' };
  };

  const renderTracker = (tracker) => {
    const text = describeStage(lastDetail);
    const title = tracker.node.querySelector(`.${PROGRESS_CLASS}__title`);
    const sub = tracker.node.querySelector(`.${PROGRESS_CLASS}__sub`);
    if (title) title.textContent = text.title;
    if (sub) sub.textContent = text.sub;
  };

  const stopTracker = (target) => {
    const tracker = trackers.get(target);
    if (!tracker) return;
    tracker.node.remove();
    trackers.delete(target);
  };

  const startTracker = (target) => {
    if (trackers.has(target)) return;
    const node = document.createElement('div');
    node.className = PROGRESS_CLASS;
    node.setAttribute('aria-live', 'polite');
    node.innerHTML = `
      <div class="${PROGRESS_CLASS}__row">
        <span class="${PROGRESS_CLASS}__dot"></span>
        <span class="${PROGRESS_CLASS}__title">Preparando arquivo...</span>
      </div>
      <div class="${PROGRESS_CLASS}__sub">Aguarde alguns segundos.</div>
    `;
    target.insertAdjacentElement('afterend', node);
    const tracker = { node };
    trackers.set(target, tracker);
    renderTracker(tracker);
  };

  const scan = () => {
    injectStyle();
    document.querySelectorAll('p').forEach((element) => {
      if (isActiveLabel(element)) startTracker(element);
    });
    trackers.forEach((_tracker, target) => {
      if (!target.isConnected || !isActiveLabel(target)) stopTracker(target);
    });
  };

  window.addEventListener('h2-order-upload-progress', (event) => {
    lastDetail = event.detail || null;
    trackers.forEach((tracker) => renderTracker(tracker));
  });

  const observer = new MutationObserver(scan);
  const boot = () => {
    scan();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
