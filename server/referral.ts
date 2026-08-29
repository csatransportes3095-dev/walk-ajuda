import { sql } from "drizzle-orm";
import { checkBlocklist, getDb } from "./db";

export type ReferralIssue = "invalid_phone" | "self_referral" | "blocked_referrer";

export type ResolvedReferral = {
  declaredName: string | null;
  declaredPhone: string | null;
  linkedReferrer: { id: number; name: string; phone: string } | null;
  issue: ReferralIssue | null;
};

/** Regra final do primeiro acesso do sistema restrito. */
export function restrictedReferralAccessError(referral: ResolvedReferral): string | null {
  if (referral.issue === 'invalid_phone') return 'Telefone do indicador inválido. Informe o número com DDD.';
  if (referral.issue === 'self_referral') return 'Você não pode indicar a si mesmo.';
  if (referral.issue === 'blocked_referrer') return 'Este número não pode ser usado como indicador. O cadastro está bloqueado ou impedido no sistema.';
  if (!referral.declaredPhone) return 'Acesso restrito: informe o telefone com DDD de quem indicou você.';
  if (!referral.linkedReferrer) return 'Este número não serve como indicador. O indicador precisa ter cadastro ativo e liberado no sistema.';
  return null;
}

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
 * Resolve a indicação somente quando o telefone pertence a um cliente ativo,
 * não excluído, não bloqueado e fora da blocklist. Esta função é a trava final
 * do servidor e não pode depender apenas da validação visual do cadastro.
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

  const blockResult = await checkBlocklist('', declaredPhone);
  if (blockResult.blocked) {
    return { declaredName, declaredPhone, linkedReferrer: null, issue: "blocked_referrer" };
  }

  const db = await getDb();
  if (!db) return { declaredName, declaredPhone, linkedReferrer: null, issue: null };

  const result = await db.execute(sql`
    SELECT id, name, phone
    FROM customers
    WHERE deletedAt IS NULL
      AND COALESCE(blocked, 0) = 0
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
