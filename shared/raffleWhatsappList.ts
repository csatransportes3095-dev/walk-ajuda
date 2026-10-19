import { WHATSAPP_ICON } from "./whatsappMessageText";

type RaffleWhatsAppParticipant = {
  number: number;
  customerName: string;
  formattedPhone: string;
  paymentStatus: "paid" | "pending";
};

/**
 * Each participant occupies precisely three mobile-friendly WhatsApp lines.
 * Do not change the stored phone, name or payment status.
 * A blank line is inserted by the caller between adjacent participants.
 */
export function formatRaffleWhatsappParticipant(entry: RaffleWhatsAppParticipant): string {
  const number = String(entry.number).padStart(2, "0");
  const status = entry.paymentStatus === "paid" ? "PAGO" : "AGUARDANDO";
  const statusIcon = entry.paymentStatus === "paid" ? WHATSAPP_ICON.paid : WHATSAPP_ICON.pending;

  return [
    `${WHATSAPP_ICON.ticket} *Nº ${number}* | ${statusIcon} *${status}*`,
    `${WHATSAPP_ICON.user} ${entry.customerName}`,
    `${WHATSAPP_ICON.phone} ${entry.formattedPhone}`,
  ].join("\n");
}

export function joinRaffleWhatsappParticipants(formatted: readonly string[]): string {
  return formatted.length ? formatted.join("\n\n") : "Nenhum número nesta categoria.";
}
