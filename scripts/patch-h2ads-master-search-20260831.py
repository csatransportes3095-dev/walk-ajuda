from pathlib import Path

path = Path("client/src/pages/H2Ads.tsx")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    source = source.replace(old, new, 1)


replace_once(
    'import { Activity, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown, ChevronRight, Copy, Eye, EyeOff, FolderPlus, KeyRound, Layers3, LockKeyhole, Monitor, Network, Pencil, Play, Plus, ShieldCheck, Square, Trash2, Wifi, WifiOff, X } from "lucide-react";',
    'import { Activity, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown, ChevronRight, Copy, Eye, EyeOff, FolderPlus, KeyRound, Layers3, LockKeyhole, Monitor, Network, Pencil, Play, Plus, Search, ShieldCheck, Square, Trash2, Wifi, WifiOff, X } from "lucide-react";',
    "import Search",
)

replace_once(
    'const colorBackground = (hex: string) => `${hex}22`;\n',
    'const colorBackground = (hex: string) => `${hex}22`;\nconst normalizeH2AdsSearch = (value: string) => value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");\n',
    "normalizador",
)

replace_once(
    '  const [orderingGroups, setOrderingGroups] = useState(false);\n',
    '  const [orderingGroups, setOrderingGroups] = useState(false);\n  const [instanceSearch, setInstanceSearch] = useState("");\n',
    "estado pesquisa",
)

instances_marker = '''  const instancesByGroup = useMemo(() => instances.reduce((map, instance) => {
    const current = map.get(instance.groupId) ?? [];
    current.push(instance);
    map.set(instance.groupId, current);
    return map;
  }, new Map<number, typeof instances>()), [instances]);
'''
search_logic = instances_marker + '''  const instanceSearchKey = useMemo(() => normalizeH2AdsSearch(instanceSearch), [instanceSearch]);
  const masterSearchResults = useMemo(() => {
    if (!instanceSearchKey) return [];
    return groups.map(group => ({
      group,
      instances: (instancesByGroup.get(group.id) ?? []).filter(instance => normalizeH2AdsSearch(instance.name).includes(instanceSearchKey)),
    })).filter(result => result.instances.length > 0);
  }, [groups, instancesByGroup, instanceSearchKey]);
  const masterSearchMatchCount = useMemo(() => masterSearchResults.reduce((total, result) => total + result.instances.length, 0), [masterSearchResults]);
  const visibleGroups = useMemo(() => instanceSearchKey ? masterSearchResults.map(result => result.group) : groups, [groups, instanceSearchKey, masterSearchResults]);
  const visibleInstancesByGroup = useMemo(() => {
    if (!instanceSearchKey) return instancesByGroup;
    const visible = new Map<number, typeof instances>();
    for (const result of masterSearchResults) visible.set(result.group.id, result.instances);
    return visible;
  }, [instanceSearchKey, instancesByGroup, masterSearchResults]);
'''
replace_once(instances_marker, search_logic, "logica pesquisa")

replace_once(
    'onClick={() => setOrderingGroups(value => !value)} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black ${orderingGroups ? "border-[#148CFF]/40 bg-[#148CFF]/15 text-[#8CC8FF]" : "border-white/10 bg-white/[0.03] text-slate-300"}`}',
    'onClick={() => setOrderingGroups(value => !value)} disabled={Boolean(instanceSearchKey)} title={instanceSearchKey ? "Limpe a pesquisa para ordenar os grupos" : undefined} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${orderingGroups ? "border-[#148CFF]/40 bg-[#148CFF]/15 text-[#8CC8FF]" : "border-white/10 bg-white/[0.03] text-slate-300"}`}',
    "ordenacao durante pesquisa",
)

search_anchor = '<Plus className="h-4 w-4" />Nova instância</button></div></header>\n        <div className="p-4 sm:p-6">'
search_block = '''<Plus className="h-4 w-4" />Nova instância</button></div></header>
        <div className="border-b border-white/10 bg-black/20 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8CC8FF]" />
              <input type="search" value={instanceSearch} onChange={event => { setInstanceSearch(event.target.value); if (orderingGroups) setOrderingGroups(false); }} onKeyDown={event => { if (event.key === "Escape") setInstanceSearch(""); }} placeholder="Pesquisar instância em todos os grupos..." autoComplete="off" aria-label="Pesquisar instância em todos os grupos" className="h-12 w-full rounded-2xl border border-[#148CFF]/30 bg-[#07101D] pl-12 pr-12 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-[#148CFF] focus:ring-2 focus:ring-[#148CFF]/20" />
              {instanceSearch && <button type="button" onClick={() => setInstanceSearch("")} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Limpar pesquisa"><X className="h-4 w-4" /></button>}
            </div>
            <div className={`rounded-xl border px-4 py-3 text-xs font-black ${instanceSearchKey ? "border-[#148CFF]/30 bg-[#148CFF]/10 text-[#8CC8FF]" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>
              {instanceSearchKey ? `${masterSearchMatchCount} instância(s) encontrada(s) em ${masterSearchResults.length} grupo(s)` : "Filtro mestre · busca em todos os grupos"}
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-6">'''
replace_once(search_anchor, search_block, "interface pesquisa")

replace_once(
    '}{groups.map((group, groupIndex) => <GroupSection',
    '}{!dashboard.isLoading && groups.length > 0 && instanceSearchKey && masterSearchMatchCount === 0 && <div className="mb-4 rounded-2xl border border-dashed border-[#F5B800]/30 bg-[#F5B800]/[0.06] p-5 text-center"><p className="font-black text-[#FFE37A]">Nenhuma instância encontrada.</p><p className="mt-1 text-xs text-slate-400">Tente outro nome. A pesquisa verifica todos os grupos.</p></div>}{visibleGroups.map(group => <GroupSection',
    "render grupos filtrados",
)
replace_once('instances={instancesByGroup.get(group.id) ?? []}', 'instances={visibleInstancesByGroup.get(group.id) ?? []}', "instancias filtradas")
replace_once('expanded={expandedGroups.has(group.id)}', 'expanded={instanceSearchKey ? true : expandedGroups.has(group.id)}', "abrir grupo encontrado")
replace_once('ordering={orderingGroups}', 'ordering={orderingGroups && !instanceSearchKey}', "bloquear ordenacao filtrada")
replace_once('canMoveUp={groupIndex > 0}', 'canMoveUp={groups.indexOf(group) > 0}', "movimento cima")
replace_once('canMoveDown={groupIndex < groups.length - 1}', 'canMoveDown={groups.indexOf(group) < groups.length - 1}', "movimento baixo")

required = [
    'Pesquisar instância em todos os grupos...',
    'normalizeH2AdsSearch(instance.name).includes(instanceSearchKey)',
    'visibleGroups.map(group => <GroupSection',
    'instances={visibleInstancesByGroup.get(group.id) ?? []}',
    'expanded={instanceSearchKey ? true : expandedGroups.has(group.id)}',
    'Nenhuma instância encontrada.',
]
for marker in required:
    if marker not in source:
        raise SystemExit(f"marcador obrigatorio ausente: {marker}")

path.write_text(source, encoding="utf-8")
print("H2ADS_MASTER_SEARCH_PATCH_OK")
