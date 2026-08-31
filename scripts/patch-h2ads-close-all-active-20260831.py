from pathlib import Path

path = Path('client/src/pages/H2Ads.tsx')
source = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    source = source.replace(old, new, 1)


replace_once(
    '  const [instanceSearch, setInstanceSearch] = useState("");\n',
    '  const [instanceSearch, setInstanceSearch] = useState("");\n  const [closingAllBrowsers, setClosingAllBrowsers] = useState(false);\n',
    'estado fechamento em lote',
)

replace_once(
    '  const browserRuns = (dashboard.data?.instanceBrowserRuns ?? []) as BrowserRun[];\n',
    '  const browserRuns = (dashboard.data?.instanceBrowserRuns ?? []) as BrowserRun[];\n  const activeBrowserInstanceIds = useMemo(() => Array.from(new Set(browserRuns.filter(run => run.state === "browser_open").map(run => run.instanceId))), [browserRuns]);\n',
    'instancias com browser aberto',
)

refresh_marker = '''  const refreshCommandState = (instanceId: number) => {
    void refresh();
    for (const delay of [120, 300, 600, 1_000, 1_500, 2_200, 3_200, 4_800, 6_500]) window.setTimeout(() => { void refresh(); }, delay);
    window.setTimeout(() => setAction(instanceId, null), 7_000);
  };
'''
refresh_bulk = refresh_marker + '''  const refreshBulkCommandState = (instanceIds: number[]) => {
    void refresh();
    for (const delay of [120, 300, 600, 1_000, 1_500, 2_200, 3_200, 4_800, 6_500]) window.setTimeout(() => { void refresh(); }, delay);
    window.setTimeout(() => setInstanceAction(current => {
      const next = { ...current };
      for (const instanceId of instanceIds) delete next[instanceId];
      return next;
    }), 7_000);
  };
'''
replace_once(refresh_marker, refresh_bulk, 'refresh em lote')

close_marker = '''  const requestBrowserClose = async (instanceId: number) => {
    setAction(instanceId, "Encerrando browser...");
    try {
      await closeBrowser.mutateAsync({ instanceId });
      toast.success("Comando de encerramento enviado.");
      refreshCommandState(instanceId);
    } catch (error) { setAction(instanceId, null); toast.error(errorText(error, "Não foi possível solicitar o encerramento do browser.")); }
  };
'''
close_all = close_marker + '''
  const requestCloseAllBrowsers = async () => {
    const instanceIds = [...activeBrowserInstanceIds];
    if (!instanceIds.length) { toast.info("Nenhuma instância ativa para fechar."); return; }
    if (!window.confirm(`Fechar ${instanceIds.length} instância(s) ativa(s)?\n\nIsso encerra somente os browsers abertos. Grupos, clientes vinculados, proxies e configurações serão mantidos.`)) return;

    setClosingAllBrowsers(true);
    for (const instanceId of instanceIds) setAction(instanceId, "Encerrando browser...");

    let closedCount = 0;
    const failedIds: number[] = [];
    try {
      for (const instanceId of instanceIds) {
        try {
          await closeBrowser.mutateAsync({ instanceId });
          closedCount += 1;
        } catch {
          failedIds.push(instanceId);
          setAction(instanceId, null);
        }
      }

      const successfulIds = instanceIds.filter(instanceId => !failedIds.includes(instanceId));
      if (successfulIds.length) refreshBulkCommandState(successfulIds);
      else await refresh();

      if (!failedIds.length) toast.success(`${closedCount} instância(s) ativa(s) receberam o comando de fechamento.`);
      else toast.error(`${closedCount} fechada(s); ${failedIds.length} falharam. As configurações foram preservadas.`);
    } finally {
      setClosingAllBrowsers(false);
    }
  };
'''
replace_once(close_marker, close_all, 'acao fechar todas')

header_anchor = '<div className="flex flex-wrap gap-2"><button type="button" onClick={() => setOrderingGroups(value => !value)}'
header_replacement = '<div className="flex flex-wrap gap-2"><button type="button" onClick={() => void requestCloseAllBrowsers()} disabled={closingAllBrowsers || activeBrowserInstanceIds.length === 0} title={activeBrowserInstanceIds.length ? "Fecha somente os browsers atualmente abertos; grupos, vínculos, proxies e configurações permanecem." : "Nenhuma instância com browser aberto"} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-2.5 text-sm font-black text-rose-100 transition hover:border-rose-300/70 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40"><Square className="h-4 w-4 fill-current" />{closingAllBrowsers ? "FECHANDO..." : `FECHAR TODAS ATIVAS${activeBrowserInstanceIds.length ? ` (${activeBrowserInstanceIds.length})` : ""}`}</button><button type="button" onClick={() => setOrderingGroups(value => !value)}'
replace_once(header_anchor, header_replacement, 'botao fechar todas')

required = [
    'const [closingAllBrowsers, setClosingAllBrowsers] = useState(false);',
    'const activeBrowserInstanceIds = useMemo(',
    'const requestCloseAllBrowsers = async () => {',
    'FECHAR TODAS ATIVAS',
    'Grupos, clientes vinculados, proxies e configurações serão mantidos.',
]
for marker in required:
    if marker not in source:
        raise SystemExit(f'marcador obrigatório ausente: {marker}')

path.write_text(source, encoding='utf-8')
print('H2ADS_CLOSE_ALL_ACTIVE_PATCH_OK')
