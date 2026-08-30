import { describe, expect, it } from "vitest";
import { splitH2AdsOrderHistory } from "./h2adsOrderLink";

describe("H2 Ads order/suborder link", () => {
  it("mantém subOrderIndex 0 como o subpedido mais recente", () => {
    const result = splitH2AdsOrderHistory([
      { status: "pedido_entregue" },
      { status: "recebido" },
      { status: "em_andamento" },
      { status: "recebido" },
    ], "recebido");
    expect(result).toEqual([
      [{ status: "recebido" }, { status: "pedido_entregue" }],
      [{ status: "recebido" }, { status: "em_andamento" }],
    ]);
  });

  it("respeita o status inicial dinâmico usado pelo módulo de pedidos", () => {
    const result = splitH2AdsOrderHistory([
      { status: "em_montagem" },
      { status: "pedido_recebido" },
      { status: "conta_ativa" },
      { status: "pedido_recebido" },
    ], "pedido_recebido");
    expect(result).toHaveLength(2);
    expect(result[0][0].status).toBe("pedido_recebido");
    expect(result[1][0].status).toBe("pedido_recebido");
  });
});
