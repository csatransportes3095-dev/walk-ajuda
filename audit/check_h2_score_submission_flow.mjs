import fs from 'node:fs';

const root = '/home/ubuntu/walk-ajuda-audio-audit';
const files = {
  score: fs.readFileSync(`${root}/server/loans/h2Score.ts`, 'utf8'),
  loans: fs.readFileSync(`${root}/server/routers/loans.ts`, 'utf8'),
  online: fs.readFileSync(`${root}/server/online-support/entry.ts`, 'utf8'),
  admin: fs.readFileSync(`${root}/client/src/pages/AdminLoans.tsx`, 'utf8'),
};

const checks = [
  ['timezone America/Sao_Paulo', files.score.includes('America/Sao_Paulo')],
  ['pontuação até 18h inclusiva', files.score.includes('clock.minutes <= 18 * 60')],
  ['pontuação entre 18h e 20h', files.score.includes('clock.minutes < 20 * 60')],
  ['envio após vencimento recebe faixa própria', files.score.includes('clock.date > due')],
  ['tabela de tentativas H2 Score', files.score.includes('CREATE TABLE IF NOT EXISTS loanH2ScoreSubmissions')],
  ['tabela de lançamentos H2 Score', files.score.includes('CREATE TABLE IF NOT EXISTS loanH2ScoreLedger')],
  ['anti-duplicidade por tentativa', files.score.includes('UNIQUE KEY uq_h2score_ledger_submission')],
  ['pontuação entra somente na aprovação', files.score.includes("status='aprovado'") && files.score.includes('INSERT IGNORE INTO loanH2ScoreLedger')],
  ['recusa não registra pontos', files.score.includes("status='recusado'")],
  ['rota principal usa timestamp do servidor', files.loans.includes('const receivedAt = new Date();') && files.loans.includes('submittedAt: receivedAt')],
  ['rota principal entra em análise', files.loans.includes("status='em_analise'")],
  ['rota principal evita segundo comprovante ativo', files.loans.includes('Já existe um comprovante em análise para esta parcela.')],
  ['atendimento online usa timestamp do servidor', files.online.includes('const receivedAt = new Date();') && files.online.includes('submittedAt: receivedAt')],
  ['atendimento online registra H2 Score', files.online.includes('registerH2ScoreSubmission')],
  ['aprovação padrão efetiva H2 Score', files.loans.includes('approveH2ScoreSubmission(db, input.installmentId, paidBy)')],
  ['recusa bloqueia pontuação', files.loans.includes('refuseH2ScoreSubmission(db, input.installmentId, refusedBy)')],
  ['ADM recebe tentativa H2 Score', files.loans.includes('h2ScoreSubmission: scoreByInstallment.get')],
  ['ADM mostra faixa H2 Score', files.admin.includes('Faixa H2 Score:')],
  ['ADM mostra aprovação', files.admin.includes('Aprovação:')],
  ['ADM configura pontuações', files.admin.includes('Salvar regras do H2 Score')],
];

const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
for (const [label, ok] of checks) console.log(`${ok ? 'OK' : 'FALHOU'} - ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} controle(s) falharam: ${failed.join('; ')}`);
  process.exit(1);
}
console.log(`\n${checks.length} controles H2 Score aprovados.`);
