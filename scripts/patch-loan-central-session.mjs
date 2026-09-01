import fs from 'node:fs';

const path = 'server/routers/loans.ts';
let src = fs.readFileSync(path, 'utf8');

const oldBlock = `async function requireLoanRouteAccess(db: any, rawToken: string): Promise<any> {
  const token = rawToken.trim();
  const sessions = await qRows(db, drizzleSql\`
    SELECT ss.*, sc.name, sc.phone, sc.cpf
    FROM spreadsheetSessions ss
    JOIN spreadsheetClients sc ON sc.id=ss.clientId
    WHERE ss.token=\${token} AND ss.expiresAt > NOW()
    LIMIT 1
  \`);
  const session = sessions[0];
  if (!session) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' });
  try {
    await requireCompleteMainCustomerProfile(db, { phone: session.phone, cpf: session.cpf });
  } catch {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Atualize foto, e-mail, CPF e telefone no cadastro principal para continuar.' });
  }
  const mainCustomer = await findMainCustomerByIdentity({ phone: session.phone, cpf: session.cpf }, db);
  if (!mainCustomer) throw new TRPCError({ code: 'FORBIDDEN', message: 'Conclua o cadastro principal para continuar.' });
  const access = await getRouteAccess(mainCustomer.id, db);
  const loanAllowed = !access.restricted || access.routes.includes('emprestimo');
  await syncLegacyLoanAccess(db, session, loanAllowed);
  if (!loanAllowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso não autorizado para a área de Empréstimos.' });
  }
  return session;
}`;

const newBlock = `async function requireLoanRouteAccess(db: any, rawToken: string): Promise<any> {
  const token = rawToken.trim();
  if (!token) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' });

  // A Planilha e o módulo de Empréstimos compartilham a mesma sessão central.
  const spreadsheetSessionRows = await qRows(db, drizzleSql\`
    SELECT ss.*, sc.name, sc.phone, sc.cpf
    FROM spreadsheetSessions ss
    JOIN spreadsheetClients sc ON sc.id=ss.clientId
    WHERE ss.token=\${token} AND ss.expiresAt > NOW()
    LIMIT 1
  \`);
  let session: any = spreadsheetSessionRows[0] || null;

  if (!session) {
    const customerSessionRows = await qRows(db, drizzleSql\`
      SELECT token, phone, expiresAt, lastAccessAt
      FROM customerPasswordSessions
      WHERE token=\${token} AND expiresAt > NOW()
      LIMIT 1
    \`);
    const customerSession = customerSessionRows[0] || null;
    if (customerSession) {
      const main = await findMainCustomerByIdentity({ phone: customerSession.phone }, db);
      if (main) {
        session = {
          ...customerSession,
          name: main.name || main.phone,
          phone: main.phone || customerSession.phone,
          cpf: main.cpf || null,
          source: 'customer',
        };
      }
    }
  }

  if (!session) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' });
  try {
    await requireCompleteMainCustomerProfile(db, { phone: session.phone, cpf: session.cpf });
  } catch {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Atualize foto, e-mail, CPF e telefone no cadastro principal para continuar.' });
  }
  const mainCustomer = await findMainCustomerByIdentity({ phone: session.phone, cpf: session.cpf }, db);
  if (!mainCustomer) throw new TRPCError({ code: 'FORBIDDEN', message: 'Conclua o cadastro principal para continuar.' });
  const access = await getRouteAccess(mainCustomer.id, db);
  const loanAllowed = !access.restricted || access.routes.includes('emprestimo');
  await syncLegacyLoanAccess(db, session, loanAllowed);
  if (!loanAllowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso não autorizado para a área de Empréstimos.' });
  }
  return session;
}`;

if (!src.includes(oldBlock)) throw new Error('requireLoanRouteAccess anchor not found');
src = src.replace(oldBlock, newBlock);
fs.writeFileSync(path, src, 'utf8');

const testPath = 'server/customerSessionRefreshRegression.test.ts';
let test = fs.readFileSync(testPath, 'utf8');
const anchor = `  it('logout invalida os dois tipos de sessao', () => {`;
const add = `  it('emprestimos aceita a sessao central do cliente', () => {\n    const loans = fs.readFileSync('server/routers/loans.ts', 'utf8');\n    expect(loans).toContain('FROM customerPasswordSessions');\n    expect(loans).toContain(\"access.routes.includes('emprestimo')\");\n    expect(loans).toContain(\"source: 'customer'\");\n  });\n\n`;
if (!test.includes("emprestimos aceita a sessao central do cliente")) {
  if (!test.includes(anchor)) throw new Error('test anchor not found');
  test = test.replace(anchor, add + anchor);
  fs.writeFileSync(testPath, test, 'utf8');
}
console.log('loan central session patch applied');
