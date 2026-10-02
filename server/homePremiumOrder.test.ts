import { describe, expect, it } from "vitest";
import { keepAdminHomeButtonOrder } from "../shared/homePremiumOrder";

describe("ordem dos cards da home premium", () => {
  it("preserva exatamente a ordem recebida do Hub Central", () => {
    const buttons = [
      { id: 10, text: "FAZER MEU CADASTRO", vipOnly: 0 },
      { id: 20, text: "PLANILHA GASTOS", vipOnly: 0 },
      { id: 30, text: "EMPRESTIMO", vipOnly: 0 },
      { id: 40, text: "FORMATAR IPHONE", vipOnly: 0 },
      { id: 50, text: "HARD RESET ANDROID", vipOnly: 0 },
      { id: 60, text: "SORTEIO GRATIS", vipOnly: 0 },
    ];

    expect(keepAdminHomeButtonOrder(buttons).map((button) => button.text)).toEqual([
      "FAZER MEU CADASTRO",
      "PLANILHA GASTOS",
      "EMPRESTIMO",
      "FORMATAR IPHONE",
      "HARD RESET ANDROID",
      "SORTEIO GRATIS",
    ]);
  });

  it("remove VIP sem reordenar os cards públicos restantes", () => {
    const buttons = [
      { id: 1, text: "A", vipOnly: 0 },
      { id: 2, text: "VIP", vipOnly: 1 },
      { id: 3, text: "B", vipOnly: 0 },
      { id: 4, text: "C", vipOnly: 0 },
    ];

    expect(keepAdminHomeButtonOrder(buttons).map((button) => button.text)).toEqual(["A", "B", "C"]);
  });
});
