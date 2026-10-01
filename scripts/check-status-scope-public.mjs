// Read-only release check. No customer identifiers, login sessions or writes.
import { setTimeout as sleep } from 'node:timers/promises';
const origin = 'https://h2colombiano.com';
async function get(path) {
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error('Unexpected origin');
  url.searchParams.set('scope_release_check', process.env.GITHUB_SHA || 'manual');
  return fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
}
function data(body) { return body?.result?.data?.json ?? body?.result?.data; }
for (let attempt = 1; attempt <= 25; attempt++) {
  try {
    const page = await get('/admin/status-types');
    if (!page.ok) throw new Error(`Status page HTTP ${page.status}`);
    const html = await page.text();
    const asset = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(m=>m[1]).find(p=>/\/assets\/.*\.js(?:\?|$)/.test(p));
    if (!asset) throw new Error('Application script missing');
    const script = await get(asset); if(!script.ok) throw new Error('Bundle unavailable');
    const bundle = await script.text();
    if (!['scopeReport','Retirar do global','Restaurar cadastro'].every(marker=>bundle.includes(marker))) throw new Error('Old application bundle');
    const statuses = await get('/api/trpc/statusTypes.list');
    if(!statuses.ok) throw new Error(`Catalogue HTTP ${statuses.status}`);
    const catalogue=data(await statuses.json());
    if(!Array.isArray(catalogue) || !catalogue.length || !catalogue.every(s=>s.isGlobal===0 || s.isGlobal===1)) throw new Error('New scope schema unavailable');
    const progress = await get('/api/trpc/statusTypes.getProgressSequence');
    if(!progress.ok) throw new Error('Global progress unavailable');
    const sequence = data(await progress.json());
    if(!Array.isArray(sequence?.keys)) throw new Error('Global progress response unexpected');
    const exclusive = new Set(catalogue.filter(s=>s.isGlobal===0).map(s=>s.key));
    if(sequence.keys.some(key=>exclusive.has(key))) throw new Error('Exclusive status leaked into global progress');
    const tracking=await get('/acompanhar'); if(!tracking.ok) throw new Error(`Tracking HTTP ${tracking.status}`);
    const protectedRoute=await get('/api/trpc/statusTypes.scopeReport');
    if(![401,403].includes(protectedRoute.status)) throw new Error(`Scope report not protected: ${protectedRoute.status}`);
    console.log(JSON.stringify({verifiedAt:new Date().toISOString(), applicationAsset:asset, statusPageHttp:page.status, trackingHttp:tracking.status, catalogueScopePresent:true, exclusiveStatusCount:exclusive.size, exclusiveStatusInGlobalProgress:false, anonymousScopeReportHttp:protectedRoute.status, scope:'Public UI/schema only; writes and customer flows tested in isolated MySQL.'},null,2));
    process.exit(0);
  } catch(error) { console.log(`Scope check ${attempt}/25: ${error.message}`); }
  if(attempt<25) await sleep(20000);
}
throw new Error('Status scope deployment not confirmed in the check window.');
