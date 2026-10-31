import { H2_AUTO_SHORT_CONFIRMATION } from "../shared/h2AutoShortReplies";
import { getMissingCustomerProfileFields } from "./customerProfileRequirements";
import { normalizeCustomerPhone } from "./customerAccess";

/**
 * Keep the WhatsApp eligibility check aligned with the existing /login gate.
 * Only a matching, non-deleted, non-blocked customer may be assessed.
 * Never disclose which personal field is missing over WhatsApp.
 */
export function h2AutoCustomerNeedsProfileUpdate(customer: unknown): boolean {
  return getMissingCustomerProfileFields(customer).length > 0;
}

/**
 * Find precisely one active customer for a submitted number. Some existing
 * profiles store a Brazilian mobile without the ninth digit or with DDI 55.
 * Never select the first of two matching accounts.
 * Address complement is not part of customerProfileRequirements.
 */
export function selectH2AutoCustomerByPhone<T extends { phone?: unknown }>(
  candidates: readonly T[],
  submittedPhone: string,
): T | null {
  const number = normalizeCustomerPhone(submittedPhone);
  if (!number) return null;
  const equivalent = (stored: unknown) => {
    const current = normalizeCustomerPhone(stored);
    if (!current) return false;
    if (current === number) return true;
    const withoutNinthDigit = (value: string) =>
      value.length === 11 && value[2] === "9"
        ? value.slice(0, 2) + value.slice(3)
        : "";
    return withoutNinthDigit(number) === current ||
      withoutNinthDigit(current) === number;
  };
  const matching = candidates.filter(customer => equivalent(customer.phone));
  return matching.length === 1 ? matching[0] : null;
}

export const H2_AUTO_CUSTOMER_PROFILE_UPDATE_MESSAGE = H2_AUTO_SHORT_CONFIRMATION.customerProfileUpdate;

/**
 * Unknown, ambiguous and otherwise unauthorized phone numbers keep one generic
 * response; do not reveal whether a specific phone is on file.
 */
export const H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE = H2_AUTO_SHORT_CONFIRMATION.customerAccessNotConfirmed;
