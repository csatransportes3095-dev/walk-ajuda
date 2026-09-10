import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'client/src/pages/AdminCustomers.tsx');
let source = fs.readFileSync(file, 'utf8');

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`[admin-customers-referral-filter] ${label}: trecho esperado nao encontrado.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  `  const [visibleCustomerLimit, setVisibleCustomerLimit] = useState(24);`,
  `  const [visibleCustomerLimit, setVisibleCustomerLimit] = useState(24);\n  // Filtro visual por cadastro indicador. Nao altera cadastro, comissao ou historico.\n  const [referrerFilter, setReferrerFilter] = useState('all');`,
  'estado do filtro por indicador'
);

replaceRequired(
  `  const sortedCustomers = [...customers].sort((a, b) => {`,
  `  const referralSummary = useMemo(() => {\n    const counts = new Map<number, number>();\n\n    for (const referredCustomer of customers) {\n      if (referredCustomer.referredBy === 'Não informou') continue;\n\n      const phone = normalizeLoanCardPhone(referredCustomer.referredByPhone);\n      let referrer = phone ? referrerCustomerIndex.byPhone.get(phone) : undefined;\n\n      if (!referrer) {\n        const name = normalizeReferrerName(\n          referredCustomer.referredBy || (referredCustomer as any).resolvedReferrerName || ''\n        );\n        if (name) referrer = referrerCustomerIndex.byName.get(name);\n      }\n\n      if (!referrer || referrer.id === referredCustomer.id) continue;\n      counts.set(referrer.id, (counts.get(referrer.id) || 0) + 1);\n    }\n\n    const options = customers\n      .map((customer) => ({\n        id: customer.id,\n        name: customer.name,\n        phone: normalizeLoanCardPhone(customer.phone),\n        count: counts.get(customer.id) || 0,\n      }))\n      .filter((item) => item.count > 0)\n      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));\n\n    return { counts, options };\n  }, [customers, referrerCustomerIndex]);\n\n  const getReferralCount = (customer: Customer) => referralSummary.counts.get(customer.id) || 0;\n\n  const matchesReferrerFilter = (customer: Customer) => {\n    if (referrerFilter === 'all') return true;\n\n    const hasReferralReference = customer.referredBy !== 'Não informou' && !!(\n      customer.referredBy || (customer as any).resolvedReferrerName || customer.referredByPhone\n    );\n    if (referrerFilter === 'none') return !hasReferralReference;\n\n    if (!referrerFilter.startsWith('customer:')) return true;\n    const selectedId = Number(referrerFilter.slice('customer:'.length));\n    if (!Number.isFinite(selectedId)) return true;\n    return getReferrerCustomer(customer)?.id === selectedId;\n  };\n\n  const sortedCustomers = [...customers].sort((a, b) => {`,
  'resumo local de indicacoes'
);

replaceRequired(
  `    if (showOnlyVip) return matchSearch && !!c.vipActive;`,
  `    if (!matchesReferrerFilter(c)) return false;\n    if (showOnlyVip) return matchSearch && !!c.vipActive;`,
  'aplicar filtro por indicador'
);

replaceRequired(
  `  }, [searchTerm, sortOrder, showOnlyVip, showOnlyOrders, showOnlyBlocked]);`,
  `  }, [searchTerm, sortOrder, showOnlyVip, showOnlyOrders, showOnlyBlocked, referrerFilter]);`,
  'reset da lista ao mudar indicador'
);

replaceRequired(
  `        </div>\n\n        {/* Barra de Seleção em Massa */}`,
  `        </div>\n\n        {/* Filtro por cadastro indicador */}\n        <div className="flex flex-wrap items-center gap-2">\n          <select\n            value={referrerFilter}\n            onChange={(event) => setReferrerFilter(event.target.value)}\n            className="w-full sm:w-auto min-w-[240px] px-3 py-2.5 bg-card border border-emerald-500/30 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"\n            title="Filtrar clientes por quem fez a indicação"\n          >\n            <option value="all">Indicador: Todos</option>\n            {referralSummary.options.map((indicator) => (\n              <option key={indicator.id} value={\`customer:\${indicator.id}\`}>\n                {indicator.name} ({indicator.count})\n              </option>\n            ))}\n            <option value="none">Sem indicação</option>\n          </select>\n          {referrerFilter !== 'all' && (\n            <button\n              type="button"\n              onClick={() => setReferrerFilter('all')}\n              className="touch-manipulation rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"\n            >\n              Limpar indicador\n            </button>\n          )}\n        </div>\n\n        {/* Barra de Seleção em Massa */}`,
  'seletor de indicador no topo'
);

replaceRequired(
  `                    </div>\n                    {/* Pedidos em aberto */}`,
  `                    </div>\n                    {getReferralCount(c) > 0 && (\n                      <button\n                        type="button"\n                        onPointerDown={(event) => event.stopPropagation()}\n                        onClick={(event) => {\n                          event.stopPropagation();\n                          setReferrerFilter(\`customer:\${c.id}\`);\n                          setVisibleCustomerLimit(24);\n                          window.scrollTo({ top: 0, behavior: 'smooth' });\n                        }}\n                        className="mt-1.5 inline-flex touch-manipulation items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black text-emerald-300 transition-colors hover:bg-emerald-500/25 active:bg-emerald-500/30"\n                        title="Ver somente os clientes indicados por este cadastro"\n                      >\n                        <Users className="h-3.5 w-3.5" />\n                        <span>Indicou</span>\n                        <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[11px] text-emerald-200">{getReferralCount(c)}</span>\n                      </button>\n                    )}\n                    {/* Pedidos em aberto */}`,
  'contador clicavel no card do indicador'
);

fs.writeFileSync(file, source);
console.log('[admin-customers-referral-filter] OK: contador no indicador + filtro por cadastro indicador.');
