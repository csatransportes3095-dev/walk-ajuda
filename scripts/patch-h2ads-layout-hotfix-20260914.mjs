import fs from 'node:fs';

const file = 'client/src/pages/H2Ads.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`[h2ads-layout-hotfix] ${label}: esperado 1 bloco, encontrado ${count}`);
  }
  source = source.replace(oldText, newText);
}

replaceOnce(
  'import { type FormEvent, type ReactNode, useMemo, useState } from "react";',
  'import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";',
  'import useEffect',
);

replaceOnce(
  '  const [scheduleFilter, setScheduleFilter] = useState<H2AdsScheduleFilter>("all");\n',
  `  const [scheduleFilter, setScheduleFilter] = useState<H2AdsScheduleFilter>("all");

  // Remove somente o painel legado que aparece como camada flutuante sobre os grupos.
  // A barra oficial permanece no fluxo normal da pagina e possui data-h2ads-schedule-topbar.
  useEffect(() => {
    let observer: MutationObserver | null = null;

    const hideLegacyFloatingSchedule = () => {
      const candidates = Array.from(document.body.querySelectorAll<HTMLElement>('div, aside, section, header'));
      for (const node of candidates) {
        if (node.closest('[data-h2ads-schedule-topbar]')) continue;

        const text = (node.textContent || '').replace(/\\s+/g, ' ').trim().toUpperCase();
        if (!text.includes('AGENDAMENTOS H2ADS') || !text.includes('SEPARADO DOS GRUPOS')) continue;

        let current: HTMLElement | null = node;
        while (current && current !== document.body) {
          const position = window.getComputedStyle(current).position;
          if (position === 'fixed' || position === 'absolute' || position === 'sticky') {
            current.style.setProperty('display', 'none', 'important');
            current.setAttribute('data-h2ads-legacy-schedule-hidden', 'true');
            observer?.disconnect();
            return true;
          }
          current = current.parentElement;
        }
      }
      return false;
    };

    if (!hideLegacyFloatingSchedule()) {
      observer = new MutationObserver(() => {
        hideLegacyFloatingSchedule();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => observer?.disconnect();
  }, []);
`,
  'ocultar filtro legado flutuante',
);

replaceOnce(
  'Filtro preso à barra superior · não cobre os grupos nem as instâncias.',
  'Filtros de agenda no fluxo da página · não cobrem os grupos nem as instâncias.',
  'texto da barra de agendamentos',
);

replaceOnce(
  '  return <div className="h2ads-workspace min-h-screen overflow-hidden bg-[#06070A] text-slate-100">',
  '  return <div className="h2ads-workspace min-h-screen overflow-x-clip bg-[#06070A] text-slate-100">',
  'overflow vertical da pagina',
);

replaceOnce(
  '      <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#0D1016]/90 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">',
  '      <section className="mt-6 overflow-visible rounded-3xl border border-white/10 bg-[#0D1016]/90 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">',
  'container dos grupos sem recorte vertical',
);

replaceOnce(
  '    <header className={`z-20 flex flex-col gap-3 rounded-t-2xl p-4 sm:flex-row sm:items-start sm:justify-between ${expanded ? "sticky top-0 border-b border-white/8 bg-[#0D1016]/95 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl" : ""}`}>',
  '    <header className={`flex flex-col gap-3 rounded-t-2xl p-4 sm:flex-row sm:items-start sm:justify-between ${expanded ? "border-b border-white/8" : ""}`}>',
  'grupo expandido permanece no ponto clicado',
);

if (!source.includes('data-h2ads-schedule-topbar')) {
  throw new Error('[h2ads-layout-hotfix] barra oficial de agendamento nao encontrada');
}
if (source.includes('sticky top-0 border-b border-white/8 bg-[#0D1016]/95')) {
  throw new Error('[h2ads-layout-hotfix] cabecalho sticky antigo ainda presente');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[h2ads-layout-hotfix] OK: filtro flutuante legado oculto; grupo abre sem saltar para o topo.');
