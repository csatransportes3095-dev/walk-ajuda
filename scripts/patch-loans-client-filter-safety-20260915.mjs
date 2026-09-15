import fs from 'node:fs';

const clientPath = 'client/src/pages/AdminLoans.tsx';
const serverPath = 'server/routers/loans.ts';

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`[loans-client-safety] Trecho nao encontrado: ${label}`);
  return source.replace(from, to);
}

function replaceAllExact(source, from, to, expectedMinimum, label) {
  if (source.includes(to)) return source;
  const count = source.split(from).length - 1;
  if (count < expectedMinimum) {
    throw new Error(`[loans-client-safety] ${label}: esperado >= ${expectedMinimum}, encontrado ${count}`);
  }
  return source.split(from).join(to);
}

let server = fs.readFileSync(serverPath, 'utf8');

server = replaceOnce(
  server,
  `COUNT(CASE WHEN status NOT IN ('pago','cancelado','reprovado') THEN 1 END) as activeCount,`,
  `COUNT(CASE WHEN status NOT IN ('pago','cancelado','reprovado','pendente') AND NOT (status='aprovado' AND pixSentAt IS NULL) THEN 1 END) as activeCount,`,
  'dashboard usa a mesma definicao de emprestimo em andamento',
);

server = replaceAllExact(
  server,
  `          COUNT(DISTINCT l.id) as totalLoans,\n          COALESCE(SUM(CASE WHEN l.status NOT IN ('pago','cancelado','reprovado') THEN l.totalAmount ELSE 0 END),0) as openAmount`,
  `          COUNT(DISTINCT l.id) as totalLoans,\n          COALESCE((\n            SELECT COUNT(*)\n            FROM loanInstallments liProtection\n            JOIN loans lProtection ON lProtection.id = liProtection.loanId\n            WHERE lProtection.clientId = lc.id\n              AND liProtection.status IN ('pendente','atrasado','em_analise','aguardando_confirmacao')\n          ),0) as openInstallmentCount,\n          COALESCE(SUM(CASE WHEN l.status NOT IN ('pago','cancelado','reprovado') THEN l.totalAmount ELSE 0 END),0) as openAmount`,
  4,
  'listClients expor parcelas abertas',
);

server = replaceOnce(
  server,
  `    if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' });\n    await db.execute(drizzleSql\`UPDATE loanClients SET loanEnabled=\${input.enabled}, updatedAt=NOW() WHERE id=\${input.clientId}\`);`,
  `    if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' });\n\n    // Segurança financeira: retirar o acesso ao módulo não pode esconder a cobrança\n    // nem impedir o cliente de acompanhar parcelas ainda abertas.\n    if (input.enabled === 0) {\n      const protectionRows = await qRows(db, drizzleSql\`\n        SELECT COUNT(*) as openInstallmentCount\n        FROM loanInstallments li\n        JOIN loans l ON l.id = li.loanId\n        WHERE l.clientId = \${input.clientId}\n          AND li.status IN ('pendente','atrasado','em_analise','aguardando_confirmacao')\n      \`);\n      const openInstallmentCount = Number(protectionRows[0]?.openInstallmentCount || 0);\n      if (openInstallmentCount > 0) {\n        throw new TRPCError({\n          code: 'PRECONDITION_FAILED',\n          message: \`Não é possível desativar o acesso: este cliente possui \${openInstallmentCount} parcela(s) em aberto. Regularize as parcelas antes de desativar.\`,\n        });\n      }\n    }\n\n    await db.execute(drizzleSql\`UPDATE loanClients SET loanEnabled=\${input.enabled}, updatedAt=NOW() WHERE id=\${input.clientId}\`);`,
  'bloqueio backend ao desativar cliente com parcela aberta',
);

fs.writeFileSync(serverPath, server);

let client = fs.readFileSync(clientPath, 'utf8');

client = replaceOnce(
  client,
  `  const [filterMode, setFilterMode] = useState<"all" | "has_order" | "active_loan" | "no_order" | "sem_limite" | "desabilitado">("all");`,
  `  const [filterMode, setFilterMode] = useState<"all" | "has_order" | "active_loan" | "parcelas_abertas" | "no_order" | "sem_limite" | "desabilitado">("all");`,
  'novo filtro de parcelas abertas',
);

client = replaceOnce(
  client,
  `  const hasActiveLoan = (client: any) => activeLoanClientIds.has(Number(client?.id));\n\n  const clients = (clientsRaw as any[]).filter((client) => {\n    if (filterMode === "has_order") return hasOrderInSystem(client);\n    if (filterMode === "active_loan") return hasActiveLoan(client);\n    if (filterMode === "no_order") return !hasOrderInSystem(client);`,
  `  const hasActiveLoan = (client: any) => activeLoanClientIds.has(Number(client?.id));\n  const hasOpenInstallments = (client: any) => Number(client?.openInstallmentCount || 0) > 0;\n\n  const clients = (clientsRaw as any[]).filter((client) => {\n    if (filterMode === "has_order") return hasOrderInSystem(client);\n    if (filterMode === "active_loan") return hasActiveLoan(client);\n    if (filterMode === "parcelas_abertas") return hasOpenInstallments(client);\n    if (filterMode === "no_order") return !hasOrderInSystem(client);`,
  'separar emprestimo em andamento de parcelas abertas',
);

client = replaceOnce(
  client,
  `  const selectAllFiltered = () => {\n    setSelectedClientIds(new Set((clients as any[]).map((client) => Number(client.id))));\n  };`,
  `  const selectAllFiltered = () => {\n    const selectable = filterMode === "no_order"\n      ? (clients as any[]).filter((client) => !hasOpenInstallments(client))\n      : (clients as any[]);\n    setSelectedClientIds(new Set(selectable.map((client) => Number(client.id))));\n  };`,
  'selecionar em massa sem incluir dividas protegidas',
);

client = replaceOnce(
  client,
  `  const applyBulkLoanAccess = async (enabled: boolean) => {\n    const ids = [...selectedClientIds];\n    if (!ids.length) {\n      toast.error("Selecione pelo menos um cliente.");\n      return;\n    }\n    const verb = enabled ? 'ATIVAR' : 'DESATIVAR';\n    if (!window.confirm(verb + ' empréstimo para ' + ids.length + ' cliente(s) selecionado(s)?')) return;\n\n    setBulkChanging(true);\n    try {\n      for (const clientId of ids) {\n        await bulkToggleEnabled.mutateAsync({ clientId, enabled: enabled ? 1 : 0 });\n      }\n      await utils.loans.listClients.invalidate();\n      toast.success('Empréstimo ' + (enabled ? 'ativado' : 'desativado') + ' para ' + ids.length + ' cliente(s).');\n      clearSelected();\n    } finally {\n      setBulkChanging(false);\n    }\n  };`,
  `  const applyBulkLoanAccess = async (enabled: boolean) => {\n    const ids = [...selectedClientIds];\n    if (!ids.length) {\n      toast.error("Selecione pelo menos um cliente.");\n      return;\n    }\n\n    if (!enabled && filterMode !== "no_order") {\n      toast.error("A desativação em massa fica disponível somente no filtro Sem pedido. Em empréstimos em andamento, o controle é individual.");\n      return;\n    }\n\n    const selectedClients = (clientsRaw as any[]).filter((client) => selectedClientIds.has(Number(client.id)));\n    const protectedClients = selectedClients.filter(hasOpenInstallments);\n    if (!enabled && protectedClients.length > 0) {\n      toast.error(protectedClients.length + " cliente(s) possuem parcelas abertas e estão protegidos contra desativação.");\n      return;\n    }\n\n    const verb = enabled ? 'ATIVAR O ACESSO AO EMPRÉSTIMO' : 'DESATIVAR O ACESSO AO EMPRÉSTIMO';\n    if (!window.confirm(verb + ' para ' + ids.length + ' cliente(s) selecionado(s)?')) return;\n\n    setBulkChanging(true);\n    try {\n      for (const clientId of ids) {\n        await bulkToggleEnabled.mutateAsync({ clientId, enabled: enabled ? 1 : 0 });\n      }\n      await utils.loans.listClients.invalidate();\n      toast.success('Acesso ao empréstimo ' + (enabled ? 'ativado' : 'desativado') + ' para ' + ids.length + ' cliente(s).');\n      clearSelected();\n    } finally {\n      setBulkChanging(false);\n    }\n  };`,
  'acao em massa contextual e segura',
);

client = replaceOnce(
  client,
  `  const activeLoanCount = activeLoansLoading ? null : (clientsRaw as any[]).filter(hasActiveLoan).length;\n  const noOrderCount = ordersLoading ? null : (clientsRaw as any[]).filter((client) => !hasOrderInSystem(client)).length;`,
  `  const activeLoanClientCount = activeLoansLoading ? null : (clientsRaw as any[]).filter(hasActiveLoan).length;\n  const activeLoanContractsCount = activeLoansLoading ? null : (activeLoans as any[]).length;\n  const openInstallmentClientsCount = (clientsRaw as any[]).filter(hasOpenInstallments).length;\n  const noOrderCount = ordersLoading ? null : (clientsRaw as any[]).filter((client) => !hasOrderInSystem(client)).length;`,
  'contadores distinguem clientes contratos e parcelas',
);

client = replaceOnce(
  client,
  `            📦 Com pedido ({withOrderCount === null ? "..." : withOrderCount})`,
  `            📦 Com pedido H2 ({withOrderCount === null ? "..." : withOrderCount})`,
  'rotulo com pedido',
);

client = replaceOnce(
  client,
  `            💰 Empréstimo ativo ({activeLoanCount === null ? "..." : activeLoanCount})\n          </Button>`,
  `            💰 Em andamento ({activeLoansLoading ? "..." : activeLoanClientCount + " clientes / " + activeLoanContractsCount + " empréstimos"})\n          </Button>\n\n          <Button\n            size="sm"\n            variant={filterMode === "parcelas_abertas" ? "default" : "outline"}\n            className={filterMode === "parcelas_abertas" ? "h-9 text-xs gap-1 bg-rose-700 hover:bg-rose-800 border-rose-700" : "h-9 text-xs gap-1 bg-transparent border-rose-500/40 text-rose-300 hover:bg-rose-500/10"}\n            onClick={() => { setFilterMode(filterMode === "parcelas_abertas" ? "all" : "parcelas_abertas"); clearSelected(); }}\n          >\n            🔒 Parcelas abertas ({openInstallmentClientsCount})\n          </Button>`,
  'rotulo em andamento e filtro de parcelas abertas',
);

client = replaceOnce(
  client,
  `            🚫 Sem pedido ({noOrderCount === null ? "..." : noOrderCount})`,
  `            🚫 Sem pedido H2 ({noOrderCount === null ? "..." : noOrderCount})`,
  'rotulo sem pedido',
);

client = replaceOnce(
  client,
  `          <Button size="sm" variant="outline" className="h-9 text-xs" onClick={selectAllFiltered} disabled={clients.length === 0 || bulkChanging}>\n            ☑ Selecionar tudo ({clients.length})\n          </Button>`,
  `          <Button size="sm" variant="outline" className="h-9 text-xs" onClick={selectAllFiltered} disabled={clients.length === 0 || bulkChanging}>\n            ☑ Selecionar tudo ({filterMode === "no_order" ? (clients as any[]).filter((client) => !hasOpenInstallments(client)).length : clients.length})\n          </Button>`,
  'selecionar tudo mostra apenas elegiveis no sem pedido',
);

client = replaceOnce(
  client,
  `          <Button size="sm" className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => applyBulkLoanAccess(true)} disabled={selectedClientIds.size === 0 || bulkChanging}>\n            ✅ Ativar selecionados\n          </Button>\n          <Button size="sm" variant="destructive" className="h-9 text-xs" onClick={() => applyBulkLoanAccess(false)} disabled={selectedClientIds.size === 0 || bulkChanging}>\n            ⛔ Desativar empréstimo\n          </Button>\n          {filterMode === "no_order" && (\n            <span className="text-[11px] text-orange-300">Sem pedido → Selecionar tudo → Desativar empréstimo.</span>\n          )}`,
  `          <Button size="sm" className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => applyBulkLoanAccess(true)} disabled={selectedClientIds.size === 0 || bulkChanging}>\n            ✅ Ativar acesso\n          </Button>\n          <Button size="sm" variant="destructive" className="h-9 text-xs" onClick={() => applyBulkLoanAccess(false)} disabled={selectedClientIds.size === 0 || bulkChanging || filterMode !== "no_order"}>\n            ⛔ Desativar acesso\n          </Button>\n          {filterMode === "no_order" ? (\n            <span className="text-[11px] text-orange-300">Sem pedido: a seleção em massa ignora clientes com parcelas abertas.</span>\n          ) : filterMode === "active_loan" ? (\n            <span className="text-[11px] text-emerald-300">Em andamento: acesso só pode ser alterado individualmente; parcelas abertas ficam protegidas.</span>\n          ) : filterMode === "parcelas_abertas" ? (\n            <span className="text-[11px] text-rose-300">Protegido: clientes com parcelas abertas não podem ter o acesso desativado.</span>\n          ) : filterMode === "has_order" ? (\n            <span className="text-[11px] text-blue-300">Com pedido H2: sem desativação em massa. Use o controle individual quando permitido.</span>\n          ) : (\n            <span className="text-[11px] text-muted-foreground">Desativação em massa disponível somente no filtro Sem pedido H2.</span>\n          )}`,
  'acoes em massa deixam de confundir acesso com divida',
);

client = replaceOnce(
  client,
  `                  <Badge variant="outline" className="text-xs bg-muted/50 text-muted-foreground capitalize">{c.profileSlug}</Badge>`,
  `                  <Badge variant="outline" className="text-xs bg-muted/50 text-muted-foreground capitalize">{c.profileSlug}</Badge>\n                  {hasOpenInstallments(c) && (\n                    <Badge variant="outline" className="text-xs bg-rose-500/15 text-rose-300 border-rose-500/30">\n                      🔒 {Number(c.openInstallmentCount || 0)} parcela(s) aberta(s)\n                    </Badge>\n                  )}`,
  'badge de protecao financeira',
);

client = replaceOnce(
  client,
  `                <input\n                  type="checkbox"\n                  className="h-4 w-4 accent-cyan-500"\n                  checked={selectedClientIds.has(Number(c.id))}\n                  onChange={() => toggleSelectedClient(Number(c.id))}\n                />`,
  `                <input\n                  type="checkbox"\n                  className="h-4 w-4 accent-cyan-500"\n                  checked={selectedClientIds.has(Number(c.id))}\n                  disabled={filterMode === "no_order" && hasOpenInstallments(c)}\n                  onChange={() => toggleSelectedClient(Number(c.id))}\n                  title={filterMode === "no_order" && hasOpenInstallments(c) ? "Protegido: possui parcelas abertas" : "Selecionar cliente"}\n                />`,
  'checkbox protegido em desativacao em massa',
);

client = replaceOnce(
  client,
  `                  <span className="text-xs text-muted-foreground">Empréstimo</span>\n                  <Switch checked={!!c.loanEnabled} onCheckedChange={(v) => toggleEnabled.mutate({ clientId: c.id, enabled: v ? 1 : 0 })} />`,
  `                  <span className="text-xs text-muted-foreground">Acesso</span>\n                  <Switch\n                    checked={!!c.loanEnabled}\n                    disabled={!!c.loanEnabled && hasOpenInstallments(c)}\n                    onCheckedChange={(v) => toggleEnabled.mutate({ clientId: c.id, enabled: v ? 1 : 0 })}\n                    title={!!c.loanEnabled && hasOpenInstallments(c) ? "Não pode desativar: há parcelas abertas" : "Ativar ou desativar acesso ao módulo de empréstimos"}\n                  />`,
  'switch deixa claro que controla acesso e respeita parcelas abertas',
);

fs.writeFileSync(clientPath, client);

console.log('[loans-client-safety] OK: filtros separados, contagens explicitas e desativacao protegida por parcelas abertas.');
