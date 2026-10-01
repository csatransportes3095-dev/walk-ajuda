/** Membership in the default flow is independent of catalogue activation. */
export type ScopedStatus = { key: string; isActive: number; isGlobal?: number | null; sortOrder?: number };
export function isGlobalStatus(status: Pick<ScopedStatus, 'isGlobal'>): boolean {
  return status.isGlobal !== 0;
}
export function globalActiveStatuses<T extends ScopedStatus>(statuses: T[]): T[] {
  return statuses.filter(s => s.isActive === 1 && isGlobalStatus(s));
}
export function unavailableFlowKeys(keys: string[], statuses: ScopedStatus[]): string[] {
  const active = new Set(statuses.filter(s => s.isActive === 1).map(s => s.key));
  return keys.filter(key => !active.has(key));
}
export function orderedFlowKeys(initialKey: string, keys: string[], statuses: ScopedStatus[]): string[] {
  const ordered = Array.from(new Set([initialKey, ...keys]));
  const unavailable = unavailableFlowKeys(ordered, statuses);
  if (unavailable.length) throw new Error(`Etapas ausentes ou inativas: ${unavailable.join(', ')}. Revise antes de salvar; nenhum vinculo foi removido.`);
  return ordered;
}
export function statusChoicesForFlow<T extends ScopedStatus>(statuses: T[], flow: { isDefault: number; statusKeys: string[] } | null): string[] {
  if (flow && flow.isDefault !== 1) {
    const active = new Set(statuses.filter(s => s.isActive === 1).map(s => s.key));
    // An empty custom flow must NEVER fall back to the global choices.
    return flow.statusKeys.filter(key => active.has(key));
  }
  return globalActiveStatuses(statuses).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(s => s.key);
}
