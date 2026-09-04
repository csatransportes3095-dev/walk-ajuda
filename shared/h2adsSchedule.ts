export type H2AdsScheduleFilter = "all" | "confirmed" | "pending";

export type H2AdsOrderLinkLike = {
  instanceId: number;
  registrationId: number;
  subOrderIndex: number;
};

export type H2AdsAppointmentLike = {
  id: number;
  registrationId: number;
  subOrderIndex?: number | null;
  status: string;
  slotDate?: string | null;
  slotTime?: string | null;
};

export const h2AdsScheduleOrderKey = (registrationId: number, subOrderIndex?: number | null) =>
  `${registrationId}:${subOrderIndex ?? 0}`;

export function buildH2AdsAppointmentByInstance(
  links: H2AdsOrderLinkLike[],
  appointments: H2AdsAppointmentLike[],
): Map<number, H2AdsAppointmentLike> {
  const latestByOrder = new Map<string, H2AdsAppointmentLike>();

  for (const appointment of appointments) {
    if (appointment.status !== "confirmed" && appointment.status !== "pending") continue;
    const key = h2AdsScheduleOrderKey(appointment.registrationId, appointment.subOrderIndex);
    const current = latestByOrder.get(key);
    if (!current || Number(appointment.id) > Number(current.id)) latestByOrder.set(key, appointment);
  }

  const byInstance = new Map<number, H2AdsAppointmentLike>();
  for (const link of links) {
    const appointment = latestByOrder.get(h2AdsScheduleOrderKey(link.registrationId, link.subOrderIndex));
    if (appointment) byInstance.set(link.instanceId, appointment);
  }
  return byInstance;
}

export function matchesH2AdsScheduleFilter(
  appointment: H2AdsAppointmentLike | undefined,
  filter: H2AdsScheduleFilter,
): boolean {
  if (filter === "all") return true;
  return appointment?.status === filter;
}

export function h2AdsAppointmentSortValue(appointment: H2AdsAppointmentLike | undefined): string {
  if (!appointment || appointment.status !== "confirmed" || !appointment.slotDate || !appointment.slotTime) {
    return "9999-12-31T23:59";
  }
  return `${appointment.slotDate}T${appointment.slotTime.slice(0, 5)}`;
}

export function formatH2AdsAppointmentDate(value?: string | null): string {
  if (!value) return "Data não informada";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function formatH2AdsAppointmentTime(value?: string | null): string {
  if (!value) return "Horário não informado";
  return value.slice(0, 5);
}
