/**
 * Somente apresentacao dos pedidos no ADM.
 * Nao altera chaves de status, fluxos de produto ou dados pessoais persistidos.
 */
export const ORDER_STATUS_GROUPS = [
  { id: "pedido", label: "Pedido e agenda", icon: "📅" },
  { id: "documentos", label: "CNH e documentos", icon: "📄" },
  { id: "foto", label: "Fotografia", icon: "📷" },
  { id: "finalizacao", label: "Ativação e entrega", icon: "✅" },
  { id: "outros", label: "Outras etapas", icon: "📋" },
] as const;

export type OrderStatusGroupId = (typeof ORDER_STATUS_GROUPS)[number]["id"];

function normalize(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Agrupamento por chave/rotulo, sem depender de uma lista fixa de produtos. */
export function orderStatusGroupFor(key: string, label: string): OrderStatusGroupId {
  const value = normalize(key + " " + label);
  // Ordem importa: "foto em analise" nao deve ir para "pedido em analise".
  if (/\b(foto|fotografia|selfie|retrato)\b/.test(value)) return "foto";
  if (/\b(cnh|rg|crlv|documento|documentos|doc|habilitacao|carteira)\b/.test(value)) return "documentos";
  if (/\b(ativa|ativo|ativar|ativacao|entregue|entrega|finalizado|finalizacao|concluido|conclusao)\b/.test(value)) return "finalizacao";
  if (/\b(agenda|agendar|agendamento|agendamentos|agendado|marcado|marcacao|analise|recebido|pagamento|pgto|pedido|andamento|montagem)\b/.test(value)) return "pedido";
  return "outros";
}

export function groupOrderStatusChoices<T extends { key: string; label: string }>(items: readonly T[]) {
  return ORDER_STATUS_GROUPS.map(group => ({
    ...group,
    items: items.filter(item => orderStatusGroupFor(item.key, item.label) === group.id),
  })).filter(group => group.items.length > 0);
}

/** Apenas mascara visual. Nunca modificar o nome usado por notificacoes ou cadastro. */
export function hasOrderSurname(value: string | null | undefined): boolean {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length > 1;
}

export function visibleOrderName(value: string | null | undefined, revealed = false): string {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ") || "Cliente";
  if (revealed || !hasOrderSurname(cleaned)) return cleaned;
  return cleaned.split(" ")[0] + " •••";
}
