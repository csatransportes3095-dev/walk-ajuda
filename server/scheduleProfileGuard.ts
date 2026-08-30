import { findMainCustomerByIdentity, normalizeCustomerPhone } from "./customerAccess";
import { getMissingCustomerProfileFields, type RequiredCustomerProfileField } from "./customerProfile";

export type ScheduleProfileRequirement =
  | { status: "complete"; phone: string; missing: RequiredCustomerProfileField[] }
  | { status: "required"; phone: string; missing: RequiredCustomerProfileField[] }
  | { status: "blocked"; phone: string; missing: RequiredCustomerProfileField[] }
  | { status: "not_found"; phone: string; missing: RequiredCustomerProfileField[] };

export function classifyScheduleProfileCustomer(customer: any, phoneHint: unknown): ScheduleProfileRequirement {
  const hintedPhone = normalizeCustomerPhone(phoneHint);
  if (!customer) return { status: "not_found", phone: hintedPhone, missing: [] };

  const phone = normalizeCustomerPhone(customer.phone) || hintedPhone;
  if (Number(customer.blocked) === 1) return { status: "blocked", phone, missing: [] };

  const missing = getMissingCustomerProfileFields(customer);
  if (missing.length > 0) return { status: "required", phone, missing };
  return { status: "complete", phone, missing: [] };
}

export async function resolveScheduleProfileRequirement(customerPhone: unknown, dbArg?: any): Promise<ScheduleProfileRequirement> {
  const phone = normalizeCustomerPhone(customerPhone);
  if (!phone) return { status: "not_found", phone: "", missing: [] };
  const customer = await findMainCustomerByIdentity({ phone }, dbArg);
  return classifyScheduleProfileCustomer(customer, phone);
}
