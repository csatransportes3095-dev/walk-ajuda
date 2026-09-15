import fs from 'node:fs';

const path = 'scripts/patch-email-generator-history-ownership-20260915.mjs';
let src = fs.readFileSync(path, 'utf8');

const from = '            VALUES (${email}, ${domain}, ${createdAt}, NOW())';
const to = '            VALUES (\\${email}, \\${domain}, \\${createdAt}, NOW())';

if (!src.includes(to)) {
  if (!src.includes(from)) {
    throw new Error('[email-history-patch-escape] Trecho de interpolacao nao encontrado.');
  }
  src = src.replace(from, to);
  fs.writeFileSync(path, src);
}

console.log('[email-history-patch-escape] interpolacoes protegidas.');
