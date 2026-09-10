import fs from 'node:fs';

const file = 'client/src/pages/AdminOrders.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`[order-group-border-only] ${label}: esperado 1 bloco, encontrado ${count}`);
  }
  source = source.replace(oldText, newText);
}

// O grupo continua usando a cor escolhida na moldura e na linha do cabecalho,
// mas o fundo do cabecalho permanece no tema normal do painel.
// O fundo dos cards NAO e alterado aqui: continua sendo controlado pelo status.
replaceOnce(
  '                  <div className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 ${colorCfg.header} border-b`}>',
  '                  <div className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 bg-card ${colorCfg.border} border-b`}>',
  'cabecalho do grupo com fundo neutro e borda colorida',
);

fs.writeFileSync(file, source, 'utf8');
console.log('[order-group-border-only] OK: cor do grupo somente na moldura/linha; fundos preservados.');
