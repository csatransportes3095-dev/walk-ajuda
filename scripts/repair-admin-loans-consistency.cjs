const fs = require('fs');
const path = 'server/routers/loans.ts';
let s = fs.readFileSync(path, 'utf8');

function mustReplace(from, to, label) {
  if (!s.includes(from)) throw new Error(`Trecho não encontrado: ${label}`);
  s = s.replace(from, to);
}

// Cards de empréstimo: taxa automática muda status para atrasado; valores/contadores
// devem continuar aparecendo e a data deve respeitar o relógio do Brasil, não UTC.
const brTodaySql = `DATE(DATE_SUB(NOW(), INTERVAL 3 HOUR))`;
mustReplace(
  `(SELECT COALESCE(SUM(amount), 0) FROM loanInstallments WHERE loanId=l.id AND status='pendente' AND dueDate < CURDATE()) as overdueAmount,`,
  `(SELECT COALESCE(SUM(amount), 0) FROM loanInstallments WHERE loanId=l.id AND status IN ('pendente','atrasado') AND dueDate < ${brTodaySql}) as overdueAmount,`,
  'overdueAmount'
);
mustReplace(
  `(SELECT COALESCE(SUM(COALESCE(feeApplied, 0)), 0) FROM loanInstallments WHERE loanId=l.id AND status='pendente' AND dueDate < CURDATE()) as overdueFees,`,
  `(SELECT COALESCE(SUM(COALESCE(feeApplied, 0)), 0) FROM loanInstallments WHERE loanId=l.id AND status IN ('pendente','atrasado') AND dueDate < ${brTodaySql}) as overdueFees,`,
  'overdueFees'
);
mustReplace(
  `(SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id AND status='pendente' AND dueDate < CURDATE()) as overdueCount,`,
  `(SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id AND status IN ('pendente','atrasado') AND dueDate < ${brTodaySql}) as overdueCount,`,
  'overdueCount card'
);

// Score de risco legado: parcela que recebeu taxa continua sendo atraso.
mustReplace(
  `AND status='pendente' AND dueDate < \${today}`,
  `AND status IN ('pendente','atrasado') AND dueDate < \${today}`,
  'score de risco por atraso'
);

// Histórico de cobrança de juros: o fluxo grava status pago_juros, não notes='interest_only'.
mustReplace(
  `WHERE loanId=\${input.loanId} AND notes='interest_only'`,
  `WHERE loanId=\${input.loanId} AND status='pago_juros'`,
  'histórico de juros'
);

// Pagamento manual com comprovante também deve respeitar outros comprovantes em análise.
const oldManualProof = `    if (parseInt(pending[0].cnt) === 0) {\n      await db.execute(drizzleSql\`UPDATE loans SET status='pago', paidAt=NOW(), paidBy=\${paidBy} WHERE id=\${loanId}\`);\n    } else {\n      await db.execute(drizzleSql\`UPDATE loans SET status='aprovado' WHERE id=\${loanId} AND status='aguardando_pagamento'\`);\n    }\n    return { ok: true, hasProof: !!hasProof, fileUrl, h2ScoreApproval, permanentH2Score };`;
const newManualProof = `    if (parseInt(pending[0].cnt) === 0) {\n      await db.execute(drizzleSql\`UPDATE loans SET status='pago', paidAt=NOW(), paidBy=\${paidBy} WHERE id=\${loanId}\`);\n    } else {\n      const awaitingProof = await qRows(db, drizzleSql\`SELECT COUNT(*) as cnt FROM loanInstallments WHERE loanId=\${loanId} AND status IN ('aguardando_confirmacao','em_analise')\`);\n      if (parseInt(awaitingProof[0]?.cnt || 0) > 0) {\n        await db.execute(drizzleSql\`UPDATE loans SET status='aguardando_pagamento' WHERE id=\${loanId}\`);\n      } else {\n        await db.execute(drizzleSql\`UPDATE loans SET status='aprovado' WHERE id=\${loanId} AND status='aguardando_pagamento'\`);\n      }\n    }\n    return { ok: true, hasProof: !!hasProof, fileUrl, h2ScoreApproval, permanentH2Score };`;
mustReplace(oldManualProof, newManualProof, 'pagamento manual com comprovante');

fs.writeFileSync(path, s);
console.log('Consistência do módulo de empréstimos corrigida.');
