import { siteBulkEmail, siteBulkPhone, validSiteBulkEmail, type SiteBulkOrder } from './siteSecurityBulk';

export const siteDirectoryFilters = ['all', 'without_registration', 'registered_without_orders', 'with_orders'] as const;
export type SiteDirectoryFilter = (typeof siteDirectoryFilters)[number];
export type SiteDirectoryMetadata = {
  registrationState: 'none' | 'registered' | 'ambiguous';
  registeredName: string | null;
  registeredPhone: string | null;
  visibleOrderCount: number | null;
};
export type SiteDirectoryEntry = {
  id: number;
  customerId: number | null;
  displayName: string;
  email: string;
  phone: string | null;
  status: string;
  expiresAt?: Date | string | null;
};
export type SiteDirectoryCustomer = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  deletedAt: Date | null;
};

/** Read-only classification. The authorization remains the source of truth and is never removed/rewritten. */
export function attachSiteDirectoryMetadata<T extends SiteDirectoryEntry>(
  entries: readonly T[], customers: readonly SiteDirectoryCustomer[], orders: readonly SiteBulkOrder[],
): Array<T & SiteDirectoryMetadata> {
  const byId = new Map<number, SiteDirectoryCustomer>();
  const byEmail = new Map<string, SiteDirectoryCustomer | null>();
  for (const customer of customers) {
    if (customer.deletedAt || !Number.isSafeInteger(customer.id) || customer.id <= 0) continue;
    byId.set(customer.id, customer);
    const email = siteBulkEmail(customer.email);
    if (!validSiteBulkEmail(email)) continue;
    if (byEmail.has(email) && byEmail.get(email)?.id !== customer.id) byEmail.set(email, null);
    else if (!byEmail.has(email)) byEmail.set(email, customer);
  }
  const counts = new Map<string, number>();
  for (const order of orders) {
    const phone = siteBulkPhone(order.customerPhone);
    if (phone.length < 10) continue;
    counts.set(phone, (counts.get(phone) ?? 0) + 1);
  }
  return entries.map(entry => {
    const direct = entry.customerId != null ? byId.get(entry.customerId) : undefined;
    const email = siteBulkEmail(entry.email);
    const match = direct ?? byEmail.get(email);
    if (!match) return {
      ...entry,
      registrationState: byEmail.has(email) && byEmail.get(email) === null ? 'ambiguous' as const : 'none' as const,
      registeredName: null, registeredPhone: null, visibleOrderCount: null,
    };
    const phone = siteBulkPhone(match.phone);
    return {
      ...entry, registrationState: 'registered' as const,
      registeredName: match.name || null, registeredPhone: match.phone || null,
      // Do not assert no orders when a legacy registration has no usable order identity.
      visibleOrderCount: phone.length >= 10 ? counts.get(phone) ?? 0 : null,
    };
  });
}

const fold = (value: string | null | undefined) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Search authorizations themselves, including manual-only entries. Never use customer ids for actions. */
export function filterSiteDirectory<T extends SiteDirectoryEntry & Partial<SiteDirectoryMetadata>>(
  entries: readonly T[], filter: SiteDirectoryFilter, search = '',
): T[] {
  const query = fold(search.trim());
  const phoneQuery = /^[+\d\s().-]+$/.test(search.trim()) ? search.replace(/\D/g, '') : '';
  return entries.filter(entry => {
    const matches = filter === 'all' ||
      (filter === 'without_registration' && entry.registrationState === 'none') ||
      (filter === 'registered_without_orders' && entry.registrationState === 'registered' && entry.visibleOrderCount === 0) ||
      (filter === 'with_orders' && typeof entry.visibleOrderCount === 'number' && entry.visibleOrderCount > 0);
    if (!matches) return false;
    if (!query) return true;
    return [entry.displayName, entry.email, entry.registeredName].some(value => fold(value).includes(query)) ||
      (!!phoneQuery && [entry.phone, entry.registeredPhone].some(value => String(value ?? '').replace(/\D/g, '').includes(phoneQuery)));
  });
}

export function siteDirectoryRegistrationLabel(entry: Partial<SiteDirectoryMetadata>): string {
  if (entry.registrationState === 'none') return 'Sem cadastro de cliente';
  if (entry.registrationState === 'ambiguous') return 'Cadastro encontrado — vínculo a conferir';
  if (entry.registrationState !== 'registered') return 'Vínculo de cadastro não disponível';
  if (entry.visibleOrderCount === 0) return 'Com cadastro • Sem pedido';
  if (typeof entry.visibleOrderCount === 'number' && entry.visibleOrderCount > 0) return `Com cadastro • ${entry.visibleOrderCount} pedido(s)`;
  return 'Com cadastro • Pedidos não identificados';
}

export function siteDirectoryAccessLabel(entry: Pick<SiteDirectoryEntry, 'status' | 'expiresAt'>, now = Date.now()): string {
  if (entry.status === 'suspended') return 'Acesso suspenso';
  if (entry.status !== 'active') return 'Situação do acesso a conferir';
  const expiry = entry.expiresAt == null ? null : new Date(entry.expiresAt).getTime();
  if (expiry !== null && (!Number.isFinite(expiry) || expiry <= now)) return 'Autorização vencida';
  return 'Acesso autorizado';
}
