import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Anchor not found: ${label}`);
  return source.replace(from, to);
}

// 1) WelcomeScreen: jamais apagar a identidade do cliente por refresh/navegacao normal.
{
  const path = 'client/src/components/WelcomeScreen.tsx';
  let src = read(path);
  src = replaceOnce(src,
`function clearPreviousCustomerIdentity() {
  const localKeys = [
    "cp_token",
    "walk_access_granted",
    "walk_access_code",
    "walk_access_type",
    "walk_access_expires",
    "walk_client_phone",
    "customer_update_phone_hint",
    "customer_update_token",
  ];
  for (const key of localKeys) localStorage.removeItem(key);

  const sessionKeys = [
    "h2_customer_return_to",
    "walk_home_existing_phone",
    "walk_home_referral_phone",
    "walk_home_new_phone",
  ];
  for (const key of sessionKeys) sessionStorage.removeItem(key);
}

`, '', 'remove destructive identity helper');
  src = src.replaceAll('      clearPreviousCustomerIdentity();\n', '');
  src = src.replaceAll('    clearPreviousCustomerIdentity();\n', '');
  write(path, src);
}

// 2) PasswordGate: erro transitorio nao deve parecer logout; manter sessao enquanto valida.
{
  const path = 'client/src/components/PasswordGate.tsx';
  let src = read(path);
  src = replaceOnce(src,
`  const [accessGranted, setAccessGranted] = useState(false);`,
`  const [accessGranted, setAccessGranted] = useState(() => !!localStorage.getItem(CP_TOKEN_KEY) || localStorage.getItem(SESSION_KEY) === "true");`,
'accessGranted hydration');
  src = replaceOnce(src,
`      retry: false,                     // não tentar novamente em caso de erro`,
`      retry: 2,                         // falha transitória não pode virar logout`,
'checkSession retry');
  src = replaceOnce(src,
`      } else if (!accessGranted) {
        // Token inválido: só limpar se o cliente NÃO estava logado
        // (evita logout durante pedido ativo por erro transitório)
        localStorage.removeItem(CP_TOKEN_KEY);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_TYPE_KEY);
        localStorage.removeItem(SESSION_PHONE_KEY);
        setAccessGranted(false);
      }`,
`      } else {
        // O servidor só responde valid:false para token realmente inexistente,
        // expirado, bloqueado ou invalidado. Falhas técnicas viram erro da query.
        localStorage.removeItem(CP_TOKEN_KEY);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_TYPE_KEY);
        localStorage.removeItem(SESSION_PHONE_KEY);
        setAccessGranted(false);
      }`,
'invalid token handling');
  write(path, src);
}

// 3) OnlineEntryPanel: reutiliza a sessao principal e so limpa em invalidacao real.
{
  const path = 'client/src/components/OnlineEntryPanel.tsx';
  let src = read(path);
  src = replaceOnce(src,
`  const [token, setToken] = useState(() => localStorage.getItem(ENTRY_TOKEN_KEY) || "");`,
`  const [token, setToken] = useState(() => localStorage.getItem(ENTRY_TOKEN_KEY) || localStorage.getItem('cp_token') || "");`,
'entry token fallback');
  src = replaceOnce(src,
`  const sessionQ = trpc.onlineSupport.entrySession.useQuery({ token }, { enabled: !!token, retry: false, refetchInterval: token ? 10000 : false });`,
`  const sessionQ = trpc.onlineSupport.entrySession.useQuery({ token }, { enabled: !!token, retry: 2, refetchInterval: token ? 10000 : false, refetchOnReconnect: true });`,
'entry retry');
  src = replaceOnce(src,
`  useEffect(() => {
    if (sessionQ.data && !sessionQ.data.authenticated) {
      localStorage.removeItem(ENTRY_TOKEN_KEY);
      setToken("");
    }
  }, [sessionQ.data]);`,
`  useEffect(() => {
    if (sessionQ.data?.authenticated && token) {
      localStorage.setItem(ENTRY_TOKEN_KEY, token);
      localStorage.setItem('cp_token', token);
      return;
    }
    if (sessionQ.data && !sessionQ.data.authenticated && sessionQ.data.invalidSession) {
      localStorage.removeItem(ENTRY_TOKEN_KEY);
      localStorage.removeItem('cp_token');
      setToken("");
    }
  }, [sessionQ.data, token]);`,
'entry session state');
  write(path, src);
}

// 4) Gastos/Emprestimos: aceitam primeiro a sessao central; logout explicito limpa ambas.
for (const path of ['client/src/pages/GastosPage.tsx', 'client/src/pages/EmprestimoPage.tsx']) {
  let src = read(path);
  src = replaceOnce(src,
`  const [savedToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || '');`,
`  const [savedToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || localStorage.getItem('cp_token') || '');`,
`${path} saved token fallback`);
  src = replaceOnce(src,
`    { enabled: !!savedToken && !isLoggedIn, retry: false, refetchOnWindowFocus: false },`,
`    { enabled: !!savedToken && !isLoggedIn, retry: 2, refetchOnWindowFocus: false, refetchOnReconnect: true },`,
`${path} verify retry`);
  src = replaceOnce(src,
`    } else if (verifyQuery.data?.valid) {
      setToken(savedToken);`,
`    } else if (verifyQuery.data?.valid) {
      localStorage.setItem(TOKEN_KEY, savedToken);
      localStorage.setItem('cp_token', savedToken);
      setToken(savedToken);`,
`${path} persist unified token`);
  src = replaceOnce(src,
`    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CLIENT_ID_KEY);
    localStorage.removeItem(CLIENT_NAME_KEY);`,
`    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('cp_token');
    localStorage.removeItem('walk_online_entry_token');
    localStorage.removeItem(CLIENT_ID_KEY);
    localStorage.removeItem(CLIENT_NAME_KEY);`,
`${path} explicit logout keys`);
  write(path, src);
}

// 5) Login legado de Gastos tambem publica o token como sessao principal.
{
  const path = 'client/src/pages/GastosLoginPage.tsx';
  let src = read(path);
  src = src.replaceAll(
`          localStorage.setItem('gastos_token', loginResult.token);`,
`          localStorage.setItem('gastos_token', loginResult.token);
          localStorage.setItem('cp_token', loginResult.token);`
  );
  src = src.replaceAll(
`        localStorage.setItem('gastos_token', result.token);`,
`        localStorage.setItem('gastos_token', result.token);
        localStorage.setItem('cp_token', result.token);`
  );
  write(path, src);
}

// 6) Home logout explicito limpa todas as chaves locais ligadas à sessao.
{
  const path = 'client/src/pages/Home.tsx';
  let src = read(path);
  const marker = `                localStorage.removeItem('cp_token');\n                localStorage.removeItem('cp_expires_at');`;
  if (src.includes(marker)) {
    src = src.replace(marker,
`                localStorage.removeItem('cp_token');
                localStorage.removeItem('gastos_token');
                localStorage.removeItem('gastos_clientId');
                localStorage.removeItem('gastos_clientName');
                localStorage.removeItem('walk_online_entry_token');
                localStorage.removeItem('cp_expires_at');`);
  }
  write(path, src);
}

// 7) Backend customerPassword: aceita token emitido pelos dois logins e nunca mascara falha de DB.
{
  const path = 'server/routers/customerPassword.ts';
  let src = read(path);
  src = replaceOnce(src,
`  customerLoginHistory,
} from "../../drizzle/schema";`,
`  customerLoginHistory,
  spreadsheetSessions,
  spreadsheetClients,
} from "../../drizzle/schema";`,
'customer password unified imports');

  const start = src.indexOf('  checkSession: publicProcedure');
  const end = src.indexOf('  // â”€â”€ Logout', start);
  if (start < 0 || end < 0) throw new Error('customerPassword checkSession block not found');
  const replacement = `  checkSession: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const cleanToken = input.token.trim();
      if (!cleanToken) return { valid: false, reason: 'missing' as const };

      const rows = await db.select().from(customerPasswordSessions)
        .where(eq(customerPasswordSessions.token, cleanToken)).limit(1);
      let session: any = rows?.[0] || null;
      let source: 'customer' | 'spreadsheet' = 'customer';
      let phone = session?.phone || '';

      if (!session) {
        const legacyRows = await db.select().from(spreadsheetSessions)
          .where(eq(spreadsheetSessions.token, cleanToken)).limit(1);
        const legacySession = legacyRows?.[0] || null;
        if (legacySession) {
          const clientRows = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.id, legacySession.clientId)).limit(1);
          const client = clientRows?.[0] || null;
          if (!client) return { valid: false, reason: 'missing' as const };
          session = legacySession;
          source = 'spreadsheet';
          phone = String(client.phone || '');
        }
      }

      if (!session) return { valid: false, reason: 'missing' as const };
      if (!session.expiresAt || new Date(session.expiresAt) < new Date()) return { valid: false, reason: 'expired' as const };

      const customerForSession = await getCustomerByCleanPhone(String(phone).replace(/\\D/g, ''));
      if (customerForSession && (customerForSession as any).blocked === 1) {
        return { valid: false, blocked: true, reason: 'blocked' as const, blockReason: (customerForSession as any).blockReason || 'Acesso bloqueado' };
      }
      const profileUpdateMeta = getProfileUpdateMeta(customerForSession);

      try {
        const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
        const diff = newExpiry.getTime() - new Date(session.expiresAt).getTime();
        if (diff > 24 * 60 * 60 * 1000) {
          if (source === 'customer') {
            await db.update(customerPasswordSessions).set({ expiresAt: newExpiry, lastAccessAt: new Date() })
              .where(eq(customerPasswordSessions.token, cleanToken));
          } else {
            await db.update(spreadsheetSessions).set({ expiresAt: newExpiry, lastAccessAt: new Date() })
              .where(eq(spreadsheetSessions.token, cleanToken));
          }
        }
      } catch {}

      return { valid: true, phone, source, ...profileUpdateMeta };
    }),

`;
  src = src.slice(0, start) + replacement + src.slice(end);

  src = replaceOnce(src,
`      if (!db) return { success: true };
      await db
        .delete(customerPasswordSessions)
        .where(eq(customerPasswordSessions.token, input.token.trim()));
      return { success: true };`,
`      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const cleanToken = input.token.trim();
      await db.delete(customerPasswordSessions).where(eq(customerPasswordSessions.token, cleanToken));
      await db.delete(spreadsheetSessions).where(eq(spreadsheetSessions.token, cleanToken));
      return { success: true };`,
'unified logout backend');
  write(path, src);
}

// 8) Online support: diferenciar sessao invalida de erro tecnico.
{
  const path = 'server/routers/online-support.ts';
  let src = read(path);
  src = replaceOnce(src,
`      } catch (error: any) {
        return { authenticated: false, message: error?.message || 'Sessão inválida.' };
      }`,
`      } catch (error: any) {
        const message = String(error?.message || 'Sessão inválida.');
        const invalidSession = /sessão (inválida|expirada)|acesso bloqueado/i.test(message);
        if (!invalidSession) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
        return { authenticated: false, invalidSession: true, message };
      }`,
'entrySession transient errors');
  write(path, src);
}

// 9) Online entry accepts spreadsheet token too.
{
  const path = 'server/online-support/entry.ts';
  let src = read(path);
  src = replaceOnce(src,
`  const rows = resultRows(await db.execute(sql\`
    SELECT c.id, c.customerNumber, c.name, c.phone, c.cpf, c.email, c.cep, c.street, c.addressNumber, c.neighborhood, c.city, c.uf, c.profilePhotoUrl, c.blocked,
           s.expiresAt
    FROM customerPasswordSessions s
    INNER JOIN customers c ON c.phone = s.phone
    WHERE s.token=\${safeToken} AND c.deletedAt IS NULL
    LIMIT 1
  \`));
  const session = rows[0];`,
`  let rows = resultRows(await db.execute(sql\`
    SELECT c.id, c.customerNumber, c.name, c.phone, c.cpf, c.email, c.cep, c.street, c.addressNumber, c.neighborhood, c.city, c.uf, c.profilePhotoUrl, c.blocked,
           s.expiresAt
    FROM customerPasswordSessions s
    INNER JOIN customers c ON RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', ''), 11)=RIGHT(REGEXP_REPLACE(s.phone, '[^0-9]', ''), 11)
    WHERE s.token=\${safeToken} AND c.deletedAt IS NULL
    LIMIT 1
  \`));
  if (!rows[0]) {
    rows = resultRows(await db.execute(sql\`
      SELECT c.id, c.customerNumber, c.name, c.phone, c.cpf, c.email, c.cep, c.street, c.addressNumber, c.neighborhood, c.city, c.uf, c.profilePhotoUrl, c.blocked,
             s.expiresAt
      FROM spreadsheetSessions s
      INNER JOIN spreadsheetClients sc ON sc.id=s.clientId
      INNER JOIN customers c ON RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', ''), 11)=RIGHT(REGEXP_REPLACE(sc.phone, '[^0-9]', ''), 11)
      WHERE s.token=\${safeToken} AND c.deletedAt IS NULL
      LIMIT 1
    \`));
  }
  const session = rows[0];`,
'online entry unified token');
  write(path, src);
}

// 10) Customer update accepts either token source.
{
  const path = 'server/routers/customerUpdate.ts';
  let src = read(path);
  src = replaceOnce(src,
`  const sessions = await rows(db, sql\`
    SELECT phone, expiresAt
    FROM customerPasswordSessions
    WHERE token=\${token.trim()}
    LIMIT 1
  \`);
  const session = sessions[0];`,
`  const cleanToken = token.trim();
  let sessions = await rows(db, sql\`
    SELECT phone, expiresAt
    FROM customerPasswordSessions
    WHERE token=\${cleanToken}
    LIMIT 1
  \`);
  if (!sessions[0]) {
    sessions = await rows(db, sql\`
      SELECT sc.phone, s.expiresAt
      FROM spreadsheetSessions s
      INNER JOIN spreadsheetClients sc ON sc.id=s.clientId
      WHERE s.token=\${cleanToken}
      LIMIT 1
    \`);
  }
  const session = sessions[0];`,
'customer update unified session');
  src = src.replace('await db.execute(sql`UPDATE customerPasswordSessions SET lastAccessAt=NOW() WHERE token=${token.trim()}`);',
`try {
    await db.execute(sql\`UPDATE customerPasswordSessions SET lastAccessAt=NOW() WHERE token=\${cleanToken}\`);
    await db.execute(sql\`UPDATE spreadsheetSessions SET lastAccessAt=NOW() WHERE token=\${cleanToken}\`);
  } catch {}`);
  write(path, src);
}

// 11) Spreadsheet verify/resolve accepts central cp token and preserves technical errors.
{
  const path = 'server/routers/spreadsheet.ts';
  let src = read(path);

  const resolveStart = src.indexOf('export async function resolveClientId(token: string): Promise<number> {');
  const resolveEnd = src.indexOf('// Resolve o cliente autenticado para o manifesto', resolveStart);
  if (resolveStart < 0 || resolveEnd < 0) throw new Error('resolveClientId block not found');
  const resolveReplacement = `export async function resolveClientId(token: string): Promise<number> {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
  const cleanToken = token.trim();

  let sessionResult = await db.select().from(spreadsheetSessions)
    .where(eq(spreadsheetSessions.token, cleanToken)).limit(1);
  let session: any = sessionResult?.[0] || null;
  let client: any = null;
  let source: 'spreadsheet' | 'customer' = 'spreadsheet';

  if (session) {
    const clientResult = await db.select().from(spreadsheetClients)
      .where(eq(spreadsheetClients.id, session.clientId)).limit(1);
    client = clientResult?.[0] || null;
  } else {
    const cpRows = await db.select().from(customerPasswordSessions)
      .where(eq(customerPasswordSessions.token, cleanToken)).limit(1);
    const cpSession = cpRows?.[0] || null;
    if (cpSession) {
      source = 'customer';
      session = cpSession;
      const cleanPhone = normalizeCustomerPhone(cpSession.phone || '');
      let clientRows = await db.select().from(spreadsheetClients)
        .where(eq(spreadsheetClients.phone, cleanPhone)).limit(1);
      client = clientRows?.[0] || null;
      if (!client && cleanPhone) {
        const mainCustomer = await findMainCustomerByIdentity({ phone: cleanPhone }, db);
        if (mainCustomer) {
          const inserted = await db.insert(spreadsheetClients).values({
            phone: cleanPhone,
            name: mainCustomer.name || cleanPhone,
            cpf: mainCustomer.cpf || null,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          client = { id: (inserted as any).insertId, phone: cleanPhone, name: mainCustomer.name || cleanPhone, cpf: mainCustomer.cpf || null, status: 'active' };
        }
      }
    }
  }

  if (!session || !client) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida ou expirada. Faça login novamente." });
  if (!session.expiresAt || new Date(session.expiresAt) < new Date()) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida ou expirada. Faça login novamente." });

  try {
    await requireCompleteMainCustomerProfile(db, { phone: client.phone || '', cpf: client.cpf || '' });
  } catch {
    throw new TRPCError({ code: "FORBIDDEN", message: "Atualize foto, e-mail, CPF e telefone no cadastro principal para continuar." });
  }
  const accessCustomer = await findMainCustomerByIdentity({ phone: client.phone || '', cpf: client.cpf || '' }, db);
  if (!accessCustomer) throw new TRPCError({ code: "FORBIDDEN", message: "Conclua o cadastro principal para continuar." });
  const access = await getRouteAccess(accessCustomer.id, db);
  if (access.restricted && !access.routes.includes('gastos') && !access.routes.includes('emprestimo')) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso não autorizado para esta área." });
  }

  try {
    const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
    const currentExpiry = new Date(session.expiresAt);
    if (newExpiry.getTime() - currentExpiry.getTime() > 24 * 60 * 60 * 1000) {
      if (source === 'spreadsheet') await db.update(spreadsheetSessions).set({ expiresAt: newExpiry }).where(eq(spreadsheetSessions.token, cleanToken));
      else await db.update(customerPasswordSessions).set({ expiresAt: newExpiry, lastAccessAt: new Date() }).where(eq(customerPasswordSessions.token, cleanToken));
    }
  } catch {}

  return Number(client.id);
}

`;
  src = src.slice(0, resolveStart) + resolveReplacement + src.slice(resolveEnd);

  const verifyStart = src.indexOf('  verifySession: publicProcedure');
  const verifyEnd = src.indexOf('  // Retornar informações do plano', verifyStart);
  if (verifyStart < 0 || verifyEnd < 0) throw new Error('spreadsheet verifySession block not found');
  const verifyReplacement = `  verifySession: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
      const cleanToken = input.token.trim();

      let sessionRows = await db.select().from(spreadsheetSessions)
        .where(eq(spreadsheetSessions.token, cleanToken)).limit(1);
      let session: any = sessionRows?.[0] || null;
      let client: any = null;
      let source: 'spreadsheet' | 'customer' = 'spreadsheet';

      if (session) {
        const clientRows = await db.select().from(spreadsheetClients).where(eq(spreadsheetClients.id, session.clientId)).limit(1);
        client = clientRows?.[0] || null;
      } else {
        const cpRows = await db.select().from(customerPasswordSessions).where(eq(customerPasswordSessions.token, cleanToken)).limit(1);
        const cpSession = cpRows?.[0] || null;
        if (cpSession) {
          source = 'customer';
          session = cpSession;
          const cleanPhone = normalizeCustomerPhone(cpSession.phone || '');
          let clientRows = await db.select().from(spreadsheetClients).where(eq(spreadsheetClients.phone, cleanPhone)).limit(1);
          client = clientRows?.[0] || null;
          if (!client && cleanPhone) {
            const main = await findMainCustomerByIdentity({ phone: cleanPhone }, db);
            if (main) {
              const inserted = await db.insert(spreadsheetClients).values({ phone: cleanPhone, name: main.name || cleanPhone, cpf: main.cpf || null, status: 'active', createdAt: new Date(), updatedAt: new Date() });
              client = { id: (inserted as any).insertId, phone: cleanPhone, name: main.name || cleanPhone, cpf: main.cpf || null, status: 'active' };
            }
          }
        }
      }

      if (!session || !session.expiresAt || new Date(session.expiresAt) < new Date() || !client) return { valid: false };

      const mainCustomer = await findMainCustomerByIdentity({ phone: client.phone || undefined, cpf: client.cpf || undefined }, db);
      if (mainCustomer) {
        const profileUpdateState = await getCustomerProfileUpdateState(mainCustomer);
        if (profileUpdateState.pending) {
          return { valid: true, source, profileIncomplete: true, profileUpdateRequired: true, profileUpdateFields: profileUpdateState.effectiveFields, clientId: client.id, clientName: client.name, clientPhone: client.phone, message: 'Atualização cadastral obrigatória pelo administrador.' };
        }
      }
      try {
        await requireCompleteMainCustomerProfile(db, { phone: client.phone || '', cpf: client.cpf || '' });
      } catch (profileError: any) {
        return { valid: true, source, profileIncomplete: true, clientId: client.id, clientName: client.name, clientPhone: client.phone, message: profileError?.message || 'Atualize seus dados para continuar.' };
      }
      return { valid: true, source, profileIncomplete: false, clientId: client.id, clientName: client.name, clientPhone: client.phone };
    }),

`;
  src = src.slice(0, verifyStart) + verifyReplacement + src.slice(verifyEnd);

  const logoutOld = `        await db.delete(spreadsheetSessions).where(eq(spreadsheetSessions.token, input.token));
        return { success: true };`;
  const logoutNew = `        const cleanToken = input.token.trim();
        await db.delete(spreadsheetSessions).where(eq(spreadsheetSessions.token, cleanToken));
        await db.delete(customerPasswordSessions).where(eq(customerPasswordSessions.token, cleanToken));
        return { success: true };`;
  src = replaceOnce(src, logoutOld, logoutNew, 'spreadsheet unified logout');
  write(path, src);
}

// Regression test: static invariants + no destructive refresh.
write('server/customerSessionRefreshRegression.test.ts', `import { describe, expect, it } from 'vitest';\nimport fs from 'node:fs';\n\ndescribe('sessao persistente do cliente', () => {\n  it('refresh da home nao apaga a sessao', () => {\n    const src = fs.readFileSync('client/src/components/WelcomeScreen.tsx', 'utf8');\n    expect(src).not.toContain('function clearPreviousCustomerIdentity()');\n    expect(src).not.toContain('clearPreviousCustomerIdentity();');\n  });\n\n  it('rotas reaproveitam cp_token', () => {\n    const gastos = fs.readFileSync('client/src/pages/GastosPage.tsx', 'utf8');\n    const emprestimo = fs.readFileSync('client/src/pages/EmprestimoPage.tsx', 'utf8');\n    const entry = fs.readFileSync('client/src/components/OnlineEntryPanel.tsx', 'utf8');\n    expect(gastos).toContain("localStorage.getItem('cp_token')");\n    expect(emprestimo).toContain("localStorage.getItem('cp_token')");\n    expect(entry).toContain("localStorage.getItem('cp_token')");\n  });\n\n  it('backend nao transforma banco indisponivel em token invalido', () => {\n    const customer = fs.readFileSync('server/routers/customerPassword.ts', 'utf8');\n    const spreadsheet = fs.readFileSync('server/routers/spreadsheet.ts', 'utf8');\n    expect(customer).not.toContain('if (!db) return { valid: false }');\n    expect(spreadsheet).toContain('if (!db) throw new TRPCError');\n  });\n\n  it('logout invalida os dois tipos de sessao', () => {\n    const customer = fs.readFileSync('server/routers/customerPassword.ts', 'utf8');\n    const spreadsheet = fs.readFileSync('server/routers/spreadsheet.ts', 'utf8');\n    expect(customer).toContain('db.delete(spreadsheetSessions)');\n    expect(spreadsheet).toContain('db.delete(customerPasswordSessions)');\n  });\n});\n`);

console.log('unified customer session patch applied');
