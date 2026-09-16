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
 * - um vínculo direto confirmado sempre vence;
 * - um vínculo direto pendente continua valendo, exceto quando existe uma
 *   confirmação MAIS NOVA do mesmo telefone (caso de recadastro/pedido antigo);
 * - se o vínculo direto está concluído/cancelado, aceita somente um agendamento
 *   ativo MAIS NOVO do mesmo telefone;
 * - considera somente o registro mais recente do telefone, evitando ressuscitar
 *   confirmação antiga depois de cancelamento/conclusão.
 */
export function selectEffectiveScheduleAppointment<T extends ScheduleAppointmentLike>(
  directAppointment: T | null | undefined,
  allAppointments: readonly T[] | null | undefined,
  customerPhone: string | null | undefined,
): T | null {
  const direct = directAppointment ?? null;

  const targetPhone = normalizeSchedulePhone(customerPhone);
  const latestForPhone = targetPhone.length >= 8 && allAppointments?.length
    ? allAppointments
        .filter((appointment) => normalizeSchedulePhone(appointment.customerPhone) === targetPhone)
        .reduce<T | null>((latest, appointment) => {
          if (!latest || appointment.id > latest.id) return appointment;
          return latest;
        }, null)
    : null;

  // Se o pedido já está confirmado diretamente, não deixa um link novo/pending
  // de outro cadastro do mesmo telefone sobrescrever essa confirmação.
  if (direct?.status === "confirmed") return direct;

  // Correção do caso observado no ADM: o card pode ter um vínculo pendente
  // antigo, enquanto o cliente confirmou um agendamento mais novo que ficou
  // associado a outro registrationId do mesmo telefone. Nesse caso a
  // confirmação mais nova precisa aparecer imediatamente no pedido atual.
  if (direct?.status === "pending") {
    if (
      latestForPhone?.status === "confirmed" &&
      latestForPhone.id > direct.id
    ) {
      return latestForPhone;
    }
    return direct;
  }

  if (!latestForPhone || !isActiveScheduleStatus(latestForPhone.status)) return direct;
  if (direct && latestForPhone.id <= direct.id) return direct;

  return latestForPhone;
}
