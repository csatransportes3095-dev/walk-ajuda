import { trpc } from "@/lib/trpc";
import { CalendarCheck, CalendarClock } from "lucide-react";

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
 * - CONFIRMADO: cliente escolheu dia e hora (verde)
 * - AGUARDANDO: link criado, cliente notificado mas ainda não agendou (amarelo)
 * - SEM AGENDAMENTO: não exibe aviso; o card fica somente com o status real do pedido.
 */
export default function ScheduleStatusBadge({ registrationId, subOrderIndex, customerPhone, orderStatus }: Props) {
  const utils = trpc.useUtils();
  const apptQuery = trpc.schedule.getForOrder.useQuery(
    { registrationId, subOrderIndex, customerPhone: customerPhone ?? undefined },
    { refetchInterval: 30000, staleTime: 10000 }
  );
  const dismissMut = trpc.schedule.dismissConfirmedAlert.useMutation({
    onSuccess: () => {
      utils.schedule.getForOrder.invalidate({ registrationId, subOrderIndex, customerPhone: customerPhone ?? undefined });
    },
  });

  const appt = apptQuery.data;
  const showConfirmedAlert = appt && appt.status === "confirmed" && appt.slotDate && !appt.adminSeenConfirmedAt;

  // Não desenha placeholder grande: se não houver agendamento, o pedido deve ficar limpo.
  if (apptQuery.isLoading) return null;

  // Quando o agendamento ou o pedido já foi concluído, o card mostra somente o status atual do pedido.
  const finalOrder = ['entregue', 'pedido_entregue', 'cancelado'].includes(String(orderStatus || ''));
  if (appt?.status === "completed" || finalOrder) return null;

  // CONFIRMADO — cliente escolheu dia e hora
  if (appt && appt.status === "confirmed" && appt.slotDate) {
    return (
      <div className="w-full space-y-2">
        <div className="w-full rounded-2xl border-2 border-green-500/60 bg-green-500/12 px-5 py-4 shadow-[0_0_14px_rgba(34,197,94,0.25)]">
          <div className="flex items-center gap-2 mb-1.5">
            <CalendarCheck className="w-[18px] h-[18px] text-green-400 shrink-0" />
            <span className="text-xs font-extrabold tracking-[0.12em] text-green-400 uppercase">Confirmado</span>
          </div>
          <p className="text-xl font-extrabold leading-tight text-green-300">
            {formatDate(appt.slotDate)}
            {appt.slotTime && <span className="text-green-200/90"> às {appt.slotTime}</span>}
          </p>
          <p className="text-sm text-green-300/70 leading-tight mt-1">Agendamento confirmado pelo cliente</p>
        </div>
        {showConfirmedAlert && (
          <div className="w-full rounded-xl border-2 border-emerald-400/70 bg-emerald-500/15 px-4 py-3 flex items-center justify-between gap-3 shadow-[0_0_18px_rgba(52,211,153,0.35)] animate-pulse">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg leading-none shrink-0">📅</span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-emerald-300 uppercase tracking-wide leading-tight">Cliente confirmou agendamento!</p>
                <p className="text-[11px] text-emerald-300/70 leading-tight mt-0.5 truncate">
                  {formatDate(appt.slotDate)}{appt.slotTime ? ` às ${appt.slotTime}` : ""}
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

  // AGUARDANDO — link criado/notificado, mas cliente ainda não escolheu
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
          <span className="text-xs font-extrabold tracking-[0.12em] text-yellow-400 uppercase">Aguardando</span>
        </div>
        <p className="text-xl font-extrabold leading-tight text-yellow-300">Aguardando agendamento</p>
        <p className="text-sm text-yellow-300/70 leading-tight mt-1">Cliente notificado, ainda não escolheu</p>
        {notifiedAt && (
          <p className="text-xs text-yellow-400/60 leading-tight mt-2 flex items-center gap-1">
            <span>📨</span>
            <span>Link enviado em: <strong className="text-yellow-400/80">{notifiedAt}</strong></span>
          </p>
        )}
      </div>
    );
  }

  // Sem agendamento: não há nada para avisar no card.
  return null;
}
