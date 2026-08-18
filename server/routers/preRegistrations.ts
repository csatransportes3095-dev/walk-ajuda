import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql as drizzleSql } from "drizzle-orm";
import { formatCPF, isValidCPF, normalizeCpf } from "@shared/cpf";
import { ENV } from "../_core/env";

let preRegistrationPhotoColumnReady = false;

async function ensurePreRegistrationPhotoColumn(db: any) {
  if (preRegistrationPhotoColumnReady) return;
  try {
    await db.execute(drizzleSql.raw("ALTER TABLE preRegistrations ADD COLUMN IF NOT EXISTS profilePhotoUrl VARCHAR(2048) NULL"));
  } catch {
    try { await db.execute(drizzleSql.raw("ALTER TABLE preRegistrations ADD COLUMN profilePhotoUrl VARCHAR(2048) NULL")); } catch { /* coluna já existe */ }
  }
  preRegistrationPhotoColumnReady = true;
}

function isValidPreRegistrationPhotoUrl(value: string) {
  try {
    const photoUrl = new URL(value);
    const publicBase = new URL(ENV.r2PublicUrl.trim());
    const basePath = publicBase.pathname.replace(/\/+$/, "");
    const expectedPrefix = `${basePath}/pre-cadastros/perfis/`.replace(/\/\/+/, "/");
    return photoUrl.protocol === publicBase.protocol
      && photoUrl.host === publicBase.host
      && photoUrl.pathname.startsWith(expectedPrefix);
  } catch {
    return false;
  }
}

async function qRows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  // drizzle mysql2 returns [rows, fields] tuple
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

export const preRegistrationsRouter = router({
  // Submissão pública (sem autenticação)
  submit: publicProcedure
    .input(z.object({
      fullName: z.string().min(3, "Nome muito curto"),
      email: z.string().email("E-mail inválido"),
      cpf: z.string().min(11, "CPF inválido"),
      fakeAccountsCount: z.number().int().min(0),
      deviceType: z.enum(["android", "iphone"]),
      acceptsGlasses: z.boolean(),
      acceptsScheduledPhoto: z.boolean(),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
      referralName: z.string().optional(),
      phone: z.string().optional(),
      referralPhone: z.string().optional(),
      parentAccount: z.string().optional(),
      uberNameType: z.enum(["primeiro_nome", "nome_completo", "nome_aleatorio", "s"]).optional(),
    }))
    .mutation(async ({ input }) => {
      // Validar CPF
      const cleanCpf = normalizeCpf(input.cpf);
      if (!isValidCPF(cleanCpf)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido" });
      }
      const cpfFormatted = formatCPF(cleanCpf);

      const db = await getDb() as any;
      const now = Date.now();

      await db.execute(drizzleSql`
        INSERT INTO preRegistrations
          (fullName, email, phone, cpf, fakAccountsCount, deviceType, acceptsGlasses, acceptsScheduledPhoto, status, ipAddress, userAgent, referralName, referralPhone, parentAccount, uberNameType, createdAt, updatedAt)
        VALUES
          (${input.fullName.trim()}, ${input.email.trim().toLowerCase()}, ${input.phone?.replace(/\D/g,'') || null}, ${cpfFormatted},
           ${input.fakeAccountsCount}, ${input.deviceType},
           ${input.acceptsGlasses ? 1 : 0}, ${input.acceptsScheduledPhoto ? 1 : 0},
           'pendente', ${input.ipAddress || null}, ${input.userAgent || null},
           ${input.referralName || null}, ${input.referralPhone || null},
           ${input.parentAccount || null}, ${input.uberNameType || null}, ${now}, ${now})
      `);

      return { ok: true, message: "Pré-cadastro enviado com sucesso! Em breve nossa equipe entrará em contato." };
    }),

  // Listar todos (admin)
  list: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(["pendente", "aprovado", "reprovado", "todos"]).default("todos"),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb() as any;
      const offset = (input.page - 1) * input.limit;
      const search = input.search?.trim() || "";
      const likeSearch = `%${search}%`;

      // Build queries using drizzleSql template literals
      let countResult: any[];
      let rows: any[];

      // Normaliza busca por telefone (remove não-dígitos para comparar com campo phone)
      const cleanSearch = search.replace(/\D/g, '');
      const likeCleanSearch = cleanSearch.length >= 4 ? `%${cleanSearch}%` : likeSearch;

      if (input.status !== "todos" && search) {
        countResult = await qRows(db, drizzleSql`SELECT COUNT(*) as total FROM preRegistrations WHERE status=${input.status} AND (fullName LIKE ${likeSearch} OR email LIKE ${likeSearch} OR cpf LIKE ${likeSearch} OR phone LIKE ${likeCleanSearch})`);
        rows = await qRows(db, drizzleSql`SELECT * FROM preRegistrations WHERE status=${input.status} AND (fullName LIKE ${likeSearch} OR email LIKE ${likeSearch} OR cpf LIKE ${likeSearch} OR phone LIKE ${likeCleanSearch}) ORDER BY createdAt DESC LIMIT ${input.limit} OFFSET ${offset}`);
      } else if (input.status !== "todos") {
        countResult = await qRows(db, drizzleSql`SELECT COUNT(*) as total FROM preRegistrations WHERE status=${input.status}`);
        rows = await qRows(db, drizzleSql`SELECT * FROM preRegistrations WHERE status=${input.status} ORDER BY createdAt DESC LIMIT ${input.limit} OFFSET ${offset}`);
      } else if (search) {
        countResult = await qRows(db, drizzleSql`SELECT COUNT(*) as total FROM preRegistrations WHERE fullName LIKE ${likeSearch} OR email LIKE ${likeSearch} OR cpf LIKE ${likeSearch} OR phone LIKE ${likeCleanSearch}`);
        rows = await qRows(db, drizzleSql`SELECT * FROM preRegistrations WHERE fullName LIKE ${likeSearch} OR email LIKE ${likeSearch} OR cpf LIKE ${likeSearch} OR phone LIKE ${likeCleanSearch} ORDER BY createdAt DESC LIMIT ${input.limit} OFFSET ${offset}`);
      } else {
        countResult = await qRows(db, drizzleSql`SELECT COUNT(*) as total FROM preRegistrations`);
        rows = await qRows(db, drizzleSql`SELECT * FROM preRegistrations ORDER BY createdAt DESC LIMIT ${input.limit} OFFSET ${offset}`);
      }

      const total = parseInt(countResult[0]?.total || 0);
      return { rows, total, page: input.page, limit: input.limit };
    }),

  // Atualizar status (admin)
  updateStatus: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pendente", "aprovado", "reprovado"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      await db.execute(drizzleSql`UPDATE preRegistrations SET status=${input.status}, updatedAt=${Date.now()} WHERE id=${input.id}`);
      return { ok: true };
    }),

  // Editar cadastro (admin)
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      fullName: z.string().min(3).optional(),
      email: z.string().email().optional(),
      cpf: z.string().optional(),
      fakeAccountsCount: z.number().int().min(0).optional(),
      deviceType: z.enum(["android", "iphone"]).optional(),
      acceptsGlasses: z.boolean().optional(),
      acceptsScheduledPhoto: z.boolean().optional(),
      status: z.enum(["pendente", "aprovado", "reprovado"]).optional(),
      referralName: z.string().nullable().optional(),
      referralPhone: z.string().nullable().optional(),
      parentAccount: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      uberNameType: z.string().nullable().optional(),
      rejectionReason: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const { id, ...fields } = input;
      const now = Date.now();

      // Usar drizzleSql template literal (compatível com mysql2)
      // Construir SET dinâmico com COALESCE para campos opcionais
      const setClauses: ReturnType<typeof drizzleSql>[] = [];

      if (fields.fullName !== undefined) setClauses.push(drizzleSql`fullName=${fields.fullName}`);
      if (fields.email !== undefined) setClauses.push(drizzleSql`email=${fields.email}`);
      if (fields.cpf !== undefined) {
        if (!isValidCPF(fields.cpf)) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido" });
        setClauses.push(drizzleSql`cpf=${formatCPF(fields.cpf)}`);
      }
      if (fields.fakeAccountsCount !== undefined) setClauses.push(drizzleSql`fakAccountsCount=${fields.fakeAccountsCount}`);
      if (fields.deviceType !== undefined) setClauses.push(drizzleSql`deviceType=${fields.deviceType}`);
      if (fields.acceptsGlasses !== undefined) setClauses.push(drizzleSql`acceptsGlasses=${fields.acceptsGlasses ? 1 : 0}`);
      if (fields.acceptsScheduledPhoto !== undefined) setClauses.push(drizzleSql`acceptsScheduledPhoto=${fields.acceptsScheduledPhoto ? 1 : 0}`);
      if (fields.status !== undefined) setClauses.push(drizzleSql`status=${fields.status}`);
      if (fields.phone !== undefined) setClauses.push(drizzleSql`phone=${fields.phone?.replace(/\D/g,'') || null}`);
      if (fields.referralName !== undefined) setClauses.push(drizzleSql`referralName=${fields.referralName || null}`);
      if (fields.referralPhone !== undefined) setClauses.push(drizzleSql`referralPhone=${fields.referralPhone || null}`);
      if (fields.parentAccount !== undefined) setClauses.push(drizzleSql`parentAccount=${fields.parentAccount || null}`);
      if (fields.uberNameType !== undefined) setClauses.push(drizzleSql`uberNameType=${fields.uberNameType || null}`);
      if (fields.rejectionReason !== undefined) setClauses.push(drizzleSql`rejectionReason=${fields.rejectionReason || null}`);
      setClauses.push(drizzleSql`updatedAt=${now}`);

      if (setClauses.length > 1) {
        // Juntar os SET clauses com vírgula
        const setQuery = setClauses.reduce((acc, clause, i) =>
          i === 0 ? clause : drizzleSql`${acc}, ${clause}`
        );
        await db.execute(drizzleSql`UPDATE preRegistrations SET ${setQuery} WHERE id=${id}`);
      }
      return { ok: true };
    }),

  // Consulta pública de status por CPF ou telefone
  checkStatus: publicProcedure
    .input(z.object({ cpf: z.string().optional(), phone: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb() as any;
      let rows: any[] = [];

      // Busca por CPF somente após aprovação matemática dos dígitos verificadores.
      if (input.cpf) {
        if (!isValidCPF(input.cpf)) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido" });
        const formatted = formatCPF(input.cpf);
        rows = await qRows(db, drizzleSql`SELECT id, fullName, status, rejectionReason FROM preRegistrations WHERE cpf=${formatted} ORDER BY createdAt DESC LIMIT 1`);
      }

      // Busca por telefone (se CPF não encontrou)
      if (!rows.length && input.phone) {
        const cleanPhone = input.phone.replace(/\D/g, "");
        if (cleanPhone.length >= 10) {
          rows = await qRows(db, drizzleSql`SELECT id, fullName, status, rejectionReason FROM preRegistrations WHERE phone=${cleanPhone} ORDER BY createdAt DESC LIMIT 1`);
        }
      }

      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum cadastro encontrado" });
      return { status: rows[0].status as string, fullName: rows[0].fullName as string, rejectionReason: rows[0].rejectionReason as string | null };
    }),

  // Verificar duplicado antes de submeter (público)
  checkDuplicate: publicProcedure
    .input(z.object({ cpf: z.string().optional(), phone: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb() as any;
      let found = false;

      if (input.cpf) {
        if (!isValidCPF(input.cpf)) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido" });
        const formatted = formatCPF(input.cpf);
        const rows = await qRows(db, drizzleSql`SELECT id FROM preRegistrations WHERE cpf=${formatted} LIMIT 1`);
        if (rows.length) found = true;
      }

      if (!found && input.phone) {
        const cleanPhone = input.phone.replace(/\D/g, "");
        if (cleanPhone.length >= 10) {
          const rows = await qRows(db, drizzleSql`SELECT id FROM preRegistrations WHERE phone=${cleanPhone} LIMIT 1`);
          if (rows.length) found = true;
        }
      }

      return { exists: found };
    }),

  // Excluir (admin)
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      await db.execute(drizzleSql`DELETE FROM preRegistrations WHERE id=${input.id}`);
      return { ok: true };
    }),

  // Buscar um registro (admin)
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb() as any;
      const rows = await qRows(db, drizzleSql`SELECT * FROM preRegistrations WHERE id=${input.id}`);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
      return rows[0];
    }),

  // Buscar respostas dinâmicas de um pré-cadastro (admin)
  getAnswers: adminProcedure
    .input(z.object({ preRegistrationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb() as any;
      const rows = await qRows(db, drizzleSql`
        SELECT a.id, a.questionId, a.fieldKey, a.answer, q.label, q.parentQuestionId, q.sortOrder
        FROM preCadastroAnswers a
        LEFT JOIN preCadastroQuestions q ON q.id = a.questionId
        WHERE a.preRegistrationId = ${input.preRegistrationId}
        ORDER BY COALESCE(q.sortOrder, a.id) ASC
      `);
      return rows.map((r: any) => ({
        id: r.id as number,
        questionId: r.questionId as number,
        fieldKey: r.fieldKey as string,
        answer: r.answer as string,
        label: r.label as string | null,
        parentQuestionId: (r.parentQuestionId as number | null) ?? null,
        sortOrder: (r.sortOrder as number | null) ?? 0,
      }));
    }),

  // Salvar/atualizar resposta dinâmica (admin)
  upsertAnswer: adminProcedure
    .input(z.object({
      preRegistrationId: z.number(),
      questionId: z.number(),
      fieldKey: z.string(),
      answer: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const now = Date.now();
      // Verificar se já existe
      const existing = await qRows(db, drizzleSql`
        SELECT id FROM preCadastroAnswers WHERE preRegistrationId=${input.preRegistrationId} AND questionId=${input.questionId}
      `);
      if (existing.length) {
        await db.execute(drizzleSql`
          UPDATE preCadastroAnswers SET answer=${input.answer} WHERE preRegistrationId=${input.preRegistrationId} AND questionId=${input.questionId}
        `);
      } else {
        await db.execute(drizzleSql`
          INSERT INTO preCadastroAnswers (preRegistrationId, questionId, fieldKey, answer, createdAt)
          VALUES (${input.preRegistrationId}, ${input.questionId}, ${input.fieldKey}, ${input.answer}, ${now})
        `);
      }
      return { ok: true };
    }),

  // Submissão 100% dinâmica — todas as respostas vão para preCadastroAnswers
  submitDynamic: publicProcedure
    .input(z.object({
      answers: z.array(z.object({
        questionId: z.number().int(),
        fieldKey: z.string(),
        answer: z.string(),
      })),
      profilePhotoUrl: z.string().url("Foto de perfil inválida"),
      userAgent: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const cpfAnswer = input.answers.find(answer => answer.fieldKey.trim().toLowerCase() === 'cpf');
      if (cpfAnswer && !isValidCPF(cpfAnswer.answer)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'CPF inválido' });
      }
      const db = await getDb() as any;
      await ensurePreRegistrationPhotoColumn(db);
      if (!isValidPreRegistrationPhotoUrl(input.profilePhotoUrl)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Envie uma foto de perfil válida." });
      }
      const now = Date.now();

      // Criar registro base na tabela preRegistrations
      const result = await db.execute(drizzleSql`
        INSERT INTO preRegistrations
          (fullName, email, phone, cpf, fakAccountsCount, deviceType, acceptsGlasses, acceptsScheduledPhoto, profilePhotoUrl, status, userAgent, createdAt, updatedAt)
        VALUES
          ('', '', NULL, '', 0, 'android', 0, 0, ${input.profilePhotoUrl}, 'pendente', ${input.userAgent || null}, ${now}, ${now})
      `);

      // Pegar o ID inserido
      const insertResult = Array.isArray(result) ? result[0] : result;
      const preRegistrationId = insertResult?.insertId || insertResult?.[0]?.insertId;

      if (!preRegistrationId) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao criar cadastro' });
      }

      // Salvar todas as respostas dinâmicas
      for (const ans of input.answers) {
        if (!ans.answer.trim()) continue; // Pular respostas vazias
        await db.execute(drizzleSql`
          INSERT INTO preCadastroAnswers (preRegistrationId, questionId, fieldKey, answer, createdAt)
          VALUES (${preRegistrationId}, ${ans.questionId}, ${ans.fieldKey}, ${ans.answer.trim()}, ${now})
        `);
      }

      // Atualizar campos fixos com base nas respostas (para compatibilidade com o sistema existente)
      const answerMap: Record<string, string> = {};
      for (const ans of input.answers) {
        answerMap[ans.fieldKey] = ans.answer.trim();
      }

      const fullName = answerMap['fullName'] || answerMap['nome'] || answerMap['nomeCompleto'] || '';
      const email = answerMap['email'] || '';
      const cpf = normalizeCpf(answerMap['cpf'] || '');
      const phone = (answerMap['phone'] || answerMap['whatsapp'] || answerMap['telefone'] || '').replace(/\D/g, '');
      const fakeCount = parseInt(answerMap['fakeAccountsCount'] || '0') || 0;
      const device = (answerMap['deviceType'] || 'android') as string;
      const glasses = answerMap['acceptsGlasses'] === 'sim';
      const photo = answerMap['acceptsScheduledPhoto'] === 'sim';
      const referralName = answerMap['referralName'] || null;
      const referralPhone = (answerMap['referralPhone'] || '').replace(/\D/g, '') || null;

      const cpfFormatted = cpf ? formatCPF(cpf) : '';

      await db.execute(drizzleSql`
        UPDATE preRegistrations SET
          fullName=${fullName},
          email=${email.toLowerCase()},
          phone=${phone || null},
          cpf=${cpfFormatted},
          fakAccountsCount=${fakeCount},
          deviceType=${device},
          acceptsGlasses=${glasses ? 1 : 0},
          acceptsScheduledPhoto=${photo ? 1 : 0},
          referralName=${referralName},
          referralPhone=${referralPhone},
          profilePhotoUrl=${input.profilePhotoUrl},
          updatedAt=${now}
        WHERE id=${preRegistrationId}
      `);

      return { ok: true, id: preRegistrationId };
    }),

  // Exportar todos para CSV/JSON (admin)
  exportAll: adminProcedure
    .input(z.object({
      status: z.enum(["pendente", "aprovado", "reprovado", "todos"]).default("todos"),
    }))
    .query(async ({ input }) => {
      const db = await getDb() as any;
      let rows: any[];
      if (input.status === "todos") {
        rows = await qRows(db, drizzleSql`SELECT * FROM preRegistrations ORDER BY createdAt DESC`);
      } else {
        rows = await qRows(db, drizzleSql`SELECT * FROM preRegistrations WHERE status=${input.status} ORDER BY createdAt DESC`);
      }
      return rows;
    }),
});

