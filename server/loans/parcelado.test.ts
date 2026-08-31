import { describe, expect, it } from "vitest";
import { calculateParceladoFromAdminPlan } from "./parcelado";

describe("parcelado mensal pelo percentual do ADM", () => {
  it("1x usa 30%", () => {
    expect(calculateParceladoFromAdminPlan({ amount: 200, installments: 1, percentage: 30 })).toEqual({
      amount: 200,
      installments: 1,
      percentage: 30,
      interestAmount: 60,
      totalAmount: 260,
      perInstallment: 260,
    });
  });

  it("2x usa 50%", () => {
    expect(calculateParceladoFromAdminPlan({ amount: 200, installments: 2, percentage: 50 })).toEqual({
      amount: 200,
      installments: 2,
      percentage: 50,
      interestAmount: 100,
      totalAmount: 300,
      perInstallment: 150,
    });
  });

  it("4x usa 100%", () => {
    expect(calculateParceladoFromAdminPlan({ amount: 200, installments: 4, percentage: 100 })).toEqual({
      amount: 200,
      installments: 4,
      percentage: 100,
      interestAmount: 200,
      totalAmount: 400,
      perInstallment: 100,
    });
  });

  it("9x usa 225%", () => {
    expect(calculateParceladoFromAdminPlan({ amount: 200, installments: 9, percentage: 225 })).toEqual({
      amount: 200,
      installments: 9,
      percentage: 225,
      interestAmount: 450,
      totalAmount: 650,
      perInstallment: 72.22,
    });
  });
});
