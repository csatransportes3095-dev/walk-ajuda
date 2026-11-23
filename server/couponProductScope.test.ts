import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { couponAppliesToOptionIds, couponAppliesToProductIds, couponScopeLabel } from "../shared/couponProductScope";

describe("Cupons vinculados a produto da vitrine", () => {
  it("preserva cupons antigos sem produto", () => {
    expect(couponAppliesToProductIds(null, [1, 2])).toBe(true);
    expect(couponAppliesToProductIds(undefined, [])).toBe(true);
  });
  it("aceita somente o produto vinculado", () => {
    expect(couponAppliesToProductIds(7, [7])).toBe(true);
    expect(couponAppliesToProductIds(7, [7, 7])).toBe(true);
    expect(couponAppliesToProductIds(7, [8])).toBe(false);
    expect(couponAppliesToProductIds(7, [7, 8])).toBe(false);
    expect(couponAppliesToProductIds(7, [])).toBe(false);
    expect(couponAppliesToProductIds(7, undefined)).toBe(false);
  });
  it("permite restringir opcao sem afetar cupons antigos", () => {
    expect(couponAppliesToOptionIds(null, [11, 22])).toBe(true);
    expect(couponAppliesToOptionIds(11, [11])).toBe(true);
    expect(couponAppliesToOptionIds(11, [11, 11])).toBe(true);
    expect(couponAppliesToOptionIds(11, [22])).toBe(false);
    expect(couponAppliesToOptionIds(11, [11, 22])).toBe(false);
    expect(couponAppliesToOptionIds(11, undefined)).toBe(false);
  });
  it("informa ao cliente qual produto aceita o desconto", () => {
    expect(couponScopeLabel("Uber Táxi")).toContain("Uber Táxi");
    expect(couponScopeLabel("Uber Carro", "Nome Aleatório")).toContain("Nome Aleatório");
    expect(couponScopeLabel(null)).toContain("todos os produtos");
  });
  it("exige o produto no checkout e também nas compras parceladas", () => {
    const checkout = readFileSync("server/routers.ts", "utf8");
    const vip = readFileSync("server/vipInstallmentPricing.ts", "utf8");
    expect(checkout).toContain("validateCoupon(input.couponCode, [input.productId || 0], [input.optionId || 0])");
    expect(vip).toContain("validateCoupon(couponCode, items.map(item => item.productId), items.map(item => item.optionId))");
  });
  it("cupom aplicado torna indicacao nao elegivel, mesmo com valor parcial", () => {
    const checkout = readFileSync("server/routers.ts", "utf8");
    expect(checkout).toContain("couponAppliedAtCheckout = true");
    expect(checkout).toContain("promotionalOrderAtCheckout = true");
    expect(checkout).toContain("couponApplied: couponAppliedAtCheckout");
    expect(checkout).toContain("Pedido com cupom de desconto não gera comissão de indicação.");
  });
});
