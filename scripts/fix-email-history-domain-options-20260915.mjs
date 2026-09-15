import fs from 'node:fs';

const generatorPath = 'client/src/components/AdminEmailGenerator.tsx';
let source = fs.readFileSync(generatorPath, 'utf8');

const wrongConfigBlock = `              <select
                value={activeDomain}
                onChange={event => setConfig(current => ({ ...current, activeDomain: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#090f1a] px-3 text-sm font-bold text-white outline-none focus:border-[#FFD400]/70"
              >
                {historyDomains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
              </select>`;

const correctConfigBlock = `              <select
                value={activeDomain}
                onChange={event => setConfig(current => ({ ...current, activeDomain: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#090f1a] px-3 text-sm font-bold text-white outline-none focus:border-[#FFD400]/70"
              >
                {config.domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
              </select>`;

if (source.includes(wrongConfigBlock)) {
  source = source.replace(wrongConfigBlock, correctConfigBlock);
}

const historyBlock = `                  <select value={historyDomain} onChange={event => setHistoryDomain(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-[#090f1a] px-3 text-xs font-bold text-white outline-none focus:border-sky-400/60">
                    <option value="all">Todos os domínios</option>
                    {config.domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
                  </select>`;

const fixedHistoryBlock = `                  <select value={historyDomain} onChange={event => setHistoryDomain(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-[#090f1a] px-3 text-xs font-bold text-white outline-none focus:border-sky-400/60">
                    <option value="all">Todos os domínios</option>
                    {historyDomains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
                  </select>`;

if (!source.includes(fixedHistoryBlock)) {
  if (!source.includes(historyBlock)) throw new Error('[email-history-domain] filtro de histórico não encontrado');
  source = source.replace(historyBlock, fixedHistoryBlock);
}

fs.writeFileSync(generatorPath, source);
console.log('[email-history-domain] configuração preservada; histórico usa domínios globais.');
