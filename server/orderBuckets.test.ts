import { describe, expect, it } from "vitest";
import { getOperationalBucket } from "../shared/orderBuckets";

describe("getOperationalBucket", () => {
  it.each([
    ["conta_ativa", "conta_ativa"],
    ["p", "conta_ativa"],
    ["aguardando_ativa", "aguardando_ativa"],
    ["aguardando_ficar_ativa", "aguardando_ativa"],
    ["em_analise", "em_analise"],
    ["foto_em_analise", "em_analise"],
    ["foto_em_anal", "em_analise"],
  ])("classifica o status %s no bucket %s", (latestStatus, expectedBucket) => {
    expect(getOperationalBucket({ latestStatus })).toBe(expectedBucket);
  });

  it("mantém agendamentos abertos como prioridade operacional", () => {
    expect(getOperationalBucket({ latestStatus: "conta_ativa", scheduleStatus: "pending" })).toBe("agendamento");
    expect(getOperationalBucket({ latestStatus: "em_analise", scheduleStatus: "confirmed" })).toBe("agendamento_confirmado");
  });

  it.each(["entregue", "pedido_entregue", "cancelado"])("classifica %s como finalizado", latestStatus => {
    expect(getOperationalBucket({ latestStatus })).toBe("finalizado");
  });

  it("usa sem_status para status desconhecido ou vazio", () => {
    expect(getOperationalBucket({ latestStatus: "status_novo_desconhecido" })).toBe("sem_status");
    expect(getOperationalBucket({ latestStatus: null })).toBe("sem_status");
  });
});
