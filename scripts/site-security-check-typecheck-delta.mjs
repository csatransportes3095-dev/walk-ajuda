import { readFileSync, appendFileSync } from "node:fs";

// Compara erros TS do checkout de producao com os do PR, ignorando
// somente deslocamentos de linha/coluna; preserva arquivo, codigo e mensagem.
const [baseFile, branchFile] = process.argv.slice(2);
if (!baseFile || !branchFile) {
  console.error("Uso: node scripts/site-security-check-typecheck-delta.mjs base.log atual.log");
  process.exit(2);
}
function parse(file) {
  const text = readFileSync(file, "utf8");
  const diagnostics = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/);
    if (!match) continue;
    const key = `${match[1]}::${match[2]}::${match[3]}`;
    diagnostics.set(key, (diagnostics.get(key) || 0) + 1);
  }
  return diagnostics;
}
const baseline = parse(baseFile);
const current = parse(branchFile);
const sum = rows => [...rows.values()].reduce((n, v) => n + v, 0);
const introduced = [];
for (const [key, count] of current) {
  const extra = count - (baseline.get(key) || 0);
  if (extra > 0) introduced.push({ key, extra });
}
const message = [
  "### Validacao TypeScript — comparacao com producao",
  `- Erros ja presentes na base: **${sum(baseline)}**`,
  `- Erros na branch de seguranca: **${sum(current)}**`,
  `- Novas ocorrencias nao existentes na base: **${introduced.reduce((n, v) => n + v.extra, 0)}**`,
  ...introduced.slice(0, 25).map(x => `- **NOVO (${x.extra}x)**: \`${x.key}\``),
  "",
].join("\n");
console.log(message);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, message);
if (introduced.length) process.exit(1);
