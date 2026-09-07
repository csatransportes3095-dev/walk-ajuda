import { describe, expect, it } from "vitest";
import { applyVipBenefitToPrice, isVipOnlyLocked, vipBenefitText } from "../shared/vipPricing";

describe("VIP por modelo/categoria", () => {
  it("cliente comum nao recebe beneficio", () => {
    expect(applyVipBenefitToPrice("R$ 200,00", { vipAccessMode: "benefit", vipDiscountType: "percentage", vipDiscountValue: 50 }, false)).toBe("R$ 200,00");
  });
  it("mantem preco normal para cliente comum", () => {
    expect(applyVipBenefitToPrice("150,00", { vipAccessMode: "benefit", vipDiscountType: "percentage", vipDiscountValue: 20 }, false)).toBe("150,00");
  });
  it("aplica percentual para VIP", () => {
    expect(applyVipBenefitToPrice("R$ 150,00", { vipAccessMode: "benefit", vipDiscountType: "percentage", vipDiscountValue: 20 }, true)).toBe("R$ 120,00");
  });
  it("aplica desconto fixo para VIP sem ficar negativo", () => {
    expect(applyVipBenefitToPrice("50,00", { vipAccessMode: "vip_only", vipDiscountType: "fixed", vipDiscountValue: 80 }, true)).toBe("R$ 0,00");
  });
  it("bloqueia somente vip para cliente comum", () => {
    expect(isVipOnlyLocked({ vipAccessMode: "vip_only" }, false)).toBe(true);
    expect(isVipOnlyLocked({ vipAccessMode: "vip_only" }, true)).toBe(false);
  });
  it("gera rotulo do beneficio", () => {
    expect(vipBenefitText({ vipAccessMode: "benefit", vipDiscountType: "percentage", vipDiscountValue: 15 })).toContain("15% OFF VIP");
  });
});
