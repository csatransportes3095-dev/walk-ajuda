import fs from 'node:fs';

const file = 'client/src/pages/AdminOrders.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`[orders-status-background] ${label}: esperado 1 bloco, encontrado ${count}`);
  }
  source = source.replace(oldText, newText);
}

// Usa SOMENTE a classe de fundo configurada no status.
// Classes de borda do status sao descartadas de proposito: o pedido do admin
// e alterar apenas o FUNDO do card, preservando todas as bordas existentes.
replaceOnce(
  `function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {\n`,
  `function statusCardBackground(statusBg?: string | null): string {\n  const backgroundClasses = (statusBg || '')\n    .split(/\\s+/)\n    .filter(Boolean)\n    .filter(className => className.startsWith('bg-'));\n  return backgroundClasses.length > 0 ? backgroundClasses.join(' ') : 'bg-card';\n}\n\nfunction withoutBackgroundClasses(classNames?: string | null): string {\n  return (classNames || '')\n    .split(/\\s+/)\n    .filter(Boolean)\n    .filter(className => !className.startsWith('bg-') && !className.startsWith('hover:bg-'))\n    .join(' ');\n}\n\nfunction InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {\n`,
  'helpers de fundo por status',
);

// Card da faixa de urgentes: fundo = status; bordas vermelhas continuam iguais.
replaceOnce(
  `                  className="bg-red-950/40 border border-red-500/50 rounded-xl p-3 flex flex-col gap-2 cursor-pointer hover:border-red-400 hover:bg-red-950/60 transition-all"`,
  `                  className={\`${'${statusCardBackground(urgentStatusCfg?.bg)}'} border border-red-500/50 rounded-xl p-3 flex flex-col gap-2 cursor-pointer hover:border-red-400 transition-all\`}`,
  'fundo do card urgente',
);

// Card dentro de grupo personalizado: fundo = status; borda/hover da borda do grupo permanecem.
replaceOnce(
  `                            className={\`${'${colorCfg.card}'} border rounded-xl p-3 flex flex-col gap-2 cursor-pointer transition-all${'${isExpandedGroupCard ? \' col-span-full\' : \'\'}'}\`}`,
  `                            className={\`${'${statusCardBackground(statusCfg?.bg)}'} ${'${withoutBackgroundClasses(colorCfg.card)}'} border rounded-xl p-3 flex flex-col gap-2 cursor-pointer transition-all${'${isExpandedGroupCard ? \' col-span-full\' : \'\'}'}\`}`,
  'fundo do card em grupo',
);

// Card principal de pedido: troca apenas bg-card pela cor de fundo do status.
replaceOnce(
  `              className={\`bg-card border rounded-xl overflow-hidden transition-all ${'${'}\n                isExpanded ? "col-span-full" : ""\n              } ${'${'}(() => {`,
  `              className={\`${'${statusCardBackground(statusCfg?.bg)}'} border rounded-xl overflow-hidden transition-all ${'${'}\n                isExpanded ? "col-span-full" : ""\n              } ${'${'}(() => {`,
  'fundo do card principal',
);

fs.writeFileSync(file, source, 'utf8');
console.log('[orders-status-background] OK: somente o fundo dos cards acompanha automaticamente a cor do status; bordas preservadas.');
