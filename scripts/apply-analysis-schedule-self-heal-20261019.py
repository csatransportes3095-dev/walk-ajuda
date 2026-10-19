from pathlib import Path
import subprocess

BASE = '6a51f224e9bf6b553f9a7b8c16d7875772e086d7'
changed = {}

def replace_once(text, old, new):
    if new in text and old not in text:
        return text
    if text.count(old) != 1:
        raise RuntimeError('Expected exactly one anchor: ' + old[:100])
    return text.replace(old, new, 1)

def section(text, start, end):
    a = text.index(start)
    b = text.index(end, a)
    return a, b, text[a:b]

# Status transition and persisted sub-order snapshot only.
p = 'server/db.ts'
text = Path(p).read_text()
a, b, block = section(text, 'export async function updateLastOrderStatus(', 'export async function getOrderStatusHistory(')
block = replace_once(block,
    "  const [targetStatusLabel, previousStatusLabel] = await Promise.all([\n    getStatusLabelFromDb(data.status).catch(() => data.status),\n    getStatusLabelFromDb(latestEntry.status).catch(() => latestEntry.status),\n  ]);\n  const targetIsAnalysis = isAnalysisOrderStatusSemantic(data.status, targetStatusLabel);\n  const previousIsAnalysis = isAnalysisOrderStatusSemantic(latestEntry.status, previousStatusLabel);",
    "  const targetStatusLabel = await getStatusLabelFromDb(data.status);\n  const targetIsAnalysis = isAnalysisOrderStatusSemantic(data.status, targetStatusLabel);")
block = replace_once(block, '  const shouldCloseSchedule = await isScheduleClosedByOrderStatus({', '  const shouldCloseSchedule = targetIsAnalysis ? false : await isScheduleClosedByOrderStatus({')
block = block.replace('if (targetIsAnalysis && !previousIsAnalysis)', 'if (targetIsAnalysis)')
split = block.index('  // Mudou status:')
first, transition = block[:split], block[split:]
transition = replace_once(transition,
    '        serviceOption: sourceForService.serviceOption ?? null,\n      });',
    '        serviceOption: sourceForService.serviceOption ?? null,\n        forceNewOnReturn: true,\n      });')
first = replace_once(first,
    "        console.error('[AutoSchedule] Falha ao garantir agenda ativa em EM ANÁLISE:', error);",
    "        console.error('[AutoSchedule] Falha ao garantir agenda ativa em EM ANÁLISE:', error);\n        return { success: false, error: 'Status salvo, mas o agendamento obrigatorio nao foi criado. Abra o pedido novamente para tentar a recuperacao.' };")
transition = replace_once(transition,
    "      console.error('[AutoSchedule] Falha ao aplicar regra central de Em Análise:', error);",
    "      console.error('[AutoSchedule] Falha ao aplicar regra central de Em Análise:', error);\n      return { success: false, error: 'Status salvo, mas o agendamento obrigatorio nao foi criado. Abra o pedido novamente para tentar a recuperacao.' };")
text = text[:a] + first + transition + text[b:]
a, b, snapshot = section(text, 'export async function getCurrentSubOrderStatusSnapshot(', 'export async function getLatestOrderStatus(')
snapshot = replace_once(snapshot, '  status: string;\n  customerPhone: string;', '  status: string;\n  id: number;\n  createdAt: Date;\n  orderNumber: number | null;\n  customerPhone: string;')
snapshot = replace_once(snapshot, '    status: latest.status,\n    customerPhone:', '    status: latest.status,\n    id: latest.id,\n    createdAt: latest.createdAt,\n    orderNumber: [...selected].reverse().find(row => row.orderNumber != null)?.orderNumber ?? null,\n    customerPhone:')
text = text[:a] + snapshot + text[b:]
changed[p] = text

# Keep checkout and commercial product editing unchanged; lock only the analysis invariant.
p = 'server/autoSchedule.ts'
text = Path(p).read_text()
a, b, block = section(text, 'export async function ensureActiveAutomaticScheduleForAnalysis(', 'export async function regenerateAutomaticScheduleForOrder(')
wrapper_marker = 'const analysisScheduleInFlight = new Map<string, Promise<AutomaticScheduleResult>>();'
if wrapper_marker not in text:
    block = block.replace('export async function ensureActiveAutomaticScheduleForAnalysis(', 'async function ensureAnalysisScheduleUnlocked(', 1)
    block = replace_once(block, '  forceNewOnReturn?: boolean;', '  forceNewOnReturn?: boolean;\n  notifyCustomer?: boolean;')
    block = replace_once(block, '    notifyCustomer: true,', '    notifyCustomer: input.notifyCustomer !== false,')
    wrapper = '''const analysisScheduleInFlight = new Map<string, Promise<AutomaticScheduleResult>>();

/** Coalesce simultaneous reads from the badge and expanded card for one order. */
export async function ensureActiveAutomaticScheduleForAnalysis(
  input: Parameters<typeof ensureAnalysisScheduleUnlocked>[0],
): Promise<AutomaticScheduleResult> {
  const key = `${input.registrationId}:${input.subOrderIndex ?? 0}`;
  const existing = analysisScheduleInFlight.get(key);
  if (existing) return existing;
  const running = ensureAnalysisScheduleUnlocked(input);
  analysisScheduleInFlight.set(key, running);
  try {
    return await running;
  } finally {
    if (analysisScheduleInFlight.get(key) === running) analysisScheduleInFlight.delete(key);
  }
}

'''
    text = text[:a] + wrapper + block + text[b:]
changed[p] = text

# The admin endpoint repairs only persisted analysis, never browser-supplied status.
p = 'server/routers/schedule.ts'
text = Path(p).read_text()
import_line = "import { reconcileAnalysisScheduleForOrder } from '../analysisScheduleReconcile';\n"
if import_line not in text:
    text = import_line + text
a, b, old = section(text, '  getForOrder: adminProcedure', '  // Cria (ou recria) o link individual de agendamento para um pedido')
new = '''  getForOrder: adminProcedure
    .input(z.object({
      registrationId: z.number().int().positive(),
      subOrderIndex: z.number().int().nonnegative().default(0),
      customerPhone: z.string().optional(),
      orderStatus: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const state = await reconcileAnalysisScheduleForOrder(input.registrationId, input.subOrderIndex);
      let appt = state.appointment;
      // Legacy phone fallback is read-only, and never overrides the analysis cycle.
      if (!appt && input.customerPhone && !state.isAnalysis && !state.closedByOrder) {
        const byPhone = await listAppointmentsByPhone(input.customerPhone);
        appt = byPhone.find(a => a.status === 'confirmed')
          ?? byPhone.find(a => a.status === 'pending') ?? byPhone[0] ?? null;
      }
      if (!appt) return null;
      let templateWhatsappMessage: string | null = null;
      if (appt.templateId) {
        const template = await getScheduleTemplateById(appt.templateId);
        templateWhatsappMessage = template?.whatsappMessage ?? null;
      }
      return {
        ...appt, templateWhatsappMessage,
        orderStatusKey: state.statusKey || null,
        orderStatusLabel: state.statusLabel || null,
      };
    }),

'''
text = text[:a] + new + text[b:]
changed[p] = text

# Expanded card immediately prefers its own recovered schedule over phone fallback.
p = 'client/src/components/OrderScheduleBlock.tsx'
text = Path(p).read_text()
import_line = 'import { isAnalysisOrderStatusSemantic } from "@shared/scheduleOrderLifecycle";\n'
if import_line not in text:
    text = import_line + text
text = replace_once(text,
    '  const apptQuery = trpc.schedule.getForOrder.useQuery(scheduleQueryInput);',
    '  const apptQuery = trpc.schedule.getForOrder.useQuery(scheduleQueryInput, { staleTime: 0, refetchOnWindowFocus: true });')
text = replace_once(text,
    '  const appt = selectEffectiveScheduleAppointment(\n    apptQuery.data as any,\n    (allAppointmentsQuery.data || []) as any[],\n    customerPhone,\n  ) as any;',
    '  const appt = (isAnalysisOrderStatusSemantic(apptQuery.data?.orderStatusKey, apptQuery.data?.orderStatusLabel)\n    ? apptQuery.data\n    : selectEffectiveScheduleAppointment(\n        apptQuery.data as any,\n        (allAppointmentsQuery.data || []) as any[],\n        customerPhone,\n      )) as any;')
changed[p] = text

# The badge must not treat a historical key renamed to EM ANALISE as photo analysis.
p = 'client/src/components/ScheduleStatusBadge.tsx'
text = Path(p).read_text()
text = replace_once(text,
    '  const orderIsInAnalysis = isAnalysisOrderStatusSemantic(status, status);',
    '  const persistedLabel = apptQuery.data?.orderStatusKey === status ? apptQuery.data?.orderStatusLabel : status;\n  const orderIsInAnalysis = isAnalysisOrderStatusSemantic(status, persistedLabel);')
text = replace_once(text, '  const scheduleClosedByOrder = [', '  const scheduleClosedByOrder = !orderIsInAnalysis && [')
text = replace_once(text,
    '  const resolvedAppointment = summaryIsClosed\n    ? exactSummary\n    : registrationIsClosed\n      ? newestRegistrationRow\n      : confirmedRegistrationRow ?? baseResolvedAppointment ?? newestRegistrationRow;',
    '  const recoveredAnalysis = isAnalysisOrderStatusSemantic(apptQuery.data?.orderStatusKey, apptQuery.data?.orderStatusLabel)\n    && ["pending", "confirmed"].includes(String(apptQuery.data?.status)) ? apptQuery.data : null;\n  const resolvedAppointment = recoveredAnalysis ?? (summaryIsClosed\n    ? exactSummary\n    : registrationIsClosed\n      ? newestRegistrationRow\n      : confirmedRegistrationRow ?? baseResolvedAppointment ?? newestRegistrationRow);')
changed[p] = text

# Verify critical entry points byte-for-byte against the deployed baseline.
def baseline(path):
    return subprocess.check_output(['git', 'show', BASE + ':' + path], text=True)

def extract(text, start, end):
    return section(text, start, end)[2]

for start, end in [
    ('export async function ensureAutomaticScheduleForOrder(', 'export async function regenerateScheduleForOrder('),
    ('export async function regenerateScheduleForOrder(', '\nconst analysisScheduleInFlight')]:
    original_end = 'export async function ensureActiveAutomaticScheduleForAnalysis(' if end.startswith('\nconst') else end
    assert extract(changed['server/autoSchedule.ts'], start, end).strip() == extract(baseline('server/autoSchedule.ts'), start, original_end).strip(), 'Checkout/regeneration changed unexpectedly'
assert Path('server/routers.ts').read_text() == baseline('server/routers.ts'), 'Checkout router must remain intact'
assert extract(changed['server/db.ts'], 'export async function createAppointment(', 'export async function markAppointmentEmailSent(') == extract(baseline('server/db.ts'), 'export async function createAppointment(', 'export async function markAppointmentEmailSent('), 'Appointment creation changed unexpectedly'

for path, content in changed.items():
    if Path(path).read_text() != content:
        Path(path).write_text(content)
        print('Patched', path)
print('PASS: checkout, creation, commercial regeneration preserved; integration applied.')
