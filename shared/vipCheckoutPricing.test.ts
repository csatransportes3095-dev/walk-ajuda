import { describe, expect, it } from "vitest";
import { applyCouponDiscountToCents, parseBrazilMoneyToCents } from "./vipCheckoutPricing";

describe("VIP checkout pricing", () => {
  it("converte valores brasileiros para centavos sem float como fonte de verdade", () => {
    expect(parseBrazilMoneyToCents("R$ 1.234,56")).toBe(123456);
    expect(parseBrazilMoneyToCents("900,00")).toBe(90000);
    expect(parseBrazilMoneyToCents("100")).toBe(10000);
    expect(parseBrazilMoneyToCents("0,01")).toBe(1);
    expect(parseBrazilMoneyToCents("1.234")).toBe(123400);
  });

  it("aplica cupom percentual em centavos", () => {
    expect(applyCouponDiscountToCents(100000, { type: "percentage", value: 20 })).toEqual({
      subtotalCents: 100000,
      discountCents: 20000,
      totalCents: 80000,
    });
  });

  it("aplica cupom fixo e nunca deixa desconto passar do subtotal", () => {
    expect(applyCouponDiscountToCents(30000, { type: "fixed", value: 50 })).toEqual({
      subtotalCents: 30000,
      discountCents: 5000,
      totalCents: 25000,
    });
    expect(applyCouponDiscountToCents(3000, { type: "fixed", value: 50 }).totalCents).toBe(0);
  });

  it("recusa percentual acima de 100%", () => {
    expect(() => applyCouponDiscountToCents(10000, { type: "percentage", value: 101 })).toThrow();
  });
});
