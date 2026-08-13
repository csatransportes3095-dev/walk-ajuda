import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const [app, portal, admin, hub, manifest, sw, globalManifest] = await Promise.all([
  read('../client/src/App.tsx'), read('../client/src/pages/LocadoraPortal.tsx'), read('../client/src/pages/AdminLocadora.tsx'), read('../client/src/pages/AdminHubCentral.tsx'), read('../client/public/locadora/manifest-v1.webmanifest'), read('../client/public/sw.js'), read('../client/public/manifest.json'),
]);
const assets = [
  '../client/public/locadora/assets/locacar-logo-full-v1.webp', '../client/public/locadora/assets/locacar-logo-header-v1.webp', '../client/public/locadora/assets/locacar-icon-192-v1.png', '../client/public/locadora/assets/locacar-icon-512-v1.png', '../client/public/locadora/assets/locacar-icon-maskable-512-v1.png', '../client/public/locadora/assets/locacar-apple-touch-icon-v1.png', '../client/public/locadora/assets/locacar-favicon-32-v1.png',
];
await Promise.all(assets.map((p) => access(new URL(p, import.meta.url))));
const checks = [];
function check(name, value) { assert.ok(value, name); checks.push(name); }
check('Manifest LocaCar tem nome oficial', manifest.includes('LocaCar — Sistema de Locação'));
check('Manifest LocaCar usa escopo isolado', manifest.includes('"scope": "/locadora/"') && manifest.includes('"start_url": "/locadora/"'));
check('Manifest LocaCar usa ícones próprios versionados', manifest.includes('/locadora/assets/locacar-icon-192-v1.png') && manifest.includes('maskable'));
check('PWA H2 global permanece H2', globalManifest.includes('H2 COLOMBIANO') && !globalManifest.includes('LocaCar'));
check('Service worker global não recebeu identidade LocaCar', !sw.includes('LocaCar') && sw.includes("walk-ajuda-v104"));
check('App troca manifest somente nas rotas LocaCar', app.includes('isLocadoraBrandRoute') && app.includes('/locadora/manifest-v1.webmanifest'));
check('Portal usa logo completo oficial', portal.includes('locacar-logo-full-v1.webp'));
check('Painel usa ícone reduzido oficial', admin.includes('locacar-icon-192-v1.png'));
check('Card ADM usa miniatura oficial', hub.includes('locacar-icon-192-v1.png'));
console.log(`[locadora-brand] ${checks.length} validações aprovadas.`);
for (const item of checks) console.log(`OK: ${item}`);
