(() => {
  'use strict';

  const STYLE_ID = 'h2-storefront-mobile-parity-style';
  const CARD_CLASS = 'h2-storefront-mobile-card';
  const GRID_CLASS = 'h2-storefront-mobile-grid';
  const PRICE_GRID_CLASS = 'h2-storefront-price-model-grid';

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width: 640px) and (max-width: 1023px) {
        .${GRID_CLASS} {
          grid-template-columns: minmax(0, 430px) !important;
          justify-content: center !important;
          align-items: stretch !important;
          width: 100% !important;
        }

        .${CARD_CLASS} {
          width: 100% !important;
          max-width: 430px !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
      }

      @media (min-width: 1024px) {
        .${GRID_CLASS} {
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          justify-content: stretch !important;
          align-items: stretch !important;
          width: 100% !important;
        }

        .${CARD_CLASS} {
          width: 100% !important;
          max-width: none !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }
      }

      @media (min-width: 640px) {
        .${CARD_CLASS} .${PRICE_GRID_CLASS} {
          grid-template-columns: minmax(0, 1fr) !important;
        }
      }
    `;
    document.head.appendChild(style);
  };

  const isStorefrontBuyButton = (element) => {
    if (!(element instanceof HTMLButtonElement)) return false;
    return (element.textContent || '').trim() === 'Comprar agora';
  };

  const markStorefront = () => {
    ensureStyle();

    document.querySelectorAll('button').forEach((button) => {
      if (!isStorefrontBuyButton(button)) return;

      const card = button.closest('article');
      if (!(card instanceof HTMLElement)) return;
      card.classList.add(CARD_CLASS);

      const grid = card.parentElement;
      if (grid instanceof HTMLElement && grid.classList.contains('grid')) {
        grid.classList.add(GRID_CLASS);
      }

      card.querySelectorAll('.grid').forEach((candidate) => {
        if (!(candidate instanceof HTMLElement)) return;
        const classes = candidate.getAttribute('class') || '';
        if (classes.includes('sm:grid-cols-3')) {
          candidate.classList.add(PRICE_GRID_CLASS);
        }
      });
    });
  };

  let scheduled = false;
  const scheduleScan = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      markStorefront();
    });
  };

  const boot = () => {
    markStorefront();
    const root = document.getElementById('root') || document.body;
    const observer = new MutationObserver(scheduleScan);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleScan, { passive: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
