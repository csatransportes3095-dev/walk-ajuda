export type ScheduleAppointmentLike = {
  id: number;
  status: string;
  customerPhone?: string | null;
};

export function normalizeSchedulePhone(phone: string | null | undefined): string {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length > 11 ? digits.slice(-11) : digits;
}

export function isActiveScheduleStatus(status: string | null | undefined): boolean {
  return status === "pending" || status === "confirmed";
}

/**
 * Resolve o agendamento que deve aparecer no pedido.
 *
 * Regras:
 * - um vínculo direto ativo sempre vence;
 * - se o vínculo direto está concluído/cancelado, aceita somente um agendamento
 *   MAIS NOVO do mesmo telefone;
 * - considera somente o registro mais recente do telefone, evitando ressuscitar
 *   confirmação antiga depois de cancelamento/conclusão.
 */
export function selectEffectiveScheduleAppointment<T extends ScheduleAppointmentLike>(
  directAppointment: T | null | undefined,
  allAppointments: readonly T[] | null | undefined,
  customerPhone: string | null | undefined,
): T | null {
  const direct = directAppointment ?? null;
  if (direct && isActiveScheduleStatus(direct.status)) return direct;

  const targetPhone = normalizeSchedulePhone(customerPhone);
  if (targetPhone.length < 8 || !allAppointments?.length) return direct;

  const latestForPhone = allAppointments
    .filter((appointment) => normalizeSchedulePhone(appointment.customerPhone) === targetPhone)
    .reduce<T | null>((latest, appointment) => {
      if (!latest || appointment.id > latest.id) return appointment;
      return latest;
    }, null);

  if (!latestForPhone || !isActiveScheduleStatus(latestForPhone.status)) return direct;
  if (direct && latestForPhone.id <= direct.id) return direct;

  return latestForPhone;
}
