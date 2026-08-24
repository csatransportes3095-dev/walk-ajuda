const fs = require('fs');

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Trecho não encontrado: ${label}`);
  return text.replace(from, to);
}

// Backend: diagnóstico administrativo somente leitura.
const serverPath = 'server/routers/loans.ts';
let server = fs.readFileSync(serverPath, 'utf8');
if (!server.includes('diagnoseLoanStorage: adminProcedure')) {
  const anchor = `  getDashboard: adminProcedure.query(async () => {`;
  const procedure = `  diagnoseLoanStorage: adminProcedure.query(async () => {\n    const db = await getDb() as any;\n    const messageOf = (error: any) => String(\n      error?.cause?.cause?.message || error?.cause?.message || error?.message || error || 'erro desconhecido'\n    );\n    const result: any = {\n      database: null,\n      loansExists: false,\n      loanInstallmentsExists: false,\n      loansCount: null,\n      installmentCount: null,\n      joinCount: null,\n      loansError: null,\n      installmentsError: null,\n      joinError: null,\n      metadataError: null,\n    };\n\n    try {\n      const dbRows = await qRows(db, drizzleSql\\`SELECT DATABASE() as dbName\\`);\n      result.database = dbRows[0]?.dbName || null;\n      const tableRows = await qRows(db, drizzleSql\\`\n        SELECT LOWER(TABLE_NAME) as tableName\n        FROM INFORMATION_SCHEMA.TABLES\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND LOWER(TABLE_NAME) IN ('loans', 'loaninstallments')\n      \\`);\n      const names = new Set(tableRows.map((row: any) => String(row.tableName || '').toLowerCase()));\n      result.loansExists = names.has('loans');\n      result.loanInstallmentsExists = names.has('loaninstallments');\n    } catch (error: any) {\n      result.metadataError = messageOf(error);\n    }\n\n    try {\n      const rows = await qRows(db, drizzleSql\\`SELECT COUNT(*) as cnt FROM loans\\`);\n      result.loansCount = Number(rows[0]?.cnt || 0);\n      result.loansExists = true;\n    } catch (error: any) {\n      result.loansError = messageOf(error);\n    }\n\n    try {\n      const rows = await qRows(db, drizzleSql\\`SELECT COUNT(*) as cnt FROM loanInstallments\\`);\n      result.installmentCount = Number(rows[0]?.cnt || 0);\n      result.loanInstallmentsExists = true;\n    } catch (error: any) {\n      result.installmentsError = messageOf(error);\n    }\n\n    try {\n      const rows = await qRows(db, drizzleSql\\`\n        SELECT COUNT(*) as cnt\n        FROM loanInstallments li\n        INNER JOIN loans l ON l.id = li.loanId\n      \\`);\n      result.joinCount = Number(rows[0]?.cnt || 0);\n    } catch (error: any) {\n      result.joinError = messageOf(error);\n    }\n\n    return result;\n  }),\n\n${anchor}`;
  server = replaceOnce(server, anchor, procedure, 'getDashboard');
  fs.writeFileSync(serverPath, server);
}

// Frontend: mostra diagnóstico independente quando o Dashboard principal falhar.
const clientPath = 'client/src/pages/AdminLoans.tsx';
let client = fs.readFileSync(clientPath, 'utf8');
if (!client.includes('storageDiagnosticQuery')) {
  client = replaceOnce(
    client,
    `  const proofStatsQuery = trpc.loans.getProofDashboardStats.useQuery(undefined, { staleTime: 15_000 });\n  const { data, isLoading, isError, error, refetch } = dashboardQuery;`,
    `  const proofStatsQuery = trpc.loans.getProofDashboardStats.useQuery(undefined, { staleTime: 15_000 });\n  const storageDiagnosticQuery = trpc.loans.diagnoseLoanStorage.useQuery(undefined, { enabled: dashboardQuery.isError, retry: false });\n  const { data, isLoading, isError, error, refetch } = dashboardQuery;`,
    'hook diagnóstico'
  );

  client = replaceOnce(
    client,
    `      <p className=\"mt-1 text-xs text-muted-foreground\">{(error as any)?.message || 'A consulta demorou demais ou o banco não respondeu.'}</p>\n      <Button className=\"mt-4\" size=\"sm\" variant=\"outline\" onClick={() => refetch()}>`,
    `      <p className=\"mt-1 text-xs text-muted-foreground\">{(error as any)?.message || 'A consulta demorou demais ou o banco não respondeu.'}</p>\n      <div className=\"mt-4 rounded-lg border border-red-500/20 bg-black/20 p-3 text-left text-xs\">\n        {storageDiagnosticQuery.isLoading && <p className=\"text-muted-foreground\">Verificando estrutura do banco...</p>}\n        {storageDiagnosticQuery.data && (() => {\n          const d: any = storageDiagnosticQuery.data;\n          return (\n            <div className=\"space-y-1\">\n              <p><strong>Base conectada:</strong> {d.database || 'não identificada'}</p>\n              <p><strong>Tabela loans:</strong> {d.loansExists ? 'EXISTE' : 'NÃO ENCONTRADA'} {d.loansCount !== null ? \\`— \\${d.loansCount} empréstimo(s)\\` : ''}</p>\n              <p><strong>Tabela loanInstallments:</strong> {d.loanInstallmentsExists ? 'EXISTE' : 'NÃO ENCONTRADA'} {d.installmentCount !== null ? \\`— \\${d.installmentCount} parcela(s)\\` : ''}</p>\n              <p><strong>Relacionamento parcelas → empréstimos:</strong> {d.joinCount !== null ? \\`OK — \\${d.joinCount} registro(s)\\` : 'FALHOU'}</p>\n              {d.installmentsError && <p className=\"break-all text-red-300\"><strong>Erro das parcelas:</strong> {d.installmentsError}</p>}\n              {d.joinError && <p className=\"break-all text-red-300\"><strong>Erro do relacionamento:</strong> {d.joinError}</p>}\n              {d.loansError && <p className=\"break-all text-red-300\"><strong>Erro de loans:</strong> {d.loansError}</p>}\n              {d.metadataError && <p className=\"break-all text-red-300\"><strong>Erro de estrutura:</strong> {d.metadataError}</p>}\n            </div>\n          );\n        })()}\n        {storageDiagnosticQuery.isError && <p className=\"text-red-300\">O diagnóstico separado também falhou: {(storageDiagnosticQuery.error as any)?.message}</p>}\n      </div>\n      <Button className=\"mt-4\" size=\"sm\" variant=\"outline\" onClick={() => { refetch(); storageDiagnosticQuery.refetch(); }}>`,
    'painel diagnóstico'
  );
  fs.writeFileSync(clientPath, client);
}

console.log('Diagnóstico independente do armazenamento aplicado.');
