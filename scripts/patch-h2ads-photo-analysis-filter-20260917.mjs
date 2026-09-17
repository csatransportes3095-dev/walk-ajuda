import fs from 'node:fs';

const file = 'client/src/pages/H2Ads.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[h2ads-photo-analysis] ${label}: esperado 1 bloco, encontrado ${count}`);
  source = source.replace(oldText, newText);
}

if (source.includes('FOTO EM ANÁLISE ({photoAnalysisCount})')) {
  console.log('[h2ads-photo-analysis] OK: filtro ja aplicado.');
  process.exit(0);
}

replaceOnce(
  'import { buildH2AdsAppointmentByInstance, h2AdsAppointmentSortValue, matchesH2AdsScheduleFilter, type H2AdsAppointmentLike, type H2AdsOrderLinkLike, type H2AdsScheduleFilter } from "@shared/h2adsSchedule";\n',
  'import { buildH2AdsAppointmentByInstance, h2AdsAppointmentSortValue, matchesH2AdsScheduleFilter, type H2AdsAppointmentLike, type H2AdsOrderLinkLike, type H2AdsScheduleFilter } from "@shared/h2adsSchedule";\nimport { getOperationalBucket } from "@shared/orderBuckets";\n',
  'import do bucket operacional',
);

replaceOnce(
  '  const scheduleAppointmentsQuery = trpc.schedule.listAppointments.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 15_000, refetchIntervalInBackground: false });\n',
  '  const scheduleAppointmentsQuery = trpc.schedule.listAppointments.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 15_000, refetchIntervalInBackground: false });\n  const scheduleOrdersQuery = trpc.orderStatus.listOrders.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 15_000, refetchIntervalInBackground: false });\n',
  'query dos pedidos',
);

replaceOnce(
  '  const [scheduleFilter, setScheduleFilter] = useState<H2AdsScheduleFilter>("all");\n',
  '  const [scheduleFilter, setScheduleFilter] = useState<H2AdsScheduleFilter | "photo_analysis">("all");\n',
  'estado do filtro',
);

replaceOnce(
  '  const pendingScheduleCount = useMemo(() => instances.filter(instance => appointmentByInstance.get(instance.id)?.status === "pending").length, [instances, appointmentByInstance]);\n  const scheduleFilteredInstances = useMemo(() => {\n    if (scheduleFilter === "all") return [] as typeof instances;\n    return instances\n      .filter(instance => matchesH2AdsScheduleFilter(appointmentByInstance.get(instance.id), scheduleFilter))\n',
  '  const pendingScheduleCount = useMemo(() => instances.filter(instance => appointmentByInstance.get(instance.id)?.status === "pending").length, [instances, appointmentByInstance]);\n  const linkedOrderByInstance = useMemo(() => {\n    const orderByKey = new Map();\n    for (const order of (scheduleOrdersQuery.data ?? [])) orderByKey.set(`${order.id}:${order.subOrderIndex ?? 0}`, order);\n    const result = new Map();\n    for (const link of (scheduleLinksQuery.data ?? [])) {\n      const order = orderByKey.get(`${link.registrationId}:${link.subOrderIndex ?? 0}`);\n      if (order) result.set(link.instanceId, order);\n    }\n    return result;\n  }, [scheduleLinksQuery.data, scheduleOrdersQuery.data]);\n  const photoAnalysisCount = useMemo(() => instances.filter(instance => getOperationalBucket({ latestStatus: linkedOrderByInstance.get(instance.id)?.latestStatus, scheduleStatus: null }) === "em_analise").length, [instances, linkedOrderByInstance]);\n  const scheduleFilteredInstances = useMemo(() => {\n    if (scheduleFilter === "all") return [] as typeof instances;\n    if (scheduleFilter === "photo_analysis") {\n      return instances\n        .filter(instance => getOperationalBucket({ latestStatus: linkedOrderByInstance.get(instance.id)?.latestStatus, scheduleStatus: null }) === "em_analise")\n        .filter(instance => !instanceSearchKey || normalizeH2AdsSearch(instance.name).includes(instanceSearchKey))\n        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));\n    }\n    return instances\n      .filter(instance => matchesH2AdsScheduleFilter(appointmentByInstance.get(instance.id), scheduleFilter))\n',
  'dados e filtragem de foto em analise',
);

replaceOnce(
  '  }, [instances, appointmentByInstance, scheduleFilter, instanceSearchKey]);\n',
  '  }, [instances, appointmentByInstance, linkedOrderByInstance, scheduleFilter, instanceSearchKey]);\n',
  'dependencias do filtro',
);

replaceOnce(
  '              <button type="button" onClick={() => { setScheduleFilter("pending"); if (orderingGroups) setOrderingGroups(false); }} className={`rounded-lg border px-3 py-2 text-[10px] font-black transition-colors ${scheduleFilter === "pending" ? "border-amber-300/60 bg-amber-400 text-[#1A1000]" : "border-amber-400/20 bg-amber-400/[0.06] text-amber-100 hover:bg-amber-400/[0.12]"}`}>AGUARDANDO AGENDAMENTO ({pendingScheduleCount})</button>\n',
  '              <button type="button" onClick={() => { setScheduleFilter("pending"); if (orderingGroups) setOrderingGroups(false); }} className={`rounded-lg border px-3 py-2 text-[10px] font-black transition-colors ${scheduleFilter === "pending" ? "border-amber-300/60 bg-amber-400 text-[#1A1000]" : "border-amber-400/20 bg-amber-400/[0.06] text-amber-100 hover:bg-amber-400/[0.12]"}`}>AGUARDANDO AGENDAMENTO ({pendingScheduleCount})</button>\n              <button type="button" onClick={() => { setScheduleFilter("photo_analysis"); if (orderingGroups) setOrderingGroups(false); }} className={`rounded-lg border px-3 py-2 text-[10px] font-black transition-colors ${scheduleFilter === "photo_analysis" ? "border-violet-300/60 bg-violet-400 text-[#14061D]" : "border-violet-400/20 bg-violet-400/[0.06] text-violet-100 hover:bg-violet-400/[0.12]"}`}>FOTO EM ANÁLISE ({photoAnalysisCount})</button>\n',
  'botao Foto em analise',
);

replaceOnce(
  '{scheduleFilter === "confirmed" ? "Agendamentos confirmados" : "Aguardando agendamento"}',
  '{scheduleFilter === "confirmed" ? "Agendamentos confirmados" : scheduleFilter === "pending" ? "Aguardando agendamento" : "Foto em análise"}',
  'titulo do bloco filtrado',
);

if (!source.includes('setScheduleFilter("photo_analysis")') || !source.includes('photoAnalysisCount')) {
  throw new Error('[h2ads-photo-analysis] validacao final falhou');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[h2ads-photo-analysis] OK: filtro Foto em analise integrado ao H2ADS.');
