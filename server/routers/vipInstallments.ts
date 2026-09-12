import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { calculateVipInstallmentQuote, type VipInstallmentDailyMode, type VipInstallmentFrequency } from "../../shared/vipInstallments";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { requireCustomerSession } from "../customerSession";
import { getDb, getSetting, upsertSetting } from "../db";
import { isVipMemberByPhone } from "./vipMemberships";

const SETTING_KEYS = {
  enabled: "vip_installments_enabled",
  minCount: "vip_installments_min_count",
  maxCount: "vip_installments_max_count",
  defaultInterestBps: "vip_installments_interest_bps",
  allowDaily: "vip_installments_allow_daily",
  allowWeekly: "vip_installments_allow_weekly",
  allowMonthly: "vip_installments_allow_monthly",
  dailyMode: "vip_installments_daily_mode",
} as const;

export type VipInstallmentConfig = {
  enabled: boolean;
  minInstallments: number;
  maxInstallments: number;
  defaultInterestBps: number;
  allowDaily: boolean;
  allowWeekly: boolean;
  allowMonthly: boolean;
  dailyMode: VipInstallmentDailyMode;
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

function boolSetting(value: string | null | undefined, fallback: boolean) {
  if (value == null || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function intSetting(value: string | null | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export async function ensureVipInstallmentInfrastructure() {
  if (!infrastructurePromise) {
    infrastructurePromise = (async () => {
      const db = (await getDb()) as any;
      if (!db) throw new Error("Banco de dados indisponível para Parcelamento VIP.");

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vipInstallmentPermissions (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          customerId INT NOT NULL,
          enabled TINYINT NOT NULL DEFAULT 0,
          maxInstallments INT NULL,
          interestBps INT NULL,
          creditLimitCents BIGINT NULL,
          allowDaily TINYINT NULL,
          allowWeekly TINYINT NULL,
          allowMonthly TINYINT NULL,
          notes VARCHAR(255) NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_vipInstallmentPermissions_customer (customerId),
          KEY idx_vipInstallmentPermissions_enabled (enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vipInstallmentPlans (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          customerId INT NOT NULL,
          membershipId INT NULL,
          orderNumber VARCHAR(64) NULL,
          productId INT NULL,
          optionId INT NULL,
          productName VARCHAR(255) NOT NULL,
          baseAmountCents BIGINT NOT NULL,
          interestBps INT NOT NULL DEFAULT 0,
          interestAmountCents BIGINT NOT NULL DEFAULT 0,
          totalAmountCents BIGINT NOT NULL,
          paidAmountCents BIGINT NOT NULL DEFAULT 0,
          balanceCents BIGINT NOT NULL,
          installmentCount INT NOT NULL,
          frequency VARCHAR(16) NOT NULL,
          dailyMode VARCHAR(16) NOT NULL DEFAULT 'all_days',
          status VARCHAR(24) NOT NULL DEFAULT 'pending',
          openSlotCustomerId INT NULL,
          createdBy VARCHAR(128) NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_vipInstallmentPlans_open_slot (openSlotCustomerId),
          KEY idx_vipInstallmentPlans_customer (customerId),
          KEY idx_vipInstallmentPlans_status (status),
          KEY idx_vipInstallmentPlans_order (orderNumber)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vipInstallments (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          planId INT NOT NULL,
          installmentNumber INT NOT NULL,
          amountCents BIGINT NOT NULL,
          dueDate DATE NOT NULL,
          paidAmountCents BIGINT NOT NULL DEFAULT 0,
          status VARCHAR(32) NOT NULL DEFAULT 'pending',
          proofUrl TEXT NULL,
          proofMimeType VARCHAR(128) NULL,
          proofSubmittedAtMs BIGINT NULL,
          paidAtMs BIGINT NULL,
          financeSaleId INT NULL,
          paymentIdempotencyKey VARCHAR(128) NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_vipInstallments_plan_number (planId, installmentNumber),
          UNIQUE KEY uq_vipInstallments_idempotency (paymentIdempotencyKey),
          KEY idx_vipInstallments_due_status (dueDate, status),
          KEY idx_vipInstallments_plan_status (planId, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vipInstallmentHistory (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          planId INT NOT NULL,
          installmentId INT NULL,
          action VARCHAR(64) NOT NULL,
          actorType VARCHAR(24) NOT NULL,
          actorId VARCHAR(128) NULL,
          previousValue TEXT NULL,
          newValue TEXT NULL,
          notes VARCHAR(500) NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_vipInstallmentHistory_plan (planId),
          KEY idx_vipInstallmentHistory_installment (installmentId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      infrastructurePromise = null;
      throw error;
    });
  }
  await infrastructurePromise;
}

export async function getVipInstallmentConfig(): Promise<VipInstallmentConfig> {
  const [enabled, minCount, maxCount, interestBps, allowDaily, allowWeekly, allowMonthly, dailyMode] = await Promise.all([
    getSetting(SETTING_KEYS.enabled),
    getSetting(SETTING_KEYS.minCount),
    getSetting(SETTING_KEYS.maxCount),
    getSetting(SETTING_KEYS.defaultInterestBps),
    getSetting(SETTING_KEYS.allowDaily),
    getSetting(SETTING_KEYS.allowWeekly),
    getSetting(SETTING_KEYS.allowMonthly),
    getSetting(SETTING_KEYS.dailyMode),
  ]);

  const minInstallments = intSetting(minCount, 2, 2, 120);
  const maxInstallments = Math.max(minInstallments, intSetting(maxCount, 3, 2, 120));
  return {
    enabled: boolSetting(enabled, false),
    minInstallments,
    maxInstallments,
    defaultInterestBps: intSetting(interestBps, 0, 0, 100_000),
    allowDaily: boolSetting(allowDaily, true),
    allowWeekly: boolSetting(allowWeekly, true),
    allowMonthly: boolSetting(allowMonthly, true),
    dailyMode: dailyMode === "mon_sat" ? "mon_sat" : "all_days",
  };
}

async function customerByPhone(phoneValue: string) {
  const phone = normalizePhone(phoneValue);
  const db = (await getDb()) as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const result = await db.execute(sql`
    SELECT id, name, phone, customerNumber
    FROM customers
    WHERE deletedAt IS NULL
      AND REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '')=${phone}
    LIMIT 1
  `);
  const row = rowsOf<any>(result)[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    phone: normalizePhone(row.phone),
    customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
  };
}

async function permissionForCustomer(customerId: number) {
  await ensureVipInstallmentInfrastructure();
  const db = (await getDb()) as any;
  const result = await db.execute(sql`
    SELECT id, customerId, enabled, maxInstallments, interestBps, creditLimitCents,
           allowDaily, allowWeekly, allowMonthly, notes
    FROM vipInstallmentPermissions
    WHERE customerId=${customerId}
    LIMIT 1
  `);
  const row = rowsOf<any>(result)[0];
  if (!row) {
    return {
      id: null,
      customerId,
      enabled: false,
      maxInstallments: null,
      interestBps: null,
      creditLimitCents: null,
      allowDaily: null,
      allowWeekly: null,
      allowMonthly: null,
      notes: null,
    };
  }
  return {
    id: Number(row.id),
    customerId: Number(row.customerId),
    enabled: Number(row.enabled) === 1,
    maxInstallments: row.maxInstallments == null ? null : Number(row.maxInstallments),
    interestBps: row.interestBps == null ? null : Number(row.interestBps),
    creditLimitCents: row.creditLimitCents == null ? null : Number(row.creditLimitCents),
    allowDaily: row.allowDaily == null ? null : Number(row.allowDaily) === 1,
    allowWeekly: row.allowWeekly == null ? null : Number(row.allowWeekly) === 1,
    allowMonthly: row.allowMonthly == null ? null : Number(row.allowMonthly) === 1,
    notes: row.notes == null ? null : String(row.notes),
  };
}

async function openPlanForCustomer(customerId: number) {
  await ensureVipInstallmentInfrastructure();
  const db = (await getDb()) as any;
  const result = await db.execute(sql`
    SELECT id, orderNumber, productName, totalAmountCents, paidAmountCents, balanceCents,
           installmentCount, frequency, status, createdAt
    FROM vipInstallmentPlans
    WHERE openSlotCustomerId=${customerId}
    LIMIT 1
  `);
  const row = rowsOf<any>(result)[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    orderNumber: row.orderNumber == null ? null : String(row.orderNumber),
    productName: String(row.productName || ""),
    totalAmountCents: Number(row.totalAmountCents || 0),
    paidAmountCents: Number(row.paidAmountCents || 0),
    balanceCents: Number(row.balanceCents || 0),
    installmentCount: Number(row.installmentCount || 0),
    frequency: String(row.frequency || ""),
    status: String(row.status || ""),
    createdAt: row.createdAt ? new Date(row.createdAt).getTime() : null,
  };
}

async function resolveEligibility(phone: string) {
  const customer = await customerByPhone(phone);
  const [config, permission, vipActive, openPlan] = await Promise.all([
    getVipInstallmentConfig(),
    permissionForCustomer(customer.id),
    isVipMemberByPhone(customer.phone),
    openPlanForCustomer(customer.id),
  ]);

  let reason: string | null = null;
  if (!config.enabled) reason = "Parcelamento VIP indisponível no momento.";
  else if (!vipActive) reason = "Seu VIP precisa estar ativo para usar o parcelamento.";
  else if (!permission.enabled) reason = "Parcelamento VIP ainda não foi liberado para este cadastro.";
  else if (openPlan && openPlan.balanceCents > 0) reason = "Você já possui uma compra parcelada em andamento. Quite o saldo para liberar um novo parcelamento.";

  return {
    customer,
    config,
    permission,
    vipActive,
    openPlan,
    eligible: !reason,
    reason,
  };
}

function effectiveFrequencyAllowed(config: VipInstallmentConfig, permission: Awaited<ReturnType<typeof permissionForCustomer>>, frequency: VipInstallmentFrequency) {
  if (frequency === "daily") return permission.allowDaily ?? config.allowDaily;
  if (frequency === "weekly") return permission.allowWeekly ?? config.allowWeekly;
  return permission.allowMonthly ?? config.allowMonthly;
}

function effectiveMaxInstallments(config: VipInstallmentConfig, permission: Awaited<ReturnType<typeof permissionForCustomer>>) {
  const customerMax = permission.maxInstallments == null ? config.maxInstallments : permission.maxInstallments;
  return Math.max(config.minInstallments, Math.min(config.maxInstallments, customerMax));
}

export const vipInstallmentsRouter = router({
  adminConfig: adminProcedure.query(async () => getVipInstallmentConfig()),

  setAdminConfig: adminProcedure
    .input(z.object({
      enabled: z.boolean(),
      minInstallments: z.number().int().min(2).max(120),
      maxInstallments: z.number().int().min(2).max(120),
      defaultInterestBps: z.number().int().min(0).max(100_000),
      allowDaily: z.boolean(),
      allowWeekly: z.boolean(),
      allowMonthly: z.boolean(),
      dailyMode: z.enum(["all_days", "mon_sat"]),
    }).refine((value) => value.maxInstallments >= value.minInstallments, {
      message: "Máximo de parcelas deve ser maior ou igual ao mínimo.",
      path: ["maxInstallments"],
    }).refine((value) => value.allowDaily || value.allowWeekly || value.allowMonthly, {
      message: "Selecione ao menos uma periodicidade.",
    }))
    .mutation(async ({ input }) => {
      await Promise.all([
        upsertSetting(SETTING_KEYS.enabled, input.enabled ? "1" : "0"),
        upsertSetting(SETTING_KEYS.minCount, String(input.minInstallments)),
        upsertSetting(SETTING_KEYS.maxCount, String(input.maxInstallments)),
        upsertSetting(SETTING_KEYS.defaultInterestBps, String(input.defaultInterestBps)),
        upsertSetting(SETTING_KEYS.allowDaily, input.allowDaily ? "1" : "0"),
        upsertSetting(SETTING_KEYS.allowWeekly, input.allowWeekly ? "1" : "0"),
        upsertSetting(SETTING_KEYS.allowMonthly, input.allowMonthly ? "1" : "0"),
        upsertSetting(SETTING_KEYS.dailyMode, input.dailyMode),
      ]);
      return getVipInstallmentConfig();
    }),

  setCustomerPermission: adminProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
      enabled: z.boolean(),
      maxInstallments: z.number().int().min(2).max(120).nullable().optional(),
      interestBps: z.number().int().min(0).max(100_000).nullable().optional(),
      creditLimitCents: z.number().int().positive().max(100_000_000_000).nullable().optional(),
      allowDaily: z.boolean().nullable().optional(),
      allowWeekly: z.boolean().nullable().optional(),
      allowMonthly: z.boolean().nullable().optional(),
      notes: z.string().max(255).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureVipInstallmentInfrastructure();
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const customerResult = await db.execute(sql`
        SELECT phone FROM customers
        WHERE id=${input.customerId} AND deletedAt IS NULL
        LIMIT 1
      `);
      const customerRow = rowsOf<any>(customerResult)[0];
      if (!customerRow) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
      if (input.enabled && !(await isVipMemberByPhone(normalizePhone(customerRow.phone)))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ative o VIP do cliente antes de liberar o parcelamento." });
      }
      await db.execute(sql`
        INSERT INTO vipInstallmentPermissions
          (customerId, enabled, maxInstallments, interestBps, creditLimitCents, allowDaily, allowWeekly, allowMonthly, notes)
        VALUES
          (${input.customerId}, ${input.enabled ? 1 : 0}, ${input.maxInstallments ?? null}, ${input.interestBps ?? null}, ${input.creditLimitCents ?? null},
           ${input.allowDaily == null ? null : input.allowDaily ? 1 : 0}, ${input.allowWeekly == null ? null : input.allowWeekly ? 1 : 0},
           ${input.allowMonthly == null ? null : input.allowMonthly ? 1 : 0}, ${input.notes ?? null})
        ON DUPLICATE KEY UPDATE
          enabled=VALUES(enabled), maxInstallments=VALUES(maxInstallments), interestBps=VALUES(interestBps),
          creditLimitCents=VALUES(creditLimitCents), allowDaily=VALUES(allowDaily), allowWeekly=VALUES(allowWeekly),
          allowMonthly=VALUES(allowMonthly), notes=VALUES(notes)
      `);
      return permissionForCustomer(input.customerId);
    }),

  adminDirectory: adminProcedure.query(async () => {
    await ensureVipInstallmentInfrastructure();
    const db = (await getDb()) as any;
    const result = await db.execute(sql`
      SELECT c.id AS customerId, c.name, c.phone, c.customerNumber,
             COALESCE(p.enabled, 0) AS installmentEnabled,
             p.maxInstallments, p.interestBps, p.creditLimitCents,
             op.id AS openPlanId, op.balanceCents, op.totalAmountCents, op.status AS openPlanStatus
      FROM customers c
      LEFT JOIN vipInstallmentPermissions p ON p.customerId=c.id
      LEFT JOIN vipInstallmentPlans op ON op.openSlotCustomerId=c.id
      WHERE c.deletedAt IS NULL
      ORDER BY c.name ASC
    `);
    return rowsOf<any>(result).map((row) => ({
      customerId: Number(row.customerId),
      name: String(row.name || ""),
      phone: normalizePhone(row.phone),
      customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
      installmentEnabled: Number(row.installmentEnabled) === 1,
      maxInstallments: row.maxInstallments == null ? null : Number(row.maxInstallments),
      interestBps: row.interestBps == null ? null : Number(row.interestBps),
      creditLimitCents: row.creditLimitCents == null ? null : Number(row.creditLimitCents),
      openPlanId: row.openPlanId == null ? null : Number(row.openPlanId),
      balanceCents: row.balanceCents == null ? 0 : Number(row.balanceCents),
      totalAmountCents: row.totalAmountCents == null ? 0 : Number(row.totalAmountCents),
      openPlanStatus: row.openPlanStatus == null ? null : String(row.openPlanStatus),
    }));
  }),

  eligibility: publicProcedure
    .input(z.object({ cpToken: z.string().min(32), phone: z.string().min(8).max(32).optional() }))
    .query(async ({ input }) => {
      const session = await requireCustomerSession(input.cpToken, input.phone);
      return resolveEligibility(session.phone);
    }),

  quote: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
      baseAmountCents: z.number().int().positive().max(100_000_000_000),
      installmentCount: z.number().int().min(2).max(120),
      frequency: z.enum(["daily", "weekly", "monthly"]),
      firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const session = await requireCustomerSession(input.cpToken, input.phone);
      const eligibility = await resolveEligibility(session.phone);
      if (!eligibility.eligible) {
        throw new TRPCError({ code: "FORBIDDEN", message: eligibility.reason || "Parcelamento VIP indisponível." });
      }

      const maxInstallments = effectiveMaxInstallments(eligibility.config, eligibility.permission);
      if (input.installmentCount < eligibility.config.minInstallments || input.installmentCount > maxInstallments) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Escolha entre ${eligibility.config.minInstallments} e ${maxInstallments} parcelas.` });
      }
      if (!effectiveFrequencyAllowed(eligibility.config, eligibility.permission, input.frequency)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Periodicidade não permitida para este parcelamento." });
      }
      if (eligibility.permission.creditLimitCents != null && input.baseAmountCents > eligibility.permission.creditLimitCents) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Valor da compra acima do limite de parcelamento liberado pelo ADM." });
      }

      const interestBps = eligibility.permission.interestBps ?? eligibility.config.defaultInterestBps;
      try {
        return calculateVipInstallmentQuote({
          baseAmountCents: input.baseAmountCents,
          installmentCount: input.installmentCount,
          interestBps,
          firstDueDate: input.firstDueDate,
          frequency: input.frequency,
          dailyMode: eligibility.config.dailyMode,
        });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message || "Não foi possível calcular o parcelamento." });
      }
    }),

  myPlans: publicProcedure
    .input(z.object({ cpToken: z.string().min(32), phone: z.string().min(8).max(32).optional() }))
    .query(async ({ input }) => {
      const session = await requireCustomerSession(input.cpToken, input.phone);
      const customer = await customerByPhone(session.phone);
      await ensureVipInstallmentInfrastructure();
      const db = (await getDb()) as any;
      const plansResult = await db.execute(sql`
        SELECT id, orderNumber, productName, baseAmountCents, interestBps, interestAmountCents,
               totalAmountCents, paidAmountCents, balanceCents, installmentCount, frequency,
               dailyMode, status, createdAt
        FROM vipInstallmentPlans
        WHERE customerId=${customer.id}
        ORDER BY id DESC
        LIMIT 50
      `);
      const plans = rowsOf<any>(plansResult);
      if (plans.length === 0) return [];
      const planIds = plans.map((row) => Number(row.id));
      const installmentsResult = await db.execute(sql`
        SELECT id, planId, installmentNumber, amountCents, dueDate, paidAmountCents, status,
               proofSubmittedAtMs, paidAtMs
        FROM vipInstallments
        WHERE planId IN (${sql.join(planIds.map((id) => sql`${id}`), sql`, `)})
        ORDER BY planId DESC, installmentNumber ASC
      `);
      const installments = rowsOf<any>(installmentsResult);
      const byPlan = new Map<number, any[]>();
      for (const row of installments) {
        const planId = Number(row.planId);
        const list = byPlan.get(planId) || [];
        list.push({
          id: Number(row.id),
          installmentNumber: Number(row.installmentNumber),
          amountCents: Number(row.amountCents),
          dueDate: row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate).slice(0, 10),
          paidAmountCents: Number(row.paidAmountCents || 0),
          status: String(row.status || "pending"),
          proofSubmittedAtMs: row.proofSubmittedAtMs == null ? null : Number(row.proofSubmittedAtMs),
          paidAtMs: row.paidAtMs == null ? null : Number(row.paidAtMs),
        });
        byPlan.set(planId, list);
      }
      return plans.map((row) => ({
        id: Number(row.id),
        orderNumber: row.orderNumber == null ? null : String(row.orderNumber),
        productName: String(row.productName || ""),
        baseAmountCents: Number(row.baseAmountCents),
        interestBps: Number(row.interestBps || 0),
        interestAmountCents: Number(row.interestAmountCents || 0),
        totalAmountCents: Number(row.totalAmountCents),
        paidAmountCents: Number(row.paidAmountCents || 0),
        balanceCents: Number(row.balanceCents || 0),
        installmentCount: Number(row.installmentCount),
        frequency: String(row.frequency),
        dailyMode: String(row.dailyMode),
        status: String(row.status),
        createdAt: row.createdAt ? new Date(row.createdAt).getTime() : null,
        installments: byPlan.get(Number(row.id)) || [],
      }));
    }),
});
