/**
 * Commission eligibility always follows the CURRENT appointment for the indicated
 * person's first order, never a historical confirmation after a cancellation.
 * Payment stays an explicit ADM action; this function does not mark anything paid.
 */
export type ReferralCommissionState = "aguardando_agendamento" | "liberada" | "paga" | "nao_elegivel";

export type ReferralCommissionInput = {
  frozenStatus?: string | null;
  paid?: boolean | number | null;
  invalid?: boolean | number | null;
  appointmentStatus?: string | null;
  appointmentConfirmedAt?: string | Date | null;
  latestOrderStatus?: string | null;
  latestOrderStatusLabel?: string | null;
};

function normalizeLabel(value: unknown): string {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

export function commissionAppointmentConfirmed(input: Pick<ReferralCommissionInput,
  "appointmentStatus" | "appointmentConfirmedAt" | "latestOrderStatus" | "latestOrderStatusLabel">): boolean {
  const appointment = String(input.appointmentStatus || "").toLowerCase();
  // A more recent pending/cancelled appointment overrides previous history.
  if (appointment) {
    return appointment === "confirmed"
      || (appointment === "completed" && Boolean(input.appointmentConfirmedAt));
  }
  // Some legacy confirmed appointments exist only as a status history entry.
  const status = normalizeLabel(input.latestOrderStatus);
  const label = normalizeLabel(input.latestOrderStatusLabel);
  return [status, label].some(v => /\bagendamento\b.*\bconfirmad[oa]\b/.test(v));
}

export function resolveReferralCommissionState(input: ReferralCommissionInput): {
  state: ReferralCommissionState;
  paymentReady: boolean;
  label: string;
} {
  const frozen = String(input.frozenStatus || "").toLowerCase();
  if (input.invalid || frozen === "nao_elegivel" || frozen === "cancelada") {
    return {state: "nao_elegivel", paymentReady: false, label: "⛔ Indicação não válida"};
  }
  if (input.paid || frozen === "paga") {
    return {state: "paga", paymentReady: false, label: "✅ Comissão paga"};
  }
  if (commissionAppointmentConfirmed(input)) {
    return {state: "liberada", paymentReady: true, label: "✅ Liberada para pagamento"};
  }
  return {state: "aguardando_agendamento", paymentReady: false, label: "⏳ Aguardando agendamento confirmado"};
}
