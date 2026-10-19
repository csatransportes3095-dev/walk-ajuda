import { siteBulkEmail, validSiteBulkEmail } from './siteSecurityBulk';

export type FilteredSiteAccessEntry = {
  id: number;
  email: string;
  status: string;
  expiresAt?: Date | string | null;
};
export type FilteredSiteAccessAction = {
  id: number;
  status: 'active' | 'suspended';
  label: 'Suspender' | 'Reativar';
  badge: string;
};

/** Customer ids and authorization ids are different. Match only an exact normalized email. */
export function indexFilteredSiteAccess<T extends FilteredSiteAccessEntry>(entries: readonly T[]): ReadonlyMap<string, T | null> {
  const index = new Map<string, T | null>();
  for (const entry of entries) {
    const email = siteBulkEmail(entry.email);
    if (!validSiteBulkEmail(email)) continue;
    // Ambiguous or malformed records must not expose a status-changing action.
    if (index.has(email) || !Number.isSafeInteger(entry.id) || entry.id <= 0) index.set(email, null);
    else index.set(email, entry);
  }
  return index;
}

/** Presentation only: actual permission checks and revocation remain in changeStatus. */
export function filteredSiteAccessAction(email: string, entry: FilteredSiteAccessEntry | null | undefined): FilteredSiteAccessAction | null {
  const normalized = siteBulkEmail(email);
  if (!entry || !validSiteBulkEmail(normalized) || siteBulkEmail(entry.email) !== normalized ||
      !Number.isSafeInteger(entry.id) || entry.id <= 0) return null;
  if (entry.status === 'active') {
    const expiry = entry.expiresAt == null ? null : new Date(entry.expiresAt).getTime();
    const expired = expiry !== null && (!Number.isFinite(expiry) || expiry <= Date.now());
    return {id: entry.id, status: 'suspended', label: 'Suspender', badge: expired ? 'Autorização vencida' : 'Já autorizado'};
  }
  if (entry.status === 'suspended') return {id: entry.id, status: 'active', label: 'Reativar', badge: 'Suspenso'};
  return null;
}
