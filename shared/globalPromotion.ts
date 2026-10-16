import { formatBrazilMoney, parseBrazilMoney } from "./vipPricing";

export const GLOBAL_PROMOTION_KEY = "global_promotion_config_v1";
const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Horário de Brasília (UTC-03); os dias da semana indicam sempre a data de início.
export type GlobalPromotionWeeklyWindow = {
  startDay: number; startTime: string; endDay: number; endTime: string;
  // Data civil de Brasília em que esta faixa começa a valer pela primeira vez.
  // Agendas antigas não têm esta propriedade e continuam recorrentes como antes.
  firstStartDate?: string;
};

export type GlobalPromotionSchedule =
  | { mode: "period"; startAt: string; endAt: string }
  | { mode: "weekly"; weekdays: number[]; startTime: string; endTime: string; startsOn?: string; endsOn?: string }
  | { mode: "weekly_windows"; windows: GlobalPromotionWeeklyWindow[] };

const WEEK_MS = 7 * DAY_MS;
const WEEK_MINUTES = 7 * 24 * 60;
const minutes = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function weeklyWindowRange(window: GlobalPromotionWeeklyWindow): { start: number; end: number } {
  const start = window.startDay * 1440 + minutes(window.startTime);
  let end = window.endDay * 1440 + minutes(window.endTime);
  if (end < start) end += WEEK_MINUTES;
  return { start, end };
}

export function brazilDateFromMs(timestampMs: number): string {
  return new Date(timestampMs - BRAZIL_OFFSET_MS).toISOString().slice(0, 10);
}

export function brazilDayFromDate(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

export function weeklyWindowOccurrence(
  window: GlobalPromotionWeeklyWindow,
  nowMs: number = Date.now(),
): { startAt: number; endsAt: number; active: boolean } {
  const interval = weeklyWindowRange(window);
  const durationMs = (interval.end - interval.start) * 60_000;
  // firstStartDate ancora a primeira execução e impede ativação antes dela.
  const anchorStart = window.firstStartDate
    ? Date.parse(window.firstStartDate + "T" + window.startTime + ":00-03:00")
    : (() => {
        const brazil = new Date(nowMs - BRAZIL_OFFSET_MS);
        const todayUtc = Date.UTC(brazil.getUTCFullYear(), brazil.getUTCMonth(), brazil.getUTCDate());
        const sundayUtc = todayUtc - brazil.getUTCDay() * DAY_MS;
        return sundayUtc + BRAZIL_OFFSET_MS + interval.start * 60_000;
      })();
  const weekIndex = Math.max(window.firstStartDate ? 0 : -1, Math.floor((nowMs - anchorStart) / WEEK_MS));
  const currentStart = anchorStart + weekIndex * WEEK_MS;
  if (nowMs >= currentStart && nowMs < currentStart + durationMs) {
    return { startAt: currentStart, endsAt: currentStart + durationMs, active: true };
  }
  const nextStart = nowMs < currentStart ? currentStart : currentStart + WEEK_MS;
  return { startAt: nextStart, endsAt: nextStart + durationMs, active: false };
}

export function weeklyWindowsOverlap(windows: GlobalPromotionWeeklyWindow[]): boolean {
  for (let i = 0; i < windows.length; i++) {
    const first = weeklyWindowRange(windows[i]);
    for (let j = i + 1; j < windows.length; j++) {
      const second = weeklyWindowRange(windows[j]);
      for (const shift of [-WEEK_MINUTES, 0, WEEK_MINUTES]) {
        if (Math.max(first.start, second.start + shift) < Math.min(first.end, second.end + shift)) return true;
      }
    }
  }
  return false;
}

export type GlobalPromotionConfig = {
  active: boolean;
  type: "percentage" | "fixed";
  value: number;
  revision: string;
  updatedAt: string | null;
  schedule?: GlobalPromotionSchedule | null;
};

export const DEFAULT_GLOBAL_PROMOTION: GlobalPromotionConfig = {
  active: false,
  type: "percentage",
  value: 10,
  revision: "not-configured",
  updatedAt: null,
  schedule: null,
};

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 2000 || year > 2100) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function brazilTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T([0-2]\d:[0-5]\d):00-03:00$/);
  if (!match || !validDate(match[1]) || !validTime(match[2])) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateTimeInBrazil(date: string, time: string): number {
  return Date.parse(date + "T" + time + ":00-03:00");
}

export function isValidGlobalPromotionSchedule(value: unknown): value is GlobalPromotionSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  if (raw.mode === "period") {
    const from = brazilTimestamp(raw.startAt);
    const to = brazilTimestamp(raw.endAt);
    return from !== null && to !== null && from < to;
  }
  if (raw.mode === "weekly_windows") {
    const windows = raw.windows;
    if (!Array.isArray(windows) || windows.length < 1 || windows.length > 28) return false;
    const valid = windows.every(window => {
      if (!window || typeof window !== "object" || Array.isArray(window)) return false;
      const row = window as Record<string, unknown>;
      if (!Number.isInteger(row.startDay) || (row.startDay as number) < 0 || (row.startDay as number) > 6 ||
          !Number.isInteger(row.endDay) || (row.endDay as number) < 0 || (row.endDay as number) > 6 ||
          !validTime(row.startTime) || !validTime(row.endTime)) return false;
      const typedRow = row as unknown as GlobalPromotionWeeklyWindow;
      const interval = weeklyWindowRange(typedRow);
      return interval.end > interval.start && interval.end - interval.start < WEEK_MINUTES &&
        (row.firstStartDate === undefined || (validDate(row.firstStartDate) && brazilDayFromDate(row.firstStartDate) === row.startDay));
    });
    return valid && !weeklyWindowsOverlap(windows as GlobalPromotionWeeklyWindow[]);
  }
  if (raw.mode === "weekly") {
    const days = raw.weekdays;
    return Array.isArray(days) && days.length > 0 && days.length <= 7 &&
      days.every(day => Number.isInteger(day) && day >= 0 && day <= 6) &&
      new Set(days).size === days.length &&
      validTime(raw.startTime) && validTime(raw.endTime) && raw.startTime !== raw.endTime &&
      (raw.startsOn === undefined || validDate(raw.startsOn)) &&
      (raw.endsOn === undefined || validDate(raw.endsOn)) &&
      (raw.startsOn === undefined || raw.endsOn === undefined || (raw.startsOn as string) <= (raw.endsOn as string));
  }
  return false;
}

export function parseGlobalPromotionConfig(value: string | null | undefined): GlobalPromotionConfig {
  if (!value) return { ...DEFAULT_GLOBAL_PROMOTION };
  try {
    const raw = JSON.parse(value) as Partial<GlobalPromotionConfig>;
    const type = raw?.type === "fixed" ? "fixed" : "percentage";
    const amount = Number(raw?.value);
    const valid = Number.isFinite(amount) && amount > 0 && amount <= (type === "percentage" ? 100 : 100000);
    const scheduleSupplied = raw?.schedule !== null && raw?.schedule !== undefined;
    const scheduleValid = !scheduleSupplied || isValidGlobalPromotionSchedule(raw?.schedule);
    return {
      // Falha segura: uma programação inválida nunca libera promoção sem prazo.
      active: raw?.active === true && valid && scheduleValid,
      type,
      value: valid ? amount : DEFAULT_GLOBAL_PROMOTION.value,
      revision: typeof raw?.revision === "string" && raw.revision ? raw.revision : "unversioned",
      updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : null,
      schedule: scheduleValid && scheduleSupplied ? raw.schedule : null,
    };
  } catch {
    return { ...DEFAULT_GLOBAL_PROMOTION };
  }
}

export type GlobalPromotionWindow = {
  active: boolean;
  status: "disabled" | "active" | "scheduled" | "expired" | "invalid";
  startsAt: number | null;
  endsAt: number | null;
};

const disabledWindow = (status: GlobalPromotionWindow["status"]): GlobalPromotionWindow =>
  ({ active: false, status, startsAt: null, endsAt: null });

export function globalPromotionWindow(config: GlobalPromotionConfig | null | undefined, nowMs: number = Date.now()): GlobalPromotionWindow {
  if (!config?.active || !Number.isFinite(config.value) || config.value <= 0 ||
      config.value > (config.type === "percentage" ? 100 : 100000)) return disabledWindow("disabled");

  const schedule = config.schedule;
  if (!schedule) return { active: true, status: "active", startsAt: null, endsAt: null };
  if (!isValidGlobalPromotionSchedule(schedule)) return disabledWindow("invalid");

  if (schedule.mode === "period") {
    const start = brazilTimestamp(schedule.startAt)!;
    const end = brazilTimestamp(schedule.endAt)!;
    if (nowMs < start) return { active: false, status: "scheduled", startsAt: start, endsAt: end };
    if (nowMs < end) return { active: true, status: "active", startsAt: start, endsAt: end };
    return disabledWindow("expired");
  }

  if (schedule.mode === "weekly_windows") {
    let nextStart: number | null = null;
    let nextEnd: number | null = null;
    for (const window of schedule.windows) {
      const execution = weeklyWindowOccurrence(window, nowMs);
      if (execution.active) {
        return { active: true, status: "active", startsAt: execution.startAt, endsAt: execution.endsAt };
      }
      if (nextStart === null || execution.startAt < nextStart) {
        nextStart = execution.startAt;
        nextEnd = execution.endsAt;
      }
    }
    return nextStart !== null
      ? { active: false, status: "scheduled", startsAt: nextStart, endsAt: nextEnd }
      : disabledWindow("invalid");
  }

  // Compatibilidade de agendas semanais antigas: não mudar o que já foi salvo.
  const localDate = new Date(nowMs - BRAZIL_OFFSET_MS);
  const todayUtc = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate());
  let nearestStart: number | null = null;
  let nearestEnd: number | null = null;
  for (let offset = -1; offset <= 8; offset++) {
    const dateObj = new Date(todayUtc + offset * DAY_MS);
    const day = dateObj.toISOString().slice(0, 10);
    if ((schedule.startsOn && day < schedule.startsOn) || (schedule.endsOn && day > schedule.endsOn) || !schedule.weekdays.includes(dateObj.getUTCDay())) continue;
    const start = dateTimeInBrazil(day, schedule.startTime);
    let end = dateTimeInBrazil(day, schedule.endTime);
    if (end < start) end += DAY_MS;
    if (nowMs >= start && nowMs < end) {
      return { active: true, status: "active", startsAt: start, endsAt: end };
    }
    if (start > nowMs && (nearestStart === null || start < nearestStart)) {
      nearestStart = start;
      nearestEnd = end;
    }
  }
  if (nearestStart !== null) return { active: false, status: "scheduled", startsAt: nearestStart, endsAt: nearestEnd };
  return disabledWindow("expired");
}

export function globalPromotionIsActive(config: GlobalPromotionConfig | null | undefined, nowMs: number = Date.now()): boolean {
  return globalPromotionWindow(config, nowMs).active;
}

// Enquanto uma programação está agendada ou em andamento, ela prevalece
// sobre promoções individuais, VIP e cupons. Ao expirar/cancelar, libera novamente.
export function globalPromotionOverridesIndividual(config: GlobalPromotionConfig | null | undefined, nowMs: number = Date.now()): boolean {
  const status = globalPromotionWindow(config, nowMs).status;
  return status === "active" || status === "scheduled";
}

type StandardPrice = { price: string | null | undefined; originalPrice?: string | null };

export function calculateGlobalPromotionPrice(
  standard: StandardPrice,
  config: GlobalPromotionConfig | null | undefined,
  nowMs: number = Date.now(),
): { baseCents: number; finalCents: number; savingsCents: number; base: string; final: string; applied: boolean } {
  const listed = Math.max(0, Math.round(parseBrazilMoney(standard.price) * 100));
  const previous = Math.max(0, Math.round(parseBrazilMoney(standard.originalPrice) * 100));
  const baseCents = Math.max(listed, previous);
  const window = globalPromotionWindow(config, nowMs);
  const applied = window.active && baseCents > 0;
  const reserved = window.status === "scheduled";
  const amountCents = applied
    ? config!.type === "percentage"
      ? Math.round(baseCents * config!.value / 100)
      : Math.round(config!.value * 100)
    : 0;
  // Fora do horário da regra geral, não aplicar descontos individuais antigos.
  const finalCents = applied ? Math.max(1, baseCents - amountCents) : reserved ? baseCents : listed;
  return {
    baseCents,
    finalCents,
    savingsCents: Math.max(0, baseCents - finalCents),
    base: formatBrazilMoney(baseCents / 100),
    final: formatBrazilMoney(finalCents / 100),
    applied: Boolean(applied),
  };
}

export function globalPromotionPrice(
  standard: StandardPrice,
  config: GlobalPromotionConfig | null | undefined,
  nowMs: number = Date.now(),
): string {
  return globalPromotionOverridesIndividual(config, nowMs)
    ? calculateGlobalPromotionPrice(standard, config, nowMs).final
    : String(standard.price || "");
}

export function globalPromotionLabel(config: GlobalPromotionConfig | null | undefined, nowMs: number = Date.now()): string {
  if (!globalPromotionIsActive(config, nowMs)) return "";
  return config!.type === "fixed"
    ? formatBrazilMoney(config!.value) + " OFF EM CADA ITEM"
    : config!.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "% OFF EM TODO O SITE";
}
