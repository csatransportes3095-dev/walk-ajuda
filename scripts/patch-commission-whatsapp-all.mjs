import fs from 'node:fs';

const file = 'client/src/pages/AdminCommissions.tsx';
let source = fs.readFileSync(file, 'utf8');

// O script também roda em todo build do Render. Se a correção mais nova já
// estiver aplicada, não deve tentar reaplicar o patch legado nem falhar.
const finalHelperImport = 'import { repairCommissionWhatsappMessage } from "@shared/whatsappMessageText";';
const finalMsgRepairs = (source.match(/repairCommissionWhatsappMessage\(msg\)/g) || []).length;
const finalPixRepairs = (source.match(/repairCommissionWhatsappMessage\(msgPix\)/g) || []).length;
if (source.includes(finalHelperImport) && finalMsgRepairs >= 2 && finalPixRepairs >= 1) {
  console.log(`[commission-whatsapp] correção final já aplicada; patch idempotente aprovado (msg=${finalMsgRepairs}, pix=${finalPixRepairs}).`);
  process.exit(0);
}

// Usa exatamente a mesma camada de reparo final já adotada no fluxo de
// pedidos/status: primeiro monta a mensagem, depois recupera marcadores U+FFFD e
// somente então faz encodeURIComponent para abrir wa.me.
const helperImport = 'import { repairWhatsappReplacementIcons } from "@shared/whatsappMessageText";';
if (!source.includes(helperImport)) {
  const importAnchor = 'import { toast } from "sonner";';
  if (!source.includes(importAnchor)) {
    throw new Error('[commission-whatsapp] ponto de importação não encontrado; não publicar.');
  }
  source = source.replace(importAnchor, `${importAnchor}\n${helperImport}`);
}

// Mantém os emojis do código-fonte em escapes JS para não depender da codificação
// do arquivo durante a compilação. Mesmo se qualquer etapa anterior já tiver
// produzido U+FFFD, o helper acima corrige novamente no payload FINAL.
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

// PONTO CRÍTICO: reparar a mensagem imediatamente antes de gerar a URL final.
// Existem 2 fluxos com msg (Pagamento confirmado + Indicação confirmada) e
// 1 fluxo com msgPix (Pedir PIX).
source = source
  .replace(/encodeURIComponent\(msg\)/g, 'encodeURIComponent(repairWhatsappReplacementIcons(msg))')
  .replace(/encodeURIComponent\(msgPix\)/g, 'encodeURIComponent(repairWhatsappReplacementIcons(msgPix))');

const msgRepairs = (source.match(/repairWhatsappReplacementIcons\(msg\)/g) || []).length;
const pixRepairs = (source.match(/repairWhatsappReplacementIcons\(msgPix\)/g) || []).length;

if (!source.includes(helperImport)) {
  throw new Error('[commission-whatsapp] helper de reparo final não importado; não publicar.');
}
if (msgRepairs < 2 || pixRepairs < 1) {
  throw new Error(`[commission-whatsapp] reparo final incompleto: msg=${msgRepairs}, pix=${pixRepairs}; não publicar.`);
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
const stillLiteral = forbidden.filter((token) => source.includes(token));
if (stillLiteral.length) {
  throw new Error(`[commission-whatsapp] ainda existem emojis literais nas mensagens: ${stillLiteral.join(' | ')}`);
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[commission-whatsapp] fonte preparada: ${changed} emojis escapados; reparo final ativo em ${msgRepairs + pixRepairs} rotas WhatsApp.`);
