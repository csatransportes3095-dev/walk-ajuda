import fs from 'node:fs';

const ordersPath = 'client/src/pages/AdminOrders.tsx';
const authenticatorPath = 'client/src/components/OrderLoginAuthenticatorCode.tsx';
const qrPath = 'client/src/components/AuthenticatorQrAdminField.tsx';
const cssPath = 'client/src/index.css';

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`[admin-orders-mobile-login] trecho não encontrado: ${label}`);
  return source.replace(from, to);
}

function replaceAll(source, from, to, minCount, label) {
  if (source.includes(to)) return source;
  const count = source.split(from).length - 1;
  if (count < minCount) throw new Error(`[admin-orders-mobile-login] ${label}: esperado >= ${minCount}, encontrado ${count}`);
  return source.split(from).join(to);
}

// 1) Escopo apenas dos blocos de login dentro do ADM Pedidos.
let orders = fs.readFileSync(ordersPath, 'utf8');
orders = replaceAll(
  orders,
  'className="bg-lime-500/5 border border-lime-500/30 rounded-lg p-3 space-y-3"',
  'className="admin-order-login-mobile min-w-0 max-w-full overflow-hidden bg-lime-500/5 border border-lime-500/30 rounded-lg p-3 space-y-3"',
  3,
  'marcação responsiva dos blocos Dados de Login',
);
fs.writeFileSync(ordersPath, orders);

// 2) Autenticador privado: código, copiar e excluir não podem ultrapassar o card no celular.
let auth = fs.readFileSync(authenticatorPath, 'utf8');
auth = replaceOnce(
  auth,
  'className="rounded-xl border border-cyan-300/30 bg-cyan-400/[0.07] p-3"',
  'className="min-w-0 max-w-full overflow-hidden rounded-xl border border-cyan-300/30 bg-cyan-400/[0.07] p-3"',
  'container do autenticador',
);
auth = replaceOnce(
  auth,
  'className="flex w-full items-center gap-2 rounded-lg border border-cyan-300/20 bg-slate-950/70 px-3 py-2"',
  'className="flex w-full min-w-0 flex-col gap-2 rounded-lg border border-cyan-300/20 bg-slate-950/70 px-3 py-2 sm:flex-row sm:items-center"',
  'linha do código autenticador',
);
auth = replaceOnce(
  auth,
  'className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left hover:opacity-90 disabled:cursor-default"',
  'className="flex w-full min-w-0 flex-1 flex-col items-stretch gap-2 text-left hover:opacity-90 disabled:cursor-default sm:flex-row sm:items-center sm:justify-between"',
  'botão/copiar autenticador',
);
auth = replaceOnce(
  auth,
  'className="flex shrink-0 items-center gap-2 font-mono text-xl font-black tracking-[0.18em] text-cyan-100"',
  'className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 font-mono text-lg font-black tracking-[0.12em] text-cyan-100 sm:w-auto sm:shrink-0 sm:text-xl sm:tracking-[0.18em]"',
  'código autenticador responsivo',
);
auth = replaceOnce(
  auth,
  'className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20 disabled:opacity-40"',
  'className="w-full shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20 disabled:opacity-40 sm:w-auto"',
  'excluir autenticador responsivo',
);
auth = replaceOnce(
  auth,
  'className="mt-3 rounded-lg border border-cyan-300/15 bg-slate-950/60 p-3"',
  'className="mt-3 min-w-0 max-w-full overflow-hidden rounded-lg border border-cyan-300/15 bg-slate-950/60 p-3"',
  'criar autenticador responsivo',
);
auth = replaceOnce(
  auth,
  'className="flex rounded-lg border border-white/10 bg-black/30 focus-within:border-cyan-300/50"',
  'className="flex min-w-0 max-w-full rounded-lg border border-white/10 bg-black/30 focus-within:border-cyan-300/50"',
  'campo Base32 responsivo',
);
auth = replaceOnce(
  auth,
  'className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-[11px] font-black text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"',
  'className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-[11px] font-black text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"',
  'criar e vincular responsivo',
);
fs.writeFileSync(authenticatorPath, auth);

// 3) QR do autenticador: garantir que preview e ações também respeitem a largura do aparelho.
let qr = fs.readFileSync(qrPath, 'utf8');
qr = replaceOnce(
  qr,
  'className="rounded-xl border border-lime-500/25 bg-lime-500/[0.035] p-3 space-y-2.5"',
  'className="min-w-0 max-w-full overflow-hidden rounded-xl border border-lime-500/25 bg-lime-500/[0.035] p-3 space-y-2.5"',
  'container QR autenticador',
);
qr = replaceOnce(
  qr,
  'className="flex items-center justify-between gap-2"',
  'className="flex flex-wrap items-center justify-between gap-2"',
  'cabeçalho preview QR',
);
fs.writeFileSync(qrPath, qr);

// 4) CSS estritamente escopado para Dados de Login do ADM Pedidos.
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* admin-orders-mobile-login-layout-20260915 */';
if (!css.includes(marker)) {
  css += `\n\n${marker}\n.admin-order-login-mobile {\n  width: 100%;\n  max-width: 100%;\n  min-width: 0;\n  overflow-x: hidden;\n  box-sizing: border-box;\n}\n\n.admin-order-login-mobile *,\n.admin-order-login-mobile *::before,\n.admin-order-login-mobile *::after {\n  box-sizing: border-box;\n}\n\n.admin-order-login-mobile label,\n.admin-order-login-mobile p,\n.admin-order-login-mobile span {\n  max-width: 100%;\n  overflow-wrap: anywhere;\n}\n\n.admin-order-login-mobile input {\n  min-width: 0;\n  max-width: 100%;\n}\n\n@media (max-width: 639px) {\n  .admin-order-login-mobile > .space-y-2 > div {\n    width: 100%;\n    max-width: 100%;\n    min-width: 0;\n  }\n\n  .admin-order-login-mobile > .space-y-2 > div > .flex {\n    width: 100%;\n    max-width: 100%;\n    min-width: 0;\n    flex-wrap: wrap;\n    align-items: stretch;\n    gap: 0.5rem;\n  }\n\n  .admin-order-login-mobile > .space-y-2 > div > .flex > input {\n    flex: 1 1 100% !important;\n    width: 100% !important;\n    min-width: 0 !important;\n    max-width: 100% !important;\n  }\n\n  .admin-order-login-mobile > .space-y-2 > div > .flex > button,\n  .admin-order-login-mobile > .space-y-2 > div > .flex > a {\n    max-width: 100%;\n    min-width: 0;\n    white-space: normal;\n  }\n}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log('[admin-orders-mobile-login] OK: login, senha e autenticador ajustados para mobile sem alterar lógica.');
