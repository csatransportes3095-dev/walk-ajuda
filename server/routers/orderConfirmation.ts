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

const DEFAULT_ORDER_QUESTIONS: Question[] = [
  { id: "geral_01", text: "Você leu a descrição completa do produto ou serviço contratado?", type: "check_cross", required: true },
  { id: "geral_02", text: "Você entendeu a diferença entre as opções de serviço disponíveis?", type: "check_cross", required: true },
  { id: "geral_03", text: "Você confirmou que escolheu a modalidade correta no pedido?", type: "check_cross", required: true },
  { id: "geral_04", text: "Você está ciente de que o pagamento é antecipado e realizado pelo site?", type: "check_cross", required: true },
  { id: "geral_05", text: "Você sabe que os pagamentos devem ser feitos exclusivamente pelos meios apresentados no site?", type: "check_cross", required: true },
  { id: "geral_06", text: "Você sabe onde acompanhar os status e atualizações do seu pedido?", type: "check_cross", required: true },
  { id: "geral_07", text: "Você está ciente de que o atendimento humano ocorre no horário informado no site?", type: "check_cross", required: true },
  { id: "geral_08", text: "Você compreendeu que os prazos podem depender da análise da plataforma?", type: "check_cross", required: true },
  { id: "geral_09", text: "Você leu e compreendeu as condições de garantia do produto contratado?", type: "check_cross", required: true },
  { id: "geral_10", text: "Você sabe que mudanças em dados cadastrais podem exigir nova verificação?", type: "check_cross", required: true },
  { id: "geral_11", text: "Você confirmou que seu telefone e e-mail cadastrados estão corretos?", type: "check_cross", required: true },
  { id: "geral_12", text: "Você sabe que o acesso à sua conta no site utiliza um código enviado ao e-mail cadastrado?", type: "check_cross", required: true },
  { id: "geral_13", text: "Você está ciente de que os documentos enviados precisam ser autênticos, válidos e legíveis?", type: "check_cross", required: true },
  { id: "geral_14", text: "Você confirma que o nome e os dados dos documentos correspondem ao titular verdadeiro?", type: "check_cross", required: true },
  { id: "geral_15", text: "Você sabe que o veículo informado deve corresponder à placa e aos documentos oficiais?", type: "check_cross", required: true },
  { id: "geral_16", text: "Você verificou se o veículo atende aos requisitos de ano, categoria e cidade da plataforma?", type: "check_cross", required: true },
  { id: "geral_17", text: "Você está ciente de que uma reprovação de documento pode exigir correção ou reenvio oficial?", type: "check_cross", required: true },
  { id: "geral_18", text: "Você entende que restrições ou bloqueios anteriores devem ser informados corretamente?", type: "check_cross", required: true },
  { id: "geral_19", text: "Você está ciente de que a aprovação da conta depende das regras da plataforma?", type: "check_cross", required: true },
  { id: "geral_20", text: "Você sabe que a plataforma pode solicitar foto ou verificação facial adicional?", type: "check_cross", required: true },
  { id: "geral_21", text: "Você está ciente de que a foto deve mostrar a identidade verdadeira do titular, sem disfarces?", type: "check_cross", required: true },
  { id: "geral_22", text: "Você preparou um ambiente interno com iluminação suficiente para uma foto nítida?", type: "check_cross", required: true },
  { id: "geral_23", text: "Você está ciente de que acessórios que cubram o rosto podem prejudicar a verificação?", type: "check_cross", required: true },
  { id: "geral_24", text: "Você verificou se o aparelho está funcionando corretamente para receber as instruções?", type: "check_cross", required: true },
  { id: "geral_25", text: "Você está ciente de que uma restauração do aparelho apaga dados e exige backup prévio?", type: "check_cross", required: true },
  { id: "geral_26", text: "Você sabe que o aparelho deve cumprir os requisitos técnicos e de segurança do aplicativo?", type: "check_cross", required: true },
  { id: "geral_27", text: "Você compreendeu que não deve compartilhar senhas ou códigos de acesso com terceiros?", type: "check_cross", required: true },
  { id: "geral_28", text: "Você sabe que a disponibilidade de agendamento deve ser consultada no site?", type: "check_cross", required: true },
  { id: "geral_29", text: "Você está ciente de que horários liberados por desistência podem aparecer na agenda?", type: "check_cross", required: true },
  { id: "geral_30", text: "Você sabe que deve respeitar o horário confirmado e as regras de reagendamento?", type: "check_cross", required: true },
  { id: "geral_31", text: "Você está ciente de que o status de foto em análise não significa aprovação definitiva?", type: "check_cross", required: true },
  { id: "geral_32", text: "Você sabe que indicações promocionais podem não gerar comissão conforme as regras da campanha?", type: "check_cross", required: true },
  { id: "geral_33", text: "Você entende que empréstimos dependem de cadastro, movimentação e liberação automática do sistema?", type: "check_cross", required: true },
  { id: "geral_34", text: "Você sabe que pedidos de suporte devem informar o código do pedido para facilitar o atendimento?", type: "check_cross", required: true },
  { id: "geral_35", text: "Você confirma que leu as instruções específicas exibidas no produto antes de contratar?", type: "check_cross", required: true },
];
let infrastructureReady = false;

async function ensureInfrastructure() {
  if (infrastructureReady) return;
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS orderConfirmationChecklists (
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
      UNIQUE KEY uq_order_confirmation_token (token),
      UNIQUE KEY uq_order_confirmation_order (registrationId, subOrderIndex),
      KEY idx_order_confirmation_status (status)
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
    questions: parseJson<Question[]>(row.questions, DEFAULT_ORDER_QUESTIONS),
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
    SELECT * FROM orderConfirmationChecklists
    WHERE registrationId=${registrationId} AND subOrderIndex=${subOrderIndex}
    LIMIT 1
  `);
  const rows = Array.isArray(result) ? result[0] : [];
  const appt = null;
  return normalizeRow(rows?.[0], appt);
}

async function getByToken(token: string) {
  await ensureInfrastructure();
  const db = await getDb() as any;
  const result: any = await db.execute(sql`
    SELECT * FROM orderConfirmationChecklists WHERE token=${token} LIMIT 1
  `);
  const rows = Array.isArray(result) ? result[0] : [];
  const row = rows?.[0];
  if (!row) return null;
  const appt = null;
  return normalizeRow(row, appt);
}

function allowedValue(question: Question, value: string) {
  if (question.type === "check_cross") return value === "yes" || value === "no";
  if (question.type === "thumbs") return value === "up" || value === "down";
  if (question.type === "mood") return value === "happy" || value === "neutral" || value === "sad";
  return value.length <= 2000;
}

export const orderConfirmationRouter = router({
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
          throw new TRPCError({ code: "CONFLICT", message: "Reabra a CONFIRMAÇÃO DO PEDIDO antes de editar as perguntas." });
        }
        await db.execute(sql`
          UPDATE orderConfirmationChecklists
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
          INSERT INTO orderConfirmationChecklists
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
        UPDATE orderConfirmationChecklists
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
        await db.execute(sql`UPDATE orderConfirmationChecklists SET openedAt=NOW() WHERE id=${record.id}`);
      }
      return {
        found: true as const,
        title: "CONFIRMAÇÃO DO PEDIDO",
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
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "CONFIRMAÇÃO DO PEDIDO não encontrada." });
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
        UPDATE orderConfirmationChecklists
        SET answers=${JSON.stringify(merged)}, openedAt=COALESCE(openedAt,NOW())
        WHERE id=${record.id}
      `);
      return { success: true as const, completed: false as const };
    }),

  completePublic: publicProcedure
    .input(z.object({ token: z.string().min(32).max(64), answers: answersSchema }))
    .mutation(async ({ input }) => {
      const record = await getByToken(input.token);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "CONFIRMAÇÃO DO PEDIDO não encontrada." });
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
        UPDATE orderConfirmationChecklists
        SET answers=${JSON.stringify(merged)}, status='completed', completedAt=NOW(), openedAt=COALESCE(openedAt,NOW())
        WHERE id=${record.id}
      `);
      return { success: true as const };
    }),
});
