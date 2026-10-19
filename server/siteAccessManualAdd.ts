import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import type { getDb } from "./db";
import { siteAccessEntries, siteAccessAudit } from "./siteAccessSchema";

type SiteDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type ManualSiteAccessInput = {
  displayName: string;
  email: string;
  phone?: string;
  expiresAt?: string | null;
};
export type ManualSiteAccessResult = {
  success: true;
  created: boolean;
  id: number;
  status: string;
  expired: boolean;
};

/** Drizzle wraps driver errors. Log codes only, never SQL, values or identities. */
export function siteAccessSqlFailure(error: unknown): { code: string; errno: number | null; sqlState: string | null } {
  let current: unknown = error;
  const visited = new Set<object>();
  for (let depth = 0; current && typeof current === "object" && depth < 8; depth++) {
    if (visited.has(current)) break;
    visited.add(current);
    const value = current as Record<string, unknown>;
    const code = typeof value.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(value.code) ? value.code : null;
    const errno = typeof value.errno === "number" && Number.isSafeInteger(value.errno) ? value.errno : null;
    if (code || errno !== null) {
      return {
        code: code ?? "MYSQL_ERROR",
        errno,
        sqlState: typeof value.sqlState === "string" && /^[0-9A-Z]{5}$/.test(value.sqlState) ? value.sqlState : null,
      };
    }
    current = value.cause;
  }
  return { code: "UNKNOWN", errno: null, sqlState: null };
}

async function findExisting(db: Pick<SiteDb, "select">, email: string) {
  const [entry] = await db.select({
    id: siteAccessEntries.id,
    status: siteAccessEntries.status,
    expiresAt: siteAccessEntries.expiresAt,
  }).from(siteAccessEntries)
    .where(sql`LOWER(TRIM(${siteAccessEntries.email})) = ${email}`)
    .limit(1);
  return entry ?? null;
}

function existingResult(entry: { id: number; status: string; expiresAt: Date | null }): ManualSiteAccessResult {
  const expiry = entry.expiresAt instanceof Date ? entry.expiresAt.getTime() : entry.expiresAt === null ? null : NaN;
  return {
    success: true,
    created: false,
    id: entry.id,
    status: entry.status,
    expired: expiry !== null && (!Number.isFinite(expiry) || expiry <= Date.now()),
  };
}

/** Caller must pass the existing Super Admin authorization check before using this function. */
export async function addManualSiteAccess(db: SiteDb, actor: string, input: ManualSiteAccessInput): Promise<ManualSiteAccessResult> {
  const email = input.email.trim().toLowerCase();
  const expire = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expire && (!Number.isFinite(expire.getTime()) || expire.getTime() <= Date.now())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Data de vencimento inválida ou já passou." });
  }
  try {
    const existing = await findExisting(db, email);
    // Adding again is NOT reactivation, renewal, editing, or creation of a customer/order.
    if (existing) return existingResult(existing);

    return await db.transaction(async tx => {
      const now = new Date();
      // Explicit field list: do not depend on legacy column defaults or send DEFAULT for nullable fields.
      // The database still allocates the primary key; no MAX(id)+1 or invented customerId.
      const [inserted] = await tx.execute(sql`
        INSERT INTO siteAccessEntries
          (displayName, email, phone, customerId, status, expiresAt, sessionVersion, createdBy, createdAt, updatedAt)
        VALUES
          (${input.displayName.trim()}, ${email}, ${input.phone?.trim() || null}, ${null}, ${"active"}, ${expire}, ${1}, ${actor}, ${now}, ${now})
      `);
      const id = Number((inserted as { insertId?: number }).insertId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("SITE_ACCESS_INSERT_WITHOUT_ID");
      // If auditing fails, the authorization is rolled back as part of this same transaction.
      await tx.insert(siteAccessAudit).values({ actor, action: "ACCESS_ADDED", subject: email, createdAt: now });
      return { success: true as const, created: true, id, status: "active", expired: false };
    });
  } catch (error) {
    const details = siteAccessSqlFailure(error);
    // A concurrent request can win after the first read. The unique email index stays enabled.
    if (details.code === "ER_DUP_ENTRY" || details.errno === 1062) {
      try {
        const existing = await findExisting(db, email);
        if (existing) return existingResult(existing);
      } catch { /* Preserve the safe diagnostic below. */ }
    }
    console.error("[SiteSecurity][manual-add] SAE_ADD", details);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível salvar a autorização. Tente novamente. Código: SAE_ADD.",
    });
  }
}
