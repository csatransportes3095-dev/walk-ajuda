import { describe, expect, it } from "vitest";
import { findAutomaticOption } from "./autoSchedule";

const option = {
  id: 7,
  productId: 3,
  label: "Nome Completo",
  productName: "Uber App",
  autoScheduleEnabled: 1,
};

describe("retroativo de agendamento para pedidos antigos", () => {
  it("aceita opção única quando o produto antigo foi renomeado", () => {
    expect(findAutomaticOption([option], "Uber Conta Antiga", "Nome Completo")?.id).toBe(7);
  });

  it("mantém bloqueio quando o mesmo rótulo existe em dois produtos", () => {
    const duplicate = { ...option, id: 8, productId: 4, productName: "Taxi" };
    expect(findAutomaticOption([option, duplicate], "Produto Legado", "Nome Completo")).toBeNull();
  });

  it("continua priorizando o produto exato quando há rótulos repetidos", () => {
    const duplicate = { ...option, id: 8, productId: 4, productName: "Taxi" };
    expect(findAutomaticOption([option, duplicate], "Taxi", "Nome Completo")?.id).toBe(8);
  });
});
