(() => {
  'use strict';

  const STYLE_ID = 'h2-payment-proof-progress-style';
  const PROGRESS_CLASS = 'h2-payment-proof-progress';
  const ACTIVE_TEXT = ['Preparando comprovante...', 'Enviando comprovante...'];
  const trackers = new Map();

  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${PROGRESS_CLASS} {
        width: 100%;
        margin-top: 8px;
        padding: 8px 10px;
        border: 1px solid rgba(250, 204, 21, 0.35);
        border-radius: 10px;
        background: rgba(10, 10, 10, 0.48);
        box-sizing: border-box;
        pointer-events: none;
      }
      .${PROGRESS_CLASS}__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
        color: #fde68a;
        font-size: 12px;
        font-weight: 800;
      }
      .${PROGRESS_CLASS}__percent {
        min-width: 42px;
        text-align: right;
        color: #facc15;
        font-variant-numeric: tabular-nums;
      }
      .${PROGRESS_CLASS}__track {
        width: 100%;
        height: 7px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.10);
      }
      .${PROGRESS_CLASS}__bar {
        width: 4%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #eab308, #f59e0b, #fde047);
        transition: width 420ms ease-out;
        box-shadow: 0 0 10px rgba(250, 204, 21, 0.35);
      }
    `;
    document.head.appendChild(style);
  };

  const isActiveLabel = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const text = (element.textContent || '').trim();
    return ACTIVE_TEXT.some(label => text.includes(label));
  };

  const stageFor = (element) => {
    const text = (element.textContent || '').trim();
    return text.includes('Preparando comprovante...') ? 'preparing' : 'uploading';
  };

  const stopTracker = (target) => {
    const tracker = trackers.get(target);
    if (!tracker) return;
    window.clearInterval(tracker.timer);
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
        <span>Carregando arquivo...</span>
        <span class="${PROGRESS_CLASS}__percent">4%</span>
      </div>
      <div class="${PROGRESS_CLASS}__track">
        <div class="${PROGRESS_CLASS}__bar"></div>
      </div>
    `;
    target.insertAdjacentElement('afterend', node);

    const percent = node.querySelector(`.${PROGRESS_CLASS}__percent`);
    const bar = node.querySelector(`.${PROGRESS_CLASS}__bar`);
    let value = stageFor(target) === 'preparing' ? 4 : 28;

    const render = () => {
      if (percent) percent.textContent = `${Math.round(value)}%`;
      if (bar) bar.style.width = `${Math.max(4, Math.min(95, value))}%`;
    };
    render();

    const timer = window.setInterval(() => {
      if (!target.isConnected || !isActiveLabel(target)) {
        stopTracker(target);
        return;
      }

      const stage = stageFor(target);
      if (stage === 'uploading' && value < 28) value = 28;
      const ceiling = stage === 'preparing' ? 24 : 95;
      if (value < ceiling) {
        const remaining = ceiling - value;
        const step = Math.max(0.6, Math.min(4, remaining * 0.12));
        value = Math.min(ceiling, value + step);
        render();
      }
    }, 650);

    trackers.set(target, { node, timer });
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
