import fs from 'node:fs';

function replaceOnce(text, before, after, label) {
  if (text.includes(after)) return text;
  const pieces = text.split(before);
  if (pieces.length !== 2) throw new Error(`Integration anchor mismatch: ${label} (${pieces.length - 1})`);
  return pieces.join(after);
}
const pagePath = 'client/src/pages/OrderTracking.tsx';
const routerPath = 'server/routers/schedule.ts';
let page = fs.readFileSync(pagePath, 'utf8');
const originalPage = page;
const imports = 'import TrackingScheduleTopCard from "@/components/TrackingScheduleTopCard";\nimport { selectTrackingSchedule } from "@shared/trackingScheduleCard";\n';
if (!page.includes(imports)) {
  if (page.includes('import TrackingScheduleTopCard')) throw new Error('Partial card import');
  page = imports + page;
}
page = replaceOnce(page,
`    { enabled: canAccess && !!searchPhone && searchPhone.length >= 10, refetchInterval: 30000 }
  );
  return (`,
`    { enabled: canAccess && !!searchPhone && searchPhone.length >= 10, staleTime: 0, refetchInterval: 15000, refetchOnWindowFocus: true, refetchOnReconnect: true }
  );
  // Appointment state, not a translated/renamed order status, controls the shortcut.
  const currentTrackingSchedule = !scheduleQuery.isError
    ? selectTrackingSchedule(scheduleQuery.data, registrationId)
    : null;
  useEffect(() => {
    if (canAccess && searchPhone.length >= 10 && registrationId > 0) void scheduleQuery.refetch();
  }, [canAccess, searchPhone, registrationId, latestStatus]);
  return (`, 'schedule-query');
page = replaceOnce(page,
`            {/* Sincronização automática — botão manual fica apenas como contingência */}`,
`            {/* Atalho de agendamento real do pedido, antes da situação atual. */}
            <TrackingScheduleTopCard key={currentTrackingSchedule?.token ?? registrationId} appointment={currentTrackingSchedule} />

            {/* Sincronização automática — botão manual fica apenas como contingência */}`, 'top-card');
page = replaceOnce(page,
`            {canAccess && canShowScheduleForCurrentOrder && (scheduleQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-3">
                {scheduleQuery.data!.map((a) => {`,
`            {canAccess && currentTrackingSchedule && (
              <div className="space-y-3">
                {[currentTrackingSchedule].map((a) => {`, 'order-specific-details');
const semanticStart = page.indexOf("  const latestStatusSemantic = String(latestCfg?.label || latestStatus || '')");
if (semanticStart !== -1) {
  const semanticEnd = page.indexOf('  const previousLiveStatusRef', semanticStart);
  if (semanticEnd === -1) throw new Error('Missing status semantic boundary');
  const old = page.slice(semanticStart, semanticEnd);
  if (!old.includes("latestStatusSemantic === 'agendamento confirmado';") || old.length > 850) throw new Error('Unexpected status guard');
  page = page.slice(0, semanticStart) + page.slice(semanticEnd);
}
if (page.includes('canShowScheduleForCurrentOrder')) throw new Error('Unexpected extra status guard reference');

let router = fs.readFileSync(routerPath, 'utf8');
const originalRouter = router;
const start = router.indexOf('  listForTrackingByPhone: publicProcedure');
const end = router.indexOf('  // Estado mínimo do agendamento', start);
if (start < 0 || end < start) throw new Error('Tracking endpoint boundaries missing');
const segment = router.slice(start, end);
const updated = replaceOnce(segment,
'          id: a.id,\n          token: a.token,',
'          id: a.id,\n          registrationId: a.registrationId,\n          token: a.token,', 'tracking-registration-id');
router = router.slice(0, start) + updated + router.slice(end);

if (page !== originalPage) fs.writeFileSync(pagePath, page);
if (router !== originalRouter) fs.writeFileSync(routerPath, router);
console.log(JSON.stringify({pageChanged: page !== originalPage, routerChanged: router !== originalRouter}));
