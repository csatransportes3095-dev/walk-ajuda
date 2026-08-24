const fs = require('fs');

const path = 'client/src/pages/AdminLoans.tsx';
let text = fs.readFileSync(path, 'utf8');

const oldDestructure = `  const { data, isLoading, isError, error, refetch } = dashboardQuery;`;
const newDestructure = `  const { data: dashboardData, isLoading, isError, error, refetch } = dashboardQuery;`;
if (!text.includes(oldDestructure)) throw new Error('Desestruturação do Dashboard não encontrada');
text = text.replace(oldDestructure, newDestructure);

const start = `  if (isError) return (\n    <Card className="border-red-500/30 bg-red-500/5 p-5 text-center">`;
const end = `  if (!data) return <div className="py-10 text-center text-sm text-muted-foreground">Dashboard sem dados para exibir.</div>;\n\n  const lucroAReceber = (data as any).lucroAReceber ?? 0;`;
const startIndex = text.indexOf(start);
const endIndex = text.indexOf(end);
if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) throw new Error('Bloco de erro do Dashboard não encontrado');

const replacement = `  const data: any = dashboardData ?? {\n    valorEmAberto: 0,\n    lucroAReceber: 0,\n    totalOverdue: 0,\n    totalDueToday: 0,\n    overdueClientsCount: 0,\n    activeCount: 0,\n    monthlyChart: [],\n  };\n\n  const lucroAReceber = data.lucroAReceber ?? 0;`;
text = text.slice(0, startIndex) + replacement + text.slice(endIndex + end.length);

const returnAnchor = `  return (\n    <div className="space-y-5">\n\n      {/* ── RESUMO DA CARTEIRA ── */}`;
const returnReplacement = `  return (\n    <div className="space-y-5">\n      {isError && (\n        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">\n          Dados financeiros indisponíveis no momento. Os visores permanecem zerados até a estrutura de Empréstimos estar disponível.\n        </div>\n      )}\n\n      {/* ── RESUMO DA CARTEIRA ── */}`;
if (!text.includes(returnAnchor)) throw new Error('Âncora do retorno do Dashboard não encontrada');
text = text.replace(returnAnchor, returnReplacement);

fs.writeFileSync(path, text);
console.log('Dashboard configurado para permanecer visível com valores zerados.');
