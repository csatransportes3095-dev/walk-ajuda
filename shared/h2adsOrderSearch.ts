export type H2AdsOrderSearchable = {
  id: number;
  customerNumber?: number | null;
  phone?: string | null;
  orderNumber?: number | null;
  customerName?: string | null;
  serviceName?: string | null;
  serviceOption?: string | null;
  latestStatus?: string | null;
};

export function normalizeH2AdsOrderSearch(value: string): string {
  return value.trim().toLowerCase().replace(/^[#*]+/, "").trim();
}

export function getExactH2AdsCustomerNumberSearch(value: string): number | null {
  const raw = value.trim();
  const match = raw.match(/^\*(\d+)$/);
  if (!match) return null;
  const customerNumber = Number(match[1]);
  return Number.isInteger(customerNumber) && customerNumber > 0 ? customerNumber : null;
}

export function matchesH2AdsOrderSearch(order: H2AdsOrderSearchable, search: string): boolean {
  const raw = search.trim().toLowerCase();
  if (!raw) return true;

  const exactCustomerNumber = getExactH2AdsCustomerNumberSearch(raw);
  if (exactCustomerNumber !== null) {
    return Number(order.customerNumber) === exactCustomerNumber;
  }

  const normalized = normalizeH2AdsOrderSearch(raw);
  const textHaystack = [
    order.orderNumber,
    order.id,
    order.customerNumber,
    order.customerName,
    order.phone,
    order.serviceName,
    order.serviceOption,
    order.latestStatus,
  ]
    .filter(value => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();

  if (normalized && textHaystack.includes(normalized)) return true;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return false;

  return [order.orderNumber, order.id, order.customerNumber, order.phone]
    .filter(value => value !== null && value !== undefined)
    .some(value => String(value).replace(/\D/g, "").includes(digits));
}
