import fs from 'node:fs';

const path = 'client/src/pages/AdminEmail.tsx';
let s = fs.readFileSync(path, 'utf8');

const marker = '        {/* Busca */}';
const block = `        {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('from') === 'pedido' && (\n          <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4 text-sm text-cyan-100">\n            <p className="font-black">PEDIDO #{new URLSearchParams(window.location.search).get('orderNumber') || new URLSearchParams(window.location.search).get('registrationId')}</p>\n            <p className="mt-1 text-xs text-cyan-200/80">Cliente: {new URLSearchParams(window.location.search).get('customerName') || 'Cliente'} · Código: *{new URLSearchParams(window.location.search).get('customerNumber') || new URLSearchParams(window.location.search).get('registrationId')}</p>\n          </div>\n        )}\n\n        {/* Busca */}`;
if (!s.includes(block)) {
  if (!s.includes(marker)) throw new Error('Busca marker ausente');
  s = s.replace(marker, block);
}

fs.writeFileSync(path, s);
console.log('[admin-email-order-banner] contexto do pedido exibido no gerador');
