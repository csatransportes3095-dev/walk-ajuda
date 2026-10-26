import { getMissingCustomerProfileFields } from "./customerProfileRequirements";

/** A password is not a subscription, and a reset must not grant access. */
export function canCustomerRecoverPassword(mode: "auto" | "manual", customer: any, password: any, now = Date.now()): boolean {
  if (mode !== "auto" || !customer || customer.deletedAt ||
      Number(customer.blocked || 0) === 1 || !String(customer.email || "").trim()) return false;
  if (getMissingCustomerProfileFields(customer).length) return false;
  return !!password && Number(password.pendingApproval || 0) === 0 &&
    !!password.expiresAt && new Date(password.expiresAt).getTime() > now;
}
