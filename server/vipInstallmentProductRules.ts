import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type VipInstallmentProductRule = {
  productId: number;
  enabled: boolean;
  minOrderCents: number | null;
  maxInstallments: number | null;
  interestBps: number | null;
  allowDaily: boolean | null;
  allowWeekly: boolean | null;
  allowMonthly: boolean | null;
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
          maxInstallments INT NULL,
          interestBps INT NULL,
          allowDaily TINYINT NULL,
          allowWeekly TINYINT NULL,
          allowMonthly TINYINT NULL,
          notes VARCHAR(255) NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_vipInstallmentProductRules_enabled (enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      infrastructurePromise = null;
      throw error;
    });
  }
  await infrastructurePromise;
}

export async function getVipInstallmentProductRule(productId: number): Promise<VipInstallmentProductRule> {
  await ensureVipInstallmentProductRuleInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco de dados indisponível.");
  const result = await db.execute(sql`
    SELECT productId, enabled, minOrderCents, maxInstallments, interestBps,
           allowDaily, allowWeekly, allowMonthly, notes
    FROM vipInstallmentProductRules
    WHERE productId=${productId}
    LIMIT 1
  `);
  const row = rowsOf<any>(result)[0];
  if (!row) {
    return {
      productId,
      enabled: false,
      minOrderCents: null,
      maxInstallments: null,
      interestBps: null,
      allowDaily: null,
      allowWeekly: null,
      allowMonthly: null,
      notes: null,
    };
  }
  return {
    productId: Number(row.productId),
    enabled: Number(row.enabled) === 1,
    minOrderCents: row.minOrderCents == null ? null : Number(row.minOrderCents),
    maxInstallments: row.maxInstallments == null ? null : Number(row.maxInstallments),
    interestBps: row.interestBps == null ? null : Number(row.interestBps),
    allowDaily: nullableBool(row.allowDaily),
    allowWeekly: nullableBool(row.allowWeekly),
    allowMonthly: nullableBool(row.allowMonthly),
    notes: row.notes == null ? null : String(row.notes),
  };
}

export async function listVipInstallmentProductRules() {
  await ensureVipInstallmentProductRuleInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco de dados indisponível.");
  const result = await db.execute(sql`
    SELECT p.id AS productId, p.name AS productName, p.isActive,
           COALESCE(r.enabled, 0) AS enabled,
           r.minOrderCents, r.maxInstallments, r.interestBps,
           r.allowDaily, r.allowWeekly, r.allowMonthly, r.notes
    FROM products p
    LEFT JOIN vipInstallmentProductRules r ON r.productId=p.id
    ORDER BY p.sortOrder ASC, p.name ASC, p.id ASC
  `);
  return rowsOf<any>(result).map((row) => ({
    productId: Number(row.productId),
    productName: String(row.productName || "Produto"),
    isActive: Number(row.isActive) === 1,
    enabled: Number(row.enabled) === 1,
    minOrderCents: row.minOrderCents == null ? null : Number(row.minOrderCents),
    maxInstallments: row.maxInstallments == null ? null : Number(row.maxInstallments),
    interestBps: row.interestBps == null ? null : Number(row.interestBps),
    allowDaily: nullableBool(row.allowDaily),
    allowWeekly: nullableBool(row.allowWeekly),
    allowMonthly: nullableBool(row.allowMonthly),
    notes: row.notes == null ? null : String(row.notes),
  }));
}

export async function saveVipInstallmentProductRule(input: VipInstallmentProductRule) {
  await ensureVipInstallmentProductRuleInfrastructure();
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco de dados indisponível.");
  const productResult = await db.execute(sql`SELECT id FROM products WHERE id=${input.productId} LIMIT 1`);
  if (!rowsOf<any>(productResult)[0]) throw new Error("Produto não encontrado.");
  await db.execute(sql`
    INSERT INTO vipInstallmentProductRules
      (productId, enabled, minOrderCents, maxInstallments, interestBps, allowDaily, allowWeekly, allowMonthly, notes)
    VALUES
      (${input.productId}, ${input.enabled ? 1 : 0}, ${input.minOrderCents}, ${input.maxInstallments}, ${input.interestBps},
       ${input.allowDaily == null ? null : input.allowDaily ? 1 : 0},
       ${input.allowWeekly == null ? null : input.allowWeekly ? 1 : 0},
       ${input.allowMonthly == null ? null : input.allowMonthly ? 1 : 0}, ${input.notes})
    ON DUPLICATE KEY UPDATE
      enabled=VALUES(enabled), minOrderCents=VALUES(minOrderCents), maxInstallments=VALUES(maxInstallments),
      interestBps=VALUES(interestBps), allowDaily=VALUES(allowDaily), allowWeekly=VALUES(allowWeekly),
      allowMonthly=VALUES(allowMonthly), notes=VALUES(notes)
  `);
  return getVipInstallmentProductRule(input.productId);
}
