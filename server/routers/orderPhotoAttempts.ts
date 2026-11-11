import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

/**
 * Controle administrativo de ate tres realizacoes de foto por pedido/subpedido.
 * Independente de agendamento, biometria, confirmacao para foto e status do pedido.
 * Os registros ficam no MySQL (nunca apenas no navegador do administrador).
 */
const orderKey = z.object({
  registrationId: z.number().int().positive(),
  subOrderIndex: z.number().int().min(0).max(999),
}).strict();

const slotSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const saveSchema = orderKey.extend({
  slot: slotSchema,
  completed: z.boolean(),
  completedAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().max(220).default(""),
}).strict();

let tablePromise: Promise<void> | null = null;

async function database() {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Banco indisponível para salvar o controle de fotos.",
  });
  if (!tablePromise) {
    tablePromise = db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS order_photo_attempt_controls (
        registrationId INT NOT NULL,
        subOrderIndex SMALLINT NOT NULL DEFAULT 0,
        photoSlot TINYINT NOT NULL,
        completed TINYINT NOT NULL DEFAULT 0,
        completedAt VARCHAR(35) NULL,
        note VARCHAR(220) NOT NULL DEFAULT '',
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (registrationId, subOrderIndex, photoSlot)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)).then(() => undefined).catch((error: unknown) => {
      tablePromise = null;
      throw error;
    });
  }
  await tablePromise;
  return db;
}

function selectRows(result: any): any[] {
  return Array.isArray(result?.[0]) ? result[0] : [];
}

export const orderPhotoAttemptsRouter = router({
  // Uma consulta para todos os cards fechados: evita uma requisicao por pedido.
  // Retorna somente os marcadores efetivamente assinalados, sem dados pessoais.
  overview: adminProcedure.query(async () => {
    const db = await database();
    const result = await db.execute(sql`
      SELECT registrationId, subOrderIndex, photoSlot
      FROM order_photo_attempt_controls
      WHERE completed=1 AND photoSlot IN (1,2,3)
    `);
    return selectRows(result).map((row: any) => ({
      registrationId: Number(row.registrationId),
      subOrderIndex: Number(row.subOrderIndex),
      slot: Number(row.photoSlot),
    }));
  }),

  get: adminProcedure.input(orderKey).query(async ({ input }) => {
    const db = await database();
    const result = await db.execute(sql`
      SELECT photoSlot,completed,completedAt,note
      FROM order_photo_attempt_controls
      WHERE registrationId=${input.registrationId}
        AND subOrderIndex=${input.subOrderIndex}
        AND photoSlot IN (1,2,3)
      ORDER BY photoSlot
    `);
    const saved = new Map<number, any>(
      selectRows(result).map((row: any) => [Number(row.photoSlot), row])
    );
    return ([1, 2, 3] as const).map(slot => {
      const row = saved.get(slot);
      return {
        slot,
        completed: Boolean(Number(row?.completed || 0)),
        completedAt: row?.completedAt ? String(row.completedAt) : null,
        note: String(row?.note || ""),
      };
    });
  }),

  save: adminProcedure.input(saveSchema).mutation(async ({ input }) => {
    const db = await database();
    const completedAt = input.completed
      ? (input.completedAt ?? new Date().toISOString())
      : null;
    // Impede datas invalidas e futuras absurdas por erro de digitacao.
    if (completedAt) {
      const timestamp = Date.parse(completedAt);
      if (!Number.isFinite(timestamp) || timestamp < Date.UTC(2020, 0, 1) ||
          timestamp > Date.now() + 5 * 60_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data ou horário da foto inválido." });
      }
    }
    const note = input.note.trim();
    await db.execute(sql`
      INSERT INTO order_photo_attempt_controls
        (registrationId,subOrderIndex,photoSlot,completed,completedAt,note)
      VALUES
        (${input.registrationId},${input.subOrderIndex},${input.slot},
         ${input.completed ? 1 : 0},${completedAt},${note})
      ON DUPLICATE KEY UPDATE
        completed=VALUES(completed),
        completedAt=VALUES(completedAt),
        note=VALUES(note)
    `);
    return {
      success: true,
      slot: input.slot,
      completed: input.completed,
      completedAt,
      note,
    };
  }),
});
