import fs from 'node:fs';

const file = 'client/src/pages/AdminCustomers.tsx';
let source = fs.readFileSync(file, 'utf8');

const cardOpenRegex = /<div key=\{c\.id\} className=\{`rounded-2xl overflow-hidden transition-all hover:-translate-y-0\.5 \$\{selectedIds\.has\(c\.id\) \? 'ring-2 ring-green-400' : editingId === c\.id \? 'ring-2 ring-blue-400' : ''\}`\} style=\{\{[\s\S]*?\n\s*\}\}>/;
const matches = source.match(cardOpenRegex);
if (!matches || matches.length !== 1) {
  throw new Error(`[customers-glass] abertura do card nao encontrada de forma unica`);
}

const replacement = `<div key={c.id} className={\`rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.01] \${selectedIds.has(c.id) ? 'ring-2 ring-green-400' : editingId === c.id ? 'ring-2 ring-blue-400' : ''}\`} style={{
                background: c.blocked === 1
                  ? 'linear-gradient(115deg, rgba(255,255,255,0.17) 0%, rgba(255,255,255,0.045) 23%, transparent 39%), linear-gradient(135deg, rgba(153,27,27,0.78) 0%, rgba(69,10,10,0.68) 48%, rgba(30,5,10,0.86) 100%)'
                  : c.vipActive
                  ? 'linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.055) 23%, transparent 39%), linear-gradient(135deg, rgba(217,119,6,0.74) 0%, rgba(146,64,14,0.48) 47.5%, rgba(91,33,182,0.56) 52.5%, rgba(46,16,101,0.82) 100%)'
                  : c.hasOrder && hasLoanForCustomer(c)
                  ? 'linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 23%, transparent 39%), linear-gradient(135deg, rgba(21,128,61,0.68) 0%, rgba(5,46,22,0.72) 47.5%, rgba(202,138,4,0.62) 52.5%, rgba(66,46,4,0.82) 100%)'
                  : hasLoanForCustomer(c)
                  ? 'linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 23%, transparent 39%), linear-gradient(135deg, rgba(202,138,4,0.68) 0%, rgba(113,63,18,0.62) 52%, rgba(36,26,0,0.84) 100%)'
                  : c.hasOrder
                  ? 'linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 23%, transparent 39%), linear-gradient(135deg, rgba(22,163,74,0.62) 0%, rgba(5,46,22,0.72) 52%, rgba(2,26,12,0.86) 100%)'
                  : 'linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 23%, transparent 39%), linear-gradient(135deg, rgba(79,70,229,0.58) 0%, rgba(49,46,129,0.54) 48%, rgba(30,27,75,0.84) 100%)',
                border: c.blocked === 1
                  ? '1px solid rgba(248,113,113,0.72)'
                  : c.vipActive
                  ? '1px solid rgba(253,224,71,0.78)'
                  : c.hasOrder && hasLoanForCustomer(c)
                  ? '1px solid rgba(250,204,21,0.62)'
                  : hasLoanForCustomer(c)
                  ? '1px solid rgba(250,204,21,0.58)'
                  : c.hasOrder
                  ? '1px solid rgba(74,222,128,0.58)'
                  : '1px solid rgba(165,180,252,0.48)',
                boxShadow: c.blocked === 1
                  ? 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(255,255,255,0.04), 0 10px 30px rgba(127,29,29,0.28)'
                  : c.vipActive
                  ? 'inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -1px 0 rgba(255,255,255,0.05), -8px 10px 32px rgba(217,119,6,0.22), 8px 10px 32px rgba(91,33,182,0.22)'
                  : c.hasOrder && hasLoanForCustomer(c)
                  ? 'inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -1px 0 rgba(255,255,255,0.04), -8px 10px 28px rgba(22,163,74,0.18), 8px 10px 28px rgba(202,138,4,0.19)'
                  : hasLoanForCustomer(c)
                  ? 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(255,255,255,0.04), 0 10px 28px rgba(202,138,4,0.20)'
                  : c.hasOrder
                  ? 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(255,255,255,0.04), 0 10px 28px rgba(22,163,74,0.20)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(255,255,255,0.04), 0 10px 28px rgba(79,70,229,0.18)',
                backdropFilter: 'blur(18px) saturate(150%)',
                WebkitBackdropFilter: 'blur(18px) saturate(150%)',
              }}>`;

source = source.replace(cardOpenRegex, replacement);
fs.writeFileSync(file, source, 'utf8');
console.log('[customers-glass] OK: cards com vidro, reflexo e mistura diagonal mantendo a logica atual.');
