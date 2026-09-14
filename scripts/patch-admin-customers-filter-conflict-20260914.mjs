import fs from 'node:fs';

const page = 'client/src/pages/AdminCustomers.tsx';
const index = 'client/index.html';
let source = fs.readFileSync(page, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[customers-filter-fix] ${label}: esperado 1 bloco, encontrado ${count}`);
  source = source.replace(oldText, newText);
}

// Estado nativo dos filtros principais. O antigo customer-card-filters.js manipulava o DOM
// por fora do React, causando conflito com busca/indicador e deixando cards escondidos.
replaceOnce(
  `  const [showOnlyVip, setShowOnlyVip] = useState(false);\n  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "name">("newest");`,
  `  const [showOnlyVip, setShowOnlyVip] = useState(false);\n  const [customerListFilter, setCustomerListFilter] = useState<'all' | 'loan' | 'progress' | 'delivered'>('all');\n  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "name">("newest");`,
  'estado filtro geral',
);

// Integra os quatro filtros ao mesmo pipeline do React, sem esconder cards via dataset/MutationObserver.
replaceOnce(
  `    if (!matchesReferrerFilter(c)) return false;\n    if (showOnlyVip) return matchSearch && !!c.vipActive;\n    if (showOnlyOrders) return matchSearch && !!c.hasOrder;\n    if (showOnlyBlocked) return matchSearch && c.blocked === 1;\n    return matchSearch;`,
  `    if (!matchesReferrerFilter(c)) return false;\n    if (!matchSearch) return false;\n    if (customerListFilter === 'loan' && !hasLoanForCustomer(c)) return false;\n    if (customerListFilter === 'progress' && (!c.hasOrder || c.latestStatus === 'pedido_entregue' || c.latestStatus === 'cancelado')) return false;\n    if (customerListFilter === 'delivered' && c.latestStatus !== 'pedido_entregue') return false;\n    if (showOnlyVip && !c.vipActive) return false;\n    if (showOnlyOrders && !c.hasOrder) return false;\n    if (showOnlyBlocked && c.blocked !== 1) return false;\n    return true;`,
  'pipeline unico de filtros',
);

// Todo filtro que muda a lista reinicia a paginação incremental.
source = source.replace(
  `  }, [searchTerm, sortOrder, showOnlyVip, showOnlyOrders, showOnlyBlocked, referrerFilter]);`,
  `  }, [searchTerm, sortOrder, showOnlyVip, showOnlyOrders, showOnlyBlocked, referrerFilter, customerListFilter]);`,
);

const searchRow = `        <div className="flex gap-2">\n        <div className="relative flex-1">`;
const filterBar = `        <div className="flex gap-2">\n        <div className="relative flex-1">`;
if (!source.includes(searchRow)) throw new Error('[customers-filter-fix] barra de busca nao encontrada');

// Insere os filtros nativos logo depois da busca e antes do filtro por indicador.
const anchor = `        </div>\n\n        {/* Filtro por cadastro indicador */}`;
const nativeFilters = `        </div>\n\n        <div className="flex flex-wrap items-center gap-2">\n          {([\n            ['all', 'Todos', customers.length],\n            ['loan', '💳 Empréstimo ativo', customers.filter(c => hasLoanForCustomer(c)).length],\n            ['progress', '🔄 Pedidos em andamento', customers.filter(c => !!c.hasOrder && c.latestStatus !== 'pedido_entregue' && c.latestStatus !== 'cancelado').length],\n            ['delivered', '✅ Pedidos entregues', customers.filter(c => c.latestStatus === 'pedido_entregue').length],\n          ] as const).map(([key, label, count]) => (\n            <button\n              key={key}\n              type="button"\n              onClick={() => {\n                setCustomerListFilter(key);\n                setVisibleCustomerLimit(24);\n              }}\n              className={\`rounded-xl border px-3 py-2 text-xs font-black transition-colors \${customerListFilter === key ? 'border-blue-400 bg-blue-600 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}\`}\n            >\n              {label} ({count})\n            </button>\n          ))}\n          <button\n            type="button"\n            onClick={() => {\n              setSearchTerm('');\n              setReferrerFilter('all');\n              setCustomerListFilter('all');\n              setShowOnlyVip(false);\n              setShowOnlyOrders(false);\n              setShowOnlyBlocked(false);\n              setSelectedIds(new Set());\n              setVisibleCustomerLimit(24);\n            }}\n            className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-500/20"\n            title="Limpar busca e todos os filtros desta página"\n          >\n            GERAL / LIMPAR FILTROS\n          </button>\n        </div>\n\n        {/* Filtro por cadastro indicador */}`;
replaceOnce(anchor, nativeFilters, 'barra nativa de filtros');

fs.writeFileSync(page, source, 'utf8');

// Remove somente o filtro DOM legado. Ele era carregado globalmente e escondia cartões
// com data-h2-filter-hidden fora do estado React. Nenhuma outra rota ou função é alterada.
let html = fs.readFileSync(index, 'utf8');
html = html.replace('    <script src="/customer-card-filters.js" defer></script>\n', '');
fs.writeFileSync(index, html, 'utf8');

console.log('[customers-filter-fix] OK: filtros unificados no React, reset GERAL e filtro DOM legado removido.');
