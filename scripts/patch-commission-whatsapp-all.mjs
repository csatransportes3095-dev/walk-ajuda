import fs from 'node:fs';

const file = 'client/src/pages/AdminCommissions.tsx';
let source = fs.readFileSync(file, 'utf8');

const replacements = [
  ["`\\n💰 *Valor pago:* R$", "`\\n\\uD83D\\uDCB0 *Valor pago:* R$"],
  ["'✅ *COMISSÃO PAGA*'", "'\\u2705 *COMISSÃO PAGA*'"],
  ["`👤 *Cliente indicado:* ${wa.customerName || 'Cliente'}`", "`\\uD83D\\uDC64 *Cliente indicado:* ${wa.customerName || 'Cliente'}`"],
  ["'Obrigado pela indicação! 🎉'", "'Obrigado pela indicação! \\uD83C\\uDF89'"],

  ["`💰 *Comissão:* R$", "`\\uD83D\\uDCB0 *Comissão:* R$"],
  ["'🎉 *INDICAÇÃO CONFIRMADA*'", "'\\uD83C\\uDF89 *INDICAÇÃO CONFIRMADA*'"],
  ["`👤 *Cliente indicado:* ${c.customerName ?? c.phone}`", "`\\uD83D\\uDC64 *Cliente indicado:* ${c.customerName ?? c.phone}`"],
  ["`📱 *Telefone:* ${formatPhone(c.phone)}`", "`\\uD83D\\uDCF1 *Telefone:* ${formatPhone(c.phone)}`"],
  ["'✅ *Pagamento da comissão confirmado.*'", "'\\u2705 *Pagamento da comissão confirmado.*'"],

  ["`💰 *Valor da comissão:* R$", "`\\uD83D\\uDCB0 *Valor da comissão:* R$"],
  ["'💳 *DADOS PARA PAGAMENTO DA COMISSÃO*'", "'\\uD83D\\uDCB3 *DADOS PARA PAGAMENTO DA COMISSÃO*'"],
];

let changed = 0;
for (const [from, to] of replacements) {
  if (source.includes(from)) {
    source = source.split(from).join(to);
    changed += 1;
  }
}

const forbidden = [
  "'✅ *COMISSÃO PAGA*'",
  "'🎉 *INDICAÇÃO CONFIRMADA*'",
  "'💳 *DADOS PARA PAGAMENTO DA COMISSÃO*'",
  "`👤 *Cliente indicado:* ${wa.customerName || 'Cliente'}`",
  "`👤 *Cliente indicado:* ${c.customerName ?? c.phone}`",
  "`📱 *Telefone:* ${formatPhone(c.phone)}`",
  "`💰 *Comissão:* R$",
  "`💰 *Valor da comissão:* R$",
  "`\\n💰 *Valor pago:* R$",
];

const stillBroken = forbidden.filter((token) => source.includes(token));
if (stillBroken.length) {
  throw new Error(`[commission-whatsapp] ainda existem emojis literais nas mensagens: ${stillBroken.join(' | ')}`);
}

if (!source.includes("'\\u2705 *COMISSÃO PAGA*'") || !source.includes("'\\uD83D\\uDCB3 *DADOS PARA PAGAMENTO DA COMISSÃO*'")) {
  throw new Error('[commission-whatsapp] validação final falhou; não publicar.');
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[commission-whatsapp] mensagens corrigidas diretamente na fonte (${changed} substituições).`);
