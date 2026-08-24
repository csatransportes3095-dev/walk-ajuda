const fs = require('fs');

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error('Trecho não encontrado: ' + label);
  return text.replace(from, to);
}

const serverPath = 'server/routers/loans.ts';
let server = fs.readFileSync(serverPath, 'utf8');
if (!server.includes('diagnoseLoanStorage: adminProcedure')) {
  const anchor = '  getDashboard: adminProcedure.query(async () => {';
  const procedure = [
    '  diagnoseLoanStorage: adminProcedure.query(async () => {',
    '    const db = await getDb() as any;',
    '    const messageOf = (error: any) => String(',
    "      error?.cause?.cause?.message || error?.cause?.message || error?.message || error || 'erro desconhecido'",
    '    );',
    '    const result: any = {',
    '      database: null, loansExists: false, loanInstallmentsExists: false,',
    '      loansCount: null, installmentCount: null, joinCount: null,',
    '      loansError: null, installmentsError: null, joinError: null, metadataError: null,',
    '    };',
    '',
    '    try {',
    '      const dbRows = await qRows(db, drizzleSql`SELECT DATABASE() as dbName`);',
    '      result.database = dbRows[0]?.dbName || null;',
    '      const tableRows = await qRows(db, drizzleSql`',
    '        SELECT LOWER(TABLE_NAME) as tableName',
    '        FROM INFORMATION_SCHEMA.TABLES',
    '        WHERE TABLE_SCHEMA = DATABASE()',
    "          AND LOWER(TABLE_NAME) IN ('loans', 'loaninstallments')",
    '      `);',
    "      const names = new Set(tableRows.map((row: any) => String(row.tableName || '').toLowerCase()));",
    "      result.loansExists = names.has('loans');",
    "      result.loanInstallmentsExists = names.has('loaninstallments');",
    '    } catch (error: any) { result.metadataError = messageOf(error); }',
    '',
    '    try {',
    '      const rows = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loans`);',
    '      result.loansCount = Number(rows[0]?.cnt || 0); result.loansExists = true;',
    '    } catch (error: any) { result.loansError = messageOf(error); }',
    '',
    '    try {',
    '      const rows = await qRows(db, drizzleSql`SELECT COUNT(*) as cnt FROM loanInstallments`);',
    '      result.installmentCount = Number(rows[0]?.cnt || 0); result.loanInstallmentsExists = true;',
    '    } catch (error: any) { result.installmentsError = messageOf(error); }',
    '',
    '    try {',
    '      const rows = await qRows(db, drizzleSql`',
    '        SELECT COUNT(*) as cnt',
    '        FROM loanInstallments li',
    '        INNER JOIN loans l ON l.id = li.loanId',
    '      `);',
    '      result.joinCount = Number(rows[0]?.cnt || 0);',
    '    } catch (error: any) { result.joinError = messageOf(error); }',
    '',
    '    return result;',
    '  }),',
    '',
    anchor,
  ].join('\n');
  server = replaceOnce(server, anchor, procedure, 'getDashboard');
  fs.writeFileSync(serverPath, server);
}

const clientPath = 'client/src/pages/AdminLoans.tsx';
let client = fs.readFileSync(clientPath, 'utf8');
if (!client.includes('storageDiagnosticQuery')) {
  const oldHook = [
    '  const proofStatsQuery = trpc.loans.getProofDashboardStats.useQuery(undefined, { staleTime: 15_000 });',
    '  const { data, isLoading, isError, error, refetch } = dashboardQuery;',
  ].join('\n');
  const newHook = [
    '  const proofStatsQuery = trpc.loans.getProofDashboardStats.useQuery(undefined, { staleTime: 15_000 });',
    '  const storageDiagnosticQuery = trpc.loans.diagnoseLoanStorage.useQuery(undefined, { enabled: dashboardQuery.isError, retry: false });',
    '  const { data, isLoading, isError, error, refetch } = dashboardQuery;',
  ].join('\n');
  client = replaceOnce(client, oldHook, newHook, 'hook diagnóstico');

  const oldPanel = [
    '      <p className="mt-1 text-xs text-muted-foreground">{(error as any)?.message || \'A consulta demorou demais ou o banco não respondeu.\'}</p>',
    '      <Button className="mt-4" size="sm" variant="outline" onClick={() => refetch()}>',
  ].join('\n');
  const newPanel = [
    '      <p className="mt-1 text-xs text-muted-foreground">{(error as any)?.message || \'A consulta demorou demais ou o banco não respondeu.\'}</p>',
    '      <div className="mt-4 rounded-lg border border-red-500/20 bg-black/20 p-3 text-left text-xs">',
    '        {storageDiagnosticQuery.isLoading && <p className="text-muted-foreground">Verificando estrutura do banco...</p>}',
    '        {storageDiagnosticQuery.data && (() => {',
    '          const d: any = storageDiagnosticQuery.data;',
    '          return (',
    '            <div className="space-y-1">',
    '              <p><strong>Base conectada:</strong> {d.database || \'não identificada\'}</p>',
    '              <p><strong>Tabela loans:</strong> {d.loansExists ? \'EXISTE\' : \'NÃO ENCONTRADA\'} {d.loansCount !== null ? \' — \' + d.loansCount + \' empréstimo(s)\' : \'\'}</p>',
    '              <p><strong>Tabela loanInstallments:</strong> {d.loanInstallmentsExists ? \'EXISTE\' : \'NÃO ENCONTRADA\'} {d.installmentCount !== null ? \' — \' + d.installmentCount + \' parcela(s)\' : \'\'}</p>',
    '              <p><strong>Relacionamento parcelas → empréstimos:</strong> {d.joinCount !== null ? \'OK — \' + d.joinCount + \' registro(s)\' : \'FALHOU\'}</p>',
    '              {d.installmentsError && <p className="break-all text-red-300"><strong>Erro das parcelas:</strong> {d.installmentsError}</p>}',
    '              {d.joinError && <p className="break-all text-red-300"><strong>Erro do relacionamento:</strong> {d.joinError}</p>}',
    '              {d.loansError && <p className="break-all text-red-300"><strong>Erro de loans:</strong> {d.loansError}</p>}',
    '              {d.metadataError && <p className="break-all text-red-300"><strong>Erro de estrutura:</strong> {d.metadataError}</p>}',
    '            </div>',
    '          );',
    '        })()}',
    '        {storageDiagnosticQuery.isError && <p className="text-red-300">O diagnóstico separado também falhou: {(storageDiagnosticQuery.error as any)?.message}</p>}',
    '      </div>',
    '      <Button className="mt-4" size="sm" variant="outline" onClick={() => { refetch(); storageDiagnosticQuery.refetch(); }}>',
  ].join('\n');
  client = replaceOnce(client, oldPanel, newPanel, 'painel diagnóstico');
  fs.writeFileSync(clientPath, client);
}

console.log('Diagnóstico independente do armazenamento aplicado.');
