import fs from 'node:fs';

const file = 'client/src/pages/AdminCommissions.tsx';
let source = fs.readFileSync(file, 'utf8');

// Este arquivo roda em todo build do Render. A validacao precisa ser realmente
// idempotente: primeiro normaliza a fonte e SOMENTE DEPOIS confirma o estado.
const finalHelperImport = 'import { repairCommissionWhatsappMessage } from "@shared/whatsappMessageText";';
const legacyHelperImport = 'import { repairWhatsappReplacementIcons } from "@shared/whatsappMessageText";';
const importAnchor = 'import { toast } from "sonner";';

if (!source.includes(finalHelperImport)) {
  if (source.includes(legacyHelperImport)) {
    source = source.replace(legacyHelperImport, finalHelperImport);
  } else if (source.includes(importAnchor)) {
    source = source.replace(importAnchor, `${importAnchor}\n${finalHelperImport}`);
  } else {
    throw new Error('[commission-whatsapp] ponto de importacao nao encontrado; nao publicar.');
  }
}

// Nenhum emoji literal fica no caminho das mensagens de comissao. Os caracteres
// usados para localizar a fonte sao montados por code point dentro deste script;
// os destinos gravados no TS usam escapes ASCII (\\u....).
const cp = (...points) => String.fromCodePoint(...points);
const icon = {
  paid: cp(0x2705),
  party: cp(0x1f389),
  card: cp(0x1f4b3),
  user: cp(0x1f464),
  phone: cp(0x1f4f1),
  money: cp(0x1f4b0),
};
const replacement = cp(0xfffd);

const replacements = [
  ["`\\n" + icon.money + " *Valor pago:* R$", "`\\n\\uD83D\\uDCB0 *Valor pago:* R$"],
  ["'" + icon.paid + " *COMISSÃO PAGA*'", "'\\u2705 *COMISSÃO PAGA*'"],
  ["`" + icon.user + " *Cliente indicado:*", "`\\uD83D\\uDC64 *Cliente indicado:*"],
  ["'Obrigado pela indicação! " + icon.party + "'", "'Obrigado pela indicação! \\uD83C\\uDF89'"],
  ["`" + icon.money + " *Comissão:* R$", "`\\uD83D\\uDCB0 *Comissão:* R$"],
  ["'" + icon.party + " *INDICAÇÃO CONFIRMADA*'", "'\\uD83C\\uDF89 *INDICAÇÃO CONFIRMADA*'"],
  ["`" + icon.phone + " *Telefone:*", "`\\uD83D\\uDCF1 *Telefone:*"],
  ["'" + icon.paid + " *Pagamento da comissão confirmado.*'", "'\\u2705 *Pagamento da comissão confirmado.*'"],
  ["`" + icon.money + " *Valor da comissão:* R$", "`\\uD83D\\uDCB0 *Valor da comissão:* R$"],
  ["'" + icon.card + " *DADOS PARA PAGAMENTO DA COMISSÃO*'", "'\\uD83D\\uDCB3 *DADOS PARA PAGAMENTO DA COMISSÃO*'"],

  // Recuperacao defensiva caso algum commit antigo ja tenha gravado U+FFFD.
  ["'" + replacement + " *COMISSÃO PAGA*'", "'\\u2705 *COMISSÃO PAGA*'"],
  ["'" + replacement + " *INDICAÇÃO CONFIRMADA*'", "'\\uD83C\\uDF89 *INDICAÇÃO CONFIRMADA*'"],
  ["'" + replacement + " *DADOS PARA PAGAMENTO DA COMISSÃO*'", "'\\uD83D\\uDCB3 *DADOS PARA PAGAMENTO DA COMISSÃO*'"],
  ["`" + replacement + " *Cliente indicado:*", "`\\uD83D\\uDC64 *Cliente indicado:*"],
  ["`" + replacement + " *Telefone:*", "`\\uD83D\\uDCF1 *Telefone:*"],
  ["`" + replacement + " *Comissão:* R$", "`\\uD83D\\uDCB0 *Comissão:* R$"],
  ["`" + replacement + " *Valor da comissão:* R$", "`\\uD83D\\uDCB0 *Valor da comissão:* R$"],
  ["`\\n" + replacement + " *Valor pago:* R$", "`\\n\\uD83D\\uDCB0 *Valor pago:* R$"],
];

let changed = 0;
for (const [from, to] of replacements) {
  if (!source.includes(from)) continue;
  source = source.split(from).join(to);
  changed += 1;
}

// Consolida os caminhos antigos e atuais em uma unica barreira final.
source = source
  .replace(/encodeURIComponent\(repairWhatsappReplacementIcons\(msg\)\)/g, 'encodeURIComponent(repairCommissionWhatsappMessage(msg))')
  .replace(/encodeURIComponent\(repairWhatsappReplacementIcons\(msgPix\)\)/g, 'encodeURIComponent(repairCommissionWhatsappMessage(msgPix))')
  .replace(/encodeURIComponent\(msg\)/g, 'encodeURIComponent(repairCommissionWhatsappMessage(msg))')
  .replace(/encodeURIComponent\(msgPix\)/g, 'encodeURIComponent(repairCommissionWhatsappMessage(msgPix))');

const msgRepairs = (source.match(/encodeURIComponent\(repairCommissionWhatsappMessage\(msg\)\)/g) || []).length;
const pixRepairs = (source.match(/encodeURIComponent\(repairCommissionWhatsappMessage\(msgPix\)\)/g) || []).length;

if (msgRepairs !== 2 || pixRepairs !== 1) {
  throw new Error(`[commission-whatsapp] rotas finais invalidas: msg=${msgRepairs}, pix=${pixRepairs}; esperado 2+1. Nao publicar.`);
}
if (source.includes('encodeURIComponent(msg)') || source.includes('encodeURIComponent(msgPix)')) {
  throw new Error('[commission-whatsapp] existe rota sem reparo final; nao publicar.');
}
if (source.includes(replacement)) {
  throw new Error('[commission-whatsapp] U+FFFD encontrado no codigo da tela de comissoes; nao publicar.');
}

const forbidden = [
  "'" + icon.paid + " *COMISSÃO PAGA*'",
  "'" + icon.party + " *INDICAÇÃO CONFIRMADA*'",
  "'" + icon.card + " *DADOS PARA PAGAMENTO DA COMISSÃO*'",
  "`" + icon.user + " *Cliente indicado:*",
  "`" + icon.phone + " *Telefone:*",
  "`" + icon.money + " *Comissão:* R$",
  "`" + icon.money + " *Valor da comissão:* R$",
  "`\\n" + icon.money + " *Valor pago:* R$",
];
const stillLiteral = forbidden.filter((token) => source.includes(token));
if (stillLiteral.length) {
  throw new Error(`[commission-whatsapp] ainda existem emojis literais no payload: ${stillLiteral.length}; nao publicar.`);
}

const requiredEscapes = [
  "'\\u2705 *COMISSÃO PAGA*'",
  "'\\uD83C\\uDF89 *INDICAÇÃO CONFIRMADA*'",
  "'\\uD83D\\uDCB3 *DADOS PARA PAGAMENTO DA COMISSÃO*'",
  "`\\uD83D\\uDC64 *Cliente indicado:*",
  "`\\uD83D\\uDCF1 *Telefone:*",
];
const missingEscapes = requiredEscapes.filter((token) => !source.includes(token));
if (missingEscapes.length) {
  throw new Error(`[commission-whatsapp] escapes obrigatorios ausentes: ${missingEscapes.length}; nao publicar.`);
}

fs.writeFileSync(file, source, 'utf8');

// Releitura apos a gravacao: se o arquivo sair diferente do validado, o build para.
const persisted = fs.readFileSync(file, 'utf8');
if (persisted.includes(replacement)) {
  throw new Error('[commission-whatsapp] U+FFFD apareceu apos gravar a fonte; nao publicar.');
}

console.log(`[commission-whatsapp] VALIDACAO OK: ${changed} normalizacoes; 3 rotas protegidas; payload sem emoji literal/U+FFFD.`);
