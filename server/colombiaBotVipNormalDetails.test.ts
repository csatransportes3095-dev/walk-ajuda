import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getColombiaBotVipComparison } from "../client/src/lib/colombiaBotVipComparison";

const bot = readFileSync("client/src/components/ColombiaBot.tsx", "utf8");
const card = readFileSync("client/src/components/ColombiaBotStorefrontCard.tsx", "utf8");

const model = {
  price: "450,00",
  vipAccessMode: "benefit" as const,
  vipDiscountType: "percentage" as const,
  vipDiscountValue: 20,
  vipHighlightText: "H2 VIP",
};

describe("ColombiaBot: preço Normal x VIP no mesmo card", () => {
  it("mostra preço normal, VIP e economia para cliente comum", () => {
    const result = getColombiaBotVipComparison(model, false, false, model.price);
    expect(result).toMatchObject({
      normalPrice: "450,00",
      vipPrice: "R$ 360,00",
      savingText: "R$ 90,00",
      isVipCustomer: false,
      vipOnly: false,
    });
  });
  it("continua exibindo os dois valores para cliente VIP", () => {
    const result = getColombiaBotVipComparison(model, true, false, "R$ 360,00");
    expect(result?.vipPrice).toBe("R$ 360,00");
    expect(result?.normalPrice).toBe("450,00");
    expect(result?.isVipCustomer).toBe(true);
  });
  it("mostra modo SOMENTE VIP sem oferecer valor Normal", () => {
    const result = getColombiaBotVipComparison({ ...model, vipAccessMode: "vip_only" }, false, false, "450,00");
    expect(result?.vipOnly).toBe(true);
    expect(result?.normalAvailable).toBe(false);
    expect(result?.normalPrice).toBe(null);
    expect(card).toContain("Somente VIP");
  });
  it("não inventa desconto onde o ADM configurou modo geral", () => {
    const result = getColombiaBotVipComparison({ ...model, vipAccessMode: "all" }, false, false, "450,00");
    expect(result?.vipPrice).toBe("450,00");
    expect(result?.hasVipDiscount).toBe(false);
    expect(result?.savingText).toBe(null);
  });
  it("não apresenta economia VIP fictícia em promoção global que substitui VIP", () => {
    const result = getColombiaBotVipComparison(model, false, true, "R$ 390,00");
    expect(result?.normalPrice).toBe("R$ 390,00");
    expect(result?.vipPrice).toBe("R$ 390,00");
    expect(result?.savingText).toBe(null);
    expect(result?.promoOverrides).toBe(true);
  });
  it("suporta desconto VIP fixo cadastrado no ADM", () => {
    const result = getColombiaBotVipComparison({ ...model, vipDiscountType: "fixed", vipDiscountValue: 50 }, true, false, "R$ 400,00");
    expect(result?.vipPrice).toBe("R$ 400,00");
    expect(result?.savingText).toBe("R$ 50,00");
  });
  it("liga comparação somente à vitrine do bot, sem mudar o checkout", () => {
    expect(bot).toContain("getColombiaBotVipComparison(model, isVipCustomer, sitePromoOverrides, getModelPrice(model))");
    expect(bot).toContain("vipComparison={vipComparison}");
    expect(bot).toContain("const basePrice = getModelPrice(flowState.current.priceModel) || priceForOption(option);");
    expect(card).toContain("PREÇO NORMAL X VIP");
    expect(card).toContain("Total aplicado ao seu cadastro");
  });
});
