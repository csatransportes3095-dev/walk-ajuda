import fs from 'node:fs';

const file = 'scripts/patch-loans-client-filters-20260914.mjs';
let source = fs.readFileSync(file, 'utf8');

const replacements = [
  ["orderIdentity.add(`p:${phone}`)", "orderIdentity.add('p:' + phone)"],
  ["orderIdentity.add(`c:${cpf}`)", "orderIdentity.add('c:' + cpf)"],
  ["orderIdentity.has(`p:${phone}`)", "orderIdentity.has('p:' + phone)"],
  ["orderIdentity.has(`c:${cpf}`)", "orderIdentity.has('c:' + cpf)"],
  ["if (!window.confirm(`${verb} empréstimo para ${ids.length} cliente(s) selecionado(s)?`)) return;", "if (!window.confirm(verb + ' empréstimo para ' + ids.length + ' cliente(s) selecionado(s)?')) return;"],
  ["toast.success(`Empréstimo ${enabled ? 'ativado' : 'desativado'} para ${ids.length} cliente(s).`);", "toast.success('Empréstimo ' + (enabled ? 'ativado' : 'desativado') + ' para ' + ids.length + ' cliente(s).');"],
];

let changed = 0;
for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`[fix-loans-filter-patch] alvo inesperado: ${before} (encontrado ${count})`);
  }
  source = source.replace(before, after);
  changed++;
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[fix-loans-filter-patch] OK: ${changed} correção(ões) de sintaxe aplicadas antes de executar o patch.`);
