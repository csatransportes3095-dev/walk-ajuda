import { describe, expect, it } from "vitest";
import { getCustomerRouteAuditTarget, shouldNotifyForRouteAudit } from "../shared/customerRouteAudit";

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
      routeKey: "/cartoes/123",
      areaName: "Cartões",
    });
    expect(getCustomerRouteAuditTarget("/ADMIN/LOGIN/").tracked).toBe(false);
  });

  it("usa fallback seguro por primeiro segmento em rotas públicas não mapeadas", () => {
    expect(getCustomerRouteAuditTarget("/area-cliente/token-interno")).toEqual({
      tracked: true,
      routeKey: "/area-cliente/token-interno",
      areaName: "Area cliente",
    });
  });

  it("mantém routeKey consistente ao sair e voltar para rota anterior", () => {
    const first = getCustomerRouteAuditTarget("/emprestimo");
    const middle = getCustomerRouteAuditTarget("/acompanhar");
    const back = getCustomerRouteAuditTarget("/emprestimo");
    expect(first.routeKey).toBe("/emprestimo");
    expect(middle.routeKey).toBe("/acompanhar");
    expect(back.routeKey).toBe("/emprestimo");
    expect(back.routeKey).toBe(first.routeKey);
  });

  it("diferencia rotas reais que antes eram agrupadas", () => {
    expect(getCustomerRouteAuditTarget("/cartoes").routeKey).toBe("/cartoes");
    expect(getCustomerRouteAuditTarget("/cartoes/cartao/1").routeKey).toBe("/cartoes/cartao/1");
    expect(getCustomerRouteAuditTarget("/app").routeKey).toBe("/app");
    expect(getCustomerRouteAuditTarget("/app-pro").routeKey).toBe("/app-pro");
  });

  it("regra de 30 minutos na mesma rota", () => {
    const base = new Date("2026-09-13T10:00:00.000Z");
    expect(shouldNotifyForRouteAudit({
      previousRouteKey: "/emprestimo",
      nextRouteKey: "/emprestimo",
      lastNotifiedAt: new Date(base),
      now: new Date(base.getTime() + (29 * 60 * 1000)),
    }).shouldNotify).toBe(false);

    expect(shouldNotifyForRouteAudit({
      previousRouteKey: "/emprestimo",
      nextRouteKey: "/emprestimo",
      lastNotifiedAt: new Date(base),
      now: new Date(base.getTime() + (30 * 60 * 1000)),
    }).shouldNotify).toBe(true);
  });

  it("A->B->A em sequência rápida continua sendo mudança de rota", () => {
    const base = new Date("2026-09-13T10:00:00.000Z");
    const first = shouldNotifyForRouteAudit({
      previousRouteKey: "",
      nextRouteKey: "/emprestimo",
      lastNotifiedAt: null,
      now: base,
    });
    expect(first.shouldNotify).toBe(true);

    const second = shouldNotifyForRouteAudit({
      previousRouteKey: "/emprestimo",
      nextRouteKey: "/acompanhar",
      lastNotifiedAt: base,
      now: new Date(base.getTime() + 5_000),
    });
    expect(second.shouldNotify).toBe(true);

    const third = shouldNotifyForRouteAudit({
      previousRouteKey: "/acompanhar",
      nextRouteKey: "/emprestimo",
      lastNotifiedAt: new Date(base.getTime() + 5_000),
      now: new Date(base.getTime() + 8_000),
    });
    expect(third.shouldNotify).toBe(true);
  });
});
