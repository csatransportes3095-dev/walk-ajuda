import { trpc } from "@/lib/trpc";
import { CalendarCheck, CalendarClock } from "lucide-react";
import { selectEffectiveScheduleAppointment } from "@shared/scheduleAppointmentResolution";

interface Props {
  registrationId: number;
  subOrderIndex: number;
  customerPhone?: string | null;
  orderStatus?: string | null;
}

function formatDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Selo grande e destacado que mostra o estado de um agendamento existente.
 * Usa a chave do pedido e, quando necessário, o telefone para recuperar
 * agendamentos vinculados a um cadastro anterior do mesmo cliente.
 */
export default function ScheduleStatusBadge({ registrationId, subOrderIndex, customerPhone, orderStatus }: Props) {
  const utils = trpc.useUtils();
  const scheduleQueryInput = { registrationId, subOrderIndex, customerPhone: customerPhone ?? undefined };
  const apptQuery = trpc.schedule.getForOrder.useQuery(
    scheduleQueryInput,
    { refetchInterval: 30000, staleTime: 10000 }
  );
  const allAppointmentsQuery = trpc.schedule.listAppointments.useQuery(undefined, {
    refetchInterval: 30000,
    staleTime: 10000,
  });
  const dismissMut = trpc.schedule.dismissConfirmedAlert.useMutation({
    onSuccess: () => {
      utils.schedule.getForOrder.invalidate(scheduleQueryInput);
      utils.schedule.listAppointments.invalidate();
    },
  });

  const appt = selectEffectiveScheduleAppointment(
    apptQuery.data as any,
    (allAppointmentsQuery.data || []) as any[],
    customerPhone,
  ) as any;
  const showConfirmedAlert = appt && appt.status === "confirmed" && appt.slotDate && !appt.adminSeenConfirmedAt;

  // Não mostra estado falso enquanto qualquer uma das duas fontes ainda carrega.
  if (apptQuery.isLoading || allAppointmentsQuery.isLoading) return null;

  const finalOrder = ['entregue', 'pedido_entregue', 'cancelado'].includes(String(orderStatus || ''));
  if (appt?.status === "completed" || finalOrder) return null;

  if (appt && appt.status === "confirmed") {
    return (
      <div className="w-full space-y-2">
        <div className="w-full rounded-2xl border-2 border-green-500/60 bg-green-500/12 px-5 py-4 shadow-[0_0_14px_rgba(34,197,94,0.25)]">
          <div className="flex items-center gap-2 mb-1.5">
            <CalendarCheck className="w-[18px] h-[18px] text-green-400 shrink-0" />
            <span className="text-xs font-extrabold tracking-[0.12em] text-green-400 uppercase">Agendamento confirmado</span>
          </div>
          <p className="text-xl font-extrabold leading-tight text-green-300">
            {appt.slotDate ? formatDate(appt.slotDate) : "Data não informada"}
            {appt.slotTime && <span className="text-green-200/90"> às {appt.slotTime}</span>}
          </p>
          <p className="text-sm text-green-300/70 leading-tight mt-1">
            {appt.slotDate || appt.slotTime
              ? "Data e horário confirmados pelo cliente"
              : "Agendamento confirmado — confira os dados no painel de agendamentos"}
          </p>
        </div>
        {showConfirmedAlert && (
          <div className="w-full rounded-xl border-2 border-emerald-400/70 bg-emerald-500/15 px-4 py-3 flex items-center justify-between gap-3 shadow-[0_0_18px_rgba(52,211,153,0.35)] animate-pulse">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg leading-none shrink-0">📅</span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-emerald-300 uppercase tracking-wide leading-tight">Cliente confirmou agendamento!</p>
                <p className="text-[11px] text-emerald-300/70 leading-tight mt-0.5 truncate">
                  {appt.slotDate ? formatDate(appt.slotDate) : "Data não informada"}{appt.slotTime ? ` às ${appt.slotTime}` : ""}
                </p>
              </div>
            </div>
            <button
              onClick={e => {
                e.stopPropagation();
                if (appt.id) dismissMut.mutate({ id: appt.id });
              }}
              disabled={dismissMut.isPending}
              className="shrink-0 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[10px] font-bold px-3 py-1.5 rounded-full transition-all whitespace-nowrap"
            >
              ✓ Finalizar
            </button>
          </div>
        )}
      </div>
    );
  }

  if (appt && appt.status === "pending") {
    const notifiedAt = appt.createdAt
      ? new Date(appt.createdAt).toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit"
        })
      : null;
    return (
      <div className="w-full rounded-2xl border-2 border-yellow-500/60 bg-yellow-500/[0.08] px-5 py-4 shadow-[0_0_14px_rgba(234,179,8,0.2)]">
        <div className="flex items-center gap-2 mb-1.5">
          <CalendarClock className="w-[18px] h-[18px] text-yellow-400 shrink-0" />
          <span className="text-xs font-extrabold tracking-[0.12em] text-yellow-400 uppercase">Aguardando agendamento</span>
        </div>
        <p className="text-xl font-extrabold leading-tight text-yellow-300">Aguardando cliente escolher</p>
        <p className="text-sm text-yellow-300/70 leading-tight mt-1">Link ativo — ainda sem data e horário confirmados</p>
        {notifiedAt && (
          <p className="text-xs text-yellow-400/60 leading-tight mt-2 flex items-center gap-1">
            <span>📨</span>
            <span>Link criado em: <strong className="text-yellow-400/80">{notifiedAt}</strong></span>
          </p>
        )}
      </div>
    );
  }

  // Sem agendamento: não polui o card com um aviso que não exige ação.
  return null;
}
