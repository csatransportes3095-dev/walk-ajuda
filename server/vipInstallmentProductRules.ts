import { sql } from "drizzle-orm";
import { getDb } from "./db";
import type { VipInstallmentFrequency } from "../shared/vipInstallments";

export type VipInstallmentEntryMode = "none" | "fixed" | "percent";

export type VipInstallmentFrequencyRule = {
  enabled: boolean;
  minInstallments: number | null;
  maxInstallments: number | null;
  interestBps: number | null;
  entryMode: VipInstallmentEntryMode | null;
  entryFixedCents: number | null;
  entryPercentBps: number | null;
};

export type VipInstallmentProductRule = {
  productId: number;
  enabled: boolean;
  minOrderCents: number | null;

  // Campos legados mantidos somente para migração/compatibilidade.
  minInstallments: number | null;
  maxInstallments: number | null;
  interestBps: number | null;
  entryMode: VipInstallmentEntryMode | null;
  entryFixedCents: number | null;
  entryPercentBps: number | null;
  allowDaily: boolean | null;
  allowWeekly: boolean | null;
  allowMonthly: boolean | null;

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
};

let infrastructurePromise: Promise<void> | null = null;

function rowsOf<T>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function nullableBool(value: unknown): boolean | null {
  if (value == null) return null;
  return Number(value) === 1;
}

function entryMode(value: unknown): VipInstallmentEntryMode | null {
  return value === "fixed" || value === "percent" || value === "none" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

async function ensureColumn(db: any, column: string, definition: string) {
  const existing = await db.execute(sql.raw(`SHOW COLUMNS FROM vipInstallmentProductRules LIKE '${column.replace(/'/g, "''")}'`));
  if (rowsOf<any>(existing).length > 0) return;
  await db.execute(sql.raw(`ALTER TABLE vipInstallmentProductRules ADD COLUMN ${column} ${definition}`));
}

export async function ensureVipInstallmentProductRuleInfrastructure() {
  if (!infrastructurePromise) {
    infrastructurePromise = (async () => {
      const db = (await getDb()) as any;
      if (!db) throw new Error("Banco de dados indisponível para regras de Parcelamento VIP.");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vipInstallmentProductRules (
          productId INT NOT NULL PRIMARY KEY,
          enabled TINYINT NOT NULL DEFAULT 0,
          minOrderCents BIGINT NULL,
          minInstallments INT NULL,
          maxInstallments INT NULL,
          interestBps INT NULL,
          entryMode VARCHAR(16) NULL,
          entryFixedCents BIGINT NULL,
          entryPercentBps INT NULL,
          allowDaily TINYINT NULL,
          allowWeekly TINYINT NULL,
          allowMonthly TINYINT NULL,
          dailyMode VARCHAR(16) NULL,
          notes VARCHAR(255) NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_vipInstallmentProductRules_enabled (enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await ensureColumn(db, "minInstallments", "INT NULL AFTER minOrderCents");
      await ensureColumn(db, "entryMode", "VARCHAR(16) NULL AFTER interestBps");
      await ensureColumn(db, "entryFixedCents", "BIGINT NULL AFTER entryMode");
      await ensureColumn(db, "entryPercentBps", "INT NULL AFTER entryFixedCents");
      await ensureColumn(db, "dailyMode", "VARCHAR(16) NULL AFTER allowMonthly");

      for (const prefix of ["daily", "weekly", "monthly"] as const) {
        await ensureColumn(db, `${prefix}MinInstallments`, "INT NULL");
        await ensureColumn(db, `${prefix}MaxInstallments`, "INT NULL");
        await ensureColumn(db, `${prefix}InterestBps`, "INT NULL");
        await ensureColumn(db, `${prefix}EntryMode`, "VARCHAR(16) NULL");
        await ensureColumn(db, `${prefix}EntryFixedCents`, "BIGINT NULL");
        await ensureColumn(db, `${prefix}EntryPercentBps`, "INT NULL");
      }
    })().catch((error) => {
      infrastructurePromise = null;
      throw error;
    });
  }
  await infrastructurePromise;
}

function mapRule(row: any, productId: number): VipInstallmentProductRule {
  if (!row) {
    return {
      productId,
      enabled: false,
      minOrderCents: null,
      minInstallments: null,
      maxInstallments: null,
      interestBps: null,
      entryMode: null,
      entryFixedCents: null,
      entryPercentBps: null,
      allowDaily: null,
      allowWeekly: null,
      allowMonthly: null,
      dailyMinInstallments: null,
      dailyMaxInstallments: null,
      dailyInterestBps: null,
      dailyEntryMode: null,
      dailyEntryFixedCents: null,
      dailyEntryPercentBps: null,
      weeklyMinInstallments: null,
      weeklyMaxInstallments: null,
      weeklyInterestBps: null,
      weeklyEntryMode: null,
      weeklyEntryFixedCents: null,
      weeklyEntryPercentBps: null,
      monthlyMinInstallments: null,
      monthlyMaxInstallments: null,
      monthlyInterestBps: null,
      monthlyEntryMode: null,
      monthlyEntryFixedCents: null,
      monthlyEntryPercentBps: null,
      dailyMode: null,
      notes: null,
    };
  }
  return {
    productId: Number(row.productId),
    enabled: Number(row.enabled) === 1,
    minOrderCents: nullableNumber(row.minOrderCents),
    minInstallments: nullableNumber(row.minInstallments),
    maxInstallments: nullableNumber(row.maxInstallments),
    interestBps: nullableNumber(row.interestBps),
    entryMode: entryMode(row.entryMode),
    entryFixedCents: nullableNumber(row.entryFixedCents),
    entryPercentBps: nullableNumber(row.entryPercentBps),
    allowDaily: nullableBool(row.allowDaily),
    allowWeekly: nullableBool(row.allowWeekly),
    allowMonthly: nullableBool(row.allowMonthly),

    dailyMinInstallments: nullableNumber(row.dailyMinInstallments),
    dailyMaxInstallments: nullableNumber(row.dailyMaxInstallments),
    dailyInterestBps: nullableNumber(row.dailyInterestBps),
    dailyEntryMode: entryMode(row.dailyEntryMode),
    dailyEntryFixedCents: nullableNumber(row.dailyEntryFixedCents),
    dailyEntryPercentBps: nullableNumber(row.dailyEntryPercentBps),

    weeklyMinInstallments: nullableNumber(row.weeklyMinInstallments),
    weeklyMaxInstallments: nullableNumber(row.weeklyMaxInstallments),
    weeklyInterestBps: nullableNumber(row.weeklyInterestBps),
    weeklyEntryMode: entryMode(row.weeklyEntryMode),
    weeklyEntryFixedCents: nullableNumber(row.weeklyEntryFixedCents),
    weeklyEntryPercentBps: nullableNumber(row.weeklyEntryPercentBps),

    monthlyMinInstallments: nullableNumber(row.monthlyMinInstallments),
    monthlyMaxInstallments: nullableNumber(row.monthlyMaxInstallments),
    monthlyInterestBps: nullableNumber(row.monthlyInterestBps),
    monthlyEntryMode: entryMode(row.monthlyEntryMode),
    monthlyEntryFixedCents: nullableNumber(row.monthlyEntryFixedCents),
    monthlyEntryPercentBps: nullableNumber(row.monthlyEntryPercentBps),

    dailyMode: row.dailyMode === "mon_sat" || row.dailyMode === "all_days" ? row.dailyMode : null,
    notes: row.notes == null ? null : String(row.notes),
  };
}

export function getVipInstallmentFrequencyRule(
  rule: VipInstallmentProductRule,
  frequency: VipInstallmentFrequency,
): VipInstallmentFrequencyRule {
  const enabled = frequency === "daily"
    ? rule.allowDaily === true
    : frequency === "weekly"
      ? rule.allowWeekly === true
      : rule.allowMonthly === true;

  const prefix = frequency === "daily" ? "daily" : frequency === "weekly" ? "weekly" : "monthly";
  const minInstallments = rule[`${prefix}MinInstallments` as keyof VipInstallmentProductRule] as number | null;
  const maxInstallments = rule[`${prefix}MaxInstallments` as keyof VipInstallmentProductRule] as number | null;
  const interestBps = rule[`${prefix}InterestBps` as keyof VipInstallmentProductRule] as number | null;
  const mode = rule[`${prefix}EntryMode` as keyof VipInstallmentProductRule] as VipInstallmentEntryMode | null;
  const fixed = rule[`${prefix}EntryFixedCents` as keyof VipInstallmentProductRule] as number | null;
  const percent = rule[`${prefix}EntryPercentBps` as keyof VipInstallmentProductRule] as number | null;

  // Compatibilidade: antes da primeira gravação do novo formulário, usa a regra antiga
  // apenas como ponto de partida. Depois cada modalidade possui seus próprios campos.
  const hasOwnRule = minInstallments != null || maxInstallments != null || interestBps != null || mode != null;
  return {
    enabled,
    minInstallments: hasOwnRule ? minInstallments : rule.minInstallments,
    maxInstallments: hasOwnRule ? maxInstallments : rule.maxInstallments,
    interestBps: hasOwnRule ? interestBps : rule.interestBps,
    entryMode: hasOwnRule ? mode : rule.entryMode,
    entryFixedCents: hasOwnRule ? fixed : rule.entryFixedCents,
    entryPercentBps: hasOwnRule ? percent : rule.entryPercentBps,
  };
}

const SELECT_FIELDS = sql.raw(`
  productId, enabled, minOrderCents, minInstallments, maxInstallments, interestBps,
  entryMode, entryFixedCents, entryPercentBps,
  allowDaily, allowWeekly, allowMonthly,
  dailyMinInstallments, dailyMaxInstallments, dailyInterestBps, dailyEntryMode, dailyEntryFixedCents, dailyEntryPercentBps,
  weeklyMinInstallments, weeklyMaxInstallments, weeklyInterestBps, weeklyEntryMode, weeklyEntryFixedCents, weeklyEntryPercentBps,
  monthlyMinInstallments, monthlyMaxInstallments, monthlyInterestBps, monthlyEntryMode, monthlyEntryFixedCents, monthlyEntryPercentBps,
  dailyMode, notes
`);

export async function getVipInstallmentProductRule(productId: number): Promise<VipInstallmentProductRule> {
  await ensureVipInstallmentProductRuleInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco de dados indisponível.");
  const result = await db.execute(sql.raw(`SELECT ${SELECT_FIELDS.sql} FROM vipInstallmentProductRules WHERE productId=${Number(productId)} LIMIT 1`));
  return mapRule(rowsOf<any>(result)[0], productId);
}

export async function listVipInstallmentProductRules() {
  await ensureVipInstallmentProductRuleInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco de dados indisponível.");
  const result = await db.execute(sql`
    SELECT p.id AS productId, p.name AS productName, p.isActive,
           COALESCE(r.enabled, 0) AS enabled,
           r.minOrderCents, r.minInstallments, r.maxInstallments, r.interestBps,
           r.entryMode, r.entryFixedCents, r.entryPercentBps,
           r.allowDaily, r.allowWeekly, r.allowMonthly,
           r.dailyMinInstallments, r.dailyMaxInstallments, r.dailyInterestBps, r.dailyEntryMode, r.dailyEntryFixedCents, r.dailyEntryPercentBps,
           r.weeklyMinInstallments, r.weeklyMaxInstallments, r.weeklyInterestBps, r.weeklyEntryMode, r.weeklyEntryFixedCents, r.weeklyEntryPercentBps,
           r.monthlyMinInstallments, r.monthlyMaxInstallments, r.monthlyInterestBps, r.monthlyEntryMode, r.monthlyEntryFixedCents, r.monthlyEntryPercentBps,
           r.dailyMode, r.notes
    FROM products p
    LEFT JOIN vipInstallmentProductRules r ON r.productId=p.id
    ORDER BY p.sortOrder ASC, p.name ASC, p.id ASC
  `);
  return rowsOf<any>(result).map((row) => ({
    productName: String(row.productName || "Produto"),
    isActive: Number(row.isActive) === 1,
    ...mapRule(row, Number(row.productId)),
  }));
}

export async function saveVipInstallmentProductRule(input: VipInstallmentProductRule) {
  await ensureVipInstallmentProductRuleInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco de dados indisponível.");
  const productResult = await db.execute(sql`SELECT id FROM products WHERE id=${input.productId} LIMIT 1`);
  if (!rowsOf<any>(productResult)[0]) throw new Error("Produto não encontrado.");

  await db.execute(sql`
    INSERT INTO vipInstallmentProductRules (
      productId, enabled, minOrderCents,
      minInstallments, maxInstallments, interestBps, entryMode, entryFixedCents, entryPercentBps,
      allowDaily, allowWeekly, allowMonthly,
      dailyMinInstallments, dailyMaxInstallments, dailyInterestBps, dailyEntryMode, dailyEntryFixedCents, dailyEntryPercentBps,
      weeklyMinInstallments, weeklyMaxInstallments, weeklyInterestBps, weeklyEntryMode, weeklyEntryFixedCents, weeklyEntryPercentBps,
      monthlyMinInstallments, monthlyMaxInstallments, monthlyInterestBps, monthlyEntryMode, monthlyEntryFixedCents, monthlyEntryPercentBps,
      dailyMode, notes
    ) VALUES (
      ${input.productId}, ${input.enabled ? 1 : 0}, ${input.minOrderCents},
      ${input.minInstallments}, ${input.maxInstallments}, ${input.interestBps}, ${input.entryMode}, ${input.entryFixedCents}, ${input.entryPercentBps},
      ${input.allowDaily == null ? null : input.allowDaily ? 1 : 0},
      ${input.allowWeekly == null ? null : input.allowWeekly ? 1 : 0},
      ${input.allowMonthly == null ? null : input.allowMonthly ? 1 : 0},
      ${input.dailyMinInstallments}, ${input.dailyMaxInstallments}, ${input.dailyInterestBps}, ${input.dailyEntryMode}, ${input.dailyEntryFixedCents}, ${input.dailyEntryPercentBps},
      ${input.weeklyMinInstallments}, ${input.weeklyMaxInstallments}, ${input.weeklyInterestBps}, ${input.weeklyEntryMode}, ${input.weeklyEntryFixedCents}, ${input.weeklyEntryPercentBps},
      ${input.monthlyMinInstallments}, ${input.monthlyMaxInstallments}, ${input.monthlyInterestBps}, ${input.monthlyEntryMode}, ${input.monthlyEntryFixedCents}, ${input.monthlyEntryPercentBps},
      ${input.dailyMode}, ${input.notes}
    )
    ON DUPLICATE KEY UPDATE
      enabled=VALUES(enabled), minOrderCents=VALUES(minOrderCents),
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
  return getVipInstallmentProductRule(input.productId);
}
