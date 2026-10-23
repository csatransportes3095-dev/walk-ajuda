import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

const kindSchema = z.enum(["placa", "chassi"]);

function normalizeVehicleValue(kind: "placa" | "chassi", raw: string) {
  const value = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (kind === "placa") {
    if (value.length !== 7) throw new TRPCError({ code: "BAD_REQUEST", message: "Placa inválida. Informe 7 caracteres." });
  } else {
    if (value.length < 8 || value.length > 30) throw new TRPCError({ code: "BAD_REQUEST", message: "Chassi inválido." });
  }
  return value;
}

async function ensureRegistry() {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS vehicle_usage_registry (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(16) NOT NULL,
      normalizedValue VARCHAR(40) NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_vehicle_usage_type_value (type, normalizedValue),
      KEY idx_vehicle_usage_value (normalizedValue)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));
  return db;
}

export const vehicleUsageRouter = router({
  check: adminProcedure.input(z.object({
    type: kindSchema,
    value: z.string().min(1).max(80),
  }).strict()).query(async ({ input }) => {
    const db = await ensureRegistry();
    const normalizedValue = normalizeVehicleValue(input.type, input.value);
    const result = await db.execute(sql`
      SELECT id, type, normalizedValue, createdAt
      FROM vehicle_usage_registry
      WHERE type=${input.type} AND normalizedValue=${normalizedValue}
      LIMIT 1
    `);
    const rows = (result[0] as any[]) || [];
    return { exists: rows.length > 0, normalizedValue, record: rows[0] || null };
  }),

  save: adminProcedure.input(z.object({
    type: kindSchema,
    value: z.string().min(1).max(80),
  }).strict()).mutation(async ({ input }) => {
    const db = await ensureRegistry();
    const normalizedValue = normalizeVehicleValue(input.type, input.value);
    try {
      await db.execute(sql`
        INSERT INTO vehicle_usage_registry (type, normalizedValue)
        VALUES (${input.type}, ${normalizedValue})
      `);
      return { saved: true, exists: true, normalizedValue };
    } catch (error: any) {
      const message = String(error?.message || "");
      if (/duplicate|uq_vehicle_usage_type_value|1062/i.test(message)) {
        return { saved: false, exists: true, normalizedValue };
      }
      throw error;
    }
  }),
});
