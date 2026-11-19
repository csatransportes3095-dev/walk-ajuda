export const DEFAULT_CUSTOMER_SESSION_HOURS = 24;
export const MIN_CUSTOMER_SESSION_HOURS = 1;
export const MAX_CUSTOMER_SESSION_HOURS = 720;
export const CUSTOMER_SESSION_HOUR_MS = 60 * 60 * 1000;

export type CustomerSessionPolicy = {
  hours: number;
  minHours: typeof MIN_CUSTOMER_SESSION_HOURS;
  maxHours: typeof MAX_CUSTOMER_SESSION_HOURS;
  appliesTo: "new_logins";
};

/** Missing or invalid historical settings preserve the existing 24-hour policy. */
export function parseCustomerSessionHours(value: unknown): number {
  const raw = typeof value === "string" ? value.trim() : value;
  if (typeof raw !== "number" && (typeof raw !== "string" || !/^\d{1,3}$/.test(raw))) {
    return DEFAULT_CUSTOMER_SESSION_HOURS;
  }
  const hours = Number(raw);
  return Number.isInteger(hours) && hours >= MIN_CUSTOMER_SESSION_HOURS && hours <= MAX_CUSTOMER_SESSION_HOURS
    ? hours
    : DEFAULT_CUSTOMER_SESSION_HOURS;
}
