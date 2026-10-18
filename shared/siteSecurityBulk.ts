/** Owner-only site access bulk import helpers. Pure functions; no mutations or side effects. */
export const siteBulkFilters = [
  "all", "with_orders", "active", "delivered", "in_progress", "without_orders",
] as const;
export type SiteBulkFilter = (typeof siteBulkFilters)[number];

export const SITE_BULK_BATCH_SIZE = 500;

export type SiteBulkCustomer = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  blocked?: number | null;
  deletedAt?: Date | null;
};

export type SiteBulkOrder = { customerPhone: string | null; status: string | null };
export type SiteBulkOrderEvent = SiteBulkOrder & {
  id: number;
  registrationId: number;
};
export type SiteBulkHiddenOrder = { registrationId: number; subOrderIndex: number };

export type SiteBulkCandidate = {
  id: number;
  name: string;
  email: string;
  phone: string;
  orderCount: number;
  activeOrders: number;
  deliveredOrders: number;
  inProgressOrders: number;
  alreadyAuthorized: boolean;
};

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const siteBulkEmail = (value: string | null | undefined) => String(value || "").trim().toLowerCase();
export const siteBulkPhone = (value: string | null | undefined) => String(value || "").replace(/\D/g, "").slice(-11);
export const validSiteBulkEmail = (value: string) => value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Use the same "recebido" restart marker and newest-first subOrderIndex as the admin order list. */
export function selectVisibleSiteBulkOrders(
  history: SiteBulkOrderEvent[],
  hidden: SiteBulkHiddenOrder[],
  initialStatus = "recebido",
): SiteBulkOrder[] {
  const grouped = new Map<number, SiteBulkOrderEvent[]>();
  for (const row of history) {
    if (!Number.isSafeInteger(row.registrationId) || row.registrationId <= 0) continue;
    const existing = grouped.get(row.registrationId);
    if (existing) existing.push(row);
    else grouped.set(row.registrationId, [row]);
  }
  const hiddenKeys = new Set(hidden.map(row => String(row.registrationId) + ":" + String(row.subOrderIndex)));
  const latest: SiteBulkOrder[] = [];
  for (const [registrationId, unsorted] of grouped) {
    // MySQL's id is a stable tie-breaker if two status events share the same createdAt.
    const rows = [...unsorted].sort((a, b) => a.id - b.id);
    const subOrders: SiteBulkOrderEvent[][] = [];
    let segment: SiteBulkOrderEvent[] = [];
    for (const row of rows) {
      if ((row.status === initialStatus || row.status === "recebido") && segment.length > 0) {
        subOrders.push(segment);
        segment = [];
      }
      segment.push(row);
    }
    if (segment.length) subOrders.push(segment);
    // Admin indexing is reversed: newest sub-order has index 0.
    subOrders.reverse().forEach((group, subOrderIndex) => {
      if (hiddenKeys.has(registrationId + ":" + subOrderIndex)) return;
      const last = group[group.length - 1];
      latest.push({ customerPhone: last.customerPhone, status: last.status });
    });
  }
  return latest;
}

export function classifySiteBulkStatus(status: string | null | undefined): "active" | "delivered" | "in_progress" | "other" {
  const key = fold(String(status || "").trim()).replace(/[\s-]+/g, "_");
  if (["ativo", "ativa", "conta_ativa", "pedido_ativo", "p"].includes(key)) return "active";
  if (["entregue", "pedido_entregue", "documento_entregue", "finalizado", "pedido_finalizado", "concluido"].includes(key)) return "delivered";
  if (["cancelado", "cancelada", "recusado", "recusada", "reprovado", "reprovada", "excluido", "excluida"].includes(key)) return "other";
  return "in_progress";
}

/** One unique valid e-mail per candidate. Duplicate customers consolidate all of their visible orders. */
export function prepareSiteBulkCandidates(
  customers: SiteBulkCustomer[],
  latestOrders: SiteBulkOrder[],
  knownEmails: Iterable<string>,
): SiteBulkCandidate[] {
  const authorizedEmails = new Set(Array.from(knownEmails, siteBulkEmail));
  const orderCounts = new Map<string, { count: number; active: number; delivered: number; progress: number }>();
  for (const order of latestOrders) {
    const phone = siteBulkPhone(order.customerPhone);
    if (!phone) continue;
    const current = orderCounts.get(phone) || { count: 0, active: 0, delivered: 0, progress: 0 };
    current.count += 1;
    const group = classifySiteBulkStatus(order.status);
    if (group === "active") current.active += 1;
    if (group === "delivered") current.delivered += 1;
    if (group === "in_progress") current.progress += 1;
    orderCounts.set(phone, current);
  }
  const byEmail = new Map<string, SiteBulkCandidate>();
  for (const c of [...customers].sort((a, b) => a.id - b.id)) {
    if (c.deletedAt || Number(c.blocked || 0) !== 0) continue;
    const email = siteBulkEmail(c.email);
    if (!validSiteBulkEmail(email)) continue;
    const counts = orderCounts.get(siteBulkPhone(c.phone)) || { count: 0, active: 0, delivered: 0, progress: 0 };
    const existing = byEmail.get(email);
    if (existing) {
      existing.orderCount += counts.count;
      existing.activeOrders += counts.active;
      existing.deliveredOrders += counts.delivered;
      existing.inProgressOrders += counts.progress;
      continue;
    }
    byEmail.set(email, {
      id: c.id, name: c.name, email, phone: c.phone,
      orderCount: counts.count, activeOrders: counts.active,
      deliveredOrders: counts.delivered, inProgressOrders: counts.progress,
      alreadyAuthorized: authorizedEmails.has(email),
    });
  }
  return [...byEmail.values()];
}

export function filterSiteBulkCandidates(candidates: SiteBulkCandidate[], filter: SiteBulkFilter, search = "") {
  const query = fold(search.trim());
  const digits = search.replace(/\D/g, "");
  return candidates.filter(c => {
    const matchesGroup = filter === "all" ||
      (filter === "with_orders" && c.orderCount > 0) ||
      (filter === "without_orders" && c.orderCount === 0) ||
      (filter === "active" && c.activeOrders > 0) ||
      (filter === "delivered" && c.deliveredOrders > 0) ||
      (filter === "in_progress" && c.inProgressOrders > 0);
    if (!matchesGroup) return false;
    if (!query) return true;
    return fold(c.name).includes(query) || c.email.includes(query) ||
      (digits.length > 0 && siteBulkPhone(c.phone).includes(digits));
  });
}

export function splitSiteBulkBatches(ids: readonly number[], size: number = SITE_BULK_BATCH_SIZE): number[][] {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("Invalid batch size");
  const unique = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
  const batches: number[][] = [];
  for (let index = 0; index < unique.length; index += size) batches.push(unique.slice(index, index + size));
  return batches;
}
