(() => {
  'use strict';

  const STORAGE_KEY = 'h2.customers.approvedNew.v1';
  const RELEASE_AT = new Date('2026-09-08T01:33:00-03:00').getTime();
  const STYLE_ID = 'h2-customer-new-approval-style';
  let scheduled = false;

  function readApproved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveApproved(set) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set))); } catch (_) {}
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes h2CustomerNewPulse {
        0%, 100% { box-shadow: 0 0 0 2px rgba(250,204,21,.92), 0 0 14px rgba(250,204,21,.35); transform: translateZ(0) scale(1); }
        50% { box-shadow: 0 0 0 4px rgba(239,68,68,.98), 0 0 34px rgba(239,68,68,.72), 0 0 58px rgba(250,204,21,.35); transform: translateZ(0) scale(1.006); }
      }
      .h2-customer-new-pulse {
        animation: h2CustomerNewPulse 1.15s ease-in-out infinite !important;
        border-color: rgba(250,204,21,.95) !important;
        position: relative !important;
        z-index: 1;
      }
      .h2-customer-new-banner {
        display:flex; align-items:center; justify-content:space-between; gap:8px;
        margin: 0 0 10px 0; padding: 8px 10px; border-radius: 10px;
        border: 1px solid rgba(250,204,21,.72); background: linear-gradient(90deg, rgba(127,29,29,.94), rgba(120,53,15,.94));
        color:#fff; font: 900 11px/1.1 Arial, sans-serif; letter-spacing:.04em;
      }
      .h2-customer-new-banner button {
        border:0; border-radius:8px; padding:7px 10px; cursor:pointer;
        background:#22c55e; color:#052e16; font:900 10px/1 Arial,sans-serif;
        box-shadow:0 0 14px rgba(34,197,94,.35);
      }
      .h2-customer-approved-badge {
        display:inline-flex; align-items:center; gap:5px; margin:0 0 8px 0; padding:5px 8px;
        border-radius:999px; border:1px solid rgba(34,197,94,.45); background:rgba(34,197,94,.12);
        color:#86efac; font:900 9px/1 Arial,sans-serif; letter-spacing:.04em;
      }
      @media (prefers-reduced-motion: reduce) {
        .h2-customer-new-pulse { animation-duration: 2.2s !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function parseBrazilianDate(text) {
    const match = String(text || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s*,?\s*(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return NaN;
    const [, dd, mm, yyyy, hh, mi, ss] = match;
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`).getTime();
  }

  function customerKey(card) {
    const text = card.innerText || '';
    const numberMatch = text.match(/\*(\d{1,9})\b/);
    if (numberMatch) return `n:${numberMatch[1]}`;
    const phoneMatch = text.match(/\b(\d{10,13})\b/);
    return phoneMatch ? `p:${phoneMatch[1]}` : '';
  }

  function findCreatedAt(card) {
    const text = card.innerText || '';
    const cadastroIndex = text.indexOf('Cadastro:');
    if (cadastroIndex < 0) return NaN;
    return parseBrazilianDate(text.slice(cadastroIndex, cadastroIndex + 90));
  }

  function locateCards() {
    const leaves = Array.from(document.querySelectorAll('span, p, div')).filter((el) => {
      const own = (el.textContent || '').trim();
      return own === 'Cadastro:' || own.startsWith('Cadastro:');
    });
    const cards = [];
    for (const leaf of leaves) {
      let node = leaf.parentElement;
      let found = null;
      for (let i = 0; node && i < 10; i += 1, node = node.parentElement) {
        const text = node.innerText || '';
        const cls = String(node.className || '');
        if (text.includes('Rotas de acesso') && text.includes('Cadastro:') && /border/.test(cls) && /rounded/.test(cls)) {
          found = node;
          break;
        }
      }
      if (found && !cards.includes(found)) cards.push(found);
    }
    return cards;
  }

  function apply() {
    ensureStyle();
    const approved = readApproved();
    for (const card of locateCards()) {
      const key = customerKey(card);
      const createdAt = findCreatedAt(card);
      if (!key || !Number.isFinite(createdAt)) continue;

      card.dataset.h2CustomerApprovalKey = key;
      const isNew = createdAt >= RELEASE_AT;
      const isApproved = approved.has(key);
      const existingBanner = card.querySelector(':scope > .h2-customer-new-banner');
      const existingBadge = card.querySelector(':scope > .h2-customer-approved-badge');

      if (isNew && !isApproved) {
        card.classList.add('h2-customer-new-pulse');
        if (existingBadge) existingBadge.remove();
        if (!existingBanner) {
          const banner = document.createElement('div');
          banner.className = 'h2-customer-new-banner';
          banner.innerHTML = '<span>⚠ NOVO CADASTRO — REVISAR</span><button type="button">OK APROVADO</button>';
          banner.querySelector('button')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const next = readApproved();
            next.add(key);
            saveApproved(next);
            card.classList.remove('h2-customer-new-pulse');
            banner.remove();
            apply();
          });
          card.prepend(banner);
        }
      } else {
        card.classList.remove('h2-customer-new-pulse');
        if (existingBanner) existingBanner.remove();
        if (isNew && isApproved && !existingBadge) {
          const badge = document.createElement('div');
          badge.className = 'h2-customer-approved-badge';
          badge.textContent = '✓ OK APROVADO';
          card.prepend(badge);
        }
      }
    }
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; apply(); }, 80);
  }

  new MutationObserver(scheduleApply).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('storage', (event) => { if (event.key === STORAGE_KEY) apply(); });
  window.addEventListener('load', apply, { once: true });
  apply();
})();
