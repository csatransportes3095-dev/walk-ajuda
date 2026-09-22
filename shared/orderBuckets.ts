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

  // O status real do pedido prevalece a partir de Em Análise. A agenda pode
  // continuar ativa em Em Análise, mas o card permanece classificado nessa etapa.
  if (["em_analise", "foto_em_analise", "foto_em_anal", "foto_analise"].includes(status)) {
    return "em_analise";
  }
  if (["documentos_aprovados", "foto_aprovada", "foto_perfil_aprovada"].includes(status)) {
    return "foto_aprovada";
  }
  if (["aguardando_ativa", "aguardando_ficar_ativa"].includes(status)) {
    return "aguardando_ativa";
  }
  if (["conta_ativa", "p"].includes(status)) return "conta_ativa";

  // Antes de Em Análise, a agenda aberta define a categoria operacional.
  if (order.scheduleStatus === "confirmed") return "agendamento_confirmado";
  if (order.scheduleStatus === "pending") return "agendamento";

  return "sem_status";
}
