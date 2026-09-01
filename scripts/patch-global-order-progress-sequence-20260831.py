from pathlib import Path

repo = Path('.')
admin = repo / 'client/src/pages/AdminOrders.tsx'
tracking = repo / 'client/src/pages/OrderTracking.tsx'
status_page = repo / 'client/src/pages/AdminStatusTypes.tsx'
db_path = repo / 'server/db.ts'
routers = repo / 'server/routers.ts'

admin_text = admin.read_text(encoding='utf-8')
tracking_text = tracking.read_text(encoding='utf-8')
status_text = status_page.read_text(encoding='utf-8')
db_text = db_path.read_text(encoding='utf-8')
router_text = routers.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    return text.replace(old, new, 1)

# ---------- DB: atomic global sequence ----------
db_anchor = '''export async function updateOrderStatusType(id: number, data: Partial<Pick<OrderStatusType, "label" | "color" | "bgColor" | "icon" | "description" | "sortOrder" | "isActive" | "pulseColor" | "showInProgress" | "progressOrder">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(orderStatusTypes).set(data).where(eq(orderStatusTypes.id, id));
}
'''
db_replacement = db_anchor + '''
export async function setGlobalOrderProgressSequence(statusKeys: string[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.transaction(async (tx) => {
    await tx.update(orderStatusTypes).set({ showInProgress: 0, progressOrder: 9999 });
    for (let index = 0; index < statusKeys.length; index++) {
      await tx.update(orderStatusTypes)
        .set({ showInProgress: 1, progressOrder: index + 1 })
        .where(eq(orderStatusTypes.key, statusKeys[index]));
    }
  });
}
'''
db_text = replace_once(db_text, db_anchor, db_replacement, 'db global sequence')

# ---------- Router imports ----------
router_text = replace_once(
    router_text,
    '  getStatusInfoFromDb,\n  generateOrderNumber,',
    '  getStatusInfoFromDb,\n  setGlobalOrderProgressSequence,\n  generateOrderNumber,',
    'router db import',
)
router_text = replace_once(
    router_text,
    'import { MAINTENANCE_ROUTE_OPTIONS, parseMaintenanceManifest } from "../shared/maintenanceManifest";\n',
    'import { MAINTENANCE_ROUTE_OPTIONS, parseMaintenanceManifest } from "../shared/maintenanceManifest";\nimport { getConfiguredGlobalProgressKeys, sanitizeGlobalProgressKeys } from "../shared/orderProgressSequence";\n',
    'router shared import',
)

status_list_anchor = '''    list: publicProcedure.query(async () => {
      const { listOrderStatusTypes } = await import('./db');
      return await listOrderStatusTypes();
    }),
'''
status_list_replacement = status_list_anchor + '''
    // Sequência global exibida em /acompanhar. Enquanto não for ativada,
    // pedidos antigos continuam usando a configuração individual legada.
    getProgressSequence: publicProcedure.query(async () => {
      const statuses = await listOrderStatusTypes();
      const enabled = (await getSetting("order_progress_global_enabled")) === "1";
      return { enabled, keys: enabled ? getConfiguredGlobalProgressKeys(statuses) : [] };
    }),

    // Salva a sequência inteira como uma única operação. Não altera sortOrder,
    // latestStatus, scheduleStatus, Arquivo, RG/CNH, grupos ou filtros operacionais.
    setProgressSequence: adminProcedure
      .input(z.object({ statusKeys: z.array(z.string().min(1).max(64)).min(1).max(64) }))
      .mutation(async ({ input }) => {
        const statuses = await listOrderStatusTypes();
        const statusKeys = sanitizeGlobalProgressKeys(statuses, input.statusKeys);
        if (statusKeys.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione pelo menos um status ativo para o progresso do cliente." });
        }
        await setGlobalOrderProgressSequence(statusKeys);
        await upsertSetting("order_progress_global_enabled", "1");
        return { success: true, keys: statusKeys };
      }),
'''
router_text = replace_once(router_text, status_list_anchor, status_list_replacement, 'statusTypes global sequence routes')

# ---------- AdminOrders imports ----------
admin_text = replace_once(
    admin_text,
    'import { snapshotUnicodeText } from "@shared/whatsappUnicodeDiagnostics";\n',
    'import { snapshotUnicodeText } from "@shared/whatsappUnicodeDiagnostics";\nimport { getConfiguredGlobalProgressKeys, getDefaultGlobalProgressKeys } from "@shared/orderProgressSequence";\n',
    'AdminOrders progress import',
)

# Replace old per-order panel with global modal component.
start = admin_text.index('// Componente separado para o painel de configuração de progresso por pedido')
end = admin_text.index('// ===== SUB-COMPONENTE: STATUS TAB DA PASTA PERSONALIZADA =====', start)
global_component = '''// Configuração global da sequência exibida para TODOS os clientes em /acompanhar.
function GlobalProgressSequenceModal({
  open,
  onClose,
  statuses,
  savedKeys,
  enabled,
  onSave,
  isSaving,
  statusConfig,
}: {
  open: boolean;
  onClose: () => void;
  statuses: any[];
  savedKeys: string[];
  enabled: boolean;
  onSave: (keys: string[]) => void;
  isSaving: boolean;
  statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }>;
}) {
  const initialKeys = React.useMemo(() => {
    if (enabled && savedKeys.length > 0) return savedKeys;
    const configured = getConfiguredGlobalProgressKeys(statuses);
    return configured.length > 0 ? configured : getDefaultGlobalProgressKeys(statuses);
  }, [enabled, savedKeys.join(','), statuses]);
  const [localKeys, setLocalKeys] = useState<string[]>(initialKeys);

  useEffect(() => { if (open) setLocalKeys(initialKeys); }, [open, initialKeys.join(',')]);
  if (!open) return null;

  const available = statuses.filter((s: any) => s.isActive === 1 && s.key !== 'cancelado');
  const add = (key: string) => setLocalKeys(prev => prev.includes(key) ? prev : [...prev, key]);
  const remove = (key: string) => setLocalKeys(prev => prev.filter(k => k !== key));
  const move = (idx: number, delta: number) => setLocalKeys(prev => {
    const target = idx + delta;
    if (target < 0 || target >= prev.length) return prev;
    const next = [...prev];
    [next[idx], next[target]] = [next[target], next[idx]];
    return next;
  });

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-purple-500/40 bg-[#09091a] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#09091a]/95 p-4 backdrop-blur">
          <div>
            <p className="text-sm font-black text-purple-300">SEQUÊNCIA GLOBAL DO CLIENTE</p>
            <p className="mt-1 text-xs text-white/45">Configure uma vez. Esta ordem passa a valer automaticamente para pedidos antigos e novos em /acompanhar.</p>
            <p className="mt-1 text-[10px] text-emerald-400/80">Não altera filtros, pastas, agendamentos, status atual, Arquivo, RG/CNH ou Entregues.</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-white/10 p-2 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-4">
          {!enabled && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Modo seguro: nada muda para os clientes até você clicar em <b>Salvar sequência global</b> pela primeira vez.
            </div>
          )}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Ordem que o cliente verá</p>
            {localKeys.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/35">Adicione pelo menos um status.</p>}
            {localKeys.map((key, idx) => {
              const cfg = statusConfig[key];
              if (!cfg) return null;
              return (
                <div key={key} className={`flex items-center gap-2 rounded-xl border border-white/10 p-2.5 ${cfg.bg}`}>
                  <span className="w-6 text-center text-xs font-black text-white/50">{idx + 1}</span>
                  <span className="scale-90">{cfg.icon}</span>
                  <span className={`min-w-0 flex-1 text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === localKeys.length - 1} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button>
                  <button onClick={() => remove(key)} className="rounded-lg p-1.5 text-red-400/70 hover:bg-red-500/15 hover:text-red-300"><X className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Adicionar status</p>
            <div className="flex flex-wrap gap-2">
              {available.filter((s: any) => !localKeys.includes(s.key)).map((s: any) => {
                const cfg = statusConfig[s.key];
                if (!cfg) return null;
                return <button key={s.key} onClick={() => add(s.key)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65 hover:bg-white/10">+ {cfg.label}</button>;
              })}
            </div>
          </div>
          <button
            onClick={() => onSave(localKeys)}
            disabled={isSaving || localKeys.length === 0}
            className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-black text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving ? 'SALVANDO...' : 'SALVAR SEQUÊNCIA GLOBAL'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

'''
admin_text = admin_text[:start] + global_component + admin_text[end:]

# Remove old per-order query/mutation block.
old_query = '''  // Query e mutation de configuração de progresso por pedido
  const progressConfigQuery = trpc.orderStatus.getProgressConfig.useQuery(
    { registrationId: expandedNumericId, subOrderIndex: expandedOrder?.subOrderIndex ?? 0 },
    { enabled: expandedId !== null && activeTab[expandedId!] === "status" }
  );
  const setProgressConfigMut = trpc.orderStatus.setProgressConfig.useMutation({
    onSuccess: () => { toast.success('Progresso salvo!'); progressConfigQuery.refetch(); },
    onError: () => toast.error('Erro ao salvar progresso'),
  });

'''
admin_text = replace_once(admin_text, old_query, '', 'remove per-order progress query')

# Add global state/query/mutation after dynamicStatuses.
status_query_anchor = '''  const statusTypesQuery = trpc.statusTypes.list.useQuery();
  const dynamicStatuses = statusTypesQuery.data ?? [];
'''
status_query_replacement = status_query_anchor + '''  const [showGlobalProgressSequence, setShowGlobalProgressSequence] = useState(false);
  const globalProgressSequenceQuery = trpc.statusTypes.getProgressSequence.useQuery(undefined, { staleTime: 0 });
  const saveGlobalProgressSequence = trpc.statusTypes.setProgressSequence.useMutation({
    onSuccess: async () => {
      toast.success('Sequência global salva para todos os clientes!');
      await Promise.all([statusTypesQuery.refetch(), globalProgressSequenceQuery.refetch()]);
      setShowGlobalProgressSequence(false);
    },
    onError: (e) => toast.error(e.message || 'Erro ao salvar sequência global'),
  });
'''
admin_text = replace_once(admin_text, status_query_anchor, status_query_replacement, 'global sequence query state')

# Remove per-order panel JSX.
panel_start = admin_text.find('                      <ProgressConfigPanel\n')
if panel_start == -1:
    raise SystemExit('ProgressConfigPanel call not found')
panel_end_marker = '''                      />

                      <textarea
'''
panel_end = admin_text.find(panel_end_marker, panel_start)
if panel_end == -1:
    raise SystemExit('ProgressConfigPanel end not found')
admin_text = admin_text[:panel_start] + '                      <textarea\n' + admin_text[panel_end + len('                      />\n\n                      <textarea\n'):]

# Add header button before Novo.
header_anchor = '''            <button onClick={() => navigate("/admin/orders/new")} className="flex items-center gap-1 px-2 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
'''
header_button = '''            <button onClick={() => setShowGlobalProgressSequence(true)} className="flex items-center gap-1 px-2 py-1.5 bg-purple-600/20 border border-purple-500/40 text-purple-300 rounded-lg text-xs font-bold hover:bg-purple-600/30 transition-colors" title="Definir uma única sequência de progresso para todos os clientes">
              <Layers className="w-3.5 h-3.5" /><span className="hidden lg:inline">Sequência do Cliente</span>
            </button>
''' + header_anchor
admin_text = replace_once(admin_text, header_anchor, header_button, 'header global progress button')

# Render modal near root opening after auth checks via first main return wrapper anchor.
modal_anchor = '''    <div className="min-h-screen bg-background text-foreground">
'''
modal_replacement = modal_anchor + '''      <GlobalProgressSequenceModal
        open={showGlobalProgressSequence}
        onClose={() => setShowGlobalProgressSequence(false)}
        statuses={dynamicStatuses as any[]}
        savedKeys={globalProgressSequenceQuery.data?.keys ?? []}
        enabled={globalProgressSequenceQuery.data?.enabled === true}
        onSave={(keys) => saveGlobalProgressSequence.mutate({ statusKeys: keys })}
        isSaving={saveGlobalProgressSequence.isPending}
        statusConfig={ACTIVE_STATUS_CONFIG}
      />
'''
admin_text = replace_once(admin_text, modal_anchor, modal_replacement, 'render global modal')

# ---------- AdminStatusTypes: remove second editing path ----------
progress_ui_start = status_text.find('                    {/* Configuração de Progresso do Cliente */}\n')
if progress_ui_start == -1:
    raise SystemExit('AdminStatusTypes progress UI start not found')
progress_ui_end = status_text.find('                    <div className="flex gap-2">\n', progress_ui_start)
if progress_ui_end == -1:
    raise SystemExit('AdminStatusTypes progress UI end not found')
status_text = status_text[:progress_ui_start] + '''                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-white/45">
                      A sequência exibida ao cliente é configurada uma única vez em <b>Pedidos → Sequência do Cliente</b>.
                    </div>
''' + status_text[progress_ui_end:]
# Remove visual progress badge to avoid presenting this page as a second editor.
visual_badge = '''                        {s.showInProgress === 1 && (
                          <span className="text-[10px] bg-purple-500/20 border border-purple-500/40 text-purple-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                            📊 Progresso #{s.progressOrder ?? 0}
                          </span>
                        )}
'''
status_text = status_text.replace(visual_badge, '')

# ---------- Tracking: global first, legacy fallback ----------
tracking_text = replace_once(
    tracking_text,
    'import { publicSiteUrl } from "@shared/publicLinks";\n',
    'import { publicSiteUrl } from "@shared/publicLinks";\nimport { chunkProgressKeys, resolveProgressPosition } from "@shared/orderProgressSequence";\n',
    'tracking helper import',
)
legacy_query_anchor = '''  // Configuração de progresso por pedido (definida pelo admin individualmente)
  const subOrderIndex = selectedOrderIdx;
  const progressConfigPublicQuery = trpc.orderStatus.getProgressConfigPublic.useQuery(
    { registrationId, subOrderIndex },
    { enabled: canAccess && registrationId > 0, staleTime: 30000, refetchInterval: 60000 }
  );
'''
legacy_query_replacement = '''  // Sequência global do cliente. Enquanto ela ainda não foi ativada pelo ADM,
  // preserva a configuração individual antiga como fallback de compatibilidade.
  const subOrderIndex = selectedOrderIdx;
  const globalProgressSequenceQuery = trpc.statusTypes.getProgressSequence.useQuery(undefined, {
    enabled: canAccess,
    staleTime: 30000,
    refetchInterval: 60000,
  });
  const progressConfigPublicQuery = trpc.orderStatus.getProgressConfigPublic.useQuery(
    { registrationId, subOrderIndex },
    { enabled: canAccess && registrationId > 0 && globalProgressSequenceQuery.data?.enabled !== true, staleTime: 30000, refetchInterval: 60000 }
  );
'''
tracking_text = replace_once(tracking_text, legacy_query_anchor, legacy_query_replacement, 'tracking global query')

tracking_block_start = tracking_text.index('            {/* === BARRA DE PROGRESSO DO CLIENTE (configuração por pedido) === */}')
tracking_block_end = tracking_text.index('            {/* Previsão de Entrega — bloco destacado separado */}', tracking_block_start)
old_block = tracking_text[tracking_block_start:tracking_block_end]
# Preserve visual rendering by targeted transforms.
new_block = old_block
new_block = new_block.replace('/* === BARRA DE PROGRESSO DO CLIENTE (configuração por pedido) === */', '/* === BARRA DE PROGRESSO DO CLIENTE (sequência global com fallback legado) === */')
new_block = new_block.replace('''              // Usar a configuração de progresso específica deste pedido
              const progressConfigData = progressConfigPublicQuery?.data ?? [];
              // Se não há configuração por pedido, não exibir a barra
              if (progressConfigData.length === 0) return null;
''', '''              const progressConfigData = globalProgressSequenceQuery.data?.enabled
                ? (globalProgressSequenceQuery.data.keys ?? [])
                : (progressConfigPublicQuery?.data ?? []);
              if (progressConfigData.length === 0) return null;
''')
logic_old = '''              // Encontrar o índice do status atual na barra de progresso
              let currentIdx = progressSteps.findIndex((s: any) => s.key === latestStatus);
              // Se o status atual não está na lista, encontrar o último status concluído
              // que esteja na lista (baseado no histórico do pedido)
              if (currentIdx === -1) {
                // Pegar todos os status do histórico do pedido
                const historyKeys = new Set(history.map((h: any) => h.status));
                // Encontrar o último step da lista que está no histórico
                let lastDoneIdx = -1;
                for (let i = 0; i < progressSteps.length; i++) {
                  if (progressSteps[i] && historyKeys.has((progressSteps[i] as any).key)) {
                    lastDoneIdx = i;
                  }
                }
                // Usar o próximo step após o último concluído como "atual" na barra
                currentIdx = lastDoneIdx >= 0 ? lastDoneIdx : 0;
              }
'''
logic_new = '''              const progressPosition = resolveProgressPosition({
                progressKeys: progressSteps.map((s: any) => s.key),
                latestStatus,
                historyStatuses: history.map((h: any) => h.status),
              });
              const currentIdx = progressPosition.currentIndex;
'''
if logic_old not in new_block:
    raise SystemExit('tracking progress position block not found')
new_block = new_block.replace(logic_old, logic_new, 1)
new_block = new_block.replace('''                  {/* Duas linhas sequenciais de progresso: até seis etapas configuradas pelo ADM */}
                  {(() => {
                    const visibleSteps = progressSteps.slice(0, 6);
                    const rows = [visibleSteps.slice(0, 3), visibleSteps.slice(3, 6)].filter(row => row.length > 0);
''', '''                  {/* Quantas linhas forem necessárias; três etapas por linha. */}
                  {(() => {
                    const rows = chunkProgressKeys(progressSteps, 3);
''')
new_block = new_block.replace('aria-label="Seis etapas do progresso do pedido"', 'aria-label="Etapas do progresso do pedido"')
new_block = new_block.replace('''                                const idx = rowIndex * 3 + localIdx;
                                const isDone = idx < currentIdx;
                                const isCurrent = idx === currentIdx;
''', '''                                const idx = rowIndex * 3 + localIdx;
                                const isDone = !progressPosition.cancelled && idx < currentIdx;
                                const isCurrent = !progressPosition.cancelled && idx === currentIdx;
''')
new_block = new_block.replace("{rowIndex === 1 && <p className=\"mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/25\">Continuação do progresso</p>}", "{rowIndex > 0 && <p className=\"mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/25\">Continuação do progresso</p>}")
# For cancelled order, don't present previous/current/next as if flow continues.
cards_anchor = '''                  {/* Cards anterior / atual / próximo */}
                  <div className="grid gap-2" style={{ gridTemplateColumns: [prevStep, currStep, nextStep].filter(Boolean).length === 1 ? '1fr' : [prevStep, currStep, nextStep].filter(Boolean).length === 2 ? '1fr 1fr' : '1fr 1fr 1fr' }}>
'''
cards_replacement = '''                  {progressPosition.cancelled && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-300">Pedido cancelado. O progresso foi encerrado e nenhuma próxima etapa será exibida.</div>
                  )}
                  {/* Cards anterior / atual / próximo */}
                  {!progressPosition.cancelled && <div className="grid gap-2" style={{ gridTemplateColumns: [prevStep, currStep, nextStep].filter(Boolean).length === 1 ? '1fr' : [prevStep, currStep, nextStep].filter(Boolean).length === 2 ? '1fr 1fr' : '1fr 1fr 1fr' }}>
'''
if cards_anchor not in new_block:
    raise SystemExit('tracking cards anchor not found')
new_block = new_block.replace(cards_anchor, cards_replacement, 1)
# Close conditional wrapper before original grid close. Replace the last matching close around cards conservatively.
cards_end_anchor = '''                  </div>
                </div>
              );
'''
# Need add } before outer div close for the last occurrence in block.
pos = new_block.rfind(cards_end_anchor)
if pos == -1:
    raise SystemExit('tracking cards end not found')
new_block = new_block[:pos] + '''                  </div>}
                </div>
              );
''' + new_block[pos + len(cards_end_anchor):]
tracking_text = tracking_text[:tracking_block_start] + new_block + tracking_text[tracking_block_end:]

# ---------- Guards ----------
for forbidden in ['<ProgressConfigPanel', 'trpc.orderStatus.getProgressConfig.useQuery', 'trpc.orderStatus.setProgressConfig.useMutation']:
    if forbidden in admin_text:
        raise SystemExit(f'AdminOrders ainda contém configuração por pedido: {forbidden}')
if 'progressSteps.slice(0, 6)' in tracking_text:
    raise SystemExit('OrderTracking ainda limita progresso a 6 etapas')
if 'getOperationalBucket' not in admin_text:
    raise SystemExit('Filtro operacional foi removido por engano')
for required in [
    'setGlobalOrderProgressSequence(statusKeys)',
    'order_progress_global_enabled',
    'setProgressSequence: adminProcedure',
    'GlobalProgressSequenceModal',
    'Sequência do Cliente',
    'globalProgressSequenceQuery',
    'resolveProgressPosition',
    'chunkProgressKeys(progressSteps, 3)',
]:
    combined = '\n'.join([db_text, router_text, admin_text, tracking_text, status_text])
    if required not in combined:
        raise SystemExit(f'marcador obrigatório ausente: {required}')

admin.write_text(admin_text, encoding='utf-8')
tracking.write_text(tracking_text, encoding='utf-8')
status_page.write_text(status_text, encoding='utf-8')
db_path.write_text(db_text, encoding='utf-8')
routers.write_text(router_text, encoding='utf-8')
print('GLOBAL_ORDER_PROGRESS_SEQUENCE_PATCH_OK')
