import { describe, expect, it } from "vitest";
import { sanitizeCustomerUpdateReturnPath } from "@shared/customerUpdateReturnPath";

describe("customerUpdateReturnPath", () => {
  it("preserva retorno seguro do agendamento por token", () => {
    const token = "a".repeat(32);
    expect(sanitizeCustomerUpdateReturnPath(`/agendar/${token}`)).toBe(`/agendar/${token}`);
  });

  it("preserva rotas fixas já autorizadas", () => {
    expect(sanitizeCustomerUpdateReturnPath("/gastos")).toBe("/gastos");
    expect(sanitizeCustomerUpdateReturnPath("/acompanhar")).toBe("/acompanhar");
  });

  it("rejeita open redirect e token inválido", () => {
    expect(sanitizeCustomerUpdateReturnPath("https://evil.example/agendar/" + "a".repeat(32))).toBe("");
    expect(sanitizeCustomerUpdateReturnPath("//evil.example")).toBe("");
    expect(sanitizeCustomerUpdateReturnPath("/agendar/123")).toBe("");
  });
});
