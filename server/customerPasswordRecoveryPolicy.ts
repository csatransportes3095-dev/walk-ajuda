import { createHmac } from "node:crypto";
import { getAdminJwtSecret } from "./adminJwt";
import { getMissingCustomerProfileFields } from "./customerProfileRequirements";

/**
 * Recovery is a credential-only operation: it must never grant or extend a
 * subscription, route permission, customer status, or ADM authorization.
 */
export function canCustomerRecoverPassword(
  mode: "auto" | "manual", customer: any, password: any, now = Date.now(),
): boolean {
  if (mode !== "auto" || !customer || !password ||
      customer.deletedAt || Number(customer.deleted || 0) === 1 ||
      Number(customer.blocked || 0) === 1 ||
      !String(customer.email || "").trim()) return false;
  if (getMissingCustomerProfileFields(customer).length) return false;
  return Number(password.isActive ?? 1) === 1 &&
    Number(password.pendingApproval || 0) === 0 &&
    !!password.expiresAt &&
    Number.isFinite(new Date(password.expiresAt).getTime()) &&
    new Date(password.expiresAt).getTime() > now;
}

/** Keyed hash: a stolen six-digit code digest cannot be brute-forced offline. */
export function passwordRecoveryCodeHash(phone: string, code: string): string {
  const secret = getAdminJwtSecret();
  if (!secret) throw new Error("PASSWORD_RECOVERY_SECRET_UNAVAILABLE");
  return createHmac("sha256", secret)
    .update("h2-password-recovery-v1|" + phone + "|" + code)
    .digest("hex");
}
