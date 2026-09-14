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

// Desktop: o usuario trabalha em tela 4K com escala do Windows em 175% e quer
// quatro cards por linha. Usamos 4 colunas a partir de lg para nao depender do
// breakpoint 2xl, que pode variar conforme a largura CSS efetiva/zoom do navegador.
replaceOnce(
  'grid grid-cols-1 gap-4 p-3 md:grid-cols-2 xl:grid-cols-4',
  'grid grid-cols-1 gap-4 p-3 md:grid-cols-2 lg:grid-cols-4',
  'grid da visualizacao de agenda',
);

replaceOnce(
  'grid grid-cols-1 gap-4 overflow-hidden rounded-b-2xl p-3 md:grid-cols-2 xl:grid-cols-4',
  'grid grid-cols-1 gap-4 overflow-hidden rounded-b-2xl p-3 md:grid-cols-2 lg:grid-cols-4',
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
      // Este bloco e exclusivamente o painel legado duplicado. Remover do DOM evita
      // que ele continue ocupando espaco ou reapareca sobre a tela no desktop.
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

// Mantem o titulo legivel sem forcar quebra caractere por caractere.
replaceOnce(
  '<h5 className="max-w-full break-words rounded-lg border px-2.5 py-1 text-base font-black tracking-tight text-white"',
  '<h5 className="max-w-full break-words rounded-lg border px-2.5 py-1 text-base font-black tracking-tight text-white"',
  'titulo da instancia',
);

fs.writeFileSync(file, source, 'utf8');
console.log('[h2ads-desktop-layout] OK: 4 cards no desktop, painel legado removido de forma persistente.');
