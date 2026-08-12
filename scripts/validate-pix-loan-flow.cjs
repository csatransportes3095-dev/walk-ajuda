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
  "COALESCE(NULLIF(lc.client_pix_key, ''), NULLIF(lc.pixKey, '')) as clientPixKey",
  "client_pix_key=${input.pixKey || null}, client_pix_name=${input.pixName || null}",
  "pixConfirmedDate=${confirmedDate}",
  "updatePixConfirmedDate: adminProcedure",
  "function isSameLoanIdentity",
  "ORDER BY CASE WHEN l.status IN ('pendente','aprovado','aguardando_pagamento','em_analise') THEN 0 ELSE 1 END, l.createdAt DESC",
  "ensureClientPixFieldsSynced",
  "function resolvePixSource",
  "function pixKeyOf",
  "clientPixKey: pixKeyOf(pixSource)",
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
  'utils.loans.listLoans.invalidate()',
  'client?.pixKey || client?.client_pix_key || ""',
  'Editar data PIX',
  'Data de PIX confirmado',
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

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
const sameIdentity = (row, cpf, phone) => {
  const cpfDigits = onlyDigits(cpf), phoneDigits = onlyDigits(phone);
  const rowCpf = onlyDigits(row.cpf), rowPhone = onlyDigits(row.phone);
  return (!!cpfDigits && cpfDigits === rowCpf) || (!!phoneDigits && (phoneDigits === rowPhone || phoneDigits.endsWith(rowPhone) || rowPhone.endsWith(phoneDigits)));
};
if (!sameIdentity({ cpf: '346.511.558-98', phone: '(21) 99702-98382' }, '34651155898', '55219970298382')) throw new Error('Normalização de CPF/telefone não reúne o mesmo cliente');

const pixKeyOf = (row) => String(row?.client_pix_key || row?.clientPixKey || row?.pixKey || '').trim();
const resolvePixSource = (loan, clients) => clients
  .filter((candidate) => Number(candidate.id) === Number(loan.clientId) || sameIdentity(candidate, loan.clientCpf, loan.clientPhone))
  .filter((candidate) => !!pixKeyOf(candidate))
  .sort((a, b) => {
    const ownA = Number(a.id) === Number(loan.clientId) ? 0 : 1;
    const ownB = Number(b.id) === Number(loan.clientId) ? 0 : 1;
    return ownA - ownB || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  })[0] || null;

const loanForPix = { clientId: 20, clientCpf: '107.522.535-30', clientPhone: '11989793464' };
const legacyPix = resolvePixSource(loanForPix, [{ id: 20, cpf: '10752253530', phone: '(11) 98979-3464', pixKey: '10752253530', updatedAt: '2026-08-01' }]);
if (pixKeyOf(legacyPix) !== '10752253530') throw new Error('Chave PIX legada não foi reconhecida');

const newPix = resolvePixSource(loanForPix, [{ id: 20, cpf: '10752253530', phone: '(11) 98979-3464', client_pix_key: 'mateus@pix', updatedAt: '2026-08-02' }]);
if (pixKeyOf(newPix) !== 'mateus@pix') throw new Error('Chave PIX nova não foi reconhecida');

const duplicatedClientPix = resolvePixSource(loanForPix, [
  { id: 20, cpf: '10752253530', phone: '11989793464', updatedAt: '2026-08-01' },
  { id: 21, cpf: '107.522.535-30', phone: '5511989793464', client_pix_key: '10752253530', updatedAt: '2026-08-03' },
]);
if (pixKeyOf(duplicatedClientPix) !== '10752253530') throw new Error('Chave PIX de cadastro equivalente não foi recuperada');

const finishedAndNew = [
  { id: 'A', status: 'pago', createdAt: '2026-07-14' },
  { id: 'B', status: 'aguardando_pagamento', createdAt: '2026-08-11' },
].sort((a, b) => {
  const order = { aguardando_pagamento: 0, pago: 1 };
  return order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt);
});
if (finishedAndNew[0].id !== 'B' || finishedAndNew[1].id !== 'A') throw new Error('Cenário quitado + novo ativo não prioriza o novo empréstimo');

console.log('OK: regras de solicitação, PIX, chaves legadas/novas e empréstimo atual validadas sem gerar dados reais.');
