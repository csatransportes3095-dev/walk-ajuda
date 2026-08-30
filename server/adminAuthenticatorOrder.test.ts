import { describe, expect, it } from "vitest";
import { buildAuthenticatorOrderLabel } from "./adminAuthenticatorOrder";

describe("buildAuthenticatorOrderLabel", () => {
  it("usa cadastro e nome do cliente quando disponíveis", () => {
    expect(buildAuthenticatorOrderLabel({ registrationId: 99, orderNumber: 130000, customerNumber: 460, customerName: "Leandro de Moraes dos Santos" }))
      .toBe("*460 LEANDRO DE MORAES DOS SANTOS");
  });

  it("usa número do pedido como fallback quando não há cadastro", () => {
    expect(buildAuthenticatorOrderLabel({ registrationId: 99, orderNumber: 130000, customerNumber: null, customerName: "Cliente Teste" }))
      .toBe("#130000 CLIENTE TESTE");
  });
});
