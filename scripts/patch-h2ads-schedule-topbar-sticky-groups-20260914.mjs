import fs from 'node:fs';

const file = 'client/src/pages/H2Ads.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`[h2ads-schedule-topbar] ${label}: esperado 1 bloco, encontrado ${count}`);
  }
  source = source.replace(oldText, newText);
}

replaceOnce(
  'import { parseH2AdsProxyInput, type H2AdsProxyProtocol } from "@shared/h2adsProxyInput";\n',
  'import { parseH2AdsProxyInput, type H2AdsProxyProtocol } from "@shared/h2adsProxyInput";\nimport { buildH2AdsAppointmentByInstance, h2AdsAppointmentSortValue, matchesH2AdsScheduleFilter, type H2AdsAppointmentLike, type H2AdsOrderLinkLike, type H2AdsScheduleFilter } from "@shared/h2adsSchedule";\n',
  'import helpers de agendamento',
);

replaceOnce(
  '  const proxySecurityStatus = trpc.h2Ads.proxySecurityStatus.useQuery(undefined, { retry: false });\n',
  '  const proxySecurityStatus = trpc.h2Ads.proxySecurityStatus.useQuery(undefined, { retry: false });\n  const scheduleLinksQuery = trpc.h2Ads.listOrderLinks.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });\n  const scheduleAppointmentsQuery = trpc.schedule.listAppointments.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 15_000, refetchIntervalInBackground: false });\n',
  'queries de agendamento',
);

replaceOnce(
  '  const [closingAllBrowsers, setClosingAllBrowsers] = useState(false);\n',
  '  const [closingAllBrowsers, setClosingAllBrowsers] = useState(false);\n  const [scheduleFilter, setScheduleFilter] = useState<H2AdsScheduleFilter>("all");\n',
  'estado do filtro de agendamento',
);

replaceOnce(
  '  const browserRunByInstance = useMemo(() => new Map(browserRuns.map(run => [run.instanceId, run])), [browserRuns]);\n',
  `  const browserRunByInstance = useMemo(() => new Map(browserRuns.map(run => [run.instanceId, run])), [browserRuns]);
  const appointmentByInstance = useMemo(() => buildH2AdsAppointmentByInstance(
    (scheduleLinksQuery.data ?? []) as H2AdsOrderLinkLike[],
    (scheduleAppointmentsQuery.data ?? []) as H2AdsAppointmentLike[],
  ), [scheduleLinksQuery.data, scheduleAppointmentsQuery.data]);
  const confirmedScheduleCount = useMemo(() => instances.filter(instance => appointmentByInstance.get(instance.id)?.status === "confirmed").length, [instances, appointmentByInstance]);
  const pendingScheduleCount = useMemo(() => instances.filter(instance => appointmentByInstance.get(instance.id)?.status === "pending").length, [instances, appointmentByInstance]);
  const scheduleFilteredInstances = useMemo(() => {
    if (scheduleFilter === "all") return [] as typeof instances;
    return instances
      .filter(instance => matchesH2AdsScheduleFilter(appointmentByInstance.get(instance.id), scheduleFilter))
      .filter(instance => !instanceSearchKey || normalizeH2AdsSearch(instance.name).includes(instanceSearchKey))
      .sort((a, b) => {
        const appointmentA = appointmentByInstance.get(a.id);
        const appointmentB = appointmentByInstance.get(b.id);
        const byDateTime = h2AdsAppointmentSortValue(appointmentA).localeCompare(h2AdsAppointmentSortValue(appointmentB));
        if (byDateTime !== 0) return byDateTime;
        return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
      });
  }, [instances, appointmentByInstance, scheduleFilter, instanceSearchKey]);
`,
  'mapa e contadores de agendamento',
);

const searchBarAnchor = '        <div className="border-b border-white/10 bg-black/20 px-4 py-4 sm:px-6">\n          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">\n';
const scheduleTopbar = `        <div className="border-b border-white/10 bg-[#081018] px-4 py-3 sm:px-6" data-h2ads-schedule-topbar>
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">Agendamentos H2ADS</p>
              <p className="mt-0.5 text-[9px] font-semibold text-slate-500">Filtro preso à barra superior · não cobre os grupos nem as instâncias.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setScheduleFilter("all")} className={\`rounded-lg border px-3 py-2 text-[10px] font-black transition-colors \${scheduleFilter === "all" ? "border-white/25 bg-white/15 text-white" : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]"}\`}>TODOS ({instances.length})</button>
              <button type="button" onClick={() => { setScheduleFilter("confirmed"); if (orderingGroups) setOrderingGroups(false); }} className={\`rounded-lg border px-3 py-2 text-[10px] font-black transition-colors \${scheduleFilter === "confirmed" ? "border-cyan-300/60 bg-cyan-400 text-[#031018]" : "border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-100 hover:bg-cyan-400/[0.12]"}\`}>AGENDAMENTOS CONFIRMADOS ({confirmedScheduleCount})</button>
              <button type="button" onClick={() => { setScheduleFilter("pending"); if (orderingGroups) setOrderingGroups(false); }} className={\`rounded-lg border px-3 py-2 text-[10px] font-black transition-colors \${scheduleFilter === "pending" ? "border-amber-300/60 bg-amber-400 text-[#1A1000]" : "border-amber-400/20 bg-amber-400/[0.06] text-amber-100 hover:bg-amber-400/[0.12]"}\`}>AGUARDANDO AGENDAMENTO ({pendingScheduleCount})</button>
            </div>
          </div>
        </div>
${searchBarAnchor}`;
replaceOnce(searchBarAnchor, scheduleTopbar, 'barra superior de agendamentos');

replaceOnce(
  '              {instanceSearchKey ? `${masterSearchMatchCount} instância(s) encontrada(s) em ${masterSearchResults.length} grupo(s)` : "Filtro mestre · busca em todos os grupos"}\n',
  '              {instanceSearchKey ? (scheduleFilter === "all" ? `${masterSearchMatchCount} instância(s) encontrada(s) em ${masterSearchResults.length} grupo(s)` : `${scheduleFilteredInstances.length} instância(s) no filtro selecionado`) : "Filtro mestre · busca em todos os grupos"}\n',
  'contador da pesquisa com filtro',
);

const oldRender = '        <div className="p-4 sm:p-6">{dashboard.isLoading && <div className="grid min-h-48 place-items-center text-sm text-slate-400">Carregando instâncias H2 Ads...</div>}{!dashboard.isLoading && groups.length === 0 && <EmptyState />}{!dashboard.isLoading && groups.length > 0 && instanceSearchKey && masterSearchMatchCount === 0 && <div className="mb-4 rounded-2xl border border-dashed border-[#F5B800]/30 bg-[#F5B800]/[0.06] p-5 text-center"><p className="font-black text-[#FFE37A]">Nenhuma instância encontrada.</p><p className="mt-1 text-xs text-slate-400">Tente outro nome. A pesquisa verifica todos os grupos.</p></div>}{visibleGroups.map(group => <GroupSection key={group.id} group={group} instances={visibleInstancesByGroup.get(group.id) ?? []} profileByInstance={profileByInstance} credentialByInstance={credentialByInstance} workerById={workerById} assignmentByInstance={assignmentByInstance} browserRunByInstance={browserRunByInstance} workers={browserWorkers} groups={activeGroups} busy={saving} visualColors={visualColors} onVisualColor={setVisualColor} onEditGroup={() => setGroupForm({ id: group.id, name: group.name, description: group.description ?? "", status: group.status, cardColor: group.cardColor || INSTANCE_DEFAULT_COLOR })} onNewInstance={() => newInstance(group.id)} onEditInstance={instance => setInstanceForm({ id: instance.id, groupId: String(instance.groupId), name: instance.name, notes: instance.notes ?? "", status: instance.status })} onEditRoute={openRouteEditor} onAssignWorker={updateInstanceWorker} onPrepareBrowser={requestBrowserPreparation} onLaunchBrowser={requestBrowserLaunch} onCloseBrowser={requestBrowserClose} onMoveInstanceGroup={moveInstanceToGroup} onDeleteInstance={removeInstance} instanceAction={instanceAction} expanded={instanceSearchKey ? true : expandedGroups.has(group.id)} onToggle={() => toggleGroup(group.id)} ordering={orderingGroups && !instanceSearchKey} canMoveUp={groups.indexOf(group) > 0} canMoveDown={groups.indexOf(group) < groups.length - 1} onMoveUp={() => void moveGroup(group.id, -1)} onMoveDown={() => void moveGroup(group.id, 1)} onDeleteGroup={() => void removeGroup(group.id, group.name)} />)}</div>\n';

const newRender = `        <div className="p-4 sm:p-6">
          {dashboard.isLoading && <div className="grid min-h-48 place-items-center text-sm text-slate-400">Carregando instâncias H2 Ads...</div>}
          {!dashboard.isLoading && groups.length === 0 && <EmptyState />}
          {!dashboard.isLoading && groups.length > 0 && scheduleFilter !== "all" && <section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-black/20">
            <header className="border-b border-white/8 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">{scheduleFilter === "confirmed" ? "Agendamentos confirmados" : "Aguardando agendamento"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">Visualização de agenda · grupos e configurações originais continuam preservados.</p>
            </header>
            {scheduleFilteredInstances.length === 0 ? <div className="p-6 text-center"><p className="font-black text-slate-300">Nenhuma instância neste filtro.</p><p className="mt-1 text-xs text-slate-500">Clique em TODOS para voltar aos grupos.</p></div> : <div className="grid grid-cols-1 gap-4 p-3 md:grid-cols-2 xl:grid-cols-4">{scheduleFilteredInstances.map(instance => {
              const group = groups.find(item => item.id === instance.groupId);
              const groupColor = group?.cardColor || visualColors[visualColorKey("group", instance.groupId)] || INSTANCE_DEFAULT_COLOR;
              const assignment = assignmentByInstance.get(instance.id);
              return <InstanceCard key={instance.id} instance={instance} profile={profileByInstance.get(instance.id)} hasCredential={credentialByInstance.has(instance.id)} assignment={assignment} browserRun={browserRunByInstance.get(instance.id)} worker={assignment ? workerById.get(assignment.workerId) : undefined} workers={browserWorkers} busy={saving} visualColor={groupColor} actionState={instanceAction[instance.id]} onAssignWorker={updateInstanceWorker} onPrepareBrowser={requestBrowserPreparation} onLaunchBrowser={requestBrowserLaunch} onCloseBrowser={requestBrowserClose} groups={activeGroups} onMoveGroup={moveInstanceToGroup} onDelete={() => removeInstance(instance.id, instance.name)} onEditInstance={() => setInstanceForm({ id: instance.id, groupId: String(instance.groupId), name: instance.name, notes: instance.notes ?? "", status: instance.status })} onEditRoute={() => openRouteEditor(instance.id)} />;
            })}</div>}
          </section>}
          {!dashboard.isLoading && groups.length > 0 && scheduleFilter === "all" && instanceSearchKey && masterSearchMatchCount === 0 && <div className="mb-4 rounded-2xl border border-dashed border-[#F5B800]/30 bg-[#F5B800]/[0.06] p-5 text-center"><p className="font-black text-[#FFE37A]">Nenhuma instância encontrada.</p><p className="mt-1 text-xs text-slate-400">Tente outro nome. A pesquisa verifica todos os grupos.</p></div>}
          {scheduleFilter === "all" && visibleGroups.map(group => <GroupSection key={group.id} group={group} instances={visibleInstancesByGroup.get(group.id) ?? []} profileByInstance={profileByInstance} credentialByInstance={credentialByInstance} workerById={workerById} assignmentByInstance={assignmentByInstance} browserRunByInstance={browserRunByInstance} workers={browserWorkers} groups={activeGroups} busy={saving} visualColors={visualColors} onVisualColor={setVisualColor} onEditGroup={() => setGroupForm({ id: group.id, name: group.name, description: group.description ?? "", status: group.status, cardColor: group.cardColor || INSTANCE_DEFAULT_COLOR })} onNewInstance={() => newInstance(group.id)} onEditInstance={instance => setInstanceForm({ id: instance.id, groupId: String(instance.groupId), name: instance.name, notes: instance.notes ?? "", status: instance.status })} onEditRoute={openRouteEditor} onAssignWorker={updateInstanceWorker} onPrepareBrowser={requestBrowserPreparation} onLaunchBrowser={requestBrowserLaunch} onCloseBrowser={requestBrowserClose} onMoveInstanceGroup={moveInstanceToGroup} onDeleteInstance={removeInstance} instanceAction={instanceAction} expanded={instanceSearchKey ? true : expandedGroups.has(group.id)} onToggle={() => toggleGroup(group.id)} ordering={orderingGroups && !instanceSearchKey} canMoveUp={groups.indexOf(group) > 0} canMoveDown={groups.indexOf(group) < groups.length - 1} onMoveUp={() => void moveGroup(group.id, -1)} onMoveDown={() => void moveGroup(group.id, 1)} onDeleteGroup={() => void removeGroup(group.id, group.name)} />)}
        </div>
`;
replaceOnce(oldRender, newRender, 'render principal com filtro de agenda');

replaceOnce(
  '  return <section className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20">\n    <header className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between ${expanded ? "border-b border-white/8" : ""}`}>\n',
  '  return <section className="mb-4 overflow-visible rounded-2xl border border-white/10 bg-black/20">\n    <header className={`z-20 flex flex-col gap-3 rounded-t-2xl p-4 sm:flex-row sm:items-start sm:justify-between ${expanded ? "sticky top-0 border-b border-white/8 bg-[#0D1016]/95 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl" : ""}`}>\n',
  'cabecalho do grupo permanece visivel ao expandir',
);

replaceOnce(
  '    {expanded && <div className="grid grid-cols-1 gap-4 p-3 md:grid-cols-2 xl:grid-cols-4">',
  '    {expanded && <div className="grid grid-cols-1 gap-4 overflow-hidden rounded-b-2xl p-3 md:grid-cols-2 xl:grid-cols-4">',
  'conteudo expandido preserva acabamento',
);

fs.writeFileSync(file, source, 'utf8');
console.log('[h2ads-schedule-topbar] OK: filtro preso à barra superior; grupo expandido mantém o cabeçalho visível.');
