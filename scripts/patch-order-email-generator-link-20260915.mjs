import fs from 'node:fs';

const path = 'client/src/pages/AdminOrders.tsx';
let src = fs.readFileSync(path, 'utf8');
const marker = `                              <AuthenticatorQrAdminField\n                                registrationId={order.id}`;
const replacement = `                              <button\n                                type="button"\n                                disabled={Boolean(fields.loginEmail?.trim())}\n                                onClick={() => {\n                                  const params = new URLSearchParams({\n                                    from: 'pedido',\n                                    registrationId: String(order.id),\n                                    customerName: order.customerName || order.codeClientName || 'Cliente',\n                                    customerNumber: String(order.customerNumber || order.id),\n                                    orderNumber: String(order.orderNumber || order.id),\n                                  });\n                                  window.location.href = '/admin/email?' + params.toString();\n                                }}\n                                className="w-full py-2 px-3 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-xs font-black hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"\n                              >\n                                <Mail className="w-3.5 h-3.5" />\n                                {fields.loginEmail?.trim() ? 'EMAIL H2WALK JÁ VINCULADO' : 'GERAR EMAIL H2WALK PARA ESTE PEDIDO'}\n                              </button>\n                              <AuthenticatorQrAdminField\n                                registrationId={order.id}`;
if (!src.includes(replacement)) {
  if (!src.includes(marker)) throw new Error('Local do gerador no pedido não encontrado');
  src = src.replace(marker, replacement);
}
fs.writeFileSync(path, src);
console.log('[order-email-link] botão do gerador adicionado ao pedido');
