export type AuthenticatorOrderIdentity = {
  registrationId: number;
  orderNumber?: number | null;
  customerNumber?: number | null;
  customerName?: string | null;
};

function cleanLabelPart(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function buildAuthenticatorOrderLabel(identity: AuthenticatorOrderIdentity): string {
  const customerName = cleanLabelPart(identity.customerName).toLocaleUpperCase("pt-BR");
  const prefix = identity.customerNumber
    ? `*${identity.customerNumber}`
    : `#${identity.orderNumber || identity.registrationId}`;
  const label = customerName ? `${prefix} ${customerName}` : `${prefix} CLIENTE`;
  return label.slice(0, 128);
}
