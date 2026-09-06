(() => {
  'use strict';

  const originalFetch = window.fetch.bind(window);
  const CHECK_MARKERS = ['adCampaigns.checkForPage', 'adCampaigns.checkForClient'];
  const STORAGE_PREFIX = 'h2_ad_frequency_v2';

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
  const campaignVersion = (campaign) => {
    const raw = campaign?.updatedAt || campaign?.createdAt || '';
    return String(raw).replace(/[^0-9A-Za-z_-]/g, '').slice(0, 48) || 'base';
  };
  const keyBase = (campaign) => `${STORAGE_PREFIX}_${campaignId(campaign)}_${campaignVersion(campaign)}`;
  const onceKey = (campaign) => `${keyBase(campaign)}_once`;
  const accessKey = (campaign) => `${keyBase(campaign)}_access`;
  const customKey = (campaign) => `${keyBase(campaign)}_custom`;

  const frequencyOf = (campaign) => String(campaign?.frequency || 'every_access').trim().toLowerCase();

  const isEligible = (campaign) => {
    if (!campaign || !campaignId(campaign)) return false;
    const frequency = frequencyOf(campaign);

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
    const frequency = frequencyOf(campaign);
    if (frequency === 'once') safeLocalSet(onceKey(campaign), '1');
    if (frequency === 'every_access') safeSessionSet(accessKey(campaign), '1');
    if (frequency === 'custom') safeLocalSet(customKey(campaign), String(Date.now()));
  };

  const locateCampaignContainer = (payload) => {
    const entries = Array.isArray(payload) ? payload : [payload];
    for (const entry of entries) {
      const json = entry?.result?.data?.json;
      if (json && Object.prototype.hasOwnProperty.call(json, 'campaign')) return json;
    }
    return null;
  };

  const rewriteCampaignResponse = async (response) => {
    try {
      const payload = await response.clone().json();
      const container = locateCampaignContainer(payload);
      const campaign = container?.campaign;
      if (!campaign) return response;

      if (!isEligible(campaign)) {
        container.campaign = null;
      } else {
        // Marca antes do React abrir o modal. Isso torna "Apenas uma vez" persistente
        // mesmo se a página for atualizada imediatamente ou se a gravação de impressão
        // do backend ainda não tiver terminado.
        markShown(campaign);
      }

      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      headers.delete('content-length');
      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn('[H2 Ads] Falha no controle de frequência:', error);
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
      if (!CHECK_MARKERS.some((marker) => url.includes(marker))) return response;
      return await rewriteCampaignResponse(response);
    } catch (_) {
      return response;
    }
  };
})();
