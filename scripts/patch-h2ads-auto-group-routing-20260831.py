from pathlib import Path

page_path = Path('client/src/pages/H2Ads.tsx')
control_path = Path('client/src/components/H2AdsOrderLinkControl.tsx')
test_path = Path('server/h2adsGroupRouting.test.ts')

page = page_path.read_text(encoding='utf-8')
control = control_path.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    return text.replace(old, new, 1)

# H2Ads page: centraliza a mutacao de grupo e passa grupos ativos ao card.
page = replace_once(
    page,
    '  const moveGroup = async (groupId: number, direction: -1 | 1) => {',
    '''  const moveInstanceToGroup = async (instanceId: number, targetGroupId: number) => {
    const instance = instances.find(item => item.id === instanceId);
    const targetGroup = activeGroups.find(group => group.id === targetGroupId);
    if (!instance) { toast.error("Instância não encontrada."); return; }
    if (!targetGroup) { toast.error("Grupo de destino não está ativo."); return; }
    if (instance.groupId === targetGroupId) { toast.info(`A instância já está em ${targetGroup.name}.`); return; }
    try {
      await updateInstance.mutateAsync({ id: instanceId, groupId: targetGroupId });
      setExpandedGroups(current => new Set([...current, targetGroupId]));
      await refresh();
      toast.success(`Instância movida para ${targetGroup.name}.`);
    } catch (error) { toast.error(errorText(error, "Não foi possível trocar o grupo da instância.")); }
  };

  const moveGroup = async (groupId: number, direction: -1 | 1) => {''',
    'handler de troca de grupo',
)

old_render = 'onCloseBrowser={onCloseBrowser} onDelete={() => onDeleteInstance(instance.id, instance.name)} onEditInstance={() => onEditInstance(instance)} onEditRoute={() => onEditRoute(instance.id)} />)'
new_render = 'onCloseBrowser={onCloseBrowser} groups={activeGroups} onMoveGroup={onMoveInstanceGroup} onDelete={() => onDeleteInstance(instance.id, instance.name)} onEditInstance={() => onEditInstance(instance)} onEditRoute={() => onEditRoute(instance.id)} />)'
page = replace_once(page, old_render, new_render, 'props de troca de grupo')

old_group_sig = 'function GroupSection({ group, instances, profileByInstance, credentialByInstance, workerById, assignmentByInstance, browserRunByInstance, workers, busy, visualColors, onVisualColor, onEditGroup, onNewInstance, onEditInstance, onEditRoute, onAssignWorker, onPrepareBrowser, onLaunchBrowser, onCloseBrowser, onDeleteInstance, instanceAction, expanded, onToggle, ordering, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onDeleteGroup }:'
new_group_sig = 'function GroupSection({ group, instances, profileByInstance, credentialByInstance, workerById, assignmentByInstance, browserRunByInstance, workers, busy, visualColors, onVisualColor, onEditGroup, onNewInstance, onEditInstance, onEditRoute, onAssignWorker, onPrepareBrowser, onLaunchBrowser, onCloseBrowser, onMoveInstanceGroup, onDeleteInstance, instanceAction, expanded, onToggle, ordering, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onDeleteGroup }:'
page = replace_once(page, old_group_sig, new_group_sig, 'GroupSection recebe callback')

old_group_type = 'onCloseBrowser: (instanceId: number) => void; onDeleteInstance: (instanceId: number, instanceName: string) => void;'
new_group_type = 'onCloseBrowser: (instanceId: number) => void; onMoveInstanceGroup: (instanceId: number, targetGroupId: number) => void; onDeleteInstance: (instanceId: number, instanceName: string) => void;'
page = replace_once(page, old_group_type, new_group_type, 'tipo callback GroupSection')

old_group_call = 'onCloseBrowser={requestBrowserClose} onDeleteInstance={removeInstance}'
new_group_call = 'onCloseBrowser={requestBrowserClose} onMoveInstanceGroup={moveInstanceToGroup} onDeleteInstance={removeInstance}'
page = replace_once(page, old_group_call, new_group_call, 'passa callback para GroupSection')

old_instance_sig = 'function InstanceCard({ instance, profile, hasCredential, assignment, browserRun, worker, workers, busy, visualColor, actionState, onAssignWorker, onPrepareBrowser, onLaunchBrowser, onCloseBrowser, onDelete, onEditInstance, onEditRoute }:'
new_instance_sig = 'function InstanceCard({ instance, profile, hasCredential, assignment, browserRun, worker, workers, groups, busy, visualColor, actionState, onAssignWorker, onPrepareBrowser, onLaunchBrowser, onCloseBrowser, onMoveGroup, onDelete, onEditInstance, onEditRoute }:'
page = replace_once(page, old_instance_sig, new_instance_sig, 'InstanceCard recebe grupos')

old_instance_type = 'instance: { id: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }; profile?: NetworkProfile; hasCredential: boolean; assignment?: WorkerAssignment; browserRun?: BrowserRun; worker?: BrowserWorker; workers: BrowserWorker[]; busy: boolean; visualColor: string; actionState?: string; onAssignWorker: (instanceId: number, workerId: string) => void; onPrepareBrowser: (instanceId: number) => void; onLaunchBrowser: (instanceId: number) => void; onCloseBrowser: (instanceId: number) => void; onDelete: () => void;'
new_instance_type = 'instance: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }; profile?: NetworkProfile; hasCredential: boolean; assignment?: WorkerAssignment; browserRun?: BrowserRun; worker?: BrowserWorker; workers: BrowserWorker[]; groups: { id: number; name: string; status: "active" | "archived" }[]; busy: boolean; visualColor: string; actionState?: string; onAssignWorker: (instanceId: number, workerId: string) => void; onPrepareBrowser: (instanceId: number) => void; onLaunchBrowser: (instanceId: number) => void; onCloseBrowser: (instanceId: number) => void; onMoveGroup: (instanceId: number, targetGroupId: number) => void; onDelete: () => void;'
page = replace_once(page, old_instance_type, new_instance_type, 'tipo InstanceCard')

page = replace_once(
    page,
    '<H2AdsOrderLinkControl instanceId={instance.id} />',
    '<H2AdsOrderLinkControl instanceId={instance.id} currentGroupId={instance.groupId} groups={groups} onMoveGroup={targetGroupId => onMoveGroup(instance.id, targetGroupId)} />',
    'controle de pedido recebe grupos',
)

# OrderLinkControl: inclui roteamento manual/automatico usando pedido vinculado.
control = replace_once(
    control,
    'import { canShowH2AdsOrderForLink, getExactH2AdsCustomerNumberSearch, matchesH2AdsOrderSearch, normalizeH2AdsOrderSearch } from "@shared/h2adsOrderSearch";',
    'import { canShowH2AdsOrderForLink, getExactH2AdsCustomerNumberSearch, matchesH2AdsOrderSearch, normalizeH2AdsOrderSearch } from "@shared/h2adsOrderSearch";\nimport { resolveH2AdsAutomaticGroup } from "@shared/h2adsGroupRouting";',
    'import roteamento',
)

control = replace_once(
    control,
    'export default function H2AdsOrderLinkControl({ instanceId }: { instanceId: number }) {',
    '''export default function H2AdsOrderLinkControl({ instanceId, currentGroupId, groups, onMoveGroup }: {
  instanceId: number;
  currentGroupId: number;
  groups: { id: number; name: string; status: "active" | "archived" }[];
  onMoveGroup: (targetGroupId: number) => void;
}) {''',
    'props roteamento',
)

control = replace_once(
    control,
    '  const [search, setSearch] = useState("");\n',
    '  const [search, setSearch] = useState("");\n  const [groupPickerOpen, setGroupPickerOpen] = useState(false);\n',
    'estado seletor de grupo',
)

control = replace_once(
    control,
    '  const currentOrder = current ? orders.find(order => order.id === current.registrationId && (order.subOrderIndex ?? 0) === current.subOrderIndex) : undefined;\n',
    '''  const currentOrder = current ? orders.find(order => order.id === current.registrationId && (order.subOrderIndex ?? 0) === current.subOrderIndex) : undefined;
  const automaticGroup = resolveH2AdsAutomaticGroup(groups, currentOrder);
  const currentGroup = groups.find(group => group.id === currentGroupId);
  const moveAutomatic = () => {
    if (!currentOrder) { toast.error("Vincule um pedido antes de direcionar automaticamente."); return; }
    if (!automaticGroup) { toast.error("Não encontrei um grupo compatível com a opção/status deste pedido."); return; }
    if (automaticGroup.id === currentGroupId) { toast.info(`A instância já está em ${automaticGroup.name}.`); return; }
    onMoveGroup(automaticGroup.id);
  };
''',
    'resolve destino automatico',
)

routing_ui = '''    <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.05] p-2.5">
      <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200">Grupo da instância</p><p className="mt-0.5 text-[11px] font-bold text-white">{currentGroup?.name || "Grupo atual"}</p></div>{automaticGroup && <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase text-emerald-200">Auto: {automaticGroup.name}</span>}</div>
      <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setGroupPickerOpen(value => !value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-[10px] font-black text-slate-200">Trocar grupo</button><button type="button" onClick={moveAutomatic} disabled={!currentOrder} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-2 text-[10px] font-black text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40">Direcionar automático</button></div>
      {groupPickerOpen && <div className="mt-2 grid gap-1 rounded-lg border border-white/10 bg-black/25 p-1.5">{groups.filter(group => group.status === "active").map(group => <button key={group.id} type="button" disabled={group.id === currentGroupId} onClick={() => { onMoveGroup(group.id); setGroupPickerOpen(false); }} className="rounded-md px-2 py-2 text-left text-[10px] font-bold text-slate-200 hover:bg-white/[0.06] disabled:cursor-default disabled:bg-emerald-400/10 disabled:text-emerald-200">{group.name}{group.id === currentGroupId ? " · atual" : ""}</button>)}</div>}
    </div>
'''
control = replace_once(
    control,
    '    <input\n      value={search}',
    routing_ui + '\n    <input\n      value={search}',
    'UI de roteamento',
)

required_page = [
    'const moveInstanceToGroup = async',
    'onMoveInstanceGroup={moveInstanceToGroup}',
    'groups={activeGroups}',
    'currentGroupId={instance.groupId}',
]
for marker in required_page:
    if marker not in page:
        raise SystemExit(f'page: marcador ausente: {marker}')

required_control = [
    'resolveH2AdsAutomaticGroup',
    'Direcionar automático',
    'Trocar grupo',
    'Auto: {automaticGroup.name}',
]
for marker in required_control:
    if marker not in control:
        raise SystemExit(f'control: marcador ausente: {marker}')

page_path.write_text(page, encoding='utf-8')
control_path.write_text(control, encoding='utf-8')

test_path.write_text('''import { describe, expect, it } from "vitest";\nimport { resolveH2AdsAutomaticGroup } from "../shared/h2adsGroupRouting";\n\nconst groups = [\n  { id: 1, name: "NOME ALEATORIO", status: "active" },\n  { id: 2, name: "PRIMEIRO NOME", status: "active" },\n  { id: 3, name: "NOME COMPLETO", status: "active" },\n  { id: 4, name: "TAXI", status: "active" },\n  { id: 5, name: "CONTA ATIVA", status: "active" },\n  { id: 6, name: "AG FICAR ATIVA", status: "active" },\n];\n\ndescribe("H2ADS automatic group routing", () => {\n  it("direciona pelas opções tradicionais do pedido", () => {\n    expect(resolveH2AdsAutomaticGroup(groups, { serviceName: "UBER APP", serviceOption: "UBER 1º / NOME" })?.id).toBe(2);\n    expect(resolveH2AdsAutomaticGroup(groups, { serviceName: "UBER APP", serviceOption: "UBER NOME / COMPLETO" })?.id).toBe(3);\n    expect(resolveH2AdsAutomaticGroup(groups, { serviceName: "UBER APP", serviceOption: "NOME ALEATÓRIO" })?.id).toBe(1);\n    expect(resolveH2AdsAutomaticGroup(groups, { serviceName: "TAXI", serviceOption: "NOME COMPLETO" })?.id).toBe(4);\n  });\n\n  it("prioriza etapas conta ativa e aguardando ficar ativa", () => {\n    expect(resolveH2AdsAutomaticGroup(groups, { serviceOption: "NOME COMPLETO", latestStatus: "conta_ativa" })?.id).toBe(5);\n    expect(resolveH2AdsAutomaticGroup(groups, { serviceOption: "NOME COMPLETO", latestStatus: "aguardando_ativa" })?.id).toBe(6);\n  });\n\n  it("ignora grupos arquivados", () => {\n    expect(resolveH2AdsAutomaticGroup([{ id: 9, name: "TAXI", status: "archived" }], { serviceName: "TAXI" })).toBeNull();\n  });\n});\n''', encoding='utf-8')

print('H2ADS_AUTO_GROUP_ROUTING_PATCH_OK')
