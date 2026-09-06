(() => {
  'use strict';

  const originalFetch = window.fetch.bind(window);
  const PAGE_CHECK_MARKER = 'adCampaigns.checkForPage';

  const safeLocalGet = (key) => {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  };
  const safeLocalSet = (key, value) => {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  };
  const safeSessionGet = (key) => {
    try { return window.sessionStorage.getItem(key); } catch (_) { return null; }
  };
  const safeSessionSet = (key, value) => {
    try { window.sessionStorage.setItem(key, value); } catch (_) {}
  };

  const campaignId = (campaign) => Number(campaign?.id || 0);
  const onceKey = (campaign) => `h2_ad_once_${campaignId(campaign)}`;
  const accessKey = (campaign) => `h2_ad_access_${campaignId(campaign)}`;
  const customKey = (campaign) => `h2_ad_custom_${campaignId(campaign)}`;

  const isEligible = (campaign) => {
    if (!campaign || !campaignId(campaign)) return false;
    const frequency = String(campaign.frequency || 'every_access');

    if (frequency === 'every_reload') return true;

    if (frequency === 'once') {
      return safeLocalGet(onceKey(campaign)) !== '1';
    }

    if (frequency === 'every_access') {
      return safeSessionGet(accessKey(campaign)) !== '1';
    }

    if (frequency === 'custom') {
      const minutes = Number(campaign.frequencyMinutes || 0);
      if (!Number.isFinite(minutes) || minutes <= 0) return true;
      const lastShownAt = Number(safeLocalGet(customKey(campaign)) || 0);
      if (!lastShownAt) return true;
      return Date.now() - lastShownAt >= minutes * 60 * 1000;
    }

    return true;
  };

  const markShown = (campaign) => {
    if (!campaign || !campaignId(campaign)) return;
    const frequency = String(campaign.frequency || 'every_access');
    if (frequency === 'once') safeLocalSet(onceKey(campaign), '1');
    if (frequency === 'every_access') safeSessionSet(accessKey(campaign), '1');
    if (frequency === 'custom') safeLocalSet(customKey(campaign), String(Date.now()));
  };

  const rewritePageCampaignResponse = async (response) => {
    try {
      const payload = await response.clone().json();
      const entry = Array.isArray(payload) ? payload[0] : payload;
      const json = entry?.result?.data?.json;
      const campaign = json?.campaign;
      if (!campaign) return response;

      if (!isEligible(campaign)) {
        json.campaign = null;
      } else {
        // Marca no momento em que o backend autorizou a exibição. Assim uma segunda
        // consulta da mesma página/sessão não reabre a propaganda configurada como
        // "Apenas uma vez" ou "A cada acesso".
        markShown(campaign);
      }

      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn('[H2 Ads] Falha ao aplicar controle local de frequência:', error);
      return response;
    }
  };

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const source = args[0];
      const url = typeof source === 'string'
        ? source
        : source instanceof Request
          ? source.url
          : String(source || '');
      if (!url.includes(PAGE_CHECK_MARKER)) return response;
      return await rewritePageCampaignResponse(response);
    } catch (_) {
      return response;
    }
  };
})();
