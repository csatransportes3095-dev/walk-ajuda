import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb, getSetting } from "../db";

export type VipMembershipSnapshot = {
  id: number;
  customerId: number;
  phone: string;
  status: "active" | "expired" | "cancelled";
  active: boolean;
  startsAtMs: number;
  expiresAtMs: number;
  daysLeft: number;
  lastPaymentAmount: string | null;
  notes: string | null;
};

let infrastructurePromise: Promise<void> | null = null;

function rowsOf<T>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function normalizePhone(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

function normalizeAmount(value?: string | null): string | null {
  const raw = String(value || "").trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")
    : raw.replace(/[^0-9.-]/g, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric.toFixed(2) : null;
}

function derivedStatus(stored: unknown, expiresAtMs: number, now = Date.now()) {
  if (String(stored) === "cancelled") return { status: "cancelled" as const, active: false, daysLeft: 0 };
  if (String(stored) === "active" && expiresAtMs > now) {
    return { status: "active" as const, active: true, daysLeft: Math.max(1, Math.ceil((expiresAtMs - now) / 86400000)) };
  }
  return { status: "expired" as const, active: false, daysLeft: 0 };
}

export async function ensureVipMembershipInfrastructure() {
  if (!infrastructurePromise) {
    infrastructurePromise = (async () => {
      const db = (await getDb()) as any;
      if (!db) throw new Error("Banco de dados indisponível para VIP.");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vipMemberships (
id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
customerId INT NOT NULL,
phone VARCHAR(32) NOT NULL,
status VARCHAR(16) NOT NULL DEFAULT 'active',
startsAtMs BIGINT NOT NULL,
expiresAtMs BIGINT NOT NULL,
lastPaymentAmount DECIMAL(10,2) NULL,
notes VARCHAR(255) NULL,
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
UNIQUE KEY uq_vipMemberships_customer (customerId),
KEY idx_vipMemberships_phone (phone),
KEY idx_vipMemberships_status_expiry (status, expiresAtMs)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vipMembershipHistory (
id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
membershipId INT NOT NULL,
customerId INT NOT NULL,
phone VARCHAR(32) NOT NULL,
action VARCHAR(32) NOT NULL,
days INT NULL,
previousExpiresAtMs BIGINT NULL,
newExpiresAtMs BIGINT NULL,
amount DECIMAL(10,2) NULL,
notes VARCHAR(255) NULL,
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
KEY idx_vipMembershipHistory_customer (customerId),
KEY idx_vipMembershipHistory_membership (membershipId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      infrastructurePromise = null;
      throw error;
    });
  }
  await infrastructurePromise;
}

async function refreshExpiredMemberships() {
  await ensureVipMembershipInfrastructure();
  const db = (await getDb()) as any;
  if (!db) return;
  const now = Date.now();
  await db.execute(sql`UPDATE vipMemberships SET status='expired' WHERE status='active' AND expiresAtMs <= ${now}`);
}

async function defaultPlanDays() {
  const configured = Number(await getSetting("vip_membership_days"));
  return Number.isFinite(configured) && configured > 0 ? Math.min(3650, Math.floor(configured)) : 30;
}

async function getCustomerForVip(customerId: number) {
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const result = await db.execute(sql`
    SELECT id, name, phone, customerNumber, profilePhotoUrl
    FROM customers
    WHERE id=${customerId} AND deletedAt IS NULL
    LIMIT 1
  `);
  const row = rowsOf<any>(result)[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
  return { ...row, id: Number(row.id), phone: normalizePhone(row.phone) };
}

async function getMembershipByCustomerId(customerId: number) {
  await ensureVipMembershipInfrastructure();
  const db = (await getDb()) as any;
  if (!db) return null;
  const result = await db.execute(sql`SELECT * FROM vipMemberships WHERE customerId=${customerId} LIMIT 1`);
  return rowsOf<any>(result)[0] || null;
}

async function logHistory(input: {
  membershipId: number;
  customerId: number;
  phone: string;
  action: string;
  days?: number | null;
  previousExpiresAtMs?: number | null;
  newExpiresAtMs?: number | null;
  amount?: string | null;
  notes?: string | null;
}) {
  const db = (await getDb()) as any;
  if (!db) return;
  await db.execute(sql`
    INSERT INTO vipMembershipHistory
      (membershipId, customerId, phone, action, days, previousExpiresAtMs, newExpiresAtMs, amount, notes)
    VALUES
      (${input.membershipId}, ${input.customerId}, ${input.phone}, ${input.action}, ${input.days ?? null}, ${input.previousExpiresAtMs ?? null}, ${input.newExpiresAtMs ?? null}, ${input.amount ?? null}, ${input.notes || null})
  `);
}

export async function getVipMembershipSnapshotMap(): Promise<Map<number, VipMembershipSnapshot>> {
  await refreshExpiredMemberships();
  const db = (await getDb()) as any;
  const map = new Map<number, VipMembershipSnapshot>();
  if (!db) return map;
  const result = await db.execute(sql`SELECT id, customerId, phone, status, startsAtMs, expiresAtMs, lastPaymentAmount, notes FROM vipMemberships`);
  const now = Date.now();
  for (const row of rowsOf<any>(result)) {
    const expiresAtMs = Number(row.expiresAtMs || 0);
    const derived = derivedStatus(row.status, expiresAtMs, now);
    map.set(Number(row.customerId), {
      id: Number(row.id),
      customerId: Number(row.customerId),
      phone: normalizePhone(row.phone),
      status: derived.status,
      active: derived.active,
      startsAtMs: Number(row.startsAtMs || 0),
      expiresAtMs,
      daysLeft: derived.daysLeft,
      lastPaymentAmount: row.lastPaymentAmount == null ? null : String(row.lastPaymentAmount),
      notes: row.notes == null ? null : String(row.notes),
    });
  }
  return map;
}

async function statusByPhone(phoneValue: string) {
  await refreshExpiredMemberships();
  const db = (await getDb()) as any;
  const phone = normalizePhone(phoneValue);
  if (!db || phone.length < 10) return { active: false, status: "none" as const, startsAtMs: null, expiresAtMs: null, daysLeft: 0 };
  const result = await db.execute(sql`
    SELECT vm.id, vm.customerId, vm.phone, vm.status, vm.startsAtMs, vm.expiresAtMs
    FROM vipMemberships vm
    LEFT JOIN customers c ON c.id = vm.customerId
    WHERE vm.phone=${phone} OR REGEXP_REPLACE(COALESCE(c.phone, ''), '[^0-9]', '')=${phone}
    ORDER BY vm.id DESC
    LIMIT 1
  `);
  const row = rowsOf<any>(result)[0];
  if (!row) return { active: false, status: "none" as const, startsAtMs: null, expiresAtMs: null, daysLeft: 0 };
  const expiresAtMs = Number(row.expiresAtMs || 0);
  const derived = derivedStatus(row.status, expiresAtMs);
  return {
    active: derived.active,
    status: derived.status,
    startsAtMs: Number(row.startsAtMs || 0) || null,
    expiresAtMs: expiresAtMs || null,
    daysLeft: derived.daysLeft,
  };
}

export async function isVipMemberByPhone(phone: string) {
  try {
    return (await statusByPhone(phone)).active;
  } catch (error) {
    console.warn("[VIP] Não foi possível consultar assinatura por telefone:", (error as Error)?.message);
    return false;
  }
}

export const vipMembershipsRouter = router({
  status: publicProcedure
    .input(z.object({ phone: z.string().min(8).max(32) }))
    .query(async ({ input }) => statusByPhone(input.phone)),

  adminDirectory: adminProcedure.query(async () => {
    await refreshExpiredMemberships();
    const db = (await getDb()) as any;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const now = Date.now();
    const result = await db.execute(sql`
      SELECT
        c.id AS customerId,
        c.name,
        c.phone,
        c.customerNumber,
        c.profilePhotoUrl,
        vm.id AS membershipId,
        vm.status AS membershipStatus,
        vm.startsAtMs,
        vm.expiresAtMs,
        vm.lastPaymentAmount,
        vm.notes
      FROM customers c
      LEFT JOIN vipMemberships vm ON vm.customerId = c.id
      WHERE c.deletedAt IS NULL
      ORDER BY c.name ASC
    `);
    return rowsOf<any>(result).map((row) => {
      const membershipId = row.membershipId == null ? null : Number(row.membershipId);
      const expiresAtMs = Number(row.expiresAtMs || 0);
      const derived = membershipId ? derivedStatus(row.membershipStatus, expiresAtMs, now) : { status: "none" as const, active: false, daysLeft: 0 };
      return {
        customerId: Number(row.customerId),
        name: String(row.name || ""),
        phone: normalizePhone(row.phone),
        customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
        profilePhotoUrl: row.profilePhotoUrl == null ? null : String(row.profilePhotoUrl),
        membershipId,
        status: derived.status,
        active: derived.active,
        startsAtMs: Number(row.startsAtMs || 0) || null,
        expiresAtMs: expiresAtMs || null,
        daysLeft: derived.daysLeft,
        lastPaymentAmount: row.lastPaymentAmount == null ? null : String(row.lastPaymentAmount),
        notes: row.notes == null ? null : String(row.notes),
      };
    });
  }),

  history: adminProcedure
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await ensureVipMembershipInfrastructure();
      const db = (await getDb()) as any;
      if (!db) return [];
      const result = await db.execute(sql`
        SELECT id, membershipId, customerId, phone, action, days, previousExpiresAtMs, newExpiresAtMs, amount, notes, createdAt
        FROM vipMembershipHistory
        WHERE customerId=${input.customerId}
        ORDER BY id DESC
        LIMIT 60
      `);
      return rowsOf<any>(result).map((row) => ({
        ...row,
        id: Number(row.id),
        membershipId: Number(row.membershipId),
        customerId: Number(row.customerId),
        days: row.days == null ? null : Number(row.days),
        previousExpiresAtMs: row.previousExpiresAtMs == null ? null : Number(row.previousExpiresAtMs),
        newExpiresAtMs: row.newExpiresAtMs == null ? null : Number(row.newExpiresAtMs),
        amount: row.amount == null ? null : String(row.amount),
        createdAt: row.createdAt ? new Date(row.createdAt).getTime() : null,
      }));
    }),

  activate: adminProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
      days: z.number().int().min(1).max(3650).optional(),
      amount: z.string().max(32).optional(),
      notes: z.string().max(255).optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureVipMembershipInfrastructure();
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const customer = await getCustomerForVip(input.customerId);
      const days = input.days || await defaultPlanDays();
      const now = Date.now();
      const expiresAtMs = now + days * 86400000;
      const amount = normalizeAmount(input.amount);
      const existing = await getMembershipByCustomerId(input.customerId);
      const previousExpiresAtMs = existing ? Number(existing.expiresAtMs || 0) : null;
      if (existing) {
        await db.execute(sql`
UPDATE vipMemberships
SET phone=${customer.phone}, status='active', startsAtMs=${now}, expiresAtMs=${expiresAtMs}, lastPaymentAmount=${amount}, notes=${input.notes || null}
WHERE customerId=${input.customerId}
        `);
      } else {
        await db.execute(sql`
INSERT INTO vipMemberships (customerId, phone, status, startsAtMs, expiresAtMs, lastPaymentAmount, notes)
VALUES (${input.customerId}, ${customer.phone}, 'active', ${now}, ${expiresAtMs}, ${amount}, ${input.notes || null})
        `);
      }
      const membership = await getMembershipByCustomerId(input.customerId);
      await logHistory({ membershipId: Number(membership.id), customerId: input.customerId, phone: customer.phone, action: "activate", days, previousExpiresAtMs, newExpiresAtMs: expiresAtMs, amount, notes: input.notes });
      return { success: true, expiresAtMs, days };
    }),

  renew: adminProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
      days: z.number().int().min(1).max(3650).optional(),
      amount: z.string().max(32).optional(),
      notes: z.string().max(255).optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureVipMembershipInfrastructure();
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const customer = await getCustomerForVip(input.customerId);
      const days = input.days || await defaultPlanDays();
      const now = Date.now();
      const existing = await getMembershipByCustomerId(input.customerId);
      const previousExpiresAtMs = existing ? Number(existing.expiresAtMs || 0) : null;
      const baseMs = existing && Number(existing.expiresAtMs || 0) > now && String(existing.status) === "active" ? Number(existing.expiresAtMs) : now;
      const expiresAtMs = baseMs + days * 86400000;
      const amount = normalizeAmount(input.amount);
      if (existing) {
        await db.execute(sql`
UPDATE vipMemberships
SET phone=${customer.phone}, status='active', startsAtMs=CASE WHEN startsAtMs > 0 THEN startsAtMs ELSE ${now} END, expiresAtMs=${expiresAtMs}, lastPaymentAmount=${amount}, notes=${input.notes || existing.notes || null}
WHERE customerId=${input.customerId}
        `);
      } else {
        await db.execute(sql`
INSERT INTO vipMemberships (customerId, phone, status, startsAtMs, expiresAtMs, lastPaymentAmount, notes)
VALUES (${input.customerId}, ${customer.phone}, 'active', ${now}, ${expiresAtMs}, ${amount}, ${input.notes || null})
        `);
      }
      const membership = await getMembershipByCustomerId(input.customerId);
      await logHistory({ membershipId: Number(membership.id), customerId: input.customerId, phone: customer.phone, action: "renew", days, previousExpiresAtMs, newExpiresAtMs: expiresAtMs, amount, notes: input.notes });
      return { success: true, expiresAtMs, days };
    }),

  setExpiry: adminProcedure
    .input(z.object({ customerId: z.number().int().positive(), expiresAtMs: z.number().int().positive(), notes: z.string().max(255).optional() }))
    .mutation(async ({ input }) => {
      await ensureVipMembershipInfrastructure();
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const customer = await getCustomerForVip(input.customerId);
      const existing = await getMembershipByCustomerId(input.customerId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ative o VIP desse cliente antes de alterar a validade." });
      const previousExpiresAtMs = Number(existing.expiresAtMs || 0);
      const status = input.expiresAtMs > Date.now() ? "active" : "expired";
      await db.execute(sql`UPDATE vipMemberships SET phone=${customer.phone}, expiresAtMs=${input.expiresAtMs}, status=${status}, notes=${input.notes || existing.notes || null} WHERE customerId=${input.customerId}`);
      await logHistory({ membershipId: Number(existing.id), customerId: input.customerId, phone: customer.phone, action: "set_expiry", previousExpiresAtMs, newExpiresAtMs: input.expiresAtMs, notes: input.notes });
      return { success: true, expiresAtMs: input.expiresAtMs, status };
    }),

  cancel: adminProcedure
    .input(z.object({ customerId: z.number().int().positive(), notes: z.string().max(255).optional() }))
    .mutation(async ({ input }) => {
      await ensureVipMembershipInfrastructure();
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const customer = await getCustomerForVip(input.customerId);
      const existing = await getMembershipByCustomerId(input.customerId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Esse cliente ainda não possui VIP." });
      await db.execute(sql`UPDATE vipMemberships SET status='cancelled', phone=${customer.phone}, notes=${input.notes || existing.notes || null} WHERE customerId=${input.customerId}`);
      await logHistory({ membershipId: Number(existing.id), customerId: input.customerId, phone: customer.phone, action: "cancel", previousExpiresAtMs: Number(existing.expiresAtMs || 0), newExpiresAtMs: Number(existing.expiresAtMs || 0), notes: input.notes });
      return { success: true };
    }),
});
