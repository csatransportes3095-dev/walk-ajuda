import { z } from "zod";
import { router, adminProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql as drizzleSql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

async function qRows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  // drizzle mysql2 returns [rows, fields] tuple
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

const questionOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const preCadastroQuestionsRouter = router({
  // Listar perguntas ativas (público — para o formulário)
  listActive: publicProcedure.query(async () => {
    const db = await getDb() as any;
    const rows = await qRows(db, drizzleSql`
      SELECT * FROM preCadastroQuestions WHERE active = 1 ORDER BY sortOrder ASC, id ASC
    `);
    return rows.map((r: any) => ({
      ...r,
      options: r.options ? (typeof r.options === "string" ? JSON.parse(r.options) : r.options) : null,
      required: Boolean(r.required),
      active: Boolean(r.active),
      parentQuestionId: r.parentQuestionId ?? null,
      triggerOption: r.triggerOption ?? null,
    }));
  }),

  // Listar todas (admin)
  listAll: adminProcedure.query(async () => {
    const db = await getDb() as any;
    const rows = await qRows(db, drizzleSql`
      SELECT * FROM preCadastroQuestions ORDER BY sortOrder ASC, id ASC
    `);
    return rows.map((r: any) => ({
      ...r,
      options: r.options ? (typeof r.options === "string" ? JSON.parse(r.options) : r.options) : null,
      required: Boolean(r.required),
      active: Boolean(r.active),
      isSystem: Boolean(r.isSystem),
      parentQuestionId: r.parentQuestionId ?? null,
      triggerOption: r.triggerOption ?? null,
    }));
  }),

  // Criar nova pergunta
  create: adminProcedure
    .input(z.object({
      label: z.string().min(1).max(300),
      fieldKey: z.string().min(2).max(100).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Use apenas letras, números e _"),
      fieldType: z.enum(["text", "email", "number", "phone", "cpf", "radio", "select", "textarea", "informativo"]),
      options: z.array(questionOptionSchema).optional(),
      placeholder: z.string().max(5000).optional(),
      required: z.boolean().default(true),
      active: z.boolean().default(true),
      sortOrder: z.number().int().default(99),
      parentQuestionId: z.number().int().nullable().optional(),
      triggerOption: z.string().max(200).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const now = Date.now();
      const optionsJson = input.options ? JSON.stringify(input.options) : null;
      await db.execute(drizzleSql`
        INSERT INTO preCadastroQuestions (label, fieldKey, fieldType, options, placeholder, required, active, sortOrder, parentQuestionId, triggerOption, createdAt, updatedAt)
        VALUES (${input.label}, ${input.fieldKey}, ${input.fieldType}, ${optionsJson}, ${input.placeholder || null}, ${input.required ? 1 : 0}, ${input.active ? 1 : 0}, ${input.sortOrder}, ${input.parentQuestionId ?? null}, ${input.triggerOption ?? null}, ${now}, ${now})
      `);
      return { ok: true };
    }),

  // Atualizar pergunta
  update: adminProcedure
    .input(z.object({
      id: z.number().int(),
      label: z.string().min(1).max(300).optional(),
      fieldType: z.enum(["text", "email", "number", "phone", "cpf", "radio", "select", "textarea", "informativo"]).optional(),
      options: z.array(questionOptionSchema).optional().nullable(),
      placeholder: z.string().max(5000).optional().nullable(),
      required: z.boolean().optional(),
      active: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      parentQuestionId: z.number().int().nullable().optional(),
      triggerOption: z.string().max(200).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const { id, label, fieldType, options, placeholder, required, active, sortOrder, parentQuestionId, triggerOption } = input;
      const now = Date.now();
      const optionsJson = options !== undefined ? (options ? JSON.stringify(options) : null) : undefined;

      // Build update using drizzleSql template literals (compatible with drizzle mysql2)
      await db.execute(drizzleSql`
        UPDATE preCadastroQuestions SET
          label             = COALESCE(${label ?? null}, label),
          fieldType         = COALESCE(${fieldType ?? null}, fieldType),
          options           = ${optionsJson !== undefined ? optionsJson : drizzleSql`options`},
          placeholder       = ${placeholder !== undefined ? (placeholder || null) : drizzleSql`placeholder`},
          required          = ${required !== undefined ? (required ? 1 : 0) : drizzleSql`required`},
          active            = ${active !== undefined ? (active ? 1 : 0) : drizzleSql`active`},
          sortOrder         = ${sortOrder !== undefined ? sortOrder : drizzleSql`sortOrder`},
          parentQuestionId  = ${parentQuestionId !== undefined ? (parentQuestionId ?? null) : drizzleSql`parentQuestionId`},
          triggerOption     = ${triggerOption !== undefined ? (triggerOption ?? null) : drizzleSql`triggerOption`},
          updatedAt         = ${now}
        WHERE id = ${id}
      `);
      return { ok: true };
    }),

  // Excluir pergunta
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      await db.execute(drizzleSql`DELETE FROM preCadastroQuestions WHERE id = ${input.id}`);
      return { ok: true };
    }),

  // Reordenar perguntas
  reorder: adminProcedure
    .input(z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const now = Date.now();
      for (const item of input) {
        await db.execute(drizzleSql`UPDATE preCadastroQuestions SET sortOrder = ${item.sortOrder}, updatedAt = ${now} WHERE id = ${item.id}`);
      }
      return { ok: true };
    }),

  // Toggle ativo/inativo
  toggleActive: adminProcedure
    .input(z.object({ id: z.number().int(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      await db.execute(drizzleSql`UPDATE preCadastroQuestions SET active = ${input.active ? 1 : 0}, updatedAt = ${Date.now()} WHERE id = ${input.id}`);
      return { ok: true };
    }),
});
