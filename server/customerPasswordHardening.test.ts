import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Estes testes são deliberadamente source-contract tests (e não testes de
 * runtime/concorrência): o router depende de MySQL/Drizzle e a simulação
 * completa da transação não acrescentaria uma garantia real de lock. Eles
 * não abrem conexão, não usam dados de produção e não alegam comprovar
 * comportamento concorrente; verificam apenas que a implementação mantém
 * os contratos de atomicidade e ordenação exigidos pelo PR456.
 */
const routerSource = readFileSync(
  new URL("./routers/customerPassword.ts", import.meta.url),
  "utf8"
);

function section(startMarker: string, endMarker: string): string {
  const start = routerSource.indexOf(startMarker);
  if (start < 0) throw new Error(`Contrato não encontrado: ${startMarker}`);
  const end = routerSource.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Fim do contrato não encontrado: ${endMarker}`);
  return routerSource.slice(start, end);
}

function firstMatchIndex(source: string, patterns: RegExp[]): number {
  const indexes = patterns
    .map(pattern => {
      const match = pattern.exec(source);
      return match?.index ?? -1;
    })
    .filter(index => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function tableLockIndex(source: string, table: string): number {
  return firstMatchIndex(source, [
    new RegExp(
      `(?:from\\(\\s*${table}\\s*\\)|FROM\\s+${table})[\\s\\S]{0,900}?\\.for\\s*\\(\\s*["']update["']\\s*\\)`,
      "i"
    ),
    new RegExp(`FROM\\s+${table}[\\s\\S]{0,500}?FOR\\s+UPDATE`, "i"),
  ]);
}

function expectFound(index: number, description: string): void {
  expect(index, description).toBeGreaterThanOrEqual(0);
}

describe("customerPassword hardening — source-contract (sem banco real)", () => {
  it("loginVerified e login delegam ao helper que trava cliente e senha antes de comparar/inserir", () => {
    const helperStart = firstMatchIndex(routerSource, [
      /(?:async\s+)?function\s+authenticateVerifiedCustomer\b/,
      /(?:const|let)\s+authenticateVerifiedCustomer\s*=\s*(?:async\s*)?/,
    ]);
    expectFound(helperStart, "helper authenticateVerifiedCustomer");
    const helperEnd = routerSource.indexOf(
      "export const customerPasswordRouter",
      helperStart
    );
    expectFound(helperEnd, "fim do helper compartilhado");
    const helper = routerSource.slice(helperStart, helperEnd);

    expect(helper).toMatch(/\bdb\.transaction\s*\(/);
    const customerLock = tableLockIndex(helper, "customers");
    const passwordLock = tableLockIndex(helper, "customerPasswords");
    expectFound(customerLock, "lock do cliente com FOR UPDATE");
    expectFound(passwordLock, "lock da senha com FOR UPDATE");
    expect(passwordLock).toBeGreaterThan(customerLock);

    const compare = firstMatchIndex(helper, [/bcrypt\.compare\s*\(/]);
    const sessionInsert = firstMatchIndex(helper, [
      /insert\(\s*customerPasswordSessions\s*\)/,
    ]);
    expectFound(compare, "bcrypt.compare dentro da transação");
    expectFound(sessionInsert, "inserção de sessão dentro da transação");
    expect(compare).toBeGreaterThan(passwordLock);
    expect(sessionInsert).toBeGreaterThan(compare);

    const loginVerified = section("loginVerified:", "\n  login:");
    const login = section("\n  login:", "\n  checkSession:");
    for (const [name, route] of [
      ["loginVerified", loginVerified],
      ["login", login],
    ] as const) {
      expect(route, `${name} deve chamar o helper compartilhado`).toMatch(
        /authenticateVerifiedCustomer\s*\(/
      );
      expect(
        route,
        `${name} não deve comparar a senha fora do helper`
      ).not.toMatch(/bcrypt\.compare\s*\(/);
      expect(
        route,
        `${name} não deve inserir sessão fora do helper`
      ).not.toMatch(/insert\(\s*customerPasswordSessions\s*\)/);
    }
  });

  it("request de recovery mantém lock, rechecagem, cooldown, INSERT e delivery na mesma transação", () => {
    const request = section(
      "requestPasswordRecovery:",
      "\n  finishPasswordRecovery:"
    );
    const transaction = firstMatchIndex(request, [
      /\bdb\.transaction\s*\(\s*async\s*(?:\(\s*)?tx\b/,
    ]);
    expectFound(transaction, "transação do requestPasswordRecovery");
    const transactionalRequest = request.slice(transaction);

    const customerLock = tableLockIndex(transactionalRequest, "customers");
    const modeRecheck = firstMatchIndex(transactionalRequest, [
      /from\(\s*appSettings\s*\)/,
      /FROM\s+appSettings/i,
    ]);
    const passwordRecheck = firstMatchIndex(transactionalRequest, [
      /from\(\s*customerPasswords\s*\)/,
      /FROM\s+customerPasswords/i,
    ]);
    const recent = firstMatchIndex(transactionalRequest, [
      /SELECT\s+createdAt[\s\S]{0,300}?FROM\s+customerPasswordRecovery/i,
    ]);
    const insert = firstMatchIndex(transactionalRequest, [
      /INSERT\s+INTO\s+customerPasswordRecovery/i,
    ]);
    const delivery = firstMatchIndex(transactionalRequest, [
      /deliverOwnSiteCode\s*\(/,
    ]);

    expectFound(customerLock, "lock do cliente do request");
    expectFound(modeRecheck, "rechecagem transacional do modo");
    expectFound(passwordRecheck, "rechecagem transacional da senha");
    expectFound(recent, "consulta transacional do cooldown");
    expectFound(insert, "INSERT transacional do recovery");
    expectFound(delivery, "delivery do código de recovery");
    expect(customerLock).toBeGreaterThan(0);
    expect(Math.min(modeRecheck, passwordRecheck)).toBeGreaterThan(
      customerLock
    );
    expect(recent).toBeGreaterThan(Math.max(modeRecheck, passwordRecheck));
    expect(insert).toBeGreaterThan(recent);
    expect(delivery).toBeGreaterThan(insert);

    // Se o SMTP falhar, a exceção precisa sair da transação depois do INSERT
    // transacional; assim o INSERT é desfeito e a tentativa seguinte não fica
    // artificialmente em cooldown. Isso é uma garantia estrutural, não uma
    // prova de concorrência em runtime.
    expect(transactionalRequest).toMatch(
      /try\s*\{[\s\S]{0,1200}deliverOwnSiteCode\s*\([\s\S]{0,1000}\}\s*catch[\s\S]{0,700}throw\s+new\s+TRPCError/s
    );
    expect(transactionalRequest).not.toMatch(
      /await\s+db\.execute\s*\(\s*sql`[\s\S]{0,300}INSERT\s+INTO\s+customerPasswordRecovery/i
    );
  });

  it("finish bloqueia appSettings/cliente/senha e remove todas as sessões legadas por telefone normalizado", () => {
    const finish = section("finishPasswordRecovery:", "\n  adminListPending:");
    const transaction = firstMatchIndex(finish, [
      /\bdb\.transaction\s*\(\s*async\s*(?:\(\s*)?tx\b/,
    ]);
    expectFound(transaction, "transação do finishPasswordRecovery");

    const appSettingsLock = tableLockIndex(finish, "appSettings");
    const customerLock = tableLockIndex(finish, "customers");
    const passwordLock = tableLockIndex(finish, "customerPasswords");
    expectFound(appSettingsLock, "lock de appSettings");
    expectFound(customerLock, "lock do cliente");
    expectFound(passwordLock, "lock da senha");
    expect(appSettingsLock).toBeGreaterThan(transaction);
    expect(customerLock).toBeGreaterThan(appSettingsLock);
    expect(passwordLock).toBeGreaterThan(customerLock);

    const recoveryRowLock = firstMatchIndex(finish, [
      /FROM\s+customerPasswordRecovery[\s\S]{0,350}FOR\s+UPDATE/i,
    ]);
    expectFound(recoveryRowLock, "lock da linha de recovery");
    expect(recoveryRowLock).toBeGreaterThan(passwordLock);

    expect(finish).toMatch(
      /(?:tx\.delete\(\s*customerPasswordSessions\s*\)|DELETE\s+FROM\s+customerPasswordSessions)/i
    );
    const customerSessionDeleteStart = firstMatchIndex(finish, [
      /DELETE\s+FROM\s+customerPasswordSessions/i,
    ]);
    expectFound(customerSessionDeleteStart, "DELETE das sessões centrais");
    expect(finish.slice(customerSessionDeleteStart)).toMatch(
      /REGEXP_REPLACE\s*\(\s*[^,]+,\s*["']\[\^0-9\]["']/i
    );
    const legacyDeleteStart = firstMatchIndex(finish, [
      /DELETE\s+FROM\s+spreadsheetSessions/i,
    ]);
    expectFound(legacyDeleteStart, "DELETE das sessões legadas");
    const legacyDelete = finish.slice(legacyDeleteStart);
    expect(legacyDelete).toMatch(/clientId\s+IN\s*\(/i);
    expect(legacyDelete).toMatch(
      /REGEXP_REPLACE\s*\(\s*[^,]+,\s*["']\[\^0-9\]["']/i
    );
    expect(legacyDelete).toMatch(
      /spreadsheetClients[\s\S]{0,700}REGEXP_REPLACE/i
    );
    expect(legacyDelete).not.toMatch(/LIMIT\s+1/i);
  });
});
