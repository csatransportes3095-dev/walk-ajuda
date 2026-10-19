export type TrackingScheduleEntry = {
  id: number;
  registrationId?: number | null;
  subOrderIndex?: number | null;
  token: string;
  status: string;
  serviceName?: string | null;
  slotDate?: string | Date | null;
  slotTime?: string | null;
};

/** Presentation only. Never create, confirm or reopen appointments here. */
export function selectTrackingSchedule<T extends TrackingScheduleEntry>(
  appointments: readonly T[] | null | undefined,
  registrationId: number,
): T | null {
  if (!Number.isInteger(registrationId) || registrationId <= 0) return null;
  const latestBySubOrder = new Map<number, T>();
  for (const entry of appointments ?? []) {
    // No fallback by phone/service: it could send the customer to a different order.
    if (entry.registrationId !== registrationId || !Number.isInteger(entry.id) || entry.id <= 0) continue;
    const subOrder = entry.subOrderIndex ?? 0;
    const previous = latestBySubOrder.get(subOrder);
    if (!previous || entry.id > previous.id) latestBySubOrder.set(subOrder, entry);
  }
  return [...latestBySubOrder.values()]
    .filter(entry => (entry.status === 'pending' || entry.status === 'confirmed') && /^[-_A-Za-z0-9]{32,64}$/.test(entry.token))
    .sort((a, b) => b.id - a.id)[0] ?? null;
}

/** slotDate is a calendar day, not an instant: never shift YYYY-MM-DD to yesterday. */
export function formatTrackingScheduleDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const raw = value instanceof Date
    ? (Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '')
    : String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match;
  const check = new Date(`${year}-${month}-${day}T12:00:00Z`);
  if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null;
  return `${day}/${month}/${year}`;
}

export function formatTrackingScheduleTime(value: string | null | undefined): string | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? '').trim());
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${match[1]}:${match[2]}` : null;
}
