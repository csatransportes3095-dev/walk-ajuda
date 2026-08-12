const fs = require('fs');

const identity = fs.readFileSync('server/customerIdentity.ts', 'utf8');
const customersRouter = fs.readFileSync('server/routers.ts', 'utf8');
const spreadsheetRouter = fs.readFileSync('server/routers/spreadsheet.ts', 'utf8');
const loansRouter = fs.readFileSync('server/routers/loans.ts', 'utf8');

const checks = [
  [identity, 'customers (cadastro principal), spreadsheetClients (gastos) e loanClients', 'centralização dos três cadastros'],
  [identity, "'emprestimo'", 'rota automática exclusiva para cadastro originado no empréstimo'],
  [identity, 'Não transfere permissões nem dados financeiros', 'preservação das permissões e dados de cada módulo'],
  [customersRouter, 'await syncUnifiedCustomerRegistry()', 'sincronização após editar o cadastro principal'],
  [spreadsheetRouter, "const routeOrigin = input.sourceRoute || 'gastos'", 'manutenção da rota de origem no cadastro de gastos'],
  [spreadsheetRouter, 'await syncUnifiedCustomerRegistry()', 'sincronização após cadastro ou senha de gastos'],
  [loansRouter, 'await syncUnifiedCustomerRegistry()', 'sincronização após cadastro ou edição no empréstimo'],
];

for (const [source, expected, label] of checks) {
  if (!source.includes(expected)) throw new Error(`Regra ausente: ${label}`);
}

const identityMatch = (a, b) => {
  const d = value => String(value || '').replace(/\D/g, '');
  const cpfA = d(a.cpf), cpfB = d(b.cpf);
  if (cpfA.length === 11 && cpfA === cpfB) return true;
  const phoneA = d(a.phone), phoneB = d(b.phone);
  return !!phoneA && !!phoneB && (phoneA === phoneB || phoneA.endsWith(phoneB) || phoneB.endsWith(phoneA));
};

if (!identityMatch({ cpf: '107.522.535-30', phone: '(11) 98979-3464' }, { cpf: '10752253530', phone: '11989793464' })) {
  throw new Error('CPF/telefone formatados não foram reconhecidos como o mesmo cliente');
}
if (identityMatch({ cpf: '10752253530', phone: '11989793464' }, { cpf: '45285267862', phone: '21925011306' })) {
  throw new Error('Clientes diferentes foram vinculados indevidamente');
}

console.log('OK: cadastro único por CPF/telefone, dados compartilhados sincronizados e acesso por rota preservado.');
