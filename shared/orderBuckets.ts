export type OperationalOrderLike = {
  latestStatus?: string | null;
  scheduleStatus?: string | null;
};

/**
 * Classifica um pedido na aba operacional correspondente.
 * As chaves canônicas vêm do orderStatusTypes; aliases antigos são aceitos
 * somente para não perder pedidos históricos já gravados.
 */
export function getOperationalBucket(order: OperationalOrderLike): string {
  const status = String(order.latestStatus || "");

  if (["entregue", "pedido_entregue", "cancelado"].includes(status)) {
    return "finalizado";
  }

  // Agendamentos ainda abertos têm prioridade sobre o status operacional.
  if (order.scheduleStatus === "confirmed") return "agendamento_confirmado";
  if (order.scheduleStatus === "pending") return "agendamento";

  // Chaves canônicas atuais, com aliases legados apenas como compatibilidade.
  if (["conta_ativa", "p"].includes(status)) return "conta_ativa";
  if (["aguardando_ativa", "aguardando_ficar_ativa"].includes(status)) {
    return "aguardando_ativa";
  }
  if (["em_analise", "foto_em_analise", "foto_em_anal"].includes(status)) {
    return "em_analise";
  }

  return "sem_status";
}
