import { isValidCPF } from "@shared/cpf";
import { isRecoveredCustomerName } from "../shared/customerProfile";
import { normalizeCustomerCpf, normalizeCustomerEmail } from "./customerAccess";

export const REQUIRED_CUSTOMER_PROFILE_FIELDS = [
  "name",
  "email",
  "cpf",
  "cep",
  "street",
  "addressNumber",
  "neighborhood",
  "city",
  "uf",
  "profilePhotoUrl",
] as const;

export type RequiredCustomerProfileField = (typeof REQUIRED_CUSTOMER_PROFILE_FIELDS)[number];

export function getMissingCustomerProfileFields(customer: any): RequiredCustomerProfileField[] {
  const missing: RequiredCustomerProfileField[] = [];
  const name = String(customer?.name || "").trim();
  if (name.length < 2 || isRecoveredCustomerName(name)) missing.push("name");
  if (!normalizeCustomerEmail(customer?.email)) missing.push("email");
  const cpf = normalizeCustomerCpf(customer?.cpf);
  if (!cpf || !isValidCPF(cpf)) missing.push("cpf");
  if (String(customer?.cep || "").replace(/\D/g, "").length !== 8) missing.push("cep");
  if (String(customer?.street || "").trim().length < 2) missing.push("street");
  if (String(customer?.addressNumber || "").trim().length < 1) missing.push("addressNumber");
  if (String(customer?.neighborhood || "").trim().length < 2) missing.push("neighborhood");
  if (String(customer?.city || "").trim().length < 2) missing.push("city");
  if (!/^[A-Z]{2}$/.test(String(customer?.uf || "").trim().toUpperCase())) missing.push("uf");
  if (!String(customer?.profilePhotoUrl || "").trim()) missing.push("profilePhotoUrl");
  return missing;
}
