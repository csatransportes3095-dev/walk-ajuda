import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('sessao persistente do cliente', () => {
  it('refresh da home nao apaga a sessao', () => {
    const src = fs.readFileSync('client/src/components/WelcomeScreen.tsx', 'utf8');
    expect(src).not.toContain('function clearPreviousCustomerIdentity()');
    expect(src).not.toContain('clearPreviousCustomerIdentity();');
  });

  it('gastos e emprestimo priorizam cp_token sobre token legado', () => {
    const gastos = fs.readFileSync('client/src/pages/GastosPage.tsx', 'utf8');
    const emprestimo = fs.readFileSync('client/src/pages/EmprestimoPage.tsx', 'utf8');
    const entry = fs.readFileSync('client/src/components/OnlineEntryPanel.tsx', 'utf8');

    expect(gastos).toContain("localStorage.getItem('cp_token') || localStorage.getItem(TOKEN_KEY)");
    expect(emprestimo).toContain("localStorage.getItem('cp_token') || localStorage.getItem(TOKEN_KEY)");
    expect(entry).toContain("localStorage.getItem('cp_token')");

    expect(gastos).toContain('trpc.customerPassword.checkSession.useQuery');
    expect(emprestimo).toContain('trpc.customerPassword.checkSession.useQuery');

    expect(gastos).toContain("localStorage.setItem(TOKEN_KEY, savedToken)");
    expect(emprestimo).toContain("localStorage.setItem(TOKEN_KEY, savedToken)");
  });

  it('falha transitoria da verificacao central nao expulsa cliente', () => {
    const gastos = fs.readFileSync('client/src/pages/GastosPage.tsx', 'utf8');
    const emprestimo = fs.readFileSync('client/src/pages/EmprestimoPage.tsx', 'utf8');
    expect(gastos).toContain('if (sessionQuery.isError)');
    expect(emprestimo).toContain('if (sessionQuery.isError)');
    expect(gastos).toContain('setIsLoggedIn(true)');
    expect(emprestimo).toContain('setIsLoggedIn(true)');
  });

  it('backend nao transforma banco indisponivel em token invalido', () => {
    const customer = fs.readFileSync('server/routers/customerPassword.ts', 'utf8');
    const spreadsheet = fs.readFileSync('server/routers/spreadsheet.ts', 'utf8');
    expect(customer).not.toContain('if (!db) return { valid: false }');
    expect(spreadsheet).toContain('if (!db) throw new TRPCError');
  });

  it('logout invalida os dois tipos de sessao', () => {
    const customer = fs.readFileSync('server/routers/customerPassword.ts', 'utf8');
    const spreadsheet = fs.readFileSync('server/routers/spreadsheet.ts', 'utf8');
    expect(customer).toContain('db.delete(spreadsheetSessions)');
    expect(spreadsheet).toContain('db.delete(customerPasswordSessions)');
  });

  it('as rotas continuam fora do PasswordGate global', () => {
    const app = fs.readFileSync('client/src/App.tsx', 'utf8');
    expect(app).toContain('if (isGastosRoute)');
    expect(app).toContain('if (isEmprestimoRoute)');
    expect(app).toContain('return <Router />;');
  });
});
