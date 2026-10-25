import { sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  getVipInstallmentFrequencyRule,
  getVipInstallmentProductRule,
  type VipInstallmentEntryMode,
  type VipInstallmentFrequencyRule,
  type VipInstallmentProductRule,
} from "./vipInstallmentProductRules";
import type { VipInstallmentFrequency } from "../shared/vipInstallments";

export type VipInstallmentOptionRule = VipInstallmentProductRule & {
  optionId: number;
  optionLabel: string;
  productName: string;
  optionActive: boolean;
  inheritedFromProduct: boolean;
};

let infrastructurePromise: Promise<void> | null = null;

function rowsOf<T>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

async function ensureColumn(db: any, column: string, definition: string) {
  const existing = await db.execute(sql.raw(`SHOW COLUMNS FROM vipInstallmentOptionRules LIKE '${column.replace(/'/g, "''")}'`));
  if (rowsOf<any>(existing).length > 0) return;
  await db.execute(sql.raw(`ALTER TABLE vipInstallmentOptionRules ADD COLUMN ${column} ${definition}`));
}

export async function ensureVipInstallmentOptionRuleInfrastructure() {
  if (!infrastructurePromise) {
    infrastructurePromise = (async () => {
      const db = (await getDb()) as any;
      if (!db) throw new Error("Banco de dados indisponível para regras VIP por categoria.");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vipInstallmentOptionRules (
          optionId INT NOT NULL PRIMARY KEY,
          productId INT NOT NULL,
          enabled TINYINT NOT NULL DEFAULT 0,
          minOrderCents BIGINT NULL,
          allowDaily TINYINT NULL,
          allowWeekly TINYINT NULL,
          allowMonthly TINYINT NULL,
          dailyMinInstallments INT NULL,
          dailyMaxInstallments INT NULL,
          dailyInterestBps INT NULL,
          dailyEntryMode VARCHAR(16) NULL,
          dailyEntryFixedCents BIGINT NULL,
          dailyEntryPercentBps INT NULL,
          weeklyMinInstallments INT NULL,
          weeklyMaxInstallments INT NULL,
          weeklyInterestBps INT NULL,
          weeklyEntryMode VARCHAR(16) NULL,
          weeklyEntryFixedCents BIGINT NULL,
          weeklyEntryPercentBps INT NULL,
          monthlyMinInstallments INT NULL,
          monthlyMaxInstallments INT NULL,
          monthlyInterestBps INT NULL,
          monthlyEntryMode VARCHAR(16) NULL,
          monthlyEntryFixedCents BIGINT NULL,
          monthlyEntryPercentBps INT NULL,
          dailyMode VARCHAR(16) NULL,
          notes VARCHAR(255) NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_vipInstallmentOptionRules_product (productId),
          KEY idx_vipInstallmentOptionRules_enabled (enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await ensureColumn(db, "productId", "INT NOT NULL AFTER optionId");
    })().catch((error) => {
      infrastructurePromise = null;
      throw error;
    });
  }
  await infrastructurePromise;
}

function bool(value: unknown): boolean | null {
  if (value == null) return null;
  return Number(value) === 1;
}
function num(value: unknown): number | null {
  return value == null ? null : Number(value);
}
function mode(value: unknown): VipInstallmentEntryMode | null {
  return value === "none" || value === "fixed" || value === "percent" ? value : null;
}

function mapStored(row: any): VipInstallmentProductRule {
  return {
    productId: Number(row.productId),
    enabled: Number(row.enabled) === 1,
    minOrderCents: num(row.minOrderCents),
    minInstallments: null,
    maxInstallments: null,
    interestBps: null,
    entryMode: null,
    entryFixedCents: null,
    entryPercentBps: null,
    allowDaily: bool(row.allowDaily),
    allowWeekly: bool(row.allowWeekly),
    allowMonthly: bool(row.allowMonthly),

    dailyMinInstallments: num(row.dailyMinInstallments),
    dailyMaxInstallments: num(row.dailyMaxInstallments),
    dailyInterestBps: num(row.dailyInterestBps),
    dailyEntryMode: mode(row.dailyEntryMode),
    dailyEntryFixedCents: num(row.dailyEntryFixedCents),
    dailyEntryPercentBps: num(row.dailyEntryPercentBps),

    weeklyMinInstallments: num(row.weeklyMinInstallments),
    weeklyMaxInstallments: num(row.weeklyMaxInstallments),
    weeklyInterestBps: num(row.weeklyInterestBps),
    weeklyEntryMode: mode(row.weeklyEntryMode),
    weeklyEntryFixedCents: num(row.weeklyEntryFixedCents),
    weeklyEntryPercentBps: num(row.weeklyEntryPercentBps),

    monthlyMinInstallments: num(row.monthlyMinInstallments),
    monthlyMaxInstallments: num(row.monthlyMaxInstallments),
    monthlyInterestBps: num(row.monthlyInterestBps),
    monthlyEntryMode: mode(row.monthlyEntryMode),
    monthlyEntryFixedCents: num(row.monthlyEntryFixedCents),
    monthlyEntryPercentBps: num(row.monthlyEntryPercentBps),

    dailyMode: row.dailyMode === "mon_sat" ? "mon_sat" : "all_days",
    notes: row.notes == null ? null : String(row.notes),
  };
}

async function optionIdentity(optionId: number) {
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco de dados indisponível.");
  const result = await db.execute(sql`
    SELECT o.id AS optionId, o.productId, o.label AS optionLabel, o.isActive AS optionActive,
           p.name AS productName, p.isActive AS productActive
    FROM productOptions o
    INNER JOIN products p ON p.id=o.productId
    WHERE o.id=${optionId}
    LIMIT 1
  `);
  return rowsOf<any>(result)[0] || null;
}

export async function getVipInstallmentOptionRule(optionId: number): Promise<VipInstallmentOptionRule> {
  await ensureVipInstallmentOptionRuleInfrastructure();
  const identity = await optionIdentity(optionId);
  if (!identity) throw new Error("Categoria/opção não encontrada.");
  const db = (await getDb()) as any;
  const result = await db.execute(sql`
    SELECT *
    FROM vipInstallmentOptionRules
    WHERE optionId=${optionId}
    LIMIT 1
  `);
  const stored = rowsOf<any>(result)[0];
  const rule = stored
    ? mapStored(stored)
    : await getVipInstallmentProductRule(Number(identity.productId));
  return {
    ...rule,
    productId: Number(identity.productId),
    optionId: Number(identity.optionId),
    optionLabel: String(identity.optionLabel || "Opção"),
    productName: String(identity.productName || "Produto"),
    optionActive: Number(identity.optionActive) === 1 && Number(identity.productActive) === 1,
    inheritedFromProduct: !stored,
  };
}

export async function listVipInstallmentOptionRules() {
  await ensureVipInstallmentOptionRuleInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco de dados indisponível.");
  const identitiesResult = await db.execute(sql`
    SELECT o.id AS optionId, o.productId, o.label AS optionLabel, o.isActive AS optionActive,
           p.name AS productName, p.isActive AS productActive, p.sortOrder AS productSort,
           o.sortOrder AS optionSort
    FROM productOptions o
    INNER JOIN products p ON p.id=o.productId
    ORDER BY p.sortOrder ASC, p.name ASC, o.sortOrder ASC, o.id ASC
  `);
  const identities = rowsOf<any>(identitiesResult);
  const result: VipInstallmentOptionRule[] = [];
  for (const row of identities) {
    const optionRule = await getVipInstallmentOptionRule(Number(row.optionId));
    result.push(optionRule);
  }
  return result;
}

export async function saveVipInstallmentOptionRule(input: {
  optionId: number;
  enabled: boolean;
  minOrderCents: number | null;
  allowDaily: boolean;
  allowWeekly: boolean;
  allowMonthly: boolean;
  dailyMinInstallments: number | null;
  dailyMaxInstallments: number | null;
  dailyInterestBps: number | null;
  dailyEntryMode: VipInstallmentEntryMode | null;
  dailyEntryFixedCents: number | null;
  dailyEntryPercentBps: number | null;
  weeklyMinInstallments: number | null;
  weeklyMaxInstallments: number | null;
  weeklyInterestBps: number | null;
  weeklyEntryMode: VipInstallmentEntryMode | null;
  weeklyEntryFixedCents: number | null;
  weeklyEntryPercentBps: number | null;
  monthlyMinInstallments: number | null;
  monthlyMaxInstallments: number | null;
  monthlyInterestBps: number | null;
  monthlyEntryMode: VipInstallmentEntryMode | null;
  monthlyEntryFixedCents: number | null;
  monthlyEntryPercentBps: number | null;
  dailyMode: "all_days" | "mon_sat" | null;
  notes: string | null;
}) {
  await ensureVipInstallmentOptionRuleInfrastructure();
  const identity = await optionIdentity(input.optionId);
  if (!identity) throw new Error("Categoria/opção não encontrada.");
  const productId = Number(identity.productId);
  const db = (await getDb()) as any;
  await db.execute(sql`
    INSERT INTO vipInstallmentOptionRules (
      optionId, productId, enabled, minOrderCents,
      allowDaily, allowWeekly, allowMonthly,
      dailyMinInstallments, dailyMaxInstallments, dailyInterestBps, dailyEntryMode, dailyEntryFixedCents, dailyEntryPercentBps,
      weeklyMinInstallments, weeklyMaxInstallments, weeklyInterestBps, weeklyEntryMode, weeklyEntryFixedCents, weeklyEntryPercentBps,
      monthlyMinInstallments, monthlyMaxInstallments, monthlyInterestBps, monthlyEntryMode, monthlyEntryFixedCents, monthlyEntryPercentBps,
      dailyMode, notes
    ) VALUES (
      ${input.optionId}, ${productId}, ${input.enabled ? 1 : 0}, ${input.minOrderCents},
      ${input.allowDaily ? 1 : 0}, ${input.allowWeekly ? 1 : 0}, ${input.allowMonthly ? 1 : 0},
      ${input.dailyMinInstallments}, ${input.dailyMaxInstallments}, ${input.dailyInterestBps}, ${input.dailyEntryMode}, ${input.dailyEntryFixedCents}, ${input.dailyEntryPercentBps},
      ${input.weeklyMinInstallments}, ${input.weeklyMaxInstallments}, ${input.weeklyInterestBps}, ${input.weeklyEntryMode}, ${input.weeklyEntryFixedCents}, ${input.weeklyEntryPercentBps},
      ${input.monthlyMinInstallments}, ${input.monthlyMaxInstallments}, ${input.monthlyInterestBps}, ${input.monthlyEntryMode}, ${input.monthlyEntryFixedCents}, ${input.monthlyEntryPercentBps},
      ${input.dailyMode}, ${input.notes}
    )
    ON DUPLICATE KEY UPDATE
      productId=VALUES(productId), enabled=VALUES(enabled), minOrderCents=VALUES(minOrderCents),
      allowDaily=VALUES(allowDaily), allowWeekly=VALUES(allowWeekly), allowMonthly=VALUES(allowMonthly),
      dailyMinInstallments=VALUES(dailyMinInstallments), dailyMaxInstallments=VALUES(dailyMaxInstallments),
      dailyInterestBps=VALUES(dailyInterestBps), dailyEntryMode=VALUES(dailyEntryMode),
      dailyEntryFixedCents=VALUES(dailyEntryFixedCents), dailyEntryPercentBps=VALUES(dailyEntryPercentBps),
      weeklyMinInstallments=VALUES(weeklyMinInstallments), weeklyMaxInstallments=VALUES(weeklyMaxInstallments),
      weeklyInterestBps=VALUES(weeklyInterestBps), weeklyEntryMode=VALUES(weeklyEntryMode),
      weeklyEntryFixedCents=VALUES(weeklyEntryFixedCents), weeklyEntryPercentBps=VALUES(weeklyEntryPercentBps),
      monthlyMinInstallments=VALUES(monthlyMinInstallments), monthlyMaxInstallments=VALUES(monthlyMaxInstallments),
      monthlyInterestBps=VALUES(monthlyInterestBps), monthlyEntryMode=VALUES(monthlyEntryMode),
      monthlyEntryFixedCents=VALUES(monthlyEntryFixedCents), monthlyEntryPercentBps=VALUES(monthlyEntryPercentBps),
      dailyMode=VALUES(dailyMode), notes=VALUES(notes)
  `);
  return getVipInstallmentOptionRule(input.optionId);
}

export function getVipInstallmentOptionFrequencyRule(
  rule: VipInstallmentOptionRule,
  frequency: VipInstallmentFrequency,
): VipInstallmentFrequencyRule {
  return getVipInstallmentFrequencyRule(rule, frequency);
}
