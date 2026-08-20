import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type ReferralIssue = "invalid_phone" | "self_referral";

export type ResolvedReferral = {
  declaredName: string | null;
  declaredPhone: string | null;
  linkedReferrer: { id: number; name: string; phone: string } | null;
  issue: ReferralIssue | null;
};

/**
 * Normaliza somente o telefone do indicador. O cadastro principal continua sendo
 * a fonte de identidade; esta função apenas remove máscara e o DDI +55 quando
 * ele vier junto do número brasileiro.
 */
export function normalizeReferralPhone(value: unknown): string {
  let phone = String(value ?? "").replace(/\D/g, "");
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith("55")) phone = phone.slice(2);
  return phone;
}

export function normalizeReferralName(value: unknown): string | null {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  return name || null;
}

/**
 * Preserva a indicação declarada e identifica, quando possível, o cliente que
 * corresponde ao telefone. Número não localizado não é erro de cadastro: fica
 * como origem declarada sem vínculo automático e nunca deve habilitar comissão.
 */
export async function resolveReferralDeclaration(input: {
  customerPhone: string;
  referrerName?: unknown;
  referrerPhone?: unknown;
}): Promise<ResolvedReferral> {
  const declaredName = normalizeReferralName(input.referrerName);
  const rawPhone = String(input.referrerPhone ?? "").trim();
  const declaredPhone = normalizeReferralPhone(rawPhone);
  const customerPhone = normalizeReferralPhone(input.customerPhone);

  if (rawPhone && !/^\d{10,11}$/.test(declaredPhone)) {
    return { declaredName, declaredPhone: null, linkedReferrer: null, issue: "invalid_phone" };
  }
  if (declaredPhone && declaredPhone === customerPhone) {
    return { declaredName, declaredPhone, linkedReferrer: null, issue: "self_referral" };
  }
  if (!declaredPhone) {
    return { declaredName, declaredPhone: null, linkedReferrer: null, issue: null };
  }

  const db = await getDb();
  if (!db) return { declaredName, declaredPhone, linkedReferrer: null, issue: null };

  const result = await db.execute(sql`
    SELECT id, name, phone
    FROM customers
    WHERE deletedAt IS NULL
      AND REGEXP_REPLACE(phone, '[^0-9]', '') = ${declaredPhone}
    LIMIT 1
  `);
  const rows = (result[0] as unknown as Array<{ id: number; name: string | null; phone: string | null }>) || [];
  const referrer = rows[0];
  if (!referrer) return { declaredName, declaredPhone, linkedReferrer: null, issue: null };

  return {
    declaredName,
    declaredPhone,
    linkedReferrer: {
      id: Number(referrer.id),
      name: String(referrer.name || "").trim(),
      phone: normalizeReferralPhone(referrer.phone),
    },
    issue: null,
  };
}
