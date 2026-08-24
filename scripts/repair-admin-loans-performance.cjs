const fs = require('fs');

function assertContains(content, needle, label) {
  if (!content.includes(needle)) throw new Error(`Trecho não encontrado: ${label}`);
}

// 1) H2 Score: DDL apenas uma vez por processo + backfill uma vez + leitura em lote.
const h2Path = 'server/loans/h2Score.ts';
let h2 = fs.readFileSync(h2Path, 'utf8');

if (!h2.includes('h2ScoreInfrastructureReady')) {
  assertContains(h2, 'export const H2_SCORE_TIMEZONE = "America/Sao_Paulo";', 'timezone H2 Score');
  h2 = h2.replace(
    'export const H2_SCORE_TIMEZONE = "America/Sao_Paulo";',
    `export const H2_SCORE_TIMEZONE = "America/Sao_Paulo";\n\n// A infraestrutura é preparada uma única vez por processo. Chamadas simultâneas\n// compartilham a mesma Promise para evitar DDL repetido e locks desnecessários no TiDB.\nlet h2ScoreInfrastructureReady = false;\nlet h2ScoreInfrastructurePromise: Promise<void> | null = null;\nlet h2ScoreBackfillReady = false;\nlet h2ScoreBackfillPromise: Promise<void> | null = null;`
  );

  const ensureStart = h2.indexOf('export async function ensureLoanH2ScoreTables(db: any) {');
  const ensureEnd = h2.indexOf('\nexport async function getLoanH2ScoreConfig', ensureStart);
  if (ensureStart < 0 || ensureEnd < 0) throw new Error('Bloco ensureLoanH2ScoreTables não localizado');
  let ensureBlock = h2.slice(ensureStart, ensureEnd);
  ensureBlock = ensureBlock.replace(
    'export async function ensureLoanH2ScoreTables(db: any) {',
    `export async function ensureLoanH2ScoreTables(db: any) {\n  if (h2ScoreInfrastructureReady) return;\n  if (h2ScoreInfrastructurePromise) return h2ScoreInfrastructurePromise;\n  h2ScoreInfrastructurePromise = (async () => {`
  );
  const ensureLastBrace = ensureBlock.lastIndexOf('\n}');
  if (ensureLastBrace < 0) throw new Error('Fechamento ensureLoanH2ScoreTables não localizado');
  ensureBlock = ensureBlock.slice(0, ensureLastBrace) + `\n    h2ScoreInfrastructureReady = true;\n  })().catch((error) => {\n    h2ScoreInfrastructurePromise = null;\n    h2ScoreInfrastructureReady = false;\n    throw error;\n  });\n  return h2ScoreInfrastructurePromise;\n}` + ensureBlock.slice(ensureLastBrace + 2);
  h2 = h2.slice(0, ensureStart) + ensureBlock + h2.slice(ensureEnd);
}

if (!h2.includes('accountByCustomerId')) {
  const oldDirectoryLoop = `  const result: any[] = [];\n  for (const [customerId, links] of grouped.entries()) {\n    const preferred = [...links].sort((a, b) => Number(b.activeLoans || 0) - Number(a.activeLoans || 0))[0];\n    const account = await ensureCustomerH2ScoreAccount(db, customerId, preferred?.loanClientId ? Number(preferred.loanClientId) : null);`;
  assertContains(h2, oldDirectoryLoop, 'loop diretório H2 Score');
  const newDirectoryLoop = `  // Busca as contas existentes em uma única consulta. Antes era uma consulta sequencial\n  // por cliente, o que deixava o ADM lento com centenas de cadastros.\n  const customerIds = Array.from(grouped.keys());\n  const existingAccounts = customerIds.length\n    ? rows(await db.execute(sql\`SELECT * FROM customerH2ScoreAccounts WHERE customerId IN (\${sql.raw(customerIds.join(','))})\`))\n    : [];\n  const accountByCustomerId = new Map<number, any>(existingAccounts.map((account: any) => [Number(account.customerId), account]));\n\n  const result: any[] = [];\n  for (const [customerId, links] of grouped.entries()) {\n    const preferred = [...links].sort((a, b) => Number(b.activeLoans || 0) - Number(a.activeLoans || 0))[0];\n    let account = accountByCustomerId.get(customerId);\n    if (!account) {\n      account = await ensureCustomerH2ScoreAccount(db, customerId, preferred?.loanClientId ? Number(preferred.loanClientId) : null);\n      accountByCustomerId.set(customerId, account);\n    }`;
  h2 = h2.replace(oldDirectoryLoop, newDirectoryLoop);
}

// Faz o backfill legado consultar apenas eventos ainda não migrados e executar uma vez por processo.
if (!h2.includes('existingEvent.id IS NULL')) {
  const backfillStart = h2.indexOf('export async function backfillLegacyH2ScoreEvents(db: any) {');
  if (backfillStart < 0) throw new Error('Backfill H2 Score não localizado');
  let backfillBlock = h2.slice(backfillStart);
  assertContains(backfillBlock, 'INNER JOIN loanClients lc ON lc.id=s.clientId', 'join backfill');
  backfillBlock = backfillBlock.replace(
    'INNER JOIN loanClients lc ON lc.id=s.clientId',
    `INNER JOIN loanClients lc ON lc.id=s.clientId\n    LEFT JOIN customerH2ScoreEvents existingEvent ON existingEvent.submissionId=s.id`
  );
  backfillBlock = backfillBlock.replace(
    `WHERE s.status='aprovado'`,
    `WHERE s.status='aprovado' AND existingEvent.id IS NULL`
  );
  backfillBlock = backfillBlock.replace(
    /\n    const exists = rows\(await db\.execute\(sql`SELECT id FROM customerH2ScoreEvents WHERE submissionId=\$\{row\.submissionId\} LIMIT 1`\)\)\[0\];\n    if \(exists\) continue;/,
    ''
  );
  h2 = h2.slice(0, backfillStart) + backfillBlock;
}

if (!h2.includes('if (h2ScoreBackfillReady) return;')) {
  const backfillStart = h2.indexOf('export async function backfillLegacyH2ScoreEvents(db: any) {');
  if (backfillStart < 0) throw new Error('Backfill H2 Score não localizado para cache');
  let block = h2.slice(backfillStart);
  block = block.replace(
    'export async function backfillLegacyH2ScoreEvents(db: any) {',
    `export async function backfillLegacyH2ScoreEvents(db: any) {\n  if (h2ScoreBackfillReady) return;\n  if (h2ScoreBackfillPromise) return h2ScoreBackfillPromise;\n  h2ScoreBackfillPromise = (async () => {`
  );
  const lastBrace = block.lastIndexOf('\n}');
  if (lastBrace < 0) throw new Error('Fechamento backfill não localizado');
  block = block.slice(0, lastBrace) + `\n    h2ScoreBackfillReady = true;\n  })().catch((error) => {\n    h2ScoreBackfillPromise = null;\n    h2ScoreBackfillReady = false;\n    throw error;\n  });\n  return h2ScoreBackfillPromise;\n}` + block.slice(lastBrace + 2);
  h2 = h2.slice(0, backfillStart) + block;
}

fs.writeFileSync(h2Path, h2);

// 2) Parcelamento: só marca a preparação como concluída depois que tudo realmente terminou.
const loansPath = 'server/routers/loans.ts';
let loans = fs.readFileSync(loansPath, 'utf8');
if (!loans.includes('_installmentPlansMigrationPromise')) {
  const start = loans.indexOf('let _installmentPlansMigrated = false;');
  const end = loans.indexOf('\nexport const loanRouter = router({', start);
  if (start < 0 || end < 0) throw new Error('Bloco ensureInstallmentPlansTable não localizado');
  let block = loans.slice(start, end);
  assertContains(block, 'async function ensureInstallmentPlansTable(db: any) {', 'ensure parcelamento');
  assertContains(block, '  _installmentPlansMigrated = true;', 'flag antecipada parcelamento');
  block = block.replace(
    `let _installmentPlansMigrated = false;\nasync function ensureInstallmentPlansTable(db: any) {\n  if (_installmentPlansMigrated) return;\n  _installmentPlansMigrated = true;`,
    `let _installmentPlansMigrated = false;\nlet _installmentPlansMigrationPromise: Promise<void> | null = null;\nasync function ensureInstallmentPlansTable(db: any) {\n  if (_installmentPlansMigrated) return;\n  if (_installmentPlansMigrationPromise) return _installmentPlansMigrationPromise;\n  _installmentPlansMigrationPromise = (async () => {`
  );
  const lastBrace = block.lastIndexOf('\n}');
  if (lastBrace < 0) throw new Error('Fechamento ensureInstallmentPlansTable não localizado');
  block = block.slice(0, lastBrace) + `\n    _installmentPlansMigrated = true;\n  })().catch((error) => {\n    _installmentPlansMigrationPromise = null;\n    _installmentPlansMigrated = false;\n    throw error;\n  });\n  return _installmentPlansMigrationPromise;\n}` + block.slice(lastBrace + 2);
  loans = loans.slice(0, start) + block + loans.slice(end);
}
fs.writeFileSync(loansPath, loans);

// 3) Dashboard: em erro, mostrar mensagem e botão de nova tentativa em vez de tela vazia/loop.
const adminPath = 'client/src/pages/AdminLoans.tsx';
let admin = fs.readFileSync(adminPath, 'utf8');
if (!admin.includes('Não foi possível carregar o Dashboard de Empréstimos')) {
  const old = `function DashboardTab() {\n  const { data, isLoading } = trpc.loans.getDashboard.useQuery();\n  const { data: proofStats } = trpc.loans.getProofDashboardStats.useQuery();\n  if (isLoading) return <div className="text-center py-12 text-muted-foreground"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></div>;\n  if (!data) return null;`;
  assertContains(admin, old, 'DashboardTab');
  const replacement = `function DashboardTab() {\n  const dashboardQuery = trpc.loans.getDashboard.useQuery(undefined, { staleTime: 15_000 });\n  const proofStatsQuery = trpc.loans.getProofDashboardStats.useQuery(undefined, { staleTime: 15_000 });\n  const { data, isLoading, isError, error, refetch } = dashboardQuery;\n  const proofStats = proofStatsQuery.data;\n  if (isLoading) return <div className="text-center py-12 text-muted-foreground"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></div>;\n  if (isError) return (\n    <Card className="border-red-500/30 bg-red-500/5 p-5 text-center">\n      <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-400" />\n      <p className="font-bold text-red-300">Não foi possível carregar o Dashboard de Empréstimos.</p>\n      <p className="mt-1 text-xs text-muted-foreground">{(error as any)?.message || 'A consulta demorou demais ou o banco não respondeu.'}</p>\n      <Button className="mt-4" size="sm" variant="outline" onClick={() => refetch()}>\n        <RefreshCw className="mr-2 h-4 w-4" />Tentar novamente\n      </Button>\n    </Card>\n  );\n  if (!data) return <div className="py-10 text-center text-sm text-muted-foreground">Dashboard sem dados para exibir.</div>;`;
  admin = admin.replace(old, replacement);
}
fs.writeFileSync(adminPath, admin);

console.log('Correções de estabilidade aplicadas com sucesso.');
