import { isValidCPF } from "@shared/cpf";
import {
  normalizeCustomerCpf,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "./customerAccess";

export type RequiredCustomerProfileField =
  | "name"
  | "phone"
  | "email"
  | "cpf"
  | "city"
  | "uf"
  | "profilePhotoUrl";

export const REQUIRED_CUSTOMER_PROFILE_FIELDS: RequiredCustomerProfileField[] = [
  "name",
  "phone",
  "email",
  "cpf",
  "city",
  "uf",
  "profilePhotoUrl",
];

export const REQUIRED_CUSTOMER_PROFILE_LABELS: Record<RequiredCustomerProfileField, string> = {
  name: "nome completo",
  phone: "telefone",
  email: "e-mail",
  cpf: "CPF válido",
  city: "cidade",
  uf: "UF",
  profilePhotoUrl: "foto de perfil",
};

const GENERIC_NAME = /^(?:CLIENTE|CADASTRO|PEDIDO)\s+RECUPERAD[OA]|^RECUPERAD[OA](?:\s|$)/i;

export function getMissingCustomerProfileFields(customer: any): RequiredCustomerProfileField[] {
  const missing: RequiredCustomerProfileField[] = [];
  const name = String(customer?.name || "").trim();
  const phone = normalizeCustomerPhone(customer?.phone);
  const email = normalizeCustomerEmail(customer?.email);
  const cpf = normalizeCustomerCpf(customer?.cpf);
  const city = String(customer?.city || "").trim();
  const uf = String(customer?.uf || "").trim().toUpperCase();
  const photo = String(customer?.profilePhotoUrl || "").trim();

  if (name.length < 2 || GENERIC_NAME.test(name)) missing.push("name");
  if (!phone) missing.push("phone");
  if (!email) missing.push("email");
  if (!cpf || !isValidCPF(cpf)) missing.push("cpf");
  if (city.length < 2) missing.push("city");
  if (!/^[A-Z]{2}$/.test(uf)) missing.push("uf");
  if (!photo) missing.push("profilePhotoUrl");

  return missing;
}

export function isCustomerProfileComplete(customer: any): boolean {
  return getMissingCustomerProfileFields(customer).length === 0;
}

export function assertCompleteCustomerProfile(customer: any): void {
  const missing = getMissingCustomerProfileFields(customer);
  if (!missing.length) return;
  const labels = missing.map((field) => REQUIRED_CUSTOMER_PROFILE_LABELS[field]);
  throw new Error(`Cadastro principal exige: ${labels.join(", ")}.`);
}

export function isGenericRecoveredCustomerName(value: unknown): boolean {
  return GENERIC_NAME.test(String(value || "").trim());
}
