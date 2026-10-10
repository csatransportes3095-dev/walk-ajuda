export type LateFeeConfigLike = {
  enabled?: boolean | number | string | null;
  fee_after_18h?: number | string | null;
  fee_after_20h?: number | string | null;
  fee_after_midnight_pct?: number | string | null;
};

export type LateFeeClock = {
  today?: string;
  date?: string;
  hour?: number;
  minute?: number;
};

function asAmount(value: unknown): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function asDate(value: unknown): string {
  return typeof value === "string"
    ? value.slice(0, 10)
    : new Date(value as Date).toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getSaoPauloClock(now = new Date()): { today: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "0";
  return {
    today: `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`,
    hour: Number(valueOf("hour")),
    minute: Number(valueOf("minute")),
  };
}

/**
 * Calcula a taxa aplicável em um instante específico, sem gravar no banco.
 * A fonte temporal é sempre America/Sao_Paulo. O clock recebido pode ser usado
 * para testes/fluxos controlados; campos ausentes são completados com o relógio de SP.
 *
 * Regras do empréstimo diário:
 * - até 18:00: sem taxa;
 * - 18:01 até 20:00: primeira taxa fixa;
 * - 20:01 até 23:58: taxas fixas acumuladas;
 * - a partir de 23:59: maior valor entre a taxa fixa acumulada e o percentual da parcela;
 * - nos dias seguintes, permanece a regra do maior valor.
 */
export function calculateLateFeeForInstallment(input: {
  dueDate: unknown;
  amount: unknown;
  config: LateFeeConfigLike | null | undefined;
  clock?: LateFeeClock;
}): number {
  if (!input.config?.enabled || String(input.config.enabled) === "0") return 0;

  const amount = asAmount(input.amount);
  const dueDate = asDate(input.dueDate);
  const saoPauloNow = getSaoPauloClock();
  const today = String(input.clock?.today || input.clock?.date || saoPauloNow.today).slice(0, 10);
  const hour = input.clock?.hour == null ? saoPauloNow.hour : Number(input.clock.hour);
  const minute = input.clock?.minute == null ? saoPauloNow.minute : Number(input.clock.minute);
  if (!amount || !dueDate || dueDate > today) return 0;

  const feeAfter18 = asAmount(input.config.fee_after_18h);
  const fixedFeeAfter20 = roundMoney(feeAfter18 + asAmount(input.config.fee_after_20h));
  const percentageFee = roundMoney(amount * (asAmount(input.config.fee_after_midnight_pct) / 100));
  const maximumLateFee = Math.max(fixedFeeAfter20, percentageFee);

  if (dueDate < today) return maximumLateFee;

  const minutesSinceMidnight = (hour * 60) + minute;
  const at1801 = (18 * 60) + 1;
  const at2001 = (20 * 60) + 1;
  const at2359 = (23 * 60) + 59;

  if (minutesSinceMidnight >= at2359) return maximumLateFee;
  if (minutesSinceMidnight >= at2001) return fixedFeeAfter20;
  if (minutesSinceMidnight >= at1801) return feeAfter18;
  return 0;
}
