import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";

export type OptionPriceModel = {
  id: number;
  optionId: number;
  label: string;
  price: string;
  originalPrice: string | null;
  promoStartsAt: number | null;
  promoEndsAt: number | null;
  sortOrder: number;
  isActive: number;
  selectorLabel?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

let infrastructurePromise: Promise<void> | null = null;

function asRows<T = any>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

async function ensureInfrastructure() {
  if (infrastructurePromise) return infrastructurePromise;
  infrastructurePromise = (async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível.");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS optionPriceModels (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        optionId INT NOT NULL,
        label VARCHAR(128) NOT NULL,
        price VARCHAR(64) NOT NULL,
        originalPrice VARCHAR(64) DEFAULT '',
        promoEndsAt BIGINT NULL,
        sortOrder INT NOT NULL DEFAULT 0,
        isActive INT NOT NULL DEFAULT 1,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_optionPriceModels_option_label (optionId, label),
        KEY idx_optionPriceModels_optionId (optionId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS optionPriceModelSettings (
        optionId INT NOT NULL PRIMARY KEY,
        selectorLabel VARCHAR(128) NOT NULL DEFAULT 'Modelo / categoria',
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Preset solicitado para o produto atual. É idempotente por causa da chave única.
    // Fica DENTRO da opção "PARA UBER E 99", não cria produto nem opção nova.
    await db.execute(sql`
      INSERT IGNORE INTO optionPriceModels (optionId, label, price, originalPrice, sortOrder, isActive)
      SELECT o.id, 'SÓ PARA BLOCO', '100,00', '150,00', 0, 1
      FROM productOptions o
      INNER JOIN products p ON p.id = o.productId
      WHERE p.name LIKE '%DOC%' AND p.name LIKE '%VEIC%'
        AND o.label LIKE '%UBER%' AND o.label LIKE '%99%'
    `);
    await db.execute(sql`
      INSERT IGNORE INTO optionPriceModels (optionId, label, price, originalPrice, sortOrder, isActive)
      SELECT o.id, 'SOMENTE VIAGEM', '150,00', '200,00', 1, 1
      FROM productOptions o
      INNER JOIN products p ON p.id = o.productId
      WHERE p.name LIKE '%DOC%' AND p.name LIKE '%VEIC%'
        AND o.label LIKE '%UBER%' AND o.label LIKE '%99%'
    `);
    await db.execute(sql`
      INSERT IGNORE INTO optionPriceModels (optionId, label, price, originalPrice, sortOrder, isActive)
      SELECT o.id, 'COMPLETO', '300,00', '350,00', 2, 1
      FROM productOptions o
      INNER JOIN products p ON p.id = o.productId
      WHERE p.name LIKE '%DOC%' AND p.name LIKE '%VEIC%'
        AND o.label LIKE '%UBER%' AND o.label LIKE '%99%'
    `);
  })().catch(error => {
    infrastructurePromise = null;
    throw error;
  });
  return infrastructurePromise;
}

async function listModels(optionIds: number[], onlyActive: boolean): Promise<OptionPriceModel[]> {
  if (optionIds.length === 0) return [];
  await ensureInfrastructure();
  const db = await getDb();
  if (!db) return [];
  const safeIds = optionIds.filter(Number.isFinite).map(Number);
  if (safeIds.length === 0) return [];
  const idList = safeIds.join(",");
  const activeSql = onlyActive ? " AND m.isActive = 1" : "";
  const result = await db.execute(sql.raw(`
    SELECT m.id, m.optionId, m.label, m.price, m.originalPrice,
           CASE WHEN COALESCE(TRIM(m.originalPrice), '') <> '' THEN UNIX_TIMESTAMP(m.updatedAt) * 1000 ELSE NULL END AS promoStartsAt,
           m.promoEndsAt, m.sortOrder, m.isActive,
           m.createdAt, m.updatedAt, COALESCE(s.selectorLabel, 'Modelo / categoria') AS selectorLabel
    FROM optionPriceModels m
    LEFT JOIN optionPriceModelSettings s ON s.optionId = m.optionId
    WHERE m.optionId IN (${idList})${activeSql}
    ORDER BY m.optionId ASC, m.sortOrder ASC, m.id ASC
  `));
  const rows = asRows<OptionPriceModel>(result).map(row => ({
    ...row,
    id: Number(row.id),
    optionId: Number(row.optionId),
    promoStartsAt: row.promoStartsAt == null ? null : Number(row.promoStartsAt),
    promoEndsAt: row.promoEndsAt == null ? null : Number(row.promoEndsAt),
    sortOrder: Number(row.sortOrder || 0),
    isActive: Number(row.isActive || 0),
  }));

  const now = Date.now();
  for (const row of rows) {
    if (row.promoEndsAt && row.promoEndsAt <= now && row.originalPrice?.trim()) {
      await db.execute(sql`
        UPDATE optionPriceModels
        SET price=${row.originalPrice}, originalPrice='', promoEndsAt=NULL
        WHERE id=${row.id}
      `);
      row.price = row.originalPrice;
      row.originalPrice = '';
      row.promoStartsAt = null;
      row.promoEndsAt = null;
    }
  }
  return rows;
}

const modelInput = z.object({
  optionId: z.number().int().positive(),
  label: z.string().trim().min(1).max(128),
  price: z.string().trim().min(1).max(64),
  originalPrice: z.string().max(64).optional().default(""),
  promoEndsAt: z.number().nullable().optional(),
  sortOrder: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const optionPriceModelsRouter = router({
  listActive: publicProcedure
    .input(z.object({ optionIds: z.array(z.number().int().positive()).max(200) }))
    .query(async ({ input }) => listModels([...new Set(input.optionIds)], true)),

  list: adminProcedure
    .input(z.object({ optionId: z.number().int().positive() }))
    .query(async ({ input }) => listModels([input.optionId], false)),

  getSettings: adminProcedure
    .input(z.object({ optionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await ensureInfrastructure();
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      const result = await db.execute(sql`
        SELECT selectorLabel FROM optionPriceModelSettings WHERE optionId=${input.optionId} LIMIT 1
      `);
      const row = asRows<{ selectorLabel?: string | null }>(result)[0];
      return { selectorLabel: row?.selectorLabel?.trim() || "Modelo / categoria" };
    }),

  updateSettings: adminProcedure
    .input(z.object({ optionId: z.number().int().positive(), selectorLabel: z.string().trim().min(1).max(128) }))
    .mutation(async ({ input }) => {
      await ensureInfrastructure();
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      await db.execute(sql`
        INSERT INTO optionPriceModelSettings (optionId, selectorLabel)
        VALUES (${input.optionId}, ${input.selectorLabel})
        ON DUPLICATE KEY UPDATE selectorLabel=VALUES(selectorLabel)
      `);
      return { success: true };
    }),

  create: adminProcedure
    .input(modelInput)
    .mutation(async ({ input }) => {
      await ensureInfrastructure();
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      const result: any = await db.execute(sql`
        INSERT INTO optionPriceModels
          (optionId, label, price, originalPrice, promoEndsAt, sortOrder, isActive)
        VALUES
          (${input.optionId}, ${input.label}, ${input.price}, ${input.originalPrice || ''}, ${input.promoEndsAt ?? null}, ${input.sortOrder}, ${input.isActive ? 1 : 0})
      `);
      const insertId = Number(result?.[0]?.insertId || result?.insertId || 0);
      const rows = await listModels([input.optionId], false);
      return rows.find(row => row.id === insertId) || rows[rows.length - 1];
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      optionId: z.number().int().positive(),
      label: z.string().trim().min(1).max(128),
      price: z.string().trim().min(1).max(64),
      originalPrice: z.string().max(64).optional().default(""),
      promoEndsAt: z.number().nullable().optional(),
      sortOrder: z.number().int().min(0).optional().default(0),
      isActive: z.boolean().optional().default(true),
    }))
    .mutation(async ({ input }) => {
      await ensureInfrastructure();
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      await db.execute(sql`
        UPDATE optionPriceModels
        SET label=${input.label}, price=${input.price}, originalPrice=${input.originalPrice || ''},
            promoEndsAt=${input.promoEndsAt ?? null}, sortOrder=${input.sortOrder}, isActive=${input.isActive ? 1 : 0}
        WHERE id=${input.id} AND optionId=${input.optionId}
      `);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await ensureInfrastructure();
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      await db.execute(sql`DELETE FROM optionPriceModels WHERE id=${input.id}`);
      return { success: true };
    }),
});
