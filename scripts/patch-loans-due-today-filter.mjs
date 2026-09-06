import fs from 'node:fs';

const clientPath = 'client/src/pages/AdminLoans.tsx';
const serverPath = 'server/routers/loans.ts';

function patchClient() {
  let source = fs.readFileSync(clientPath, 'utf8');

  if (!source.includes('| "vence_hoje"')) {
    const unionAnchor = '"pago_hoje" | "todos"';
    if (!source.includes(unionAnchor)) throw new Error('Não encontrei a união de filtros do LoansTab.');
    source = source.replace(unionAnchor, '"pago_hoje" | "vence_hoje" | "todos"');
  }

  if (!source.includes('id: "vence_hoje"')) {
    const cardAnchor = '{ id: "pago_hoje",         emoji: "💰", label: "Pago Hoje",';
    const start = source.indexOf(cardAnchor);
    if (start < 0) throw new Error('Não encontrei o card Pago Hoje para inserir Vencendo Hoje.');
    const lineEnd = source.indexOf('\n', start);
    if (lineEnd < 0) throw new Error('Linha do card Pago Hoje inválida.');
    const dueCard = '\n            { id: "vence_hoje",        emoji: "📅", label: "Vencendo Hoje",    color: "border-amber-500/50 bg-amber-500/10 text-amber-300",  active: "border-amber-500 bg-amber-600 text-white shadow-lg" },';
    source = source.slice(0, lineEnd) + dueCard + source.slice(lineEnd);
  }

  fs.writeFileSync(clientPath, source);
  console.log('[patch-loans-due-today] Frontend atualizado.');
}

function patchServer() {
  let source = fs.readFileSync(serverPath, 'utf8');

  if (!source.includes("input.status === 'vence_hoje'")) {
    const anchor = "      } else if (input.status === 'pago_hoje') {";
    if (!source.includes(anchor)) throw new Error('Não encontrei o filtro pago_hoje no backend.');

    const block = `      } else if (input.status === 'vence_hoje') {\n        // Empréstimos com pelo menos uma parcela vencendo hoje no horário de São Paulo.\n        const venceHoje = getBrazilToday();\n        const venceHojeRows = await qRows(db, drizzleSql\`\n          SELECT DISTINCT loanId\n          FROM loanInstallments\n          WHERE dueDate=\${venceHoje}\n            AND status IN ('pendente', 'em_analise')\n        \`);\n        const venceHojeIds = new Set(venceHojeRows.map((row: any) => Number(row.loanId)));\n        result = result.filter((r: any) => venceHojeIds.has(Number(r.id)));\n`;

    source = source.replace(anchor, block + anchor);
  }

  fs.writeFileSync(serverPath, source);
  console.log('[patch-loans-due-today] Backend atualizado.');
}

patchClient();
patchServer();
