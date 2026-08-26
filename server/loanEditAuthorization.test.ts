import { afterEach, describe, expect, it } from "vitest";
import { isLoanEditPasswordValid } from "./loanEditAuthorization";

const originalPassword = process.env.ADMIN_LOAN_EDIT_PASSWORD;

afterEach(() => {
  if (originalPassword === undefined) delete process.env.ADMIN_LOAN_EDIT_PASSWORD;
  else process.env.ADMIN_LOAN_EDIT_PASSWORD = originalPassword;
});

describe("isLoanEditPasswordValid", () => {
  it("accepts only the exact configured password", () => {
    process.env.ADMIN_LOAN_EDIT_PASSWORD = "Loan-Edit-2026!";

    expect(isLoanEditPasswordValid("Loan-Edit-2026!")).toBe(true);
    expect(isLoanEditPasswordValid("loan-edit-2026!")).toBe(false);
    expect(isLoanEditPasswordValid("Loan-Edit-2026! ")).toBe(false);
  });

  it("fails closed when the environment password is missing", () => {
    delete process.env.ADMIN_LOAN_EDIT_PASSWORD;

    expect(isLoanEditPasswordValid("qualquer-coisa")).toBe(false);
  });

  it("rejects an empty provided password", () => {
    process.env.ADMIN_LOAN_EDIT_PASSWORD = "Loan-Edit-2026!";

    expect(isLoanEditPasswordValid("")).toBe(false);
  });
});
