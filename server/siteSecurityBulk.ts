/** Selects customer e-mails for the owner's site access list. No writes here. */
export const siteBulkFilters = [
  "all", "with_orders", "active", "delivered", "in_progress", "without_orders",
] as const;
export type SiteBulkFilter = (typeof siteBulkFilters)[number];

export type SiteBulkCustomer = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  blocked?: number | null;
  deletedAt?: Date | null;
};
export type SiteBulkOrder = { customerPhone: string | null; status: string | null };
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

export function classifySiteBulkStatus(status: string | null | undefined): "active" | "delivered" | "in_progress" | "other" {
  const key = fold(String(status || "").trim()).replace(/[\s-]+/g, "_");
  if (["ativo", "ativa", "conta_ativa", "pedido_ativo", "p"].includes(key)) return "active";
  if (["entregue", "pedido_entregue", "documento_entregue", "finalizado", "pedido_finalizado", "concluido"].includes(key)) return "delivered";
  if (["cancelado", "cancelada", "recusado", "recusada", "reprovado", "reprovada", "excluido"].includes(key)) return "other";
  return "in_progress";
}

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
  const seen = new Set<string>();
  const result: SiteBulkCandidate[] = [];
  for (const c of [...customers].sort((a, b) => a.id - b.id)) {
    if (c.deletedAt || Number(c.blocked || 0) !== 0) continue;
    const email = siteBulkEmail(c.email);
    if (!validSiteBulkEmail(email) || seen.has(email)) continue;
    seen.add(email);
    const counts = orderCounts.get(siteBulkPhone(c.phone)) || { count: 0, active: 0, delivered: 0, progress: 0 };
    result.push({
      id: c.id, name: c.name, email, phone: c.phone,
      orderCount: counts.count, activeOrders: counts.active,
      deliveredOrders: counts.delivered, inProgressOrders: counts.progress,
      alreadyAuthorized: authorizedEmails.has(email),
    });
  }
  return result;
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
