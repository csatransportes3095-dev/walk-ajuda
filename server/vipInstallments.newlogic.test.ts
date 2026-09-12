import { describe, expect, it } from "vitest";
import {
  buildVipInstallmentDueDates,
  calculateVipInstallmentQuote,
  splitInstallmentAmounts,
} from "../shared/vipInstallments";
import { applyCouponDiscountToCents, parseBrazilMoneyToCents } from "../shared/vipCheckoutPricing";

describe("VIP installment calculation", () => {
  it("calculates 10% interest on R$ 900 and splits exactly into 3 equal installments", () => {
    const quote = calculateVipInstallmentQuote({
      baseAmountCents: 90_000,
      installmentCount: 3,
      interestBps: 1_000,
      firstDueDate: "2026-09-12",
      frequency: "weekly",
    });
    expect(quote.interestAmountCents).toBe(9_000);
    expect(quote.totalAmountCents).toBe(99_000);
    expect(quote.installments.map(item => item.amountCents)).toEqual([33_000, 33_000, 33_000]);
    expect(quote.installments.map(item => item.dueDate)).toEqual(["2026-09-12", "2026-09-19", "2026-09-26"]);
  });

  it("places rounding remainder on the last installment without losing cents", () => {
    const parts = splitInstallmentAmounts(10_000, 3);
    expect(parts).toEqual([3_333, 3_333, 3_334]);
    expect(parts.reduce((sum, value) => sum + value, 0)).toBe(10_000);
  });

  it("handles daily, Monday-Saturday and monthly calendar rules", () => {
    expect(buildVipInstallmentDueDates({ firstDueDate: "2026-09-12", installmentCount: 4, frequency: "daily", dailyMode: "all_days" }))
      .toEqual(["2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15"]);
    expect(buildVipInstallmentDueDates({ firstDueDate: "2026-09-12", installmentCount: 4, frequency: "daily", dailyMode: "mon_sat" }))
      .toEqual(["2026-09-12", "2026-09-14", "2026-09-15", "2026-09-16"]);
    expect(buildVipInstallmentDueDates({ firstDueDate: "2026-01-31", installmentCount: 3, frequency: "monthly" }))
      .toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(buildVipInstallmentDueDates({ firstDueDate: "2028-01-31", installmentCount: 3, frequency: "monthly" }))
      .toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });

  it("rejects invalid dates and always preserves total cents", () => {
    expect(() => buildVipInstallmentDueDates({ firstDueDate: "2026-02-30", installmentCount: 3, frequency: "monthly" }))
      .toThrow("Data de vencimento inválida");
    const quote = calculateVipInstallmentQuote({ baseAmountCents: 123_457, installmentCount: 7, interestBps: 1_375, firstDueDate: "2026-09-12", frequency: "weekly" });
    expect(quote.installments.reduce((sum, item) => sum + item.amountCents, 0)).toBe(quote.totalAmountCents);
  });
});

describe("VIP checkout pricing", () => {
  it("parses Brazilian money into cents", () => {
    expect(parseBrazilMoneyToCents("R$ 1.234,56")).toBe(123456);
    expect(parseBrazilMoneyToCents("900,00")).toBe(90000);
    expect(parseBrazilMoneyToCents("100")).toBe(10000);
    expect(parseBrazilMoneyToCents("0,01")).toBe(1);
    expect(parseBrazilMoneyToCents("1.234")).toBe(123400);
  });

  it("applies percentage and fixed discounts safely", () => {
    expect(applyCouponDiscountToCents(100000, { type: "percentage", value: 20 })).toEqual({ subtotalCents: 100000, discountCents: 20000, totalCents: 80000 });
    expect(applyCouponDiscountToCents(30000, { type: "fixed", value: 50 })).toEqual({ subtotalCents: 30000, discountCents: 5000, totalCents: 25000 });
    expect(applyCouponDiscountToCents(3000, { type: "fixed", value: 50 }).totalCents).toBe(0);
    expect(() => applyCouponDiscountToCents(10000, { type: "percentage", value: 101 })).toThrow();
  });
});
