import { describe, expect, it } from "vitest";
import {
  canonicalProgressStatusKey,
  chunkProgressKeys,
  findProgressStatusIndex,
  getConfiguredGlobalProgressKeys,
  resolveProgressPosition,
  sanitizeGlobalProgressKeys,
} from "../shared/orderProgressSequence";

const statuses = [
  { key: "pedido_recebido", isActive: 1, showInProgress: 1, progressOrder: 1, sortOrder: 10 },
  { key: "em_analise", isActive: 1, showInProgress: 1, progressOrder: 2, sortOrder: 20 },
  { key: "em_processamento", isActive: 1, showInProgress: 1, progressOrder: 3, sortOrder: 30 },
  { key: "agendamento_confirmado", isActive: 1, showInProgress: 1, progressOrder: 4, sortOrder: 40 },
  { key: "foto_em_analise", isActive: 1, showInProgress: 1, progressOrder: 5, sortOrder: 50 },
  { key: "aguardando_ativa", isActive: 1, showInProgress: 1, progressOrder: 6, sortOrder: 60 },
  { key: "foto_aprovada", isActive: 1, showInProgress: 1, progressOrder: 7, sortOrder: 70 },
  { key: "login_sendo_criado", isActive: 1, showInProgress: 1, progressOrder: 8, sortOrder: 80 },
  { key: "conta_ativa", isActive: 1, showInProgress: 1, progressOrder: 9, sortOrder: 90 },
  { key: "pedido_entregue", isActive: 1, showInProgress: 1, progressOrder: 10, sortOrder: 100 },
  { key: "cancelado", isActive: 1, showInProgress: 0, progressOrder: 9999, sortOrder: 110 },
];

describe("sequência global do acompanhamento", () => {
  it("usa progressOrder sem depender do sortOrder operacional", () => {
    const shuffled = statuses.map((status, index) => ({ ...status, sortOrder: 1000 - index }));
    expect(getConfiguredGlobalProgressKeys(shuffled)).toEqual([
      "pedido_recebido", "em_analise", "em_processamento", "agendamento_confirmado", "foto_em_analise",
      "aguardando_ativa", "foto_aprovada", "login_sendo_criado", "conta_ativa", "pedido_entregue",
    ]);
  });

  it("não limita a sequência a seis etapas", () => {
    const rows = chunkProgressKeys(getConfiguredGlobalProgressKeys(statuses), 3);
    expect(rows).toHaveLength(4);
    expect(rows.flat()).toHaveLength(10);
    expect(rows[3]).toEqual(["pedido_entregue"]);
  });

  it("remove duplicados, inativos, desconhecidos e cancelado ao salvar", () => {
    expect(sanitizeGlobalProgressKeys(statuses, [
      "pedido_recebido", "em_analise", "em_analise", "cancelado", "nao_existe", "pedido_entregue",
    ])).toEqual(["pedido_recebido", "em_analise", "pedido_entregue"]);
  });

  it("reconhece aliases finais de pedidos antigos sem alterar outros status", () => {
    expect(canonicalProgressStatusKey("entregue")).toBe("pedido_entregue");
    expect(canonicalProgressStatusKey("login_de_acesso")).toBe("pedido_entregue");
    expect(canonicalProgressStatusKey("aguardando_ficar_ativa")).toBe("aguardando_ativa");
    expect(canonicalProgressStatusKey("foto_em_analise")).toBe("foto_em_analise");
    expect(findProgressStatusIndex(["conta_ativa", "pedido_entregue"], "entregue")).toBe(1);
  });

  it("usa o status atual quando ele está na sequência", () => {
    const keys = getConfiguredGlobalProgressKeys(statuses);
    expect(resolveProgressPosition({ progressKeys: keys, latestStatus: "foto_aprovada", historyStatuses: ["pedido_recebido", "em_analise"] }))
      .toEqual({ currentIndex: 6, cancelled: false });
  });

  it("quando o status atual não está na sequência, usa a etapa mais avançada já atingida", () => {
    const keys = getConfiguredGlobalProgressKeys(statuses);
    expect(resolveProgressPosition({
      progressKeys: keys,
      latestStatus: "status_interno_que_cliente_nao_ve",
      historyStatuses: ["pedido_recebido", "foto_em_analise", "em_analise"],
    })).toEqual({ currentIndex: 4, cancelled: false });
  });

  it("pedido cancelado encerra o progresso e não cria próxima etapa falsa", () => {
    const keys = getConfiguredGlobalProgressKeys(statuses);
    expect(resolveProgressPosition({
      progressKeys: keys,
      latestStatus: "cancelado",
      historyStatuses: ["pedido_recebido", "em_analise", "em_processamento"],
    })).toEqual({ currentIndex: 2, cancelled: true });
  });
});
