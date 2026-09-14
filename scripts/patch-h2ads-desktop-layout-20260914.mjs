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

// Desktop 4K: manter QUATRO cards por linha. O problema visto em producao nao era
// quantidade de colunas; o container da agenda estava encolhendo para a largura do
// conteudo. Forcamos o painel a ocupar toda a faixa horizontal disponivel.
replaceOnce(
  '<section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-black/20">',
  '<section className="col-span-full w-full min-w-0 max-w-none overflow-hidden rounded-2xl border border-cyan-400/20 bg-black/20">',
  'largura total do painel de agenda',
);

replaceOnce(
  'grid grid-cols-1 gap-4 p-3 md:grid-cols-2 xl:grid-cols-4',
  'grid w-full min-w-0 grid-cols-1 gap-4 p-3 md:grid-cols-2 lg:grid-cols-4',
  'grid da visualizacao de agenda',
);

replaceOnce(
  'grid grid-cols-1 gap-4 overflow-hidden rounded-b-2xl p-3 md:grid-cols-2 xl:grid-cols-4',
  'grid w-full min-w-0 grid-cols-1 gap-4 overflow-hidden rounded-b-2xl p-3 md:grid-cols-2 lg:grid-cols-4',
  'grid das instancias do grupo expandido',
);

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
      target.remove();
      return true;
    };

    hideLegacySchedule();
    observer = new MutationObserver(() => {
      hideLegacySchedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer?.disconnect();`,
  'observador persistente do painel legado',
);

// Protecao extra: os cards devem sempre esticar dentro da celula do grid.
replaceOnce(
  'return <article className="min-w-0 rounded-2xl border p-4 xl:p-4"',
  'return <article className="w-full min-w-0 rounded-2xl border p-4 xl:p-4"',
  'largura dos cards de instancia',
);

fs.writeFileSync(file, source, 'utf8');
console.log('[h2ads-desktop-layout] OK: painel em largura total e 4 cards por linha no desktop.');
