import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const storefront = fs.readFileSync(path.resolve(root, "client/src/components/StorefrontProductCard.tsx"), "utf8");
const home = fs.readFileSync(path.resolve(root, "client/src/pages/Home.tsx"), "utf8");

describe("apresentação de preço VIP", () => {
  it("mantém valor normal no seletor de garantia", () => {
    expect(storefront).toContain("Valor normal");
    expect(storefront).toContain("{asMoney(model.price)}");
    expect(storefront).not.toContain("VIP {asMoney(vipPreviewPrice)}");
  });

  it("mantém comparação VIP separada no card Sua escolha", () => {
    expect(storefront).toContain("Você é VIP • paga");
    expect(storefront).toContain("Cliente VIP paga");
    expect(storefront).toContain("Você economiza");
  });

  it("separa valor normal do valor efetivo usado na cobrança", () => {
    expect(home).toContain("getCurrentNormalServiceValue");
    expect(home).toContain("const originalValue = getCurrentServiceValue()");
    expect(home).toContain("const normalValue = getCurrentNormalServiceValue()");
    expect(home).toContain("const vipDiscountValue = isVipCustomer");
  });

  it("mostra detalhamento VIP antes do valor PIX", () => {
    expect(home).toContain("Valor normal");
    expect(home).toContain("👑 Desconto VIP");
    expect(home).toContain("Benefício VIP aplicado");
    expect(home).toContain("VALOR A PAGAR");
  });

  it("mantém o preço efetivo VIP na submissão do pedido", () => {
    expect(home).toContain("getPriceModelServiceValue(selectedPriceModel)");
    expect(home).toContain("applyVipBenefitToPrice(model.price, model, isVipCustomer)");
  });
});
