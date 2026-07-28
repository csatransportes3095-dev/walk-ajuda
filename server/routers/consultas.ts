import { z } from "zod";
import { publicProcedure, router, adminProcedure } from "../_core/trpc";
import {
  listConsultaForms,
  getConsultaForm,
  createConsultaForm,
  updateConsultaForm,
  deleteConsultaForm,
  submitConsultaRequest,
  listConsultaRequests,
  respondConsultaRequest,
  getConsultaRequest,
  countConsultaRequestsThisWeek,
  getSetting,
  upsertSetting,
} from "../db";
import nodemailer from "nodemailer";
import { storagePut } from "../storage";
// ─── Helpers de e-mail ──────────────────────────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const emailPass = process.env.ZOHO_EMAIL_PASSWORD;
  if (!emailPass) return false;
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: { user: 'walkajuda@walkajuda.com', pass: emailPass },
    });
    await transporter.sendMail({ from: '"Walk Ajuda" <walkajuda@walkajuda.com>', to, subject, html });
    return true;
  } catch (e) {
    console.error("[consultas] email error:", e);
    return false;
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const consultasRouter = {
  // Listar formulários ativos (para o cliente)
  listForms: publicProcedure.query(async () => {
    return await listConsultaForms(true);
  }),

  // Listar todos os formulários (para o ADM)
  listAllForms: adminProcedure.query(async () => {
    return await listConsultaForms(false);
  }),

  // Criar formulário (ADM)
  createForm: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      icon: z.string().default("Search"),
      type: z.enum(["consultation", "link"]),
      redirectUrl: z.string().default(""),
      fields: z.string().default("[]"),
      isActive: z.number().default(1),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      return await createConsultaForm({ ...input, isBuiltin: 0 });
    }),

  // Atualizar formulário (ADM)
  updateForm: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      icon: z.string().optional(),
      type: z.enum(["consultation", "link"]).optional(),
      redirectUrl: z.string().optional(),
      fields: z.string().optional(),
      originalFields: z.string().optional(),
      isActive: z.number().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateConsultaForm(id, data);
      return { success: true };
    }),

  // Salvar configuração de campos do formulário (ADM)
  saveFormFields: adminProcedure
    .input(z.object({
      id: z.number(),
      fields: z.string(), // JSON rows
    }))
    .mutation(async ({ input }) => {
      const form = await getConsultaForm(input.id);
      if (!form) throw new Error("Formulário não encontrado");
      // Se for builtin e originalFields ainda não foi salvo, salvar agora
      const updateData: Record<string, string> = { fields: input.fields };
      if (form.isBuiltin && (!form.originalFields || form.originalFields === '[]' || form.originalFields === null)) {
        // Salvar os campos atuais como original antes de sobrescrever
        updateData.originalFields = form.fields || '[]';
      }
      await updateConsultaForm(input.id, updateData);
      return { success: true };
    }),

  // Restaurar formulário para configuração original (ADM)
  restoreFormFields: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const form = await getConsultaForm(input.id);
      if (!form) throw new Error("Formulário não encontrado");
      if (!form.isBuiltin) throw new Error("Apenas formulários fixos podem ser restaurados");
      const original = form.originalFields || '[]';
      await updateConsultaForm(input.id, { fields: original });
      return { success: true };
    }),

  // Inicializar campos de formulários fixos com os campos padrão (ADM)
  initBuiltinFields: adminProcedure
    .mutation(async () => {
      const forms = await listConsultaForms(false);
      const db = await (await import('../db')).getDb();
      if (!db) return { success: false };
      const { sql } = await import('drizzle-orm');
      const { createConsultaForm } = await import('../db');

      const builtinDefaults: Array<{ key: string; title: string; icon: string; fields: string }> = [
        {
          key: 'veiculo',
          title: 'Consulta de Veículo',
          icon: 'Car',
          fields: JSON.stringify([{id:'r1',cols:1,fields:[{id:'f1',key:'Placa',label:'Placa do Veículo',type:'text',required:true,placeholder:'Ex: ABC1D23',mask:'placa',isActive:true},{id:'f2',key:'RENAVAM',label:'RENAVAM',type:'text',required:true,placeholder:'Somente números',mask:'numbers',isActive:true},{id:'f3',key:'Tipo de Placa',label:'Tipo de Placa',type:'select',required:true,options:['Placa Mercosul','Placa Cinza'],isActive:true}]}]),
        },
        {
          key: 'mandado',
          title: 'Mandado de Prisão',
          icon: 'Scale',
          fields: JSON.stringify([{id:'r1',cols:1,fields:[{id:'f1',key:'CPF',label:'CPF',type:'text',required:true,placeholder:'Somente números',mask:'numbers',isActive:true},{id:'f2',key:'Nome da Mãe',label:'Nome da Mãe',type:'text',required:false,placeholder:'Nome completo da mãe',isActive:true},{id:'f3',key:'Nome do Pai',label:'Nome do Pai',type:'text',required:false,placeholder:'Nome completo do pai (opcional)',isActive:true}]}]),
        },
        {
          key: 'antecedente',
          title: 'Antecedentes Criminais',
          icon: 'FileSearch',
          fields: JSON.stringify([{id:'r1',cols:2,fields:[{id:'f1',key:'CPF',label:'CPF',type:'text',required:true,placeholder:'Somente números',mask:'numbers',isActive:true},{id:'f2',key:'Nome',label:'Nome Completo',type:'text',required:true,placeholder:'Nome completo',isActive:true},{id:'f3',key:'Data de Nascimento',label:'Data de Nascimento',type:'date',required:true,isActive:true},{id:'f4',key:'Nome da Mãe',label:'Nome da Mãe',type:'text',required:false,placeholder:'Nome da mãe',isActive:true}]},{id:'r2',cols:1,fields:[{id:'f5',key:'Nome do Pai',label:'Nome do Pai',type:'text',required:false,placeholder:'Nome do pai (opcional)',isActive:true}]}]),
        },
      ];

      let updated = 0;

      for (const builtin of builtinDefaults) {
        // Verificar se já existe um formulário builtin com este título/keyword
        const existing = (forms as Array<{id:number;title:string;isBuiltin:number;fields:string|null;originalFields:string|null}>).find(f => {
          const t = f.title.toLowerCase();
          if (builtin.key === 'veiculo') return t.includes('ve') && (t.includes('culo') || t.includes('placa'));
          if (builtin.key === 'mandado') return t.includes('mandado') || t.includes('pris');
          if (builtin.key === 'antecedente') return t.includes('antecedente');
          return false;
        });

        if (existing) {
          // Já existe — atualizar fields se estiver vazio
          const hasFields = existing.fields && existing.fields !== '[]' && existing.fields.length > 2;
          if (!hasFields) {
            await db.execute(sql`UPDATE consultaForms SET fields = ${builtin.fields}, originalFields = ${builtin.fields}, isBuiltin = 1 WHERE id = ${existing.id}`);
            updated++;
          } else if (!existing.originalFields || existing.originalFields === '[]') {
            await db.execute(sql`UPDATE consultaForms SET originalFields = ${existing.fields}, isBuiltin = 1 WHERE id = ${existing.id}`);
          }
        } else {
          // Não existe — criar o formulário builtin
          await createConsultaForm({
            title: builtin.title,
            icon: builtin.icon,
            type: 'consultation',
            redirectUrl: '',
            fields: builtin.fields,
            originalFields: builtin.fields,
            isActive: 1,
            isBuiltin: 1,
            sortOrder: 0,
          });
          updated++;
        }
      }

      return { success: true, updated };
    }),

  // Excluir formulário (ADM - apenas não-builtin)
  deleteForm: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const form = await getConsultaForm(input.id);
      if (!form) throw new Error("Formulário não encontrado");
      if (form.isBuiltin) throw new Error("Formulários fixos não podem ser excluídos");
      await deleteConsultaForm(input.id);
      return { success: true };
    }),

  // Obter limite semanal de consultas (público - para o cliente saber)
  getWeeklyLimit: publicProcedure.query(async () => {
    const limit = await getSetting('consulta_weekly_limit');
    return { limit: limit ? parseInt(limit, 10) : 0 }; // 0 = sem limite
  }),

  // Verificar quantas consultas o cliente já fez esta semana
  checkMyUsage: publicProcedure
    .input(z.object({ customerPhone: z.string() }))
    .query(async ({ input }) => {
      const phone = input.customerPhone.replace(/\D/g, '');
      const count = await countConsultaRequestsThisWeek(phone);
      const limitStr = await getSetting('consulta_weekly_limit');
      const limit = limitStr ? parseInt(limitStr, 10) : 0;
      return { used: count, limit, canSubmit: limit === 0 || count < limit };
    }),

  // Admin: definir limite semanal
  setWeeklyLimit: adminProcedure
    .input(z.object({ limit: z.number().min(0) }))
    .mutation(async ({ input }) => {
      await upsertSetting('consulta_weekly_limit', String(input.limit));
      return { success: true };
    }),

  // Cliente envia uma consulta
  submit: publicProcedure
    .input(z.object({
      formId: z.number(),
      customerPhone: z.string(),
      customerName: z.string().default(""),
      customerEmail: z.string().default(""),
      customerPhoto: z.string().default(""),
      data: z.string(), // JSON
    }))
    .mutation(async ({ input }) => {
      const form = await getConsultaForm(input.formId);
      if (!form) throw new Error("Formulário não encontrado");
      if (!form.isActive) throw new Error("Formulário inativo");
      // Verificar limite semanal
      const phone = input.customerPhone.replace(/\D/g, '');
      const limitStr = await getSetting('consulta_weekly_limit');
      const limit = limitStr ? parseInt(limitStr, 10) : 0;
      if (limit > 0) {
        const count = await countConsultaRequestsThisWeek(phone);
        if (count >= limit) {
          throw new Error(`Você já atingiu o limite de ${limit} consulta(s) por semana. Tente novamente na próxima semana.`);
        }
      }
      const req = await submitConsultaRequest({
        formId: input.formId,
        formTitle: form.title,
        customerPhone: phone,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhoto: input.customerPhoto,
        data: input.data,
      });
      return { success: true, id: req.id };
    }),

  // Listar solicitações (ADM)
  listRequests: adminProcedure.query(async () => {
    return await listConsultaRequests();
  }),

  // ADM responde uma solicitação e envia por e-mail ou WhatsApp
  respond: adminProcedure
    .input(z.object({
      id: z.number(),
      adminResponse: z.string(),
      sendVia: z.enum(["email", "whatsapp", "none"]).default("none"),
    }))
    .mutation(async ({ input }) => {
      const req = await getConsultaRequest(input.id);
      if (!req) throw new Error("Solicitação não encontrada");
      await respondConsultaRequest(input.id, input.adminResponse);

      let emailSent = false;
      if (input.sendVia === "email" && req.customerEmail) {
        emailSent = await sendEmail(
          req.customerEmail,
          `Resposta: ${req.formTitle}`,
          `<p>Olá ${req.customerName || ""},</p>
           <p>Segue a resposta para sua consulta <strong>${req.formTitle}</strong>:</p>
           <blockquote style="border-left:4px solid #6366f1;padding:8px 16px;background:#f5f5ff">${input.adminResponse.replace(/\n/g, "<br>")}</blockquote>
           <p>Obrigado!</p>`
        );
      }

      // Para WhatsApp: retornar o link wa.me para o frontend abrir
      let whatsappUrl = "";
      if (input.sendVia === "whatsapp" && req.customerPhone) {
        const phone = req.customerPhone.replace(/\D/g, "");
        const msg = encodeURIComponent(`Olá ${req.customerName || ""}! Resposta da consulta *${req.formTitle}*:\n\n${input.adminResponse}`);
        whatsappUrl = `https://wa.me/55${phone}?text=${msg}`;
      }

      return { success: true, emailSent, whatsappUrl };
    }),

  // ADM faz upload de arquivo de resposta (PDF, imagem, etc.)
  uploadResponseFile: adminProcedure
    .input(z.object({
      requestId: z.number(),
      base64: z.string(),
      mimeType: z.string().default("application/pdf"),
      fileName: z.string().default("arquivo"),
    }))
    .mutation(async ({ input }) => {
      const ext = input.fileName.split(".").pop() || "pdf";
      const key = `consulta-respostas/${input.requestId}-${Date.now()}.${ext}`;
      const buffer = Buffer.from(input.base64, "base64");
      const { url } = await storagePut(key, buffer, input.mimeType);
      // Salvar a URL do arquivo na solicitação
      const db = await (await import('../db')).getDb();
      const { sql } = await import('drizzle-orm');
      if (!db) throw new Error('DB not available');
      await db.execute(sql`UPDATE consultaRequests SET responseFileUrl = ${url}, responseFileName = ${input.fileName} WHERE id = ${input.requestId}`);
      return { url, key, fileName: input.fileName };
    }),

  // ADM deleta uma solicitação
  deleteRequest: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await (await import('../db')).getDb();
      const { sql } = await import('drizzle-orm');
      if (!db) throw new Error('DB not available');
      await db.execute(sql`DELETE FROM consultaRequests WHERE id = ${input.id}`);
      return { success: true };
    }),

  // Upload de arquivo para campo de formulário dinâmico
  uploadDoc: publicProcedure
    .input(z.object({
      fieldKey: z.string(),
      base64: z.string(),
      mimeType: z.string().default("image/jpeg"),
      fileName: z.string().default("doc"),
    }))
    .mutation(async ({ input }) => {
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `consulta-docs/${Date.now()}-${input.fieldKey}.${ext}`;
      const buffer = Buffer.from(input.base64, "base64");
      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url, key };
    }),
};

// Função exportada para inicialização automática dos formulários fixos no startup
export async function autoInitBuiltinForms(): Promise<void> {
  try {
    const forms = await listConsultaForms(false);
    const db = await (await import('../db')).getDb();
    if (!db) return;
    const { sql } = await import('drizzle-orm');
    const { createConsultaForm } = await import('../db');

    const builtinDefaults: Array<{ key: string; title: string; icon: string; fields: string }> = [
      {
        key: 'veiculo',
        title: 'Consulta de Veículo',
        icon: 'Car',
        fields: JSON.stringify([{id:'r1',cols:1,fields:[{id:'f1',key:'Placa',label:'Placa do Veículo',type:'text',required:true,placeholder:'Ex: ABC1D23',mask:'placa',isActive:true},{id:'f2',key:'RENAVAM',label:'RENAVAM',type:'text',required:true,placeholder:'Somente números',mask:'numbers',isActive:true},{id:'f3',key:'Tipo de Placa',label:'Tipo de Placa',type:'select',required:true,options:['Placa Mercosul','Placa Cinza'],isActive:true}]}]),
      },
      {
        key: 'mandado',
        title: 'Mandado de Prisão',
        icon: 'Scale',
        fields: JSON.stringify([{id:'r1',cols:1,fields:[{id:'f1',key:'CPF',label:'CPF',type:'text',required:true,placeholder:'Somente números',mask:'numbers',isActive:true},{id:'f2',key:'Nome da Mãe',label:'Nome da Mãe',type:'text',required:false,placeholder:'Nome completo da mãe',isActive:true},{id:'f3',key:'Nome do Pai',label:'Nome do Pai',type:'text',required:false,placeholder:'Nome completo do pai (opcional)',isActive:true}]}]),
      },
      {
        key: 'antecedente',
        title: 'Antecedentes Criminais',
        icon: 'FileSearch',
        fields: JSON.stringify([{id:'r1',cols:2,fields:[{id:'f1',key:'CPF',label:'CPF',type:'text',required:true,placeholder:'Somente números',mask:'numbers',isActive:true},{id:'f2',key:'Nome',label:'Nome Completo',type:'text',required:true,placeholder:'Nome completo',isActive:true},{id:'f3',key:'Data de Nascimento',label:'Data de Nascimento',type:'date',required:true,isActive:true},{id:'f4',key:'Nome da Mãe',label:'Nome da Mãe',type:'text',required:false,placeholder:'Nome da mãe',isActive:true}]},{id:'r2',cols:1,fields:[{id:'f5',key:'Nome do Pai',label:'Nome do Pai',type:'text',required:false,placeholder:'Nome do pai (opcional)',isActive:true}]}]),
      },
    ];

    for (const builtin of builtinDefaults) {
      const existing = (forms as Array<{id:number;title:string;isBuiltin:number;fields:string|null;originalFields:string|null}>).find(f => {
        const t = f.title.toLowerCase();
        if (builtin.key === 'veiculo') return t.includes('ve') && (t.includes('culo') || t.includes('placa'));
        if (builtin.key === 'mandado') return t.includes('mandado') || t.includes('pris');
        if (builtin.key === 'antecedente') return t.includes('antecedente');
        return false;
      });

      if (existing) {
        const hasFields = existing.fields && existing.fields !== '[]' && existing.fields.length > 2;
        if (!hasFields) {
          await db.execute(sql`UPDATE consultaForms SET fields = ${builtin.fields}, originalFields = ${builtin.fields}, isBuiltin = 1 WHERE id = ${existing.id}`);
        } else if (!existing.originalFields || existing.originalFields === '[]') {
          await db.execute(sql`UPDATE consultaForms SET originalFields = ${existing.fields}, isBuiltin = 1 WHERE id = ${existing.id}`);
        }
      } else {
        await createConsultaForm({
          title: builtin.title,
          icon: builtin.icon,
          type: 'consultation',
          redirectUrl: '',
          fields: builtin.fields,
          originalFields: builtin.fields,
          isActive: 1,
          isBuiltin: 1,
          sortOrder: 0,
        });
      }
    }
  } catch (e) {
    // silencioso
  }
}
