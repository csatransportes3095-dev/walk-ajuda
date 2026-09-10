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

// REGRA FINAL DO GRUPO:
// - a cor escolhida do grupo aparece SOMENTE nas bordas/molduras;
// - fundo do cabecalho permanece neutro;
// - fundo dos cards continua sendo controlado pelo STATUS;
// - nome, contador e telefone ficam neutros e nao herdam a cor do grupo.
// Este patch roda por ultimo justamente para impedir que outro patch visual
// volte a aplicar a cor do grupo no fundo/textos.
replaceOnce(
  '                  <div className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 ${colorCfg.header} border-b`}>',
  '                  <div className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 bg-card ${colorCfg.border} border-b`}>',
  'cabecalho do grupo com fundo neutro e borda colorida',
);

replaceOnce(
  '                      <span className={`${colorCfg.text} min-w-0 truncate font-black text-sm uppercase tracking-wider`}>{group.name}</span>',
  '                      <span className="min-w-0 truncate font-black text-sm uppercase tracking-wider text-white">{group.name}</span>',
  'nome do grupo neutro',
);

replaceOnce(
  '                      <span className={`${colorCfg.badge} shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white`}>{groupOrders.length}</span>',
  '                      <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/80">{groupOrders.length}</span>',
  'contador do grupo neutro',
);

replaceOnce(
  '                                  <p className={`${colorCfg.text} opacity-70 text-[11px] truncate`}>{order.phone}</p>',
  '                                  <p className="truncate text-[11px] text-white/60">{order.phone}</p>',
  'telefone neutro dentro do grupo',
);

// O patch de fundo por status executado antes deste ja transforma colorCfg.card
// para manter apenas classes de BORDA do grupo e usar statusCardBackground(...)
// no fundo do pedido. Validamos aqui que esse resultado final realmente existe.
const expectedCardRule = 'className={`${statusCardBackground(statusCfg?.bg)} ${withoutBackgroundClasses(colorCfg.card)} border rounded-xl p-3 flex flex-col gap-2 cursor-pointer transition-all${isExpandedGroupCard ? \' col-span-full\' : \'\'}`}';
if (!source.includes(expectedCardRule)) {
  throw new Error('[order-group-border-only] card do grupo nao esta usando fundo do status com somente bordas do grupo');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[order-group-border-only] OK: cor do grupo somente nas bordas; fundo, nome, contador e telefone neutros; card usa fundo do status.');
