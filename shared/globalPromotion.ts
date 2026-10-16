import { formatBrazilMoney, parseBrazilMoney } from "./vipPricing";

export const GLOBAL_PROMOTION_KEY = "global_promotion_config_v1";
const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Horário de Brasília (UTC-03); os dias da semana indicam sempre a data de início.
export type GlobalPromotionSchedule =
  | { mode: "period"; startAt: string; endAt: string }
  | { mode: "weekly"; weekdays: number[]; startTime: string; endTime: string; startsOn: string; endsOn: string };

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
  if (raw.mode === "weekly") {
    const days = raw.weekdays;
    return Array.isArray(days) && days.length > 0 && days.length <= 7 &&
      days.every(day => Number.isInteger(day) && day >= 0 && day <= 6) &&
      new Set(days).size === days.length &&
      validTime(raw.startTime) && validTime(raw.endTime) && raw.startTime !== raw.endTime &&
      validDate(raw.startsOn) && validDate(raw.endsOn) && raw.startsOn <= raw.endsOn;
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

  // O fuso é o de Brasília, independente do fuso do servidor ou navegador.
  // Inclui ontem para manter o período 23h-06h depois da meia-noite.
  const localDate = new Date(nowMs - BRAZIL_OFFSET_MS);
  const todayUtc = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate());
  let nearestStart: number | null = null;
  let nearestEnd: number | null = null;
  for (let offset = -1; offset <= 8; offset++) {
    const dateObj = new Date(todayUtc + offset * DAY_MS);
    const day = dateObj.toISOString().slice(0, 10);
    if (day < schedule.startsOn || day > schedule.endsOn || !schedule.weekdays.includes(dateObj.getUTCDay())) continue;
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

type StandardPrice = { price: string | null | undefined; originalPrice?: string | null };

export function calculateGlobalPromotionPrice(
  standard: StandardPrice,
  config: GlobalPromotionConfig | null | undefined,
  nowMs: number = Date.now(),
): { baseCents: number; finalCents: number; savingsCents: number; base: string; final: string; applied: boolean } {
  const listed = Math.max(0, Math.round(parseBrazilMoney(standard.price) * 100));
  const previous = Math.max(0, Math.round(parseBrazilMoney(standard.originalPrice) * 100));
  const baseCents = Math.max(listed, previous);
  const applied = globalPromotionIsActive(config, nowMs) && baseCents > 0;
  const amountCents = applied
    ? config!.type === "percentage"
      ? Math.round(baseCents * config!.value / 100)
      : Math.round(config!.value * 100)
    : 0;
  const finalCents = applied ? Math.max(1, baseCents - amountCents) : listed;
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
  return globalPromotionIsActive(config, nowMs)
    ? calculateGlobalPromotionPrice(standard, config, nowMs).final
    : String(standard.price || "");
}

export function globalPromotionLabel(config: GlobalPromotionConfig | null | undefined, nowMs: number = Date.now()): string {
  if (!globalPromotionIsActive(config, nowMs)) return "";
  return config!.type === "fixed"
    ? formatBrazilMoney(config!.value) + " OFF EM CADA ITEM"
    : config!.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "% OFF EM TODO O SITE";
}
