import fs from 'node:fs';

const file = 'client/src/pages/AdminLoans.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) {
    console.log(`[loans-client-filters] ${label}: ja aplicado`);
    return;
  }
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`[loans-client-filters] ${label}: esperado 1 bloco, encontrado ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
`function ClientsTab() {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "sem_limite" | "desabilitado">("all");
  const [editClient, setEditClient] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();
  const { data: clientsRaw = [], isLoading } = trpc.loans.listClients.useQuery({ search });
  const clients = (clientsRaw as any[]).filter((c) => {
    if (filterMode === "sem_limite") return parseFloat(c.creditLimit || 0) === 0;
    if (filterMode === "desabilitado") return !c.loanEnabled;
    return true;
  });
  const { data: profiles = [] } = trpc.loans.listProfiles.useQuery();`,
`function ClientsTab() {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "has_order" | "loan_active" | "no_order" | "sem_limite" | "desabilitado">("all");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<number>>(new Set());
  const [bulkChanging, setBulkChanging] = useState(false);
  const [editClient, setEditClient] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();
  const { data: clientsRaw = [], isLoading } = trpc.loans.listClients.useQuery({ search });
  // Somente leitura: usa o cadastro principal apenas para saber se existe pedido no sistema.
  // Nenhum dado de cadastro, pedido, H2ADS, Gastos ou Login e alterado por estes filtros.
  const { data: mainCustomers = [] } = trpc.customers.list.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previous: any) => previous,
  });
  const normalizePhone = (value: unknown) => {
    const digits = String(value || '').replace(/\\D/g, '');
    return digits.length > 9 ? digits.slice(-9) : digits;
  };
  const normalizeCpf = (value: unknown) => String(value || '').replace(/\\D/g, '').slice(-11);
  const orderIdentity = new Set<string>();
  for (const customer of (mainCustomers as any[])) {
    if (!customer?.hasOrder) continue;
    const phone = normalizePhone(customer.phone);
    const cpf = normalizeCpf(customer.cpf);
    if (phone) orderIdentity.add(`p:${phone}`);
    if (cpf) orderIdentity.add(`c:${cpf}`);
  }
  const hasOrderInSystem = (client: any) => {
    const phone = normalizePhone(client?.phone);
    const cpf = normalizeCpf(client?.cpf);
    return (!!phone && orderIdentity.has(`p:${phone}`)) || (!!cpf && orderIdentity.has(`c:${cpf}`));
  };
  const clients = (clientsRaw as any[]).filter((c) => {
    if (filterMode === "has_order") return hasOrderInSystem(c);
    if (filterMode === "loan_active") return !!c.loanEnabled;
    if (filterMode === "no_order") return !hasOrderInSystem(c);
    if (filterMode === "sem_limite") return parseFloat(c.creditLimit || 0) === 0;
    if (filterMode === "desabilitado") return !c.loanEnabled;
    return true;
  });
  const { data: profiles = [] } = trpc.loans.listProfiles.useQuery();`,
  'estado e filtros novos'
);

replaceOnce(
`  const toggleEnabled = trpc.loans.toggleLoanEnabled.useMutation({
    onSuccess: () => utils.loans.listClients.invalidate(),
    onError: (e) => toast.error(e.message),
  });`,
`  const toggleEnabled = trpc.loans.toggleLoanEnabled.useMutation({
    onSuccess: () => utils.loans.listClients.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const bulkToggleEnabled = trpc.loans.toggleLoanEnabled.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const toggleSelectedClient = (id: number) => {
    setSelectedClientIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllFiltered = () => setSelectedClientIds(new Set((clients as any[]).map((client) => Number(client.id))));
  const clearSelected = () => setSelectedClientIds(new Set());
  const applyBulkLoanAccess = async (enabled: boolean) => {
    const ids = [...selectedClientIds];
    if (!ids.length) {
      toast.error('Selecione pelo menos um cliente.');
      return;
    }
    const verb = enabled ? 'ATIVAR' : 'DESATIVAR';
    if (!window.confirm(`${verb} empréstimo para ${ids.length} cliente(s) selecionado(s)?`)) return;
    setBulkChanging(true);
    try {
      for (const clientId of ids) {
        await bulkToggleEnabled.mutateAsync({ clientId, enabled: enabled ? 1 : 0 });
      }
      await utils.loans.listClients.invalidate();
      toast.success(`Empréstimo ${enabled ? 'ativado' : 'desativado'} para ${ids.length} cliente(s).`);
      clearSelected();
    } finally {
      setBulkChanging(false);
    }
  };`,
  'acoes em lote'
);

replaceOnce(
`        <div className="flex gap-1">
          <Button size="sm" variant={filterMode === "all" ? "default" : "outline"} className={\`h-9 text-xs ${filterMode !== "all" ? "bg-transparent border-border text-muted-foreground hover:text-foreground" : ""}\`} onClick={() => setFilterMode("all")}>
            Todos ({(clientsRaw as any[]).length})
          </Button>
          <Button size="sm" variant={filterMode === "sem_limite" ? "default" : "outline"} className={\`h-9 text-xs gap-1 ${filterMode === "sem_limite" ? "bg-amber-600 hover:bg-amber-700 border-amber-600" : "bg-transparent border-amber-500/40 text-amber-400 hover:bg-amber-500/10"}\`} onClick={() => setFilterMode(filterMode === "sem_limite" ? "all" : "sem_limite")}>
            💰 Limite R$0 ({(clientsRaw as any[]).filter((c) => parseFloat(c.creditLimit || 0) === 0).length})
          </Button>
          <Button size="sm" variant={filterMode === "desabilitado" ? "default" : "outline"} className={\`h-9 text-xs gap-1 ${filterMode === "desabilitado" ? "bg-red-700 hover:bg-red-800 border-red-700" : "bg-transparent border-red-500/40 text-red-400 hover:bg-red-500/10"}\`} onClick={() => setFilterMode(filterMode === "desabilitado" ? "all" : "desabilitado")}>
            🔴 Desabilitado ({(clientsRaw as any[]).filter((c) => !c.loanEnabled).length})
          </Button>
        </div>`,
`        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant={filterMode === "all" ? "default" : "outline"} className={\`h-9 text-xs ${filterMode !== "all" ? "bg-transparent border-border text-muted-foreground hover:text-foreground" : ""}\`} onClick={() => { setFilterMode("all"); clearSelected(); }}>
            Todos ({(clientsRaw as any[]).length})
          </Button>
          <Button size="sm" variant={filterMode === "has_order" ? "default" : "outline"} className={\`h-9 text-xs gap-1 ${filterMode === "has_order" ? "bg-blue-600 hover:bg-blue-700 border-blue-600" : "bg-transparent border-blue-500/40 text-blue-300 hover:bg-blue-500/10"}\`} onClick={() => { setFilterMode(filterMode === "has_order" ? "all" : "has_order"); clearSelected(); }}>
            📦 Com pedido ({(clientsRaw as any[]).filter(hasOrderInSystem).length})
          </Button>
          <Button size="sm" variant={filterMode === "loan_active" ? "default" : "outline"} className={\`h-9 text-xs gap-1 ${filterMode === "loan_active" ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : "bg-transparent border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"}\`} onClick={() => { setFilterMode(filterMode === "loan_active" ? "all" : "loan_active"); clearSelected(); }}>
            💰 Empréstimo ativo ({(clientsRaw as any[]).filter((c) => !!c.loanEnabled).length})
          </Button>
          <Button size="sm" variant={filterMode === "no_order" ? "default" : "outline"} className={\`h-9 text-xs gap-1 ${filterMode === "no_order" ? "bg-orange-600 hover:bg-orange-700 border-orange-600" : "bg-transparent border-orange-500/40 text-orange-300 hover:bg-orange-500/10"}\`} onClick={() => { setFilterMode(filterMode === "no_order" ? "all" : "no_order"); clearSelected(); }}>
            🚫 Sem pedido ({(clientsRaw as any[]).filter((c) => !hasOrderInSystem(c)).length})
          </Button>
          <Button size="sm" variant={filterMode === "sem_limite" ? "default" : "outline"} className={\`h-9 text-xs gap-1 ${filterMode === "sem_limite" ? "bg-amber-600 hover:bg-amber-700 border-amber-600" : "bg-transparent border-amber-500/40 text-amber-400 hover:bg-amber-500/10"}\`} onClick={() => { setFilterMode(filterMode === "sem_limite" ? "all" : "sem_limite"); clearSelected(); }}>
            💳 Limite R$0 ({(clientsRaw as any[]).filter((c) => parseFloat(c.creditLimit || 0) === 0).length})
          </Button>
          <Button size="sm" variant={filterMode === "desabilitado" ? "default" : "outline"} className={\`h-9 text-xs gap-1 ${filterMode === "desabilitado" ? "bg-red-700 hover:bg-red-800 border-red-700" : "bg-transparent border-red-500/40 text-red-400 hover:bg-red-500/10"}\`} onClick={() => { setFilterMode(filterMode === "desabilitado" ? "all" : "desabilitado"); clearSelected(); }}>
            🔴 Desabilitado ({(clientsRaw as any[]).filter((c) => !c.loanEnabled).length})
          </Button>
        </div>`,
  'botoes de filtro'
);

replaceOnce(
`      {isLoading && <div className="text-center py-8"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>}

      <div className="space-y-2">`,
`      {isLoading && <div className="text-center py-8"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>}

      {!isLoading && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/30 p-2.5">
          <Button size="sm" variant="outline" className="h-9 text-xs" onClick={selectAllFiltered} disabled={clients.length === 0 || bulkChanging}>
            ☑ Selecionar tudo ({clients.length})
          </Button>
          <Button size="sm" variant="outline" className="h-9 text-xs" onClick={clearSelected} disabled={selectedClientIds.size === 0 || bulkChanging}>
            Limpar seleção
          </Button>
          <span className="text-xs font-semibold text-muted-foreground">{selectedClientIds.size} selecionado(s)</span>
          <Button size="sm" className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => applyBulkLoanAccess(true)} disabled={selectedClientIds.size === 0 || bulkChanging}>
            ✅ Ativar selecionados
          </Button>
          <Button size="sm" variant="destructive" className="h-9 text-xs" onClick={() => applyBulkLoanAccess(false)} disabled={selectedClientIds.size === 0 || bulkChanging}>
            ⛔ Desativar empréstimo
          </Button>
          {filterMode === 'no_order' && <span className="text-[11px] text-orange-300">Fluxo recomendado: Sem pedido → Selecionar tudo → Desativar empréstimo.</span>}
        </div>
      )}

      <div className="space-y-2">`,
  'barra de selecao e lote'
);

replaceOnce(
`          <Card key={c.id} className="p-3 bg-card/60 border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">`,
`          <Card key={c.id} className={\`p-3 bg-card/60 border-border ${selectedClientIds.has(Number(c.id)) ? 'ring-2 ring-cyan-500/60' : ''}\`}>
            <div className="flex items-start justify-between gap-3">
              <label className="mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-background/50" title="Selecionar cliente">
                <input type="checkbox" className="h-4 w-4 accent-cyan-500" checked={selectedClientIds.has(Number(c.id))} onChange={() => toggleSelectedClient(Number(c.id))} />
              </label>
              <div className="flex-1 min-w-0">`,
  'checkbox por cliente'
);

if (!source.includes('filterMode === "no_order"')) throw new Error('[loans-client-filters] verificacao: filtro sem pedido ausente');
if (!source.includes('applyBulkLoanAccess(false)')) throw new Error('[loans-client-filters] verificacao: acao de desativacao em lote ausente');
if (!source.includes('trpc.customers.list.useQuery')) throw new Error('[loans-client-filters] verificacao: leitura de pedidos ausente');

fs.writeFileSync(file, source, 'utf8');
console.log('[loans-client-filters] OK: apenas aba Clientes de Emprestimos recebeu filtros/selecoes; calculos e demais rotas intactos.');
