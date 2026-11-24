import { describe, it, expect } from "vitest";
import { hashCustomerKeyword, matchesCustomerKeyword } from "./customerKeyword";
import { isValidCustomerKeyword } from "../shared/customerKeyword";
describe("segurança da palavra-chave", () => {
  it("rejeita segredo vazio ou curto", () => {
    expect(isValidCustomerKeyword("1234567")).toBe(false);
    expect(isValidCustomerKeyword("        ")).toBe(false);
  });
  it("protege com salt único e rejeita chave incorreta", async () => {
    const first = await hashCustomerKeyword("palavra longa de teste");
    const second = await hashCustomerKeyword("palavra longa de teste");
    expect(first).not.toBe(second);
    expect(first).not.toContain("palavra longa de teste");
    expect(await matchesCustomerKeyword("palavra longa de teste",first)).toBe(true);
    expect(await matchesCustomerKeyword("palavra errada",first)).toBe(false);
    expect(await matchesCustomerKeyword("palavra longa de teste",null)).toBe(false);
  });
});
