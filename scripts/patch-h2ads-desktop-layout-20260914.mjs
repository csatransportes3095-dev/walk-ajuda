import fs from 'node:fs';

const file = 'client/src/pages/H2Ads.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`[h2ads-desktop-layout] ${label}: esperado 1 bloco, encontrado ${count}`);
  }
  source = source.replace(oldText, newText);
}

// Desktop: quatro cards completos por linha deixa os cards estreitos demais e faz
// nomes/textos quebrarem letra por letra. Mantemos 1 coluna no celular, 2 no desktop
// medio e no maximo 3 em telas muito largas.
const oldGrid = 'grid grid-cols-1 gap-4 p-3 md:grid-cols-2 xl:grid-cols-4';
const gridCount = source.split(oldGrid).length - 1;
if (gridCount !== 2) {
  throw new Error(`[h2ads-desktop-layout] grids responsivos: esperado 2 blocos, encontrado ${gridCount}`);
}
source = source.split(oldGrid).join('grid grid-cols-1 gap-4 p-3 md:grid-cols-2 2xl:grid-cols-3');

// O painel legado pode ser recriado por re-render/refetch. O hotfix anterior parava de
// observar o DOM depois da primeira remocao; por isso ele podia reaparecer no desktop.
replaceOnce(
  `      const target = floatingAncestor ?? node;
      target.style.setProperty('display', 'none', 'important');
      target.setAttribute('data-h2ads-legacy-schedule-hidden', 'true');
      observer?.disconnect();
      return true;
    };

    if (!hideLegacySchedule()) {
      observer = new MutationObserver(() => {
        hideLegacySchedule();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => observer?.disconnect();`,
  `      const target = floatingAncestor ?? node;
      // Este bloco e exclusivamente o painel legado duplicado. Remover do DOM evita
      // que ele continue ocupando espaco ou volte a ser escolhido em mutacoes futuras.
      target.remove();
      return true;
    };

    // Executa agora e continua vigiando durante toda a vida da pagina, porque o painel
    // legado pode ser recriado por refetch/re-render no desktop.
    hideLegacySchedule();
    observer = new MutationObserver(() => {
      hideLegacySchedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer?.disconnect();`,
  'observador persistente do painel legado',
);

// Protecao adicional contra quebra vertical em nomes longos nos cards do desktop.
replaceOnce(
  '<h5 className="max-w-full break-words rounded-lg border px-2.5 py-1 text-base font-black tracking-tight text-white"',
  '<h5 className="max-w-full break-words [overflow-wrap:anywhere] rounded-lg border px-2.5 py-1 text-base font-black tracking-tight text-white"',
  'titulo da instancia',
);

fs.writeFileSync(file, source, 'utf8');
console.log('[h2ads-desktop-layout] OK: grids desktop limitados a 3 colunas e painel legado removido de forma persistente.');
