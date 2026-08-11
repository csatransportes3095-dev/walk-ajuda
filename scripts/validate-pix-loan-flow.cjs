const fs = require('fs');

const backend = fs.readFileSync('server/routers/loans.ts', 'utf8');
const admin = fs.readFileSync('client/src/pages/AdminLoans.tsx', 'utf8');
const client = fs.readFileSync('client/src/pages/LoansTab.tsx', 'utf8');

const requiredBackend = [
  "ensurePixDisbursementColumns",
  "confirmPixSent: adminProcedure",
  "input.status === 'solicitacoes_novas'",
  "r.status === 'pendente' || (r.status === 'aprovado' && !r.pixSentAt)",
  "!['pago', 'cancelado', 'reprovado', 'pendente'].includes(r.status)",
  "WHERE l.clientId IN",
];
for (const snippet of requiredBackend) {
  if (!backend.includes(snippet)) throw new Error(`Backend sem regra obrigatória: ${snippet}`);
}

const requiredAdmin = [
  'Solicitações Novas',
  'Confirmar PIX enviado ao cliente',
  'falta enviar PIX ao cliente',
  'Cobrança e gestão',
  'Gestão da solicitação',
];
for (const snippet of requiredAdmin) {
  if (!admin.includes(snippet)) throw new Error(`Painel ADM sem regra obrigatória: ${snippet}`);
}

const requiredClient = [
  'clientLoanPriority',
  'Empréstimo aprovado — aguardando a liberação do PIX pelo administrador.',
  'PIX liberado. Seu empréstimo está ativo',
];
for (const snippet of requiredClient) {
  if (!client.includes(snippet)) throw new Error(`Página do cliente sem regra obrigatória: ${snippet}`);
}

const loans = [
  { id: 1, status: 'pago', createdAt: '2026-08-01T10:00:00Z' },
  { id: 2, status: 'aprovado', pixSentAt: null, createdAt: '2026-08-11T10:00:00Z' },
  { id: 3, status: 'pendente', createdAt: '2026-08-12T10:00:00Z' },
  { id: 4, status: 'aprovado', pixSentAt: '2026-08-10T12:00:00Z', createdAt: '2026-08-10T10:00:00Z' },
];
const solicitacoes = loans.filter((loan) => loan.status === 'pendente' || (loan.status === 'aprovado' && !loan.pixSentAt));
const normais = loans.filter((loan) => !['pago', 'cancelado', 'reprovado', 'pendente'].includes(loan.status) && !(loan.status === 'aprovado' && !loan.pixSentAt));
if (solicitacoes.map((loan) => loan.id).join(',') !== '2,3') throw new Error('Solicitações novas incorretas');
if (normais.map((loan) => loan.id).join(',') !== '4') throw new Error('Empréstimos normais incorretos');

const priority = { pendente: 0, aprovado: 1, aguardando_pagamento: 2, em_analise: 3, pago: 4, cancelado: 5 };
const clientOrder = [...loans].sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || String(b.createdAt).localeCompare(String(a.createdAt)));
if (clientOrder[0].id !== 3 || clientOrder[1].id !== 2 || clientOrder.at(-1).id !== 1) throw new Error('Prioridade do empréstimo atual incorreta');

console.log('OK: regras de solicitação, PIX e empréstimo atual validadas sem gerar dados reais.');
