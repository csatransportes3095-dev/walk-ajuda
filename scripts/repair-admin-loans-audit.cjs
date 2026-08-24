const fs = require('fs');

function replaceOnce(s, from, to, label) {
  if (!s.includes(from)) throw new Error(`Trecho não encontrado: ${label}`);
  return s.replace(from, to);
}

// ── Server ──────────────────────────────────────────────────────────────────
const loansPath = 'server/routers/loans.ts';
let s = fs.readFileSync(loansPath, 'utf8');

// Análise Financeira: considerar atrasados e remover agregação SQL inválida.
s = s.replaceAll(`li.status IN ('pendente', 'em_analise')`, `li.status IN ('pendente', 'atrasado', 'em_analise')`);
s = s.replaceAll(`li.status IN ('pendente','em_analise')`, `li.status IN ('pendente','atrasado','em_analise')`);

s = replaceOnce(
  s,
  `SELECT COALESCE(SUM(\n        l.interestAmount * (COUNT(li.id) / GREATEST(l.installments, 1))\n      ), 0) as totalInterest`,
  `SELECT COALESCE(SUM(\n        l.interestAmount * (1.0 / GREATEST(l.installments, 1))\n      ), 0) as totalInterest`,
  'projeção de juros'
);

s = replaceOnce(
  s,
  `WHERE li.status = 'pendente' AND li.dueDate < \${today} AND \${drizzleSql.raw(dateCondition)}`,
  `WHERE li.status IN ('pendente','atrasado') AND li.dueDate < \${today} AND \${drizzleSql.raw(dateCondition)}`,
  'inadimplência análise financeira'
);

s = replaceOnce(
  s,
  `SELECT li.id, li.dueDate, li.amount, li.installmentNumber,\n             l.clientName, l.id as loanId\n      FROM loanInstallments li\n      JOIN loans l ON l.id = li.loanId`,
  `SELECT li.id, li.dueDate, li.amount, li.installmentNumber,\n             lc.name as clientName, l.id as loanId\n      FROM loanInstallments li\n      JOIN loans l ON l.id = li.loanId\n      JOIN loanClients lc ON lc.id = l.clientId`,
  'cliente das próximas parcelas'
);

// Editar empréstimo: preservar qualquer parcela com valor/histórico que não pode ser recriado.
s = replaceOnce(
  s,
  `WHERE loanId=\${input.id} AND status IN ('pago', 'em_analise')`,
  `WHERE loanId=\${input.id} AND status IN ('pago', 'pago_juros', 'em_analise', 'aguardando_confirmacao', 'atrasado')`,
  'parcelas protegidas na edição'
);

// Reagendamento deve atuar somente no que ainda é efetivamente devido.
const rescheduleStart = s.indexOf('rescheduleInstallments: adminProcedure');
if (rescheduleStart < 0) throw new Error('rescheduleInstallments não localizado');
const rescheduleEnd = s.indexOf('syncFromGastos: adminProcedure', rescheduleStart);
if (rescheduleEnd < 0) throw new Error('fim de rescheduleInstallments não localizado');
let rescheduleBlock = s.slice(rescheduleStart, rescheduleEnd);
rescheduleBlock = replaceOnce(
  rescheduleBlock,
  `WHERE loanId=\${input.loanId} AND status != 'pago'`,
  `WHERE loanId=\${input.loanId} AND status IN ('pendente','atrasado')`,
  'parcelas de reagendamento'
);
s = s.slice(0, rescheduleStart) + rescheduleBlock + s.slice(rescheduleEnd);

// Cobrar Juros: loan.clientId é ID de loanClients, não de customers.
const wrongClientLookup = `SELECT name, phone, email, cpf FROM customers WHERE id=\${loan.clientId}`;
const correctClientLookup = `SELECT lc.name, lc.phone, COALESCE(lc.cpf, c.cpf) as cpf, c.email\n        FROM loanClients lc\n        LEFT JOIN customers c ON c.deletedAt IS NULL AND (\n          RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', ''), 9) = RIGHT(REGEXP_REPLACE(lc.phone, '[^0-9]', ''), 9)\n          OR (REGEXP_REPLACE(COALESCE(c.cpf,''), '[^0-9]', '') <> '' AND REGEXP_REPLACE(COALESCE(c.cpf,''), '[^0-9]', '') = REGEXP_REPLACE(COALESCE(lc.cpf,''), '[^0-9]', ''))\n        )\n        WHERE lc.id=\${loan.clientId} LIMIT 1`;
const lookupCount = s.split(wrongClientLookup).length - 1;
if (lookupCount < 2) throw new Error(`esperava 2 buscas erradas de cliente, encontrou ${lookupCount}`);
s = s.split(wrongClientLookup).join(correctClientLookup);

fs.writeFileSync(loansPath, s);

// ── Frontend ────────────────────────────────────────────────────────────────
const adminPath = 'client/src/pages/AdminLoans.tsx';
let a = fs.readFileSync(adminPath, 'utf8');

if (!a.includes('function todayBRTDate()')) {
  const anchor = `function fmtDate(d: string | null | undefined) {\n  if (!d) return "—";\n  const s = String(d).slice(0, 10);\n  const [y, m, day] = s.split("-");\n  return \`\${day}/\${m}/\${y}\`;\n}`;
  const helper = `${anchor}\n\n// Data civil de São Paulo. Evita virar o dia às 21h por causa do UTC.\nfunction todayBRTDate() {\n  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);\n}`;
  a = replaceOnce(a, anchor, helper, 'helper de data');
}

// Todos os defaults de "hoje" desta página passam a usar o mesmo dia de São Paulo.
a = a.split(`new Date().toISOString().slice(0, 10)`).join(`todayBRTDate()`);
a = a.replace(
  `const todayBRT = () => new Date(new Date().getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);`,
  `const todayBRT = todayBRTDate;`
);
a = a.replace(
  `  const today = new Date();\n  const todayStr = todayBRTDate();`,
  `  const todayStr = todayBRTDate();`
);

fs.writeFileSync(adminPath, a);
console.log('Auditoria funcional aplicada.');
