(() => {
  'use strict';

  const VERSION = '3.0.0';
  const REPLACEMENT = '\uFFFD';
  const ICON = {
    paid: String.fromCodePoint(0x2705),
    party: String.fromCodePoint(0x1f389),
    card: String.fromCodePoint(0x1f4b3),
    user: String.fromCodePoint(0x1f464),
    phone: String.fromCodePoint(0x1f4f1),
    money: String.fromCodePoint(0x1f4b0),
  };

  function isCommissionText(text) {
    return /INDICA|DADOS PARA PAGAMENTO|Cliente indicado:|Telefone:|Valor pago:|Valor da comiss|COMISS/.test(text);
  }

  function repairCommissionText(value) {
    let text = String(value ?? '');
    if (!text.includes(REPLACEMENT) || !isCommissionText(text)) return text;

    text = text.replace(/\uFFFD{2,}/g, REPLACEMENT);

    text = text
      .replace(/\uFFFD(?=\s*\*?INDICA)/g, ICON.party)
      .replace(/\uFFFD(?=\s*\*?DADOS PARA PAGAMENTO)/g, ICON.card)
      .replace(/\uFFFD(?=\s*\*?COMISS)/g, ICON.paid)
      .replace(/\uFFFD(?=\s*\*?Cliente indicado:)/gi, ICON.user)
      .replace(/\uFFFD(?=\s*\*?Telefone:)/gi, ICON.phone)
      .replace(/\uFFFD(?=\s*\*?Valor pago:)/gi, ICON.money)
      .replace(/\uFFFD(?=\s*\*?Valor da comiss)/gi, ICON.money)
      .replace(/\uFFFD(?=\s*\*?Comiss)/g, ICON.money)
      .replace(/\uFFFD(?=\s*\*?Pagamento da comiss)/gi, ICON.paid)
      .replace(/(Obrigado pela indica[^!\n]*!\s*)\uFFFD/gi, `$1${ICON.party}`);

    return text.replace(/\uFFFD/g, '');
  }

  function repairWhatsappUrl(input) {
    if (input == null) return input;

    const raw = String(input);
    if (!raw.includes('wa.me/')) return input;

    try {
      const url = new URL(raw, window.location.href);
      if (url.hostname !== 'wa.me') return input;

      const text = url.searchParams.get('text');
      if (!text || !text.includes(REPLACEMENT) || !isCommissionText(text)) return input;

      const repaired = repairCommissionText(text);
      url.search = `?text=${encodeURIComponent(repaired)}`;
      console.info(`[H2 Commission WhatsApp Guard ${VERSION}] payload reparado antes de abrir o WhatsApp.`);
      return url.toString();
    } catch (_) {
      return input;
    }
  }

  const nativeOpen = window.open;
  if (typeof nativeOpen === 'function') {
    window.open = function patchedWindowOpen(url, target, features) {
      return nativeOpen.call(window, repairWhatsappUrl(url), target, features);
    };
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    const anchor = target && typeof target.closest === 'function'
      ? target.closest('a[href*="wa.me/"]')
      : null;
    if (!anchor) return;

    const repaired = repairWhatsappUrl(anchor.href);
    if (typeof repaired === 'string' && repaired !== anchor.href) {
      anchor.href = repaired;
    }
  }, true);

  window.__H2_COMMISSION_WA_GUARD__ = VERSION;
})();
