export const DEFAULT_CUSTOMER_SESSION_HOURS = 720;
export const MIN_CUSTOMER_SESSION_HOURS = 1;
export const MAX_CUSTOMER_SESSION_HOURS = 2160;
export const CUSTOMER_SESSION_HOUR_MS = 60 * 60 * 1000;

export type CustomerSessionPolicy = {
  hours: number;
  minHours: typeof MIN_CUSTOMER_SESSION_HOURS;
  maxHours: typeof MAX_CUSTOMER_SESSION_HOURS;
  appliesTo: "new_logins";
};

/** New installations default to 30 days; malformed stored values fail safe at 24 hours. */
export function parseCustomerSessionHours(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_CUSTOMER_SESSION_HOURS;
  const raw = typeof value === "string" ? value.trim() : value;
  if (typeof raw !== "number" && (typeof raw !== "string" || !/^[1-9]\d{0,3}$/.test(raw))) {
    return 24;
  }
  const hours = Number(raw);
  return Number.isInteger(hours) && hours >= MIN_CUSTOMER_SESSION_HOURS && hours <= MAX_CUSTOMER_SESSION_HOURS
    ? hours
    : 24;
}
