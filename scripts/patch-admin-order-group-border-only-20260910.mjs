import fs from 'node:fs';

const file = 'client/src/pages/AdminOrders.tsx';
let source = fs.readFileSync(file, 'utf8');

function assertExactlyOnce(text, label) {
  const count = source.split(text).length - 1;
  if (count !== 1) {
    throw new Error(`[order-group-border-only] ${label}: esperado 1 bloco, encontrado ${count}`);
  }
}

function replaceExactlyOnce(oldText, newText, label) {
  assertExactlyOnce(oldText, label);
  source = source.replace(oldText, newText);
}

// AUDITORIA FINAL DOS GRUPOS:
// 1. O painel/lista de grupos permanece exatamente como configurado pelo ADM.
// 2. O fundo do card do pedido pode acompanhar a cor/gradiente do STATUS.
// 3. A borda externa do card do pedido continua vindo do GRUPO.
// 4. A pequena faixa no topo DO CARD que mostra o grupo usa a cor SOLIDA do grupo.
// 5. Nenhuma regra especial por nome de grupo existe: vale para HOJE, ATIVAS etc.

assertExactlyOnce(
  '                <div key={group.id} className={`mx-4 mt-3 border-2 ${colorCfg.border} rounded-xl overflow-hidden`}>',
  'moldura externa do painel usa a cor do grupo',
);

assertExactlyOnce(
  '                  <div className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 ${colorCfg.header} border-b`}>',
  'painel do grupo preserva o cabecalho configurado',
);

assertExactlyOnce(
  '                      <span className={`${colorCfg.text} min-w-0 truncate font-black text-sm uppercase tracking-wider`}>{group.name}</span>',
  'painel do grupo preserva o nome configurado',
);

assertExactlyOnce(
  '                      <span className={`${colorCfg.badge} shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white`}>{groupOrders.length}</span>',
  'painel do grupo preserva o contador configurado',
);

// Corrige SOMENTE a faixa que aparece dentro do card de pedido.
// Antes ela usava c.header (ex.: bg-red-600/30), que era transparente e deixava
// o gradiente/cor do STATUS vazar por baixo. Agora usa c.hex, que e a cor solida
// ja definida pelo ADM para aquele grupo.
replaceExactlyOnce(
  '                  <div className={`${c.header} border-b px-4 py-1 flex items-center gap-2`}>\n                    <span className={`${c.text} text-xs font-bold`}>{orderGroup.icon} {orderGroup.name}</span>\n                  </div>',
  '                  <div className="border-b px-4 py-1 flex items-center gap-2" style={{ backgroundColor: c.hex, borderBottomColor: c.hex }}>\n                    <span className="text-white text-xs font-bold">{orderGroup.icon} {orderGroup.name}</span>\n                  </div>',
  'faixa do grupo dentro do card usa cor solida do grupo',
);

const expectedMainCardGroupBorder = "const c = GROUP_COLOR_MAP[orderGroup.color] || GROUP_COLOR_MAP.red;\n                  return c.border + ' ring-1 ring-offset-0';";
assertExactlyOnce(
  expectedMainCardGroupBorder,
  'borda do card principal continua vindo do grupo',
);

const expectedGroupedCardRule = 'className={`${statusCardBackground(statusCfg?.bg)} ${withoutBackgroundClasses(colorCfg.card)} border rounded-xl p-3 flex flex-col gap-2 cursor-pointer transition-all${isExpandedGroupCard ? \' col-span-full\' : \'\'}`}';
assertExactlyOnce(
  expectedGroupedCardRule,
  'card exibido dentro do painel do grupo usa fundo do status mantendo a borda do grupo',
);

fs.writeFileSync(file, source, 'utf8');
console.log('[order-group-border-only] OK: grupos preservados; bordas seguem o grupo; faixa do grupo no card usa HEX solido; fundo do card segue o status.');
