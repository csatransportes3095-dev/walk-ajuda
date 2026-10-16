import { describe, expect, it } from "vitest";
import { calculateGlobalPromotionPrice, parseGlobalPromotionConfig, globalPromotionPrice } from "./globalPromotion";

const percent = { active: true, type: "percentage" as const, value: 20, revision: "t", updatedAt: null };
const fixed = { ...percent, type: "fixed" as const, value: 50 };
const price = { price: "400,00", originalPrice: "500,00" };

describe("promocao geral do site", () => {
  it("desligada preserva o preco cadastrado sem reescrever", () => {
    expect(globalPromotionPrice(price, { ...percent, active: false })).toBe("400,00");
  });
  it("20% e aplicado sobre 500, e nao sobre a promocao antiga 400", () => {
    expect(calculateGlobalPromotionPrice(price, percent).final).toBe("R$ 400,00");
  });
  it("50 reais sao descontados por item a partir do preco original", () => {
    expect(calculateGlobalPromotionPrice(price, fixed).final).toBe("R$ 450,00");
  });
  it("nunca cobra negativo ou zero na compra PIX", () => {
    expect(calculateGlobalPromotionPrice({ price: "R$ 20,00" }, { ...fixed, value: 100 }).final).toBe("R$ 0,01");
  });
  it("rejeita configuracao invalida", () => {
    expect(parseGlobalPromotionConfig(JSON.stringify({ ...percent, value: 110 })).active).toBe(false);
    expect(parseGlobalPromotionConfig("{erro").active).toBe(false);
  });
});