import { describe, expect, it } from "vitest";
import { getCustomerRouteAuditTarget } from "../shared/customerRouteAudit";

describe("getCustomerRouteAuditTarget", () => {
  it("monitora rotas principais com nomes obrigatórios", () => {
    expect(getCustomerRouteAuditTarget("/").areaName).toBe("Fazer pedido");
    expect(getCustomerRouteAuditTarget("/bot").areaName).toBe("Fazer pedido");
    expect(getCustomerRouteAuditTarget("/emprestimo").areaName).toBe("Empréstimos");
    expect(getCustomerRouteAuditTarget("/acompanhar").areaName).toBe("Acompanhar pedido");
    expect(getCustomerRouteAuditTarget("/cartoes/cartao/1").areaName).toBe("Cartões");
    expect(getCustomerRouteAuditTarget("/video/tutorial").areaName).toBe("Tutorial");
    expect(getCustomerRouteAuditTarget("/app-pro").areaName).toBe("Aplicativo H2");
  });

  it("nunca devolve token de URL dinâmica no identificador da rota", () => {
    const schedule = getCustomerRouteAuditTarget("/agendar/token-ultra-sensivel");
    const quote = getCustomerRouteAuditTarget("/orcamento/publicToken123");
    const receipt = getCustomerRouteAuditTarget("/recibo/abcxyz");
    expect(schedule.routeKey).toBe("/agendar/:token");
    expect(schedule.areaName).toBe("Agendar atendimento");
    expect(quote.routeKey).toBe("/orcamento/:publicToken");
    expect(quote.areaName).toBe("Orçamento");
    expect(receipt.routeKey).toBe("/recibo/:publicToken");
    expect(receipt.areaName).toBe("Recibo");
  });

  it("ignora rotas administrativas e não-clientes", () => {
    expect(getCustomerRouteAuditTarget("/admin/login").tracked).toBe(false);
    expect(getCustomerRouteAuditTarget("/admin/orders").tracked).toBe(false);
    expect(getCustomerRouteAuditTarget("/h2ads").tracked).toBe(false);
    expect(getCustomerRouteAuditTarget("/revendedor").tracked).toBe(false);
  });

  it("normaliza maiúsculas, barra final, query e hash", () => {
    expect(getCustomerRouteAuditTarget("/Cartoes/123?token=secreto#section")).toEqual({
      tracked: true,
      routeKey: "/cartoes/*",
      areaName: "Cartões",
    });
    expect(getCustomerRouteAuditTarget("/ADMIN/LOGIN/").tracked).toBe(false);
  });

  it("usa fallback seguro por primeiro segmento em rotas públicas não mapeadas", () => {
    expect(getCustomerRouteAuditTarget("/area-cliente/token-interno")).toEqual({
      tracked: true,
      routeKey: "/area-cliente",
      areaName: "Area cliente",
    });
  });
});
