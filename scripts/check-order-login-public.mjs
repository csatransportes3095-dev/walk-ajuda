// Read-only smoke test: public assets and rejection of unauthenticated access.
// Never logs in, retrieves customer data, changes settings or triggers a deploy.
import { setTimeout as sleep } from 'node:timers/promises';
const origin = 'https://h2colombiano.com';
const get = async path => {
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error('Unexpected asset origin');
  url.searchParams.set('login_release_check', process.env.GITHUB_SHA || 'manual');
  return fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
};
for (let attempt = 1; attempt <= 25; attempt++) {
  try {
    const page = await get('/acompanhar');
    if (!page.ok) throw new Error(`Tracking HTTP ${page.status}`);
    const html = await page.text();
    const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1]);
    const asset = sources.find(src => /\/assets\/.*\.js(?:\?|$)/.test(src));
    if (!asset) throw new Error('Application asset not found');
    const script = await get(asset);
    if (!script.ok) throw new Error(`Asset HTTP ${script.status}`);
    const text = await script.text();
    if (!['order-login-fields-grid', 'cnhCode', 'getGlobalGroup'].every(marker => text.includes(marker))) throw new Error('Previous application bundle is still served');
    const admin = await get('/admin/orders');
    if (!admin.ok) throw new Error(`Admin entry HTTP ${admin.status}`);
    const denied = await get('/api/trpc/loginData.getGlobalGroup');
    if (![401, 403].includes(denied.status)) throw new Error(`Global group route rejection: HTTP ${denied.status}`);
    console.log(JSON.stringify({ verifiedAt: new Date().toISOString(), trackingHttp: page.status, adminEntryHttp: admin.status, applicationAsset: asset, newLoginFieldsPresent: true, globalGroupUnauthenticatedHttp: denied.status, scope: 'Public assets only; authenticated customer flow tested in isolated CI database.' }, null, 2));
    process.exit(0);
  } catch (error) {
    console.log(`Deployment check ${attempt}/25: ${error.message}`);
  }
  if (attempt < 25) await sleep(20000);
}
throw new Error('New public deployment was not confirmed within the check window.');
