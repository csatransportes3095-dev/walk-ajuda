type AdminScheduleSearchAppointment = {
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerNumber?: number | string | null;
  registrationId?: number | string | null;
  orderNumber?: number | string | null;
  serviceName?: string | null;
};

/**
 * Busca no ADM -> Agendamentos.
 * *509 representa o numero do cadastro principal (customers.customerNumber),
 * #509 representa o numero do pedido, e 509 aceita ambos.
 * Nao mistura o codigo do cadastro com o ID tecnico do agendamento.
 */
export function filterAdminScheduleAppointments<T extends AdminScheduleSearchAppointment>(
  appointments: readonly T[],
  searchTerm: string,
): T[] {
  const q = searchTerm.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const cadastroQuery = /^\*\d+$/.test(q);
  const pedidoQuery = /^#\d+$/.test(q);
  const numericQuery = /^\d+$/.test(q);

  return appointments.filter((a) => {
    // Agendamentos concluidos ficam na aba Finalizados; cancelados ficam ocultos.
    if (a.status === "completed" || a.status === "cancelled") return false;
    if (!q) return true;

    const name = (a.customerName || "").toLowerCase();
    const phone = (a.customerPhone || "").replace(/\D/g, "");
    const service = (a.serviceName || "").toLowerCase();

    // Somente o cadastro principal tem formato *509. O pedido pode ser #1920001.
    const cadastroMatch = (cadastroQuery || numericQuery)
      && String(a.customerNumber ?? "") === qDigits;
    const pedidoMatch = (pedidoQuery || numericQuery)
      && (String(a.registrationId ?? "") === qDigits || String(a.orderNumber ?? "") === qDigits);

    // Preserva a busca por telefone e por trechos (4+ digitos) ja existente.
    const phoneMatch = !cadastroQuery && !pedidoQuery && phone.length > 0 && (
      qDigits.length >= 8
        ? phone === qDigits || phone.endsWith(qDigits) || qDigits.endsWith(phone)
        : qDigits.length >= 4 && phone.includes(qDigits)
    );

    return cadastroMatch || pedidoMatch || name.includes(q) || phoneMatch || service.includes(q);
  });
}
