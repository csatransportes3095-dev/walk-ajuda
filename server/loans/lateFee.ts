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

export type DailyLateFeeBreakdownEntry = {
  date: string;
  fee: number;
  stage: "18:01" | "20:01" | "23:59";
  completed: boolean;
};

export type DailyLateFeeDetails = {
  fee: number;
  baseAmount: number;
  dailyMaximumFee: number;
  completedDays: number;
  currentDayFee: number;
  currentDayStage: "none" | "18:01" | "20:01" | "23:59";
  entries: DailyLateFeeBreakdownEntry[];
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

function civilDateToUtcMs(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function civilDayDiff(from: string, to: string): number {
  return Math.floor((civilDateToUtcMs(to) - civilDateToUtcMs(from)) / 86_400_000);
}

function addCivilDays(date: string, days: number): string {
  const next = new Date(civilDateToUtcMs(date) + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}

/**
 * Regra do empréstimo DIÁRIO.
 *
 * Cada dia civil de atraso possui sua própria sequência em America/Sao_Paulo:
 * - até 18:00: sem taxa naquele dia;
 * - 18:01 até 20:00: primeira taxa fixa;
 * - 20:01 até 23:58: taxas fixas acumuladas;
 * - 23:59: fecha o ciclo do dia pelo maior valor entre a taxa fixa acumulada
 *   e o percentual configurado sobre o valor ORIGINAL da parcela.
 *
 * Ao virar o dia, o ciclo fechado do dia anterior permanece acumulado e um novo
 * ciclo diário começa. Ex.: vencimento 27/08 consultado em 31/08 antes de 18:01
 * possui quatro ciclos completos: 27, 28, 29 e 30/08.
 */
export function calculateLateFeeDetailsForInstallment(input: {
  dueDate: unknown;
  amount: unknown;
  config: LateFeeConfigLike | null | undefined;
  clock?: LateFeeClock;
}): DailyLateFeeDetails {
  const amount = asAmount(input.amount);
  const empty: DailyLateFeeDetails = {
    fee: 0,
    baseAmount: amount,
    dailyMaximumFee: 0,
    completedDays: 0,
    currentDayFee: 0,
    currentDayStage: "none",
    entries: [],
  };
  if (!input.config?.enabled || String(input.config.enabled) === "0") return empty;

  const dueDate = asDate(input.dueDate);
  const saoPauloNow = getSaoPauloClock();
  const today = String(input.clock?.today || input.clock?.date || saoPauloNow.today).slice(0, 10);
  const hour = input.clock?.hour == null ? saoPauloNow.hour : Number(input.clock.hour);
  const minute = input.clock?.minute == null ? saoPauloNow.minute : Number(input.clock.minute);
  if (!amount || !dueDate || dueDate > today) return empty;

  const feeAfter18 = asAmount(input.config.fee_after_18h);
  const fixedFeeAfter20 = roundMoney(feeAfter18 + asAmount(input.config.fee_after_20h));
  const percentageFee = roundMoney(amount * (asAmount(input.config.fee_after_midnight_pct) / 100));
  const dailyMaximumFee = Math.max(fixedFeeAfter20, percentageFee);
  const completedDays = Math.max(0, civilDayDiff(dueDate, today));

  const entries: DailyLateFeeBreakdownEntry[] = [];
  for (let index = 0; index < completedDays; index += 1) {
    entries.push({ date: addCivilDays(dueDate, index), fee: dailyMaximumFee, stage: "23:59", completed: true });
  }

  const minutesSinceMidnight = (hour * 60) + minute;
  const at1801 = (18 * 60) + 1;
  const at2001 = (20 * 60) + 1;
  const at2359 = (23 * 60) + 59;
  let currentDayFee = 0;
  let currentDayStage: DailyLateFeeDetails["currentDayStage"] = "none";

  if (minutesSinceMidnight >= at2359) {
    currentDayFee = dailyMaximumFee;
    currentDayStage = "23:59";
  } else if (minutesSinceMidnight >= at2001) {
    currentDayFee = fixedFeeAfter20;
    currentDayStage = "20:01";
  } else if (minutesSinceMidnight >= at1801) {
    currentDayFee = feeAfter18;
    currentDayStage = "18:01";
  }

  if (currentDayFee > 0) {
    entries.push({ date: today, fee: currentDayFee, stage: currentDayStage as "18:01" | "20:01" | "23:59", completed: currentDayStage === "23:59" });
  }

  return {
    fee: roundMoney(completedDays * dailyMaximumFee + currentDayFee),
    baseAmount: amount,
    dailyMaximumFee,
    completedDays,
    currentDayFee,
    currentDayStage,
    entries,
  };
}

export function calculateLateFeeForInstallment(input: {
  dueDate: unknown;
  amount: unknown;
  config: LateFeeConfigLike | null | undefined;
  clock?: LateFeeClock;
}): number {
  return calculateLateFeeDetailsForInstallment(input).fee;
}
