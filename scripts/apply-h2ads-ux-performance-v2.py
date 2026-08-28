from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"expected snippet not found in {path}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

# -----------------------------------------------------------------------------
# Server data layer: safe instance deletion
# -----------------------------------------------------------------------------
path = Path("server/h2ads.ts")
text = path.read_text(encoding="utf-8")
needle = '''export async function updateH2AdsInstance(id: number, input: Partial<Pick<H2AdsInstance, "groupId" | "name" | "status" | "notes" | "sortOrder">>): Promise<boolean> {
  const db = await requireH2AdsDb();
  if (Object.keys(input).length === 0) return false;
  const result = await db.update(h2AdsInstances).set(input).where(eq(h2AdsInstances.id, id));
  return Number(result[0].affectedRows) > 0;
}
'''
replacement = needle + '''
export async function deleteH2AdsInstance(id: number): Promise<boolean> {
  const db = await requireH2AdsDb();
  const existing = await db.select({ id: h2AdsInstances.id }).from(h2AdsInstances).where(eq(h2AdsInstances.id, id)).limit(1);
  if (!existing[0]) return false;

  return db.transaction(async (tx) => {
    const run = await tx.select({ state: h2AdsInstanceBrowserRuns.state }).from(h2AdsInstanceBrowserRuns).where(eq(h2AdsInstanceBrowserRuns.instanceId, id)).limit(1);
    if (run[0]?.state === "browser_open") {
      throw new Error("Encerre o browser desta instância antes de excluí-la.");
    }

    // Remove somente dados pertencentes à instância escolhida. Worker e grupo permanecem intactos.
    await tx.delete(h2AdsWorkerBrowserCommands).where(eq(h2AdsWorkerBrowserCommands.instanceId, id));
    await tx.delete(h2AdsWorkerCommands).where(eq(h2AdsWorkerCommands.instanceId, id));
    await tx.delete(h2AdsInstanceBrowserRuns).where(eq(h2AdsInstanceBrowserRuns.instanceId, id));
    await tx.delete(h2AdsInstanceWorkerAssignments).where(eq(h2AdsInstanceWorkerAssignments.instanceId, id));
    await tx.delete(h2AdsInstanceProxyCredentials).where(eq(h2AdsInstanceProxyCredentials.instanceId, id));
    await tx.delete(h2AdsInstanceNetworkProfiles).where(eq(h2AdsInstanceNetworkProfiles.instanceId, id));
    const deleted = await tx.delete(h2AdsInstances).where(eq(h2AdsInstances.id, id));
    return Number(deleted[0].affectedRows) === 1;
  });
}
'''
if needle not in text:
    raise SystemExit("updateH2AdsInstance anchor not found")
path.write_text(text.replace(needle, replacement, 1), encoding="utf-8")

# -----------------------------------------------------------------------------
# Router: admin-only delete mutation
# -----------------------------------------------------------------------------
path = Path("server/routers/h2ads.ts")
text = path.read_text(encoding="utf-8")
text = text.replace("  createH2AdsInstance,\n", "  createH2AdsInstance,\n  deleteH2AdsInstance,\n", 1)
anchor = '''export const h2AdsUpdateInstanceSchema = z.object({
  id: z.number().int().positive(),
  groupId: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(128).optional(),
  status: h2AdsInstanceStatusSchema.optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
}).strict().refine(({ id: _id, ...changes }) => Object.values(changes).some(value => value !== undefined), {
  message: "Informe ao menos um campo para atualizar a instância.",
});
'''
if anchor not in text:
    raise SystemExit("update instance schema anchor not found")
text = text.replace(anchor, anchor + '''
export const h2AdsDeleteInstanceSchema = z.object({
  id: z.number().int().positive(),
}).strict();
''', 1)
mutation_anchor = '''  updateInstance: adminProcedure.input(h2AdsUpdateInstanceSchema).mutation(async ({ input }) => {
    const { id, groupId, ...changes } = input;
    if (groupId !== undefined) await requireWritableGroup(groupId);
    const updated = await updateH2AdsInstance(id, { ...changes, ...(groupId === undefined ? {} : { groupId }) });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Instância H2 Ads não encontrada." });
    return { success: true };
  }),
'''
if mutation_anchor not in text:
    raise SystemExit("update instance mutation anchor not found")
text = text.replace(mutation_anchor, mutation_anchor + '''
  deleteInstance: adminProcedure.input(h2AdsDeleteInstanceSchema).mutation(async ({ input }) => {
    try {
      const deleted = await deleteH2AdsInstance(input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Instância H2 Ads não encontrada." });
      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      const message = error instanceof Error ? error.message : "Não foi possível excluir a instância.";
      throw new TRPCError({ code: "CONFLICT", message });
    }
  }),
''', 1)
path.write_text(text, encoding="utf-8")

# -----------------------------------------------------------------------------
# Client UX/performance
# -----------------------------------------------------------------------------
path = Path("client/src/pages/H2Ads.tsx")
text = path.read_text(encoding="utf-8")
text = text.replace(
    'import { Activity, ArrowLeft, CheckCircle2, Copy, Eye, EyeOff, FolderPlus, KeyRound, Layers3, LockKeyhole, MapPin, Monitor, Network, Pencil, Play, Plus, ShieldCheck, Square, Wifi, WifiOff, X } from "lucide-react";',
    'import { Activity, ArrowLeft, CheckCircle2, Copy, Eye, EyeOff, FolderPlus, KeyRound, Layers3, LockKeyhole, MapPin, Monitor, Network, Pencil, Play, Plus, ShieldCheck, Square, Trash2, Wifi, WifiOff, X } from "lucide-react";',
    1,
)
text = text.replace(
    '  const dashboard = trpc.h2Ads.listDashboard.useQuery(undefined, { retry: false });',
    '  const dashboard = trpc.h2Ads.listDashboard.useQuery(undefined, { retry: false, staleTime: 3_000, refetchInterval: 12_000, refetchOnWindowFocus: false });',
    1,
)
text = text.replace(
    '  const updateInstance = trpc.h2Ads.updateInstance.useMutation();',
    '  const updateInstance = trpc.h2Ads.updateInstance.useMutation();\n  const deleteInstance = trpc.h2Ads.deleteInstance.useMutation();',
    1,
)
text = text.replace(
    '  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: Date } | null>(null);',
    '  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: Date } | null>(null);\n  const [instanceAction, setInstanceAction] = useState<Record<number, string>>({});',
    1,
)
old_saving = '  const saving = createGroup.isPending || updateGroup.isPending || createInstance.isPending || updateInstance.isPending || saveNetworkProfile.isPending || saveProxyCredential.isPending || updateProxyRotation.isPending || validateProxy.isPending || createWorkerPairing.isPending || assignWorker.isPending || revokeWorker.isPending || prepareBrowser.isPending || launchBrowser.isPending || closeBrowser.isPending;\nconst refresh = () => utils.h2Ads.listDashboard.invalidate();\nconst refreshCommandState = () => {\n  void refresh();\n  for (const delay of [600, 1_400, 2_600, 4_200]) window.setTimeout(() => { void refresh(); }, delay);\n};'
new_saving = '''  const saving = createGroup.isPending || updateGroup.isPending || createInstance.isPending || updateInstance.isPending || deleteInstance.isPending || saveNetworkProfile.isPending || saveProxyCredential.isPending || updateProxyRotation.isPending || validateProxy.isPending || createWorkerPairing.isPending || assignWorker.isPending || revokeWorker.isPending;
const refresh = () => dashboard.refetch();
const setAction = (instanceId: number, label: string | null) => setInstanceAction(current => {
  const next = { ...current };
  if (label) next[instanceId] = label; else delete next[instanceId];
  return next;
});
const refreshCommandState = (instanceId: number) => {
  void refresh();
  for (const delay of [350, 800, 1_500, 2_600, 4_000]) window.setTimeout(() => { void refresh(); }, delay);
  window.setTimeout(() => setAction(instanceId, null), 4_600);
};'''
if old_saving not in text:
    raise SystemExit("saving/refresh anchor not found")
text = text.replace(old_saving, new_saving, 1)

old_handlers = '''  const requestBrowserPreparation = async (instanceId: number) => {
    try {
      await prepareBrowser.mutateAsync({ instanceId });
      toast.success("Preparação enviada ao Worker. O browser permanecerá fechado.");
      await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível preparar esta instância.")); }
  };

  const requestBrowserLaunch = async (instanceId: number) => {
    try {
      await launchBrowser.mutateAsync({ instanceId });
      toast.success("Abertura manual enviada ao Worker. O browser só abre no perfil preparado.");
      await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível solicitar a abertura do browser.")); }
  };

  const requestBrowserClose = async (instanceId: number) => {
    try {
      await closeBrowser.mutateAsync({ instanceId });
      toast.success("Encerrando browser...");
      refreshCommandState();
    } catch (error) { toast.error(errorText(error, "Não foi possível solicitar o encerramento do browser.")); }
  };
'''
new_handlers = '''  const requestBrowserPreparation = async (instanceId: number) => {
    setAction(instanceId, "Preparando perfil e verificando proxy...");
    try {
      await prepareBrowser.mutateAsync({ instanceId });
      toast.success("Preparação enviada. Acompanhe o estado no próprio cartão.");
      refreshCommandState(instanceId);
    } catch (error) { setAction(instanceId, null); toast.error(errorText(error, "Não foi possível preparar esta instância.")); }
  };

  const requestBrowserLaunch = async (instanceId: number) => {
    setAction(instanceId, "Abrindo browser no Windows...");
    try {
      await launchBrowser.mutateAsync({ instanceId });
      toast.success("Comando de abertura enviado.");
      refreshCommandState(instanceId);
    } catch (error) { setAction(instanceId, null); toast.error(errorText(error, "Não foi possível solicitar a abertura do browser.")); }
  };

  const requestBrowserClose = async (instanceId: number) => {
    setAction(instanceId, "Encerrando browser...");
    try {
      await closeBrowser.mutateAsync({ instanceId });
      toast.success("Comando de encerramento enviado.");
      refreshCommandState(instanceId);
    } catch (error) { setAction(instanceId, null); toast.error(errorText(error, "Não foi possível solicitar o encerramento do browser.")); }
  };

  const removeInstance = async (instanceId: number, instanceName: string) => {
    const run = browserRunByInstance.get(instanceId);
    if (run?.state === "browser_open") { toast.error("Encerre o browser antes de excluir esta instância."); return; }
    if (!window.confirm(`Excluir definitivamente a instância ${instanceName}? A rota, o perfil local vinculado no painel e o histórico operacional desta instância serão removidos.`)) return;
    setAction(instanceId, "Excluindo instância...");
    try {
      await deleteInstance.mutateAsync({ id: instanceId });
      setAction(instanceId, null);
      toast.success("Instância excluída.");
      await refresh();
    } catch (error) { setAction(instanceId, null); toast.error(errorText(error, "Não foi possível excluir a instância.")); }
  };
'''
if old_handlers not in text:
    raise SystemExit("browser handlers anchor not found")
text = text.replace(old_handlers, new_handlers, 1)

text = text.replace('max-w-[1800px]', 'max-w-none', 2)
text = text.replace('lg:px-8', 'lg:px-5 2xl:px-8', 2)

old_group_call = 'onEditRoute={openRouteEditor} onAssignWorker={updateInstanceWorker} onPrepareBrowser={requestBrowserPreparation} onLaunchBrowser={requestBrowserLaunch} onCloseBrowser={requestBrowserClose} />)'
new_group_call = 'onEditRoute={openRouteEditor} onAssignWorker={updateInstanceWorker} onPrepareBrowser={requestBrowserPreparation} onLaunchBrowser={requestBrowserLaunch} onCloseBrowser={requestBrowserClose} onDeleteInstance={removeInstance} instanceAction={instanceAction} />)'
if old_group_call not in text:
    raise SystemExit("GroupSection call anchor not found")
text = text.replace(old_group_call, new_group_call, 1)

# Clear, direct proxy copy.
text = text.replace('{hasCredential ? "Substituir rota rotativa" : "Adicionar rota à instância"}', '{hasCredential ? "Trocar proxy desta instância" : "Configurar proxy desta instância"}', 1)
text = text.replace('Selecione o protocolo, cole uma linha e confira os dados extraídos antes de vincular.', 'Cole o novo proxy, confira os dados e salve. O proxy atual só é substituído depois da confirmação.', 1)
text = text.replace('Linha da nova rota', 'Novo proxy', 1)
text = text.replace('{hasCredential ? "Substituir rota" : "Salvar e vincular"}', '{hasCredential ? "Salvar novo proxy" : "Salvar proxy"}', 1)
text = text.replace('Tempo de rotação (minutos)', 'Avançado · reconexão automática (minutos)', 1)
text = text.replace('Deixe vazio para desativar. A credencial continua cifrada; somente o tempo fica visível no ADM. A mudança entra na próxima abertura do browser.', 'Opcional. Deixe vazio para não forçar reconexões locais. Isto não altera o TTL/sessão definido pelo fornecedor do proxy.', 1)

# Replace GroupSection + InstanceCard signatures and rendering bits.
old_group_sig = 'function GroupSection({ group, instances, profileByInstance, credentialByInstance, workerById, assignmentByInstance, browserRunByInstance, workers, busy, onEditGroup, onNewInstance, onEditInstance, onEditRoute, onAssignWorker, onPrepareBrowser, onLaunchBrowser, onCloseBrowser }: { group: { id: number; name: string; description: string | null; status: "active" | "archived" }; instances: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }[]; profileByInstance: Map<number, NetworkProfile>; credentialByInstance: Map<number, unknown>; workerById: Map<number, BrowserWorker>; assignmentByInstance: Map<number, WorkerAssignment>; browserRunByInstance: Map<number, BrowserRun>; workers: BrowserWorker[]; busy: boolean; onEditGroup: () => void; onNewInstance: () => void; onEditInstance: (instance: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }) => void; onEditRoute: (id: number) => void; onAssignWorker: (instanceId: number, workerId: string) => void; onPrepareBrowser: (instanceId: number) => void; onLaunchBrowser: (instanceId: number) => void; onCloseBrowser: (instanceId: number) => void }) {'
new_group_sig = 'function GroupSection({ group, instances, profileByInstance, credentialByInstance, workerById, assignmentByInstance, browserRunByInstance, workers, busy, onEditGroup, onNewInstance, onEditInstance, onEditRoute, onAssignWorker, onPrepareBrowser, onLaunchBrowser, onCloseBrowser, onDeleteInstance, instanceAction }: { group: { id: number; name: string; description: string | null; status: "active" | "archived" }; instances: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }[]; profileByInstance: Map<number, NetworkProfile>; credentialByInstance: Map<number, unknown>; workerById: Map<number, BrowserWorker>; assignmentByInstance: Map<number, WorkerAssignment>; browserRunByInstance: Map<number, BrowserRun>; workers: BrowserWorker[]; busy: boolean; onEditGroup: () => void; onNewInstance: () => void; onEditInstance: (instance: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }) => void; onEditRoute: (id: number) => void; onAssignWorker: (instanceId: number, workerId: string) => void; onPrepareBrowser: (instanceId: number) => void; onLaunchBrowser: (instanceId: number) => void; onCloseBrowser: (instanceId: number) => void; onDeleteInstance: (instanceId: number, instanceName: string) => void; instanceAction: Record<number, string> }) {'
if old_group_sig not in text:
    raise SystemExit("GroupSection signature anchor not found")
text = text.replace(old_group_sig, new_group_sig, 1)
text = text.replace('className="grid gap-3 p-3 lg:grid-cols-2 2xl:grid-cols-4"', 'className="grid gap-4 p-3 grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))]"', 1)
old_card_call = 'workers={workers} busy={busy} onAssignWorker={onAssignWorker} onPrepareBrowser={onPrepareBrowser} onLaunchBrowser={onLaunchBrowser} onCloseBrowser={onCloseBrowser} onEditInstance={() => onEditInstance(instance)} onEditRoute={() => onEditRoute(instance.id)} />)'
new_card_call = 'workers={workers} busy={busy} actionState={instanceAction[instance.id]} onAssignWorker={onAssignWorker} onPrepareBrowser={onPrepareBrowser} onLaunchBrowser={onLaunchBrowser} onCloseBrowser={onCloseBrowser} onDelete={() => onDeleteInstance(instance.id, instance.name)} onEditInstance={() => onEditInstance(instance)} onEditRoute={() => onEditRoute(instance.id)} />)'
if old_card_call not in text:
    raise SystemExit("InstanceCard call anchor not found")
text = text.replace(old_card_call, new_card_call, 1)

old_card_sig = 'function InstanceCard({ instance, profile, hasCredential, assignment, browserRun, worker, workers, busy, onAssignWorker, onPrepareBrowser, onLaunchBrowser, onCloseBrowser, onEditInstance, onEditRoute }: { instance: { id: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }; profile?: NetworkProfile; hasCredential: boolean; assignment?: WorkerAssignment; browserRun?: BrowserRun; worker?: BrowserWorker; workers: BrowserWorker[]; busy: boolean; onAssignWorker: (instanceId: number, workerId: string) => void; onPrepareBrowser: (instanceId: number) => void; onLaunchBrowser: (instanceId: number) => void; onCloseBrowser: (instanceId: number) => void; onEditInstance: () => void; onEditRoute: () => void }) {'
new_card_sig = 'function InstanceCard({ instance, profile, hasCredential, assignment, browserRun, worker, workers, busy, actionState, onAssignWorker, onPrepareBrowser, onLaunchBrowser, onCloseBrowser, onDelete, onEditInstance, onEditRoute }: { instance: { id: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }; profile?: NetworkProfile; hasCredential: boolean; assignment?: WorkerAssignment; browserRun?: BrowserRun; worker?: BrowserWorker; workers: BrowserWorker[]; busy: boolean; actionState?: string; onAssignWorker: (instanceId: number, workerId: string) => void; onPrepareBrowser: (instanceId: number) => void; onLaunchBrowser: (instanceId: number) => void; onCloseBrowser: (instanceId: number) => void; onDelete: () => void; onEditInstance: () => void; onEditRoute: () => void }) {'
if old_card_sig not in text:
    raise SystemExit("InstanceCard signature anchor not found")
text = text.replace(old_card_sig, new_card_sig, 1)
text = text.replace('  const canClose = Boolean(assignment && isOnline && !isArchived && browserRun?.state === "browser_open");\n  const browserState =', '  const canClose = Boolean(assignment && isOnline && !isArchived && browserRun?.state === "browser_open");\n  const instanceBusy = Boolean(actionState);\n  const browserState =', 1)
text = text.replace('{hasCredential ? "Editar rota" : "Adicionar rota"}', '{hasCredential ? "Trocar proxy" : "Configurar proxy"}', 1)
text = text.replace('disabled={busy || !canPrepare || browserRun?.state === "queued"', 'disabled={instanceBusy || !canPrepare || browserRun?.state === "queued"', 1)
text = text.replace('disabled={busy || !canLaunch}', 'disabled={instanceBusy || !canLaunch}', 1)
text = text.replace('disabled={busy || !canClose}', 'disabled={instanceBusy || !canClose}', 1)
text = text.replace('{browserState}{browserRun?.observedIp', '{actionState || browserState}{browserRun?.observedIp', 1)
old_footer = '<div className="mt-3 flex items-center justify-between gap-3"><p className="min-w-0 truncate text-[11px] text-slate-500">{profile?.lastCheckMessage || "Nenhuma validação executada."}</p><button type="button" onClick={onEditInstance} className="shrink-0 text-xs font-bold text-slate-400 hover:text-white">Editar instância</button></div>'
new_footer = '<div className="mt-3 flex items-center justify-between gap-3"><p className="min-w-0 truncate text-[11px] text-slate-500">{profile?.lastCheckMessage || "Nenhuma validação executada."}</p><div className="flex shrink-0 items-center gap-3"><button type="button" onClick={onEditInstance} className="text-xs font-bold text-slate-400 hover:text-white">Editar</button><button type="button" disabled={instanceBusy || browserRun?.state === "browser_open"} onClick={onDelete} className="inline-flex items-center gap-1 text-xs font-bold text-rose-300 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-35" title={browserRun?.state === "browser_open" ? "Encerre o browser antes de excluir" : "Excluir instância"}><Trash2 className="h-3.5 w-3.5" />Excluir</button></div></div>'
if old_footer not in text:
    raise SystemExit("InstanceCard footer anchor not found")
text = text.replace(old_footer, new_footer, 1)

path.write_text(text, encoding="utf-8")
