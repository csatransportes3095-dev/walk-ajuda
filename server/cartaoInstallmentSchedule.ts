import { competenceForDate, getCardBillingCycle, type CardBillingConfig } from "./cardsBilling";

function parseIsoDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) throw new Error("Data da compra inválida");
  return { year, month, day };
}

function clampDay(year: number, monthIndex: number, day: number) {
  return Math.min(day, new Date(year, monthIndex + 1, 0).getDate());
}

function addMonthsClamped(value: string, offset: number) {
  const { year, month, day } = parseIsoDate(value);
  const base = new Date(year, month - 1 + offset, 1, 12, 0, 0);
  const safeDay = clampDay(base.getFullYear(), base.getMonth(), day);
  return new Date(base.getFullYear(), base.getMonth(), safeDay, 12, 0, 0);
}

export function saoPauloDateOnly(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export type InstallmentScheduleItem = {
  numeroParcela: number;
  compraReferencia: string;
  competencia: string;
  fechamento: string;
  vencimento: string;
  historicaPaga: boolean;
};

export function buildInstallmentSchedule(
  purchaseDate: string,
  installments: number,
  card: CardBillingConfig,
  today = saoPauloDateOnly(),
): InstallmentScheduleItem[] {
  const result: InstallmentScheduleItem[] = [];
  for (let offset = 0; offset < installments; offset++) {
    const purchaseReference = addMonthsClamped(purchaseDate, offset);
    const competence = competenceForDate(purchaseReference, card.fechamentoDia);
    const cycle = getCardBillingCycle(card, competence);
    result.push({
      numeroParcela: offset + 1,
      compraReferencia: purchaseReference.toISOString().slice(0, 10),
      competencia: competence,
      fechamento: cycle.closingDate,
      vencimento: cycle.dueDate,
      // Somente vencimento que já passou vira histórico pago.
      // Vence hoje, fatura atual e futuras continuam abertas.
      historicaPaga: cycle.dueDate < today,
    });
  }
  return result;
}
