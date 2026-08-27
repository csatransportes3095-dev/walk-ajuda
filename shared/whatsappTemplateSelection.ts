export type WhatsappStatusTemplate = {
  id: number;
  statusKey: string | null;
  isDefault: number | string;
};

const WHATSAPP_TEMPLATE_STATUS_ALIASES: Record<string, string> = {
  entregue: "pedido_entregue",
};

export function normalizeWhatsappTemplateStatus(status: string | null | undefined): string {
  const normalized = String(status ?? "").trim();
  return WHATSAPP_TEMPLATE_STATUS_ALIASES[normalized] ?? normalized;
}

export function selectWhatsappTemplateForStatus<T extends WhatsappStatusTemplate>(
  templates: readonly T[],
  status: string | null | undefined,
): T | null {
  const expectedStatus = normalizeWhatsappTemplateStatus(status);
  if (!expectedStatus) return null;

  const matches = templates.filter(template => normalizeWhatsappTemplateStatus(template.statusKey) === expectedStatus);
  return matches.find(template => Number(template.isDefault) === 1) ?? matches[0] ?? null;
}
