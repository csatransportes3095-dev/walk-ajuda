import { describe, expect, it } from "vitest";
import { isValidCustomerBirthDate } from "./customerBirthDate";

describe("data de nascimento", () => {
  it("aceita datas de calendário válidas", () => {
    expect(isValidCustomerBirthDate("2000-02-29")).toBe(true);
    expect(isValidCustomerBirthDate("1990-12-31")).toBe(true);
  });
  it("rejeita datas ausentes, futuras ou inexistentes", () => {
    for (const date of ["", "2001-02-29", "1990-04-31", "1990-13-01", "2099-01-01", "31/12/1990", null, undefined]) {
      expect(isValidCustomerBirthDate(date)).toBe(false);
    }
  });
});
