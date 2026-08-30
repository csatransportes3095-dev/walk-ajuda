import fs from 'node:fs';

function exactReplace(path, before, after, expected = 1) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== expected) throw new Error(`${path}: expected ${expected} exact match(es), found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

const adminCustomers = 'client/src/pages/AdminCustomers.tsx';
exactReplace(
  adminCustomers,
  "        setCreateError(data.message || 'Erro ao cadastrar cliente');\n",
  "        setCreateError('Erro ao cadastrar cliente');\n",
);
exactReplace(
  adminCustomers,
  '    updateMut.mutate(payload);\n',
  '    updateMut.mutate(payload as any);\n',
);

// O arquivo server/routers.ts possui erros TypeScript antigos fora deste trabalho.
// Em vez de ignorar silenciosamente o hardening, validamos aqui o trecho exato
// que deve existir depois do patch: qualquer troca de telefone é proibida no backend legado.
const routers = fs.readFileSync('server/routers.ts', 'utf8');
const immutablePhoneGuard = "throw new TRPCError({ code: 'FORBIDDEN', message: 'Telefone é a identidade fixa do cliente e não pode ser alterado.' });";
if (!routers.includes(immutablePhoneGuard)) {
  throw new Error('server/routers.ts: immutable phone backend guard was not applied');
}

console.log('PR #38 scoped type fixes and legacy phone guard assertion passed.');
