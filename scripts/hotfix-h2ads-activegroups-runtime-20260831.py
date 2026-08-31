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
    'workers={browserWorkers} busy={saving}',
    'workers={browserWorkers} groups={activeGroups} busy={saving}',
    'passar grupos ativos ao GroupSection',
)

replace_once(
    'function GroupSection({ group, instances, profileByInstance, credentialByInstance, workerById, assignmentByInstance, browserRunByInstance, workers, busy, visualColors,',
    'function GroupSection({ group, instances, profileByInstance, credentialByInstance, workerById, assignmentByInstance, browserRunByInstance, workers, groups, busy, visualColors,',
    'GroupSection recebe groups',
)

replace_once(
    'browserRunByInstance: Map<number, BrowserRun>; workers: BrowserWorker[]; busy: boolean;',
    'browserRunByInstance: Map<number, BrowserRun>; workers: BrowserWorker[]; groups: { id: number; name: string; status: "active" | "archived" }[]; busy: boolean;',
    'tipagem groups em GroupSection',
)

replace_once(
    'groups={activeGroups} onMoveGroup={onMoveInstanceGroup}',
    'groups={groups} onMoveGroup={onMoveInstanceGroup}',
    'InstanceCard usa prop groups',
)

start = source.index('function GroupSection(')
end = source.index('function InstanceCard(', start)
group_section = source[start:end]
if 'activeGroups' in group_section:
    raise SystemExit('activeGroups ainda aparece dentro de GroupSection')

required = [
    'workers={browserWorkers} groups={activeGroups} busy={saving}',
    'workers, groups, busy, visualColors',
    'groups: { id: number; name: string; status: "active" | "archived" }[]; busy: boolean;',
    'groups={groups} onMoveGroup={onMoveInstanceGroup}',
]
for marker in required:
    if marker not in source:
        raise SystemExit(f'marcador obrigatório ausente: {marker}')

path.write_text(source, encoding='utf-8')
print('H2ADS_ACTIVEGROUPS_RUNTIME_HOTFIX_OK')
