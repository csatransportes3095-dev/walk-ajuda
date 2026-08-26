import { timingSafeEqual } from "node:crypto";

/**
 * Valida a senha adicional que protege ações sensíveis de empréstimos e PIX no ADM.
 * A senha configurada fica somente no ambiente do servidor; nunca é registrada.
 */
export function isLoanEditPasswordValid(providedPassword: string): boolean {
  const configuredPassword = process.env.ADMIN_LOAN_EDIT_PASSWORD ?? "";
  if (!configuredPassword || !providedPassword) return false;

  const expected = Buffer.from(configuredPassword, "utf8");
  const provided = Buffer.from(providedPassword, "utf8");
  if (expected.length !== provided.length) return false;

  return timingSafeEqual(expected, provided);
}
