import fs from 'node:fs';

const file = 'client/src/pages/AdminOrders.tsx';
const source = fs.readFileSync(file, 'utf8');

function assertExactlyOnce(text, label) {
  const count = source.split(text).length - 1;
  if (count !== 1) {
    throw new Error(`[order-group-border-only] ${label}: esperado 1 bloco, encontrado ${count}`);
  }
}

// AUDITORIA FINAL DOS GRUPOS:
// 1. O visual do grupo deve permanecer exatamente como configurado pelo grupo
//    (cabecalho, texto, contador e moldura).
// 2. O fundo do card do pedido pode acompanhar a cor/gradiente do STATUS.
// 3. A borda do card do pedido deve continuar vindo do GRUPO.
// 4. Nenhuma regra especial por nome de grupo deve existir aqui.

assertExactlyOnce(
  '                <div key={group.id} className={`mx-4 mt-3 border-2 ${colorCfg.border} rounded-xl overflow-hidden`}>',
  'moldura externa usa a cor do grupo',
);

assertExactlyOnce(
  '                  <div className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 ${colorCfg.header} border-b`}>',
  'cabecalho preserva a cor original do grupo',
);

assertExactlyOnce(
  '                      <span className={`${colorCfg.text} min-w-0 truncate font-black text-sm uppercase tracking-wider`}>{group.name}</span>',
  'nome preserva a cor do grupo',
);

assertExactlyOnce(
  '                      <span className={`${colorCfg.badge} shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white`}>{groupOrders.length}</span>',
  'contador preserva a cor do grupo',
);

assertExactlyOnce(
  '                                  <p className={`${colorCfg.text} opacity-70 text-[11px] truncate`}>{order.phone}</p>',
  'telefone preserva a cor do grupo',
);

const expectedCardRule = 'className={`${statusCardBackground(statusCfg?.bg)} ${withoutBackgroundClasses(colorCfg.card)} border rounded-xl p-3 flex flex-col gap-2 cursor-pointer transition-all${isExpandedGroupCard ? \' col-span-full\' : \'\'}`}';
assertExactlyOnce(
  expectedCardRule,
  'card usa fundo do status mantendo as classes de borda do grupo',
);

console.log('[order-group-border-only] OK: cores originais dos grupos preservadas; moldura/borda continuam no grupo; somente o fundo dos cards acompanha o status.');
