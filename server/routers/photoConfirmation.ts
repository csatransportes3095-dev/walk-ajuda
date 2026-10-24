import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

const questionTypeSchema = z.enum(["check_cross", "thumbs", "mood", "text"]);
const questionSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(500),
  type: questionTypeSchema,
  required: z.boolean().default(true),
});
const questionsSchema = z.array(questionSchema).min(1).max(40);
const answersSchema = z.record(z.string().min(1).max(64), z.string().max(2000));

type Question = z.infer<typeof questionSchema>;

const LEGACY_BASE_IDS = ["ready_location", "ready_device", "ready_environment", "ready_now"] as const;
const PHOTO_PREP_QUESTIONS: Question[] = [
  { id: "glasses_no_lenses", text: "Está com a armação de óculos sem lentes?", type: "check_cross", required: true },
  { id: "hard_reset_done", text: "O celular já foi feito Hard Reset?", type: "check_cross", required: true },
  { id: "inside_home", text: "Você está dentro de casa?", type: "check_cross", required: true },
  { id: "colored_background", text: "Preparou cama, lençol ou fundo colorido?", type: "check_cross", required: true },
  { id: "good_lighting", text: "O local está com boa iluminação?", type: "check_cross", required: true },
  { id: "whatsapp_new_number", text: "O WhatsApp está instalado com número novo?", type: "check_cross", required: true },
  { id: "new_sim", text: "Está usando chip novo?", type: "check_cross", required: true },
  { id: "no_wifi_after_reset", text: "Após o Hard Reset, o celular nunca foi conectado ao Wi-Fi?", type: "check_cross", required: true },
  { id: "ready_for_photo", text: "Está tudo pronto para fazer a foto?", type: "check_cross", required: true },
];

function withPhotoPrepQuestions(questions: Question[]): Question[] {
  const ids = new Set(questions.map(q => q.id));
  const isLegacyChecklist = LEGACY_BASE_IDS.every(id => ids.has(id)) && PHOTO_PREP_QUESTIONS.every(q => !ids.has(q.id));
  return isLegacyChecklist ? [...questions, ...PHOTO_PREP_QUESTIONS] : questions;
}

let infrastructureReady = false;

async function ensureInfrastructure() {
  if (infrastructureReady) return;
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS photoConfirmationChecklists (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      token VARCHAR(64) NOT NULL,
      registrationId INT NOT NULL,
      subOrderIndex INT NOT NULL DEFAULT 0,
      customerPhone VARCHAR(32) NOT NULL DEFAULT '',
      customerName VARCHAR(128) NULL,
      orderNumber INT NULL,
      questions LONGTEXT NOT NULL,
      answers LONGTEXT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      openedAt DATETIME NULL,
      completedAt DATETIME NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_photo_confirmation_token (token),
      UNIQUE KEY uq_photo_confirmation_order (registrationId, subOrderIndex),
      KEY idx_photo_confirmation_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));
  infrastructureReady = true;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

async function appointmentFor(db: any, registrationId: number, subOrderIndex: number) {
  try {
    const result: any = await db.execute(sql`
      SELECT status, slotDate, slotTime, serviceName
      FROM scheduleAppointments
      WHERE registrationId=${registrationId}
        AND subOrderIndex=${subOrderIndex}
        AND status <> 'cancelled'
      ORDER BY id DESC
      LIMIT 1
    `);
    const rows = Array.isArray(result) ? result[0] : [];
    return rows?.[0] ? {
      status: String(rows[0].status || ""),
      slotDate: rows[0].slotDate ? String(rows[0].slotDate) : null,
      slotTime: rows[0].slotTime ? String(rows[0].slotTime) : null,
      serviceName: rows[0].serviceName ? String(rows[0].serviceName) : null,
    } : null;
  } catch {
    return null;
  }
}

function normalizeRow(row: any, appointment: any = null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    token: String(row.token),
    registrationId: Number(row.registrationId),
    subOrderIndex: Number(row.subOrderIndex || 0),
    customerPhone: String(row.customerPhone || ""),
    customerName: row.customerName ? String(row.customerName) : null,
    orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
    questions: withPhotoPrepQuestions(parseJson<Question[]>(row.questions, [])),
    answers: parseJson<Record<string,string>>(row.answers, {}),
    status: String(row.status || "pending") as "pending" | "completed",
    openedAt: row.openedAt ? new Date(row.openedAt).toISOString() : null,
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    appointment,
  };
}

async function getByOrder(registrationId: number, subOrderIndex: number) {
  await ensureInfrastructure();
  const db = await getDb() as any;
  const result: any = await db.execute(sql`
    SELECT * FROM photoConfirmationChecklists
    WHERE registrationId=${registrationId} AND subOrderIndex=${subOrderIndex}
    LIMIT 1
  `);
  const rows = Array.isArray(result) ? result[0] : [];
  const appt = await appointmentFor(db, registrationId, subOrderIndex);
  return normalizeRow(rows?.[0], appt);
}

async function getByToken(token: string) {
  await ensureInfrastructure();
  const db = await getDb() as any;
  const result: any = await db.execute(sql`
    SELECT * FROM photoConfirmationChecklists WHERE token=${token} LIMIT 1
  `);
  const rows = Array.isArray(result) ? result[0] : [];
  const row = rows?.[0];
  if (!row) return null;
  const appt = await appointmentFor(db, Number(row.registrationId), Number(row.subOrderIndex || 0));
  return normalizeRow(row, appt);
}

function allowedValue(question: Question, value: string) {
  if (question.type === "check_cross") return value === "yes" || value === "no";
  if (question.type === "thumbs") return value === "up" || value === "down";
  if (question.type === "mood") return value === "happy" || value === "neutral" || value === "sad";
  return value.length <= 2000;
}

export const photoConfirmationRouter = router({
  getForOrder: adminProcedure
    .input(z.object({ registrationId: z.number().int().positive(), subOrderIndex: z.number().int().min(0).default(0) }))
    .query(async ({ input }) => getByOrder(input.registrationId, input.subOrderIndex)),

  saveForOrder: adminProcedure
    .input(z.object({
      registrationId: z.number().int().positive(),
      subOrderIndex: z.number().int().min(0).default(0),
      customerPhone: z.string().max(32).default(""),
      customerName: z.string().max(128).nullable().optional(),
      orderNumber: z.number().int().positive().nullable().optional(),
      questions: questionsSchema,
    }))
    .mutation(async ({ input }) => {
      await ensureInfrastructure();
      const db = await getDb() as any;
      const existing = await getByOrder(input.registrationId, input.subOrderIndex);
      const ids = new Set(input.questions.map(q => q.id));
      const keptAnswers = Object.fromEntries(Object.entries(existing?.answers || {}).filter(([key]) => ids.has(key)));
      if (existing) {
        if (existing.status === "completed") {
          throw new TRPCError({ code: "CONFLICT", message: "Reabra a CONFIRMAÇÃO PARA FOTO antes de editar as perguntas." });
        }
        await db.execute(sql`
          UPDATE photoConfirmationChecklists
          SET customerPhone=${input.customerPhone},
              customerName=${input.customerName ?? null},
              orderNumber=${input.orderNumber ?? null},
              questions=${JSON.stringify(input.questions)},
              answers=${JSON.stringify(keptAnswers)}
          WHERE id=${existing.id}
        `);
      } else {
        const token = randomBytes(24).toString("hex");
        await db.execute(sql`
          INSERT INTO photoConfirmationChecklists
            (token,registrationId,subOrderIndex,customerPhone,customerName,orderNumber,questions,answers,status)
          VALUES
            (${token},${input.registrationId},${input.subOrderIndex},${input.customerPhone},
             ${input.customerName ?? null},${input.orderNumber ?? null},
             ${JSON.stringify(input.questions)},'{}','pending')
        `);
      }
      return await getByOrder(input.registrationId, input.subOrderIndex);
    }),

  reopen: adminProcedure
    .input(z.object({ registrationId: z.number().int().positive(), subOrderIndex: z.number().int().min(0).default(0) }))
    .mutation(async ({ input }) => {
      await ensureInfrastructure();
      const db = await getDb() as any;
      await db.execute(sql`
        UPDATE photoConfirmationChecklists
        SET status='pending', completedAt=NULL
        WHERE registrationId=${input.registrationId} AND subOrderIndex=${input.subOrderIndex}
      `);
      return await getByOrder(input.registrationId, input.subOrderIndex);
    }),

  getPublic: publicProcedure
    .input(z.object({ token: z.string().min(32).max(64) }))
    .query(async ({ input }) => {
      const record = await getByToken(input.token);
      if (!record) return { found: false as const };
      const db = await getDb() as any;
      if (!record.openedAt) {
        await db.execute(sql`UPDATE photoConfirmationChecklists SET openedAt=NOW() WHERE id=${record.id}`);
      }
      return {
        found: true as const,
        title: "CONFIRMAÇÃO PARA FOTO",
        customerName: record.customerName,
        orderNumber: record.orderNumber,
        questions: record.questions,
        answers: record.answers,
        status: record.status,
        completedAt: record.completedAt,
        appointment: record.appointment,
      };
    }),

  savePublic: publicProcedure
    .input(z.object({ token: z.string().min(32).max(64), answers: answersSchema }))
    .mutation(async ({ input }) => {
      const record = await getByToken(input.token);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "CONFIRMAÇÃO PARA FOTO não encontrada." });
      if (record.status === "completed") return { success: true as const, completed: true as const };
      const byId = new Map(record.questions.map(q => [q.id, q]));
      const merged = { ...record.answers };
      for (const [id, value] of Object.entries(input.answers)) {
        const q = byId.get(id);
        if (!q || !allowedValue(q, value)) continue;
        merged[id] = value;
      }
      const db = await getDb() as any;
      await db.execute(sql`
        UPDATE photoConfirmationChecklists
        SET answers=${JSON.stringify(merged)}, openedAt=COALESCE(openedAt,NOW())
        WHERE id=${record.id}
      `);
      return { success: true as const, completed: false as const };
    }),

  completePublic: publicProcedure
    .input(z.object({ token: z.string().min(32).max(64), answers: answersSchema }))
    .mutation(async ({ input }) => {
      const record = await getByToken(input.token);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "CONFIRMAÇÃO PARA FOTO não encontrada." });
      const byId = new Map(record.questions.map(q => [q.id, q]));
      const merged = { ...record.answers };
      for (const [id, value] of Object.entries(input.answers)) {
        const q = byId.get(id);
        if (q && allowedValue(q, value)) merged[id] = value;
      }
      const missing = record.questions.filter(q => q.required && !String(merged[q.id] || "").trim());
      if (missing.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Responda todas as perguntas obrigatórias (${missing.length} pendente(s)).` });
      }
      const db = await getDb() as any;
      await db.execute(sql`
        UPDATE photoConfirmationChecklists
        SET answers=${JSON.stringify(merged)}, status='completed', completedAt=NOW(), openedAt=COALESCE(openedAt,NOW())
        WHERE id=${record.id}
      `);
      return { success: true as const };
    }),
});
