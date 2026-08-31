export type H2AdsRoutingGroup = {
  id: number;
  name: string;
  status?: string | null;
};

export type H2AdsRoutingOrder = {
  serviceName?: string | null;
  serviceOption?: string | null;
  latestStatus?: string | null;
};

export function normalizeH2AdsRoutingText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function findGroup(groups: H2AdsRoutingGroup[], candidates: string[]): H2AdsRoutingGroup | null {
  const active = groups.filter(group => group.status !== "archived");
  const normalized = active.map(group => ({ group, name: normalizeH2AdsRoutingText(group.name) }));
  for (const candidate of candidates.map(normalizeH2AdsRoutingText)) {
    const exact = normalized.find(item => item.name === candidate);
    if (exact) return exact.group;
  }
  for (const candidate of candidates.map(normalizeH2AdsRoutingText)) {
    const partial = normalized.find(item => item.name.includes(candidate) || candidate.includes(item.name));
    if (partial) return partial.group;
  }
  return null;
}

export function resolveH2AdsAutomaticGroup(groups: H2AdsRoutingGroup[], order: H2AdsRoutingOrder | null | undefined): H2AdsRoutingGroup | null {
  if (!order) return null;
  const status = normalizeH2AdsRoutingText(order.latestStatus);
  const service = normalizeH2AdsRoutingText(`${order.serviceName || ""} ${order.serviceOption || ""}`);

  // Etapas operacionais têm prioridade quando o pedido já chegou nelas.
  if (status === "conta ativa" || status.includes("conta ativa")) {
    const target = findGroup(groups, ["CONTA ATIVA"]);
    if (target) return target;
  }
  if ((status.includes("aguardando") && status.includes("ativa")) || status.includes("ficar ativa")) {
    const target = findGroup(groups, ["AG FICAR ATIVA", "AGUARDANDO FICAR ATIVA"]);
    if (target) return target;
  }

  if (service.includes("taxi")) return findGroup(groups, ["TAXI"]);
  if (service.includes("aleatorio")) return findGroup(groups, ["NOME ALEATORIO"]);
  if (service.includes("primeiro nome") || /(?:^| )1 ?nome(?: |$)/.test(service)) return findGroup(groups, ["PRIMEIRO NOME"]);
  if (service.includes("nome completo") || service.includes("completo")) return findGroup(groups, ["NOME COMPLETO"]);

  return null;
}
