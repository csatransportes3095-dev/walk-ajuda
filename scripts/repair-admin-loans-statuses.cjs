const fs = require('fs');

const loansPath = 'server/routers/loans.ts';
let loans = fs.readFileSync(loansPath, 'utf8');

function replaceAllChecked(from, to, minCount, label) {
  const count = loans.split(from).length - 1;
  if (count < minCount) throw new Error(`${label}: esperava pelo menos ${minCount}, encontrou ${count}`);
  loans = loans.split(from).join(to);
}

// Parcelas que receberam taxa automática passam de pendente para atrasado.
// Toda detecção de vencidos deve considerar os dois estados.
replaceAllChecked(
  `WHERE dueDate < \${today} AND status='pendente'`,
  `WHERE dueDate < \${today} AND status IN ('pendente','atrasado')`,
  2,
  'filtro de parcelas vencidas'
);

replaceAllChecked(
  `AND li.status = 'pendente'\n      AND li.dueDate < \${today}`,
  `AND li.status IN ('pendente','atrasado')\n      AND li.dueDate < \${today}`,
  1,
  'alerta de inadimplência'
);

// Há código legado procurando aguardando_confirmacao, enquanto o fluxo atual usa em_analise.
const oldProofCheck = `SELECT COUNT(*) as cnt FROM loanInstallments WHERE loanId=\${loanId} AND status='aguardando_confirmacao'`;
const newProofCheck = `SELECT COUNT(*) as cnt FROM loanInstallments WHERE loanId=\${loanId} AND status IN ('aguardando_confirmacao','em_analise')`;
if (!loans.includes(oldProofCheck)) throw new Error('verificação de comprovante legado não localizada');
loans = loans.replace(oldProofCheck, newProofCheck);

fs.writeFileSync(loansPath, loans);

const adminPath = 'client/src/pages/AdminLoans.tsx';
let admin = fs.readFileSync(adminPath, 'utf8');
const oldAuto = `  const autoApplyFees = trpc.loans.autoApplyLateFees.useMutation();\n  useEffect(() => { autoApplyFees.mutate(); }, []);`;
const newAuto = `  const autoApplyFees = trpc.loans.autoApplyLateFees.useMutation({\n    onSuccess: async () => {\n      // A aplicação automática pode mudar valor e status para "atrasado".\n      // Atualiza imediatamente as informações visíveis no ADM.\n      await Promise.all([\n        utils.loans.listLoans.invalidate(),\n        utils.loans.getScoreDAlerts.invalidate(),\n        utils.loans.getDashboard.invalidate(),\n      ]);\n    },\n    onError: (e) => toast.error(e.message || 'Não foi possível atualizar as taxas automáticas.'),\n  });\n  useEffect(() => { autoApplyFees.mutate(); }, []);`;
if (!admin.includes(oldAuto)) throw new Error('autoApplyLateFees no AdminLoans não localizado');
admin = admin.replace(oldAuto, newAuto);
fs.writeFileSync(adminPath, admin);

console.log('Status e atualização automática corrigidos.');
