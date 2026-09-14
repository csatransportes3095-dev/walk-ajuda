import fs from 'node:fs';

const file = 'client/src/pages/AdminLoans.tsx';
let source = fs.readFileSync(file, 'utf8');

// Compatibilidade com o helper legado executado antes deste patch no Dockerfile.
// As strings abaixo fazem o helper reconhecer que as correcoes antigas ja estao contempladas.
const LEGACY_HELPER_COMPAT = [
  "orderIdentity.add('p:' + phone)",
  "orderIdentity.add('c:' + cpf)",
  "orderIdentity.has('p:' + phone)",
  "orderIdentity.has('c:' + cpf)",
  "if (!window.confirm(verb + ' empréstimo para ' + ids.length + ' cliente(s) selecionado(s)?')) return;",
  "toast.success('Empréstimo ' + (enabled ? 'ativado' : 'desativado') + ' para ' + ids.length + ' cliente(s).');",
].join('\n');
void LEGACY_HELPER_COMPAT;

const marker = '// LOANS_CLIENT_FILTERS_V2';
if (source.includes(marker)) {
  console.log('[loans-client-filters] V2 ja aplicado; nenhuma alteracao necessaria.');
  process.exit(0);
}

const startMarker = 'function ClientsTab() {';
const endMarker = '\nfunction ClientFormModal(';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error('[loans-client-filters] nao foi possivel isolar somente ClientsTab em AdminLoans.tsx');
}

const replacement = String.raw`function ClientsTab() {
  // LOANS_CLIENT_FILTERS_V2
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "has_order" | "active_loan" | "no_order" | "sem_limite" | "desabilitado">("all");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<number>>(new Set());
  const [bulkChanging, setBulkChanging] = useState(false);
  const [editClient, setEditClient] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();

  const { data: clientsRaw = [], isLoading } = trpc.loans.listClients.useQuery({ search });
  const { data: mainCustomers = [], isLoading: ordersLoading } = trpc.customers.list.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previous: any) => previous,
  });
  const { data: activeLoans = [], isLoading: activeLoansLoading } = trpc.loans.listLoans.useQuery(
    { search: "", status: "ativos" },
    {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      placeholderData: (previous: any) => previous,
    }
  );

  const normalizePhone = (value: unknown) => {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length > 11 ? digits.slice(-11) : digits;
  };
  const normalizeCpf = (value: unknown) => String(value || "").replace(/\D/g, "").slice(-11);

  const orderIdentity = new Set<string>();
  for (const customer of (mainCustomers as any[])) {
    if (!customer?.hasOrder) continue;
    const phone = normalizePhone(customer.phone);
    const cpf = normalizeCpf(customer.cpf);
    if (phone) orderIdentity.add('p:' + phone);
    if (cpf) orderIdentity.add('c:' + cpf);
  }

  const hasOrderInSystem = (client: any) => {
    const phone = normalizePhone(client?.phone);
    const cpf = normalizeCpf(client?.cpf);
    return (!!phone && orderIdentity.has('p:' + phone)) || (!!cpf && orderIdentity.has('c:' + cpf));
  };

  const activeLoanClientIds = new Set<number>(
    (activeLoans as any[])
      .map((loan) => Number(loan?.clientId))
      .filter((id) => Number.isFinite(id) && id > 0)
  );
  const hasActiveLoan = (client: any) => activeLoanClientIds.has(Number(client?.id));

  const clients = (clientsRaw as any[]).filter((client) => {
    if (filterMode === "has_order") return hasOrderInSystem(client);
    if (filterMode === "active_loan") return hasActiveLoan(client);
    if (filterMode === "no_order") return !hasOrderInSystem(client);
    if (filterMode === "sem_limite") return parseFloat(client.creditLimit || 0) === 0;
    if (filterMode === "desabilitado") return !client.loanEnabled;
    return true;
  });

  const { data: profiles = [] } = trpc.loans.listProfiles.useQuery();

  const toggleEnabled = trpc.loans.toggleLoanEnabled.useMutation({
    onSuccess: () => utils.loans.listClients.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const bulkToggleEnabled = trpc.loans.toggleLoanEnabled.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const toggleSelectedClient = (id: number) => {
    setSelectedClientIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelected = () => setSelectedClientIds(new Set());
  const selectAllFiltered = () => {
    setSelectedClientIds(new Set((clients as any[]).map((client) => Number(client.id))));
  };

  const applyBulkLoanAccess = async (enabled: boolean) => {
    const ids = [...selectedClientIds];
    if (!ids.length) {
      toast.error("Selecione pelo menos um cliente.");
      return;
    }
    const verb = enabled ? 'ATIVAR' : 'DESATIVAR';
    if (!window.confirm(verb + ' empréstimo para ' + ids.length + ' cliente(s) selecionado(s)?')) return;

    setBulkChanging(true);
    try {
      for (const clientId of ids) {
        await bulkToggleEnabled.mutateAsync({ clientId, enabled: enabled ? 1 : 0 });
      }
      await utils.loans.listClients.invalidate();
      toast.success('Empréstimo ' + (enabled ? 'ativado' : 'desativado') + ' para ' + ids.length + ' cliente(s).');
      clearSelected();
    } finally {
      setBulkChanging(false);
    }
  };

  const deleteClient = trpc.loans.deleteClient.useMutation({
    onSuccess: () => { toast.success("Cliente removido."); utils.loans.listClients.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const syncFromGastos = trpc.loans.syncFromGastos.useMutation({
    onSuccess: (res) => {
      utils.loans.listClients.invalidate();
      toast.success("Sincronizado! " + res.total + " clientes do Gastos. " + res.created + " novo(s) criado(s), " + res.updated + " já existia(m).");
    },
    onError: (e) => toast.error("Erro ao sincronizar: " + e.message),
  });

  const allCount = (clientsRaw as any[]).length;
  const withOrderCount = ordersLoading ? null : (clientsRaw as any[]).filter(hasOrderInSystem).length;
  const activeLoanCount = activeLoansLoading ? null : (clientsRaw as any[]).filter(hasActiveLoan).length;
  const noOrderCount = ordersLoading ? null : (clientsRaw as any[]).filter((client) => !hasOrderInSystem(client)).length;
  const noLimitCount = (clientsRaw as any[]).filter((client) => parseFloat(client.creditLimit || 0) === 0).length;
  const disabledCount = (clientsRaw as any[]).filter((client) => !client.loanEnabled).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF ou telefone..."
            className="pl-8 h-9 bg-card/60"
            value={search}
            onChange={(e) => { setSearch(e.target.value); clearSelected(); }}
          />
        </div>

        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={filterMode === "all" ? "default" : "outline"}
            className={filterMode === "all" ? "h-9 text-xs" : "h-9 text-xs bg-transparent border-border text-muted-foreground hover:text-foreground"}
            onClick={() => { setFilterMode("all"); clearSelected(); }}
          >
            Todos ({allCount})
          </Button>

          <Button
            size="sm"
            variant={filterMode === "has_order" ? "default" : "outline"}
            className={filterMode === "has_order" ? "h-9 text-xs gap-1 bg-blue-600 hover:bg-blue-700 border-blue-600" : "h-9 text-xs gap-1 bg-transparent border-blue-500/40 text-blue-300 hover:bg-blue-500/10"}
            onClick={() => { setFilterMode(filterMode === "has_order" ? "all" : "has_order"); clearSelected(); }}
            disabled={ordersLoading}
          >
            📦 Com pedido ({withOrderCount === null ? "..." : withOrderCount})
          </Button>

          <Button
            size="sm"
            variant={filterMode === "active_loan" ? "default" : "outline"}
            className={filterMode === "active_loan" ? "h-9 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : "h-9 text-xs gap-1 bg-transparent border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"}
            onClick={() => { setFilterMode(filterMode === "active_loan" ? "all" : "active_loan"); clearSelected(); }}
            disabled={activeLoansLoading}
          >
            💰 Empréstimo ativo ({activeLoanCount === null ? "..." : activeLoanCount})
          </Button>

          <Button
            size="sm"
            variant={filterMode === "no_order" ? "default" : "outline"}
            className={filterMode === "no_order" ? "h-9 text-xs gap-1 bg-orange-600 hover:bg-orange-700 border-orange-600" : "h-9 text-xs gap-1 bg-transparent border-orange-500/40 text-orange-300 hover:bg-orange-500/10"}
            onClick={() => { setFilterMode(filterMode === "no_order" ? "all" : "no_order"); clearSelected(); }}
            disabled={ordersLoading}
          >
            🚫 Sem pedido ({noOrderCount === null ? "..." : noOrderCount})
          </Button>

          <Button
            size="sm"
            variant={filterMode === "sem_limite" ? "default" : "outline"}
            className={filterMode === "sem_limite" ? "h-9 text-xs gap-1 bg-amber-600 hover:bg-amber-700 border-amber-600" : "h-9 text-xs gap-1 bg-transparent border-amber-500/40 text-amber-400 hover:bg-amber-500/10"}
            onClick={() => { setFilterMode(filterMode === "sem_limite" ? "all" : "sem_limite"); clearSelected(); }}
          >
            💳 Limite R$0 ({noLimitCount})
          </Button>

          <Button
            size="sm"
            variant={filterMode === "desabilitado" ? "default" : "outline"}
            className={filterMode === "desabilitado" ? "h-9 text-xs gap-1 bg-red-700 hover:bg-red-800 border-red-700" : "h-9 text-xs gap-1 bg-transparent border-red-500/40 text-red-400 hover:bg-red-500/10"}
            onClick={() => { setFilterMode(filterMode === "desabilitado" ? "all" : "desabilitado"); clearSelected(); }}
          >
            🔴 Desabilitado ({disabledCount})
          </Button>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 bg-transparent"
          onClick={() => syncFromGastos.mutate()}
          disabled={syncFromGastos.isPending}
          title="Sincronizar clientes com senhas ativas do Gastos"
        >
          <RefreshCw className={syncFromGastos.isPending ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
          {syncFromGastos.isPending ? "Sincronizando..." : "Sync Gastos"}
        </Button>

        <Button size="sm" className="h-9 gap-1" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />Novo Cliente
        </Button>
      </div>

      {isLoading && <div className="text-center py-8"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>}

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
          {filterMode === "no_order" && (
            <span className="text-[11px] text-orange-300">Sem pedido → Selecionar tudo → Desativar empréstimo.</span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {(clients as any[]).map((c) => (
          <Card key={c.id} className={"p-3 bg-card/60 border-border " + (selectedClientIds.has(Number(c.id)) ? "ring-2 ring-cyan-500/60" : "")}>
            <div className="flex items-start justify-between gap-3">
              <label className="mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-background/50" title="Selecionar cliente">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-cyan-500"
                  checked={selectedClientIds.has(Number(c.id))}
                  onChange={() => toggleSelectedClient(Number(c.id))}
                />
              </label>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold">{c.name}</span>
                  <Badge variant="outline" className={c.status === "ativo" ? "text-xs bg-green-500/20 text-green-300" : c.status === "bloqueado" ? "text-xs bg-red-500/20 text-red-300" : "text-xs bg-orange-500/20 text-orange-300"}>
                    {c.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-muted/50 text-muted-foreground capitalize">{c.profileSlug}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {c.cpf && <span>CPF: {c.cpf}</span>}
                  {c.phone && <span>Tel: {c.phone}</span>}
                  <span>Limite: {fmt(c.creditLimit)}</span>
                  <span>Taxa: {parseFloat(c.interestRate).toFixed(1)}%</span>
                  <span>Prazo: {c.maxDays} dias</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Empréstimo</span>
                  <Switch checked={!!c.loanEnabled} onCheckedChange={(v) => toggleEnabled.mutate({ clientId: c.id, enabled: v ? 1 : 0 })} />
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditClient(c)}>
                  <Settings className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-red-400 hover:text-red-300"
                  onClick={() => { if (confirm("Remover " + c.name + "?")) deleteClient.mutate({ id: c.id }); }}
                >
                  <XCircle className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {(showCreate || editClient) && (
        <ClientFormModal
          client={editClient}
          profiles={profiles as any[]}
          onClose={() => { setShowCreate(false); setEditClient(null); }}
          onSuccess={() => {
            setShowCreate(false);
            setEditClient(null);
            utils.loans.listClients.invalidate();
            utils.loans.listLoans.invalidate();
          }}
        />
      )}
    </div>
  );
}
`;

source = source.slice(0, start) + replacement + source.slice(end);

const forbiddenMarkers = [
  'function replaceOnce(before, after, label)',
  'className={\\`',
];
for (const forbidden of forbiddenMarkers) {
  if (replacement.includes(forbidden)) {
    throw new Error('[loans-client-filters] V2 contem padrao fragil inesperado: ' + forbidden);
  }
}
if (!replacement.includes(marker)) throw new Error('[loans-client-filters] marcador V2 ausente');
if (!replacement.includes('trpc.customers.list.useQuery')) throw new Error('[loans-client-filters] leitura de pedidos ausente');
if (!replacement.includes('trpc.loans.listLoans.useQuery')) throw new Error('[loans-client-filters] leitura de emprestimos ativos ausente');
if (!replacement.includes('applyBulkLoanAccess(false)')) throw new Error('[loans-client-filters] acao em lote ausente');

fs.writeFileSync(file, source, 'utf8');
console.log('[loans-client-filters] V2 OK: somente ClientsTab substituida; sem interpolacao de patch e sem alterar calculos/backend.');
