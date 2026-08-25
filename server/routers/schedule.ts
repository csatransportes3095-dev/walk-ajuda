import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { sendMailDirect } from "../_core/sendMailDirect";
import { publicSiteUrl } from "../../shared/publicLinks";
import { isValidCPF } from "@shared/cpf";
import { findMainCustomerByIdentity, normalizeCustomerCpf, normalizeCustomerEmail, normalizeCustomerPhone } from "../customerAccess";
import { syncUnifiedCustomerRegistry } from "../customerIdentity";
import { storagePut } from "../storage";
import {
  getScheduleConfig, updateScheduleConfig,
  listScheduleTemplates, createScheduleTemplate, updateScheduleTemplate, deleteScheduleTemplate, getScheduleTemplateById,
  listScheduleSlots, listAvailableScheduleSlots, createScheduleSlots, deleteScheduleSlot, toggleScheduleSlot, cleanupOldScheduleSlots, setScheduleSlotTemplate,
  getAppointmentByOrder, getAppointmentByToken, createAppointment, markAppointmentEmailSent, listAppointmentsByRegistration, listAppointmentsByPhone,
  cancelAppointment, reopenAppointment, confirmAppointment, listAppointments, deleteAppointment, completeAppointment,
  getAppointmentById, manualConfirmAppointment, adminDismissScheduleAlert,
  getSetting, getLatestOrderStatus, getStatusLabelFromDb, getDb,
} from "../db";

function makeToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

const SCHEDULE_ACCESS_DURATION_MS = 15 * 60 * 1000;
const GENERIC_CUSTOMER_NAME = /^(?:CLIENTE|CADASTRO|PEDIDO)\s+RECUPERAD[OA]|^RECUPERAD[OA](?:\s|$)/i;

type ScheduleAccessPayload = { appointmentToken: string; customerId: number; expiresAt: number };

function scheduleAccessSecret(): string {
  return String(process.env.JWT_SECRET || "").trim();
}

export function phonesMatch(leftValue: unknown, rightValue: unknown): boolean {
  const left = normalizeCustomerPhone(leftValue);
  const right = normalizeCustomerPhone(rightValue);
  if (!left || !right) return false;
  return left === right ||
    (left.length === 11 && right.length === 10 && left.slice(1) === right) ||
    (right.length === 11 && left.length === 10 && right.slice(1) === left);
}

export function missingCustomerFields(customer: any): string[] {
  const missing: string[] = [];
  const name = String(customer?.name || "").trim();
  if (name.length < 2 || GENERIC_CUSTOMER_NAME.test(name)) missing.push("name");
  if (!normalizeCustomerEmail(customer?.email)) missing.push("email");
  const cpf = normalizeCustomerCpf(customer?.cpf);
  if (!cpf || !isValidCPF(cpf)) missing.push("cpf");
  if (String(customer?.city || "").trim().length < 2) missing.push("city");
  if (!/^[A-Z]{2}$/.test(String(customer?.uf || "").trim().toUpperCase())) missing.push("uf");
  if (!String(customer?.profilePhotoUrl || "").trim()) missing.push("profilePhotoUrl");
  return missing;
}

function publicAppointment(appt: any) {
  return {
    id: appt.id,
    subOrderIndex: appt.subOrderIndex,
    serviceName: appt.serviceName,
    status: appt.status,
    slotDate: appt.slotDate,
    slotTime: appt.slotTime,
    instructions: appt.instructions,
  };
}

export function createScheduleAccessToken(appointmentToken: string, customerId: number): string {
  const secret = scheduleAccessSecret();
  if (secret.length < 16) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A autenticação do agendamento está indisponível." });
  const payload: ScheduleAccessPayload = {
    appointmentToken,
    customerId,
    expiresAt: Date.now() + SCHEDULE_ACCESS_DURATION_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyScheduleAccessToken(token: string, appointmentToken: string): ScheduleAccessPayload | null {
  const secret = scheduleAccessSecret();
  if (secret.length < 16 || !token || token.length > 512) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ScheduleAccessPayload;
    if (payload.appointmentToken !== appointmentToken || !Number.isInteger(payload.customerId) || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function rows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  return (result[0] || result || []) as any[];
}

async function loadMainCustomerById(db: any, customerId: number): Promise<any | null> {
  const found = await rows(db, sql`
    SELECT id, customerNumber, name, phone, cpf, email, city, uf, profilePhotoUrl, blocked, deletedAt
    FROM customers
    WHERE id=${customerId} AND deletedAt IS NULL
    LIMIT 1
  `);
  return found[0] || null;
}

async function requireScheduleAccess(appointmentToken: string, accessToken: string) {
  const payload = verifyScheduleAccessToken(accessToken, appointmentToken);
  if (!payload) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão do agendamento inválida ou vencida." });
  const appt = await getAppointmentByToken(appointmentToken);
  const db = await getDb() as any;
  if (!appt || !db) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
  const customer = await loadMainCustomerById(db, payload.customerId);
  if (!customer || Number(customer.blocked) === 1 || !phonesMatch(customer.phone, appt.customerPhone)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão do agendamento inválida ou vencida." });
  }
  return { db, appt, customer };
}

async function getPublicOrderContext(registrationId: number) {
  const latestStatus = await getLatestOrderStatus(registrationId);
  const statusKey = latestStatus?.status ? String(latestStatus.status) : null;
  return {
    statusKey,
    statusLabel: statusKey ? await getStatusLabelFromDb(statusKey) : null,
  };
}

async function buildAuthenticatedScheduleData(appt: any, customer: any) {
  const cfg = await getScheduleConfig();
  const slots = await listAvailableScheduleSlots(appt.templateId ?? null);
  const orderStatus = await getPublicOrderContext(Number(appt.registrationId));
  return {
    found: true as const,
    requiresIdentity: false as const,
    appointment: publicAppointment(appt),
    config: cfg,
    slots,
    profile: {
      missing: missingCustomerFields(customer),
    },
    order: {
      registrationId: Number(appt.registrationId),
      serviceName: appt.serviceName || null,
      appointmentStatus: String(appt.status || "pending"),
      orderStatusKey: orderStatus.statusKey,
      orderStatusLabel: orderStatus.statusLabel,
    },
  };
}

async function sendScheduleEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!to) return false;
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
    });
    const siteTitle = (await getSetting("site_title")) || "H2 COLOMBIANO";
    await Promise.race([
      transporter.sendMail({
        from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
        to,
        subject,
        html,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
    ]);
    return true;
  } catch (e) {
    console.error("[schedule] Falha ao enviar email:", e);
    return false;
  }
}

export const scheduleRouter = router({
  // ââ€â‚¬ââ€â‚¬ââ€â‚¬ CONFIG GLOBAL ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  getConfig: publicProcedure.query(async () => {
    const cfg = await getScheduleConfig();
    return cfg;
  }),
  updateConfig: adminProcedure
    .input(z.object({
      title: z.string().optional(),
      introMessage: z.string().optional(),
      emailSubject: z.string().optional(),
      emailMessage: z.string().optional(),
      whatsappMessage: z.string().optional(),
      scheduledWhatsappMessage: z.string().optional(),
      confirmationMessage: z.string().optional(),
      noShowWarning: z.string().optional(),
      accentColor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await updateScheduleConfig(input);
      return { success: true };
    }),

  // ââ€â‚¬ââ€â‚¬ââ€â‚¬ MODELOS PRÉ-FEITOS ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  listTemplates: adminProcedure.query(async () => await listScheduleTemplates(false)),
  createTemplate: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      serviceName: z.string().default(""),
      instructions: z.string().default(""),
      emailSubject: z.string().nullable().optional(),
      emailMessage: z.string().nullable().optional(),
      whatsappMessage: z.string().nullable().optional(),
      scheduledWhatsappMessage: z.string().nullable().optional(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const t = await createScheduleTemplate({
        name: input.name,
        serviceName: input.serviceName,
        instructions: input.instructions,
        emailSubject: input.emailSubject ?? null,
        emailMessage: input.emailMessage ?? null,
        whatsappMessage: input.whatsappMessage ?? null,
        scheduledWhatsappMessage: input.scheduledWhatsappMessage ?? null,
        sortOrder: input.sortOrder,
      });
      return t;
    }),
  updateTemplate: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      serviceName: z.string().optional(),
      instructions: z.string().optional(),
      emailSubject: z.string().nullable().optional(),
      emailMessage: z.string().nullable().optional(),
      whatsappMessage: z.string().nullable().optional(),
      scheduledWhatsappMessage: z.string().nullable().optional(),
      isActive: z.number().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await updateScheduleTemplate(id, rest as any);
      return { success: true };
    }),
  deleteTemplate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteScheduleTemplate(input.id);
      return { success: true };
    }),

  // ââ€â‚¬ââ€â‚¬ââ€â‚¬ SLOTS DE DATA/HORA (ADMIN) ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  listSlots: adminProcedure.query(async () => {
    await cleanupOldScheduleSlots();
    return await listScheduleSlots();
  }),
  // cria slots em lote: combinação de datas x horários, vinculados a um modelo (templateId).
  createSlots: adminProcedure
    .input(z.object({
      dates: z.array(z.string()).min(1),       // ["2026-06-20", ...]
      times: z.array(z.string()).min(1),       // ["09:00", "09:30", ...]
      capacity: z.number().min(1).default(1),
      templateId: z.number().nullable().optional(), // null = geral (vale para qualquer modelo)
    }))
    .mutation(async ({ input }) => {
      const slots: { slotDate: string; slotTime: string; capacity: number }[] = [];
      for (const d of input.dates) {
        for (const t of input.times) {
          slots.push({ slotDate: d, slotTime: t, capacity: input.capacity });
        }
      }
      const created = await createScheduleSlots(slots, input.templateId ?? null);
      return { created };
    }),
  deleteSlot: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await deleteScheduleSlot(input.id); return { success: true }; }),
  toggleSlot: adminProcedure
    .input(z.object({ id: z.number(), status: z.enum(["available", "disabled"]) }))
    .mutation(async ({ input }) => { await toggleScheduleSlot(input.id, input.status); return { success: true }; }),
  // altera o modelo de um horário existente
  setSlotTemplate: adminProcedure
    .input(z.object({ id: z.number(), templateId: z.number().nullable() }))
    .mutation(async ({ input }) => { await setScheduleSlotTemplate(input.id, input.templateId); return { success: true }; }),

  // ââ€â‚¬ââ€â‚¬ââ€â‚¬ AGENDAMENTOS (ADMIN) ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  listAppointments: adminProcedure.query(async () => await listAppointments()),

  getForOrder: adminProcedure
    .input(z.object({ registrationId: z.number(), subOrderIndex: z.number().default(0), customerPhone: z.string().optional() }))
    .query(async ({ input }) => {
      let appt = await getAppointmentByOrder(input.registrationId, input.subOrderIndex);
      // Fallback por TELEFONE: agendamentos podem ter sido vinculados a um
      // registrationId antigo/diferente do mesmo cliente (re-cadastro). Se não
      // encontrar pela chave do pedido, casa pelo telefone (chave confiável),
      // priorizando o agendamento confirmado mais recente.
      if (!appt && input.customerPhone) {
        const byPhone = await listAppointmentsByPhone(input.customerPhone);
        if (byPhone.length > 0) {
          appt = byPhone.find(a => a.status === "confirmed")
            ?? byPhone.find(a => a.status === "pending")
            ?? byPhone[0];
        }
      }
      if (!appt) return null;
      // Busca o texto de WhatsApp do modelo associado (se houver)
      let templateWhatsappMessage: string | null = null;
      if (appt.templateId) {
        const tpl = await getScheduleTemplateById(appt.templateId);
        templateWhatsappMessage = tpl?.whatsappMessage ?? null;
      }
      // Enriquecer com o status mais recente do pedido
      let orderStatusKey: string | null = null;
      let orderStatusLabel: string | null = null;
      try {
        const latestStatus = await getLatestOrderStatus(appt.registrationId);
        if (latestStatus?.status) {
          orderStatusKey = latestStatus.status;
          orderStatusLabel = await getStatusLabelFromDb(latestStatus.status);
        }
      } catch (e) { /* silently ignore */ }
      return { ...appt, templateWhatsappMessage, orderStatusKey, orderStatusLabel };
    }),

  // Cria (ou recria) o link individual de agendamento para um pedido
  createForOrder: adminProcedure
    .input(z.object({
      registrationId: z.number(),
      subOrderIndex: z.number().default(0),
      customerPhone: z.string(),
      customerName: z.string().nullable().optional(),
      customerEmail: z.string().nullable().optional(),
      customerPhotoUrl: z.string().nullable().optional(),
      serviceName: z.string().nullable().optional(),
      instructions: z.string().nullable().optional(),
      templateId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const token = makeToken();
      const appt = await createAppointment({
        token,
        registrationId: input.registrationId,
        subOrderIndex: input.subOrderIndex,
        customerPhone: input.customerPhone,
        customerName: input.customerName ?? null,
        customerEmail: input.customerEmail ?? null,
        customerPhotoUrl: input.customerPhotoUrl ?? null,
        serviceName: input.serviceName ?? null,
        instructions: input.instructions ?? null,
        templateId: input.templateId ?? null,
      });
      return appt;
    }),

  // Reagendar / cancelar
  reopen: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await reopenAppointment(input.id); return { success: true }; }),

  // Reagendar + notificar cliente (email + retorna link WhatsApp)
  reopenAndNotify: adminProcedure
    .input(z.object({ id: z.number(), origin: z.string() }))
    .mutation(async ({ input }) => {
      await reopenAppointment(input.id);
      const appt = await getAppointmentById(input.id);
      if (!appt) return { success: true, emailSent: false, waLink: null };
      const link = publicSiteUrl(`/agendar/${appt.token}`);
      const cfg = await getScheduleConfig();
      const accent = cfg?.accentColor || "#8b5cf6";
      const siteTitle = (await getSetting("site_title")) || "H2 COLOMBIANO";
      const customerName = appt.customerName ? `, ${appt.customerName.split(' ')[0]}` : '';
      // Mensagem WhatsApp
      const waMsg = `Olá${customerName}! Seu agendamento do pedido #${appt.registrationId} foi liberado para reagendamento. Por favor, escolha um novo horário pelo link abaixo:\n${link}`;
      const digits = appt.customerPhone.replace(/\D/g, '');
      const waFull = digits.startsWith('55') ? digits : `55${digits}`;
      const waUrl = `https://wa.me/${waFull}?text=${encodeURIComponent(waMsg)}`;
      // Email — enviar de forma assíncrona para não bloquear o retorno do waLink
      setImmediate(async () => {
        try {
          let customerEmail = appt.customerEmail;
          if (!customerEmail) {
            const { getCustomerByPhone } = await import('../db');
            const phoneDigits = appt.customerPhone.replace(/\D/g, '');
            const customer = await getCustomerByPhone(phoneDigits);
            if (customer?.email) customerEmail = customer.email;
          }
          if (customerEmail) {
            const subject = `Reagendamento necessário — ${siteTitle}`;
            const html = `
              <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:12px">
                <h2 style="color:${accent};margin:0 0 16px">Reagendamento necessário</h2>
                <p style="margin:0 0 12px;font-size:15px;color:#333">Olá${customerName}! Seu agendamento do pedido <strong>#${appt.registrationId}</strong> foi liberado para reagendamento.</p>
                <p style="margin:0 0 12px;font-size:15px;color:#333">Por favor, clique no botão abaixo para escolher um novo horário:</p>
                <p style="text-align:center;margin:24px 0">
                  <a href="${link}" style="background:${accent};color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Escolher novo horário</a>
                </p>
                <p style="margin:0 0 12px;font-size:13px;color:#888">Ou copie e cole este link no navegador:<br>${link}</p>
              </div>`;
            await sendScheduleEmail(customerEmail, subject, html);
          }
        } catch (e) { console.warn('[ScheduleEmail] Erro ao enviar email de reagendamento:', e); }
      });
      return { success: true, emailSent: true, waLink: waUrl };
    }),
  cancel: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await cancelAppointment(input.id); return { success: true }; }),
  remove: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await deleteAppointment(input.id); return { success: true }; }),
  complete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await completeAppointment(input.id); return { success: true }; }),

  // Agendamento manual pelo admin: define data e hora diretamente
  manualConfirm: adminProcedure
    .input(z.object({ id: z.number(), slotDate: z.string(), slotTime: z.string() }))
    .mutation(async ({ input }) => {
      const appt = await manualConfirmAppointment(input.id, input.slotDate, input.slotTime);
      if (!appt) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });
      // Notificar admin por e-mail de forma assíncrona (não bloqueia a resposta)
      setImmediate(() => {
        try {
          const transporter = nodemailer.createTransport({
            host: 'smtp.zoho.com',
            port: 465,
            secure: true,
            auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
          });
          transporter.sendMail({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: 'h2@h2colombiano.com',
            subject: 'Agendamento manual confirmado',
            html: `<h2>Agendamento manual confirmado</h2><p>Pedido: <strong>#${appt.registrationId}</strong></p><p>Cliente: <strong>${appt.customerName || appt.customerPhone}</strong></p><p>Data: <strong>${input.slotDate}</strong></p><p>Hora: <strong>${input.slotTime}</strong></p>`,
          }).catch((e: any) => console.warn('[ScheduleEmail] Erro ao enviar e-mail:', e));
        } catch (e) { console.warn('[ScheduleEmail] Erro ao criar transporter:', e); }
      });
      // Montar waLink para notificar cliente sobre novo horário
      let waLink: string | null = null;
      try {
        const cfg = await getScheduleConfig();
        const digits = appt.customerPhone.replace(/\D/g, '');
        const waFull = digits.startsWith('55') ? digits : `55${digits}`;
        let msg = (cfg as any)?.scheduledWhatsappMessage || '';
        if (!msg) msg = `Olá ${appt.customerName || ''}! Seu atendimento está confirmado para o dia ${input.slotDate} às ${input.slotTime}. Fique disponível no WhatsApp nesse horário!`;
        msg = msg
          .replace(/\{nome\}/gi, appt.customerName || '')
          .replace(/\{data\}/gi, input.slotDate)
          .replace(/\{hora\}/gi, input.slotTime)
          .replace(/\{telefone\}/gi, appt.customerPhone)
          .replace(/\{servico\}/gi, (appt as any).serviceName || '')
          .replace(/\{cadastro\}/gi, appt.registrationId ? `*${appt.registrationId}` : '');
        waLink = `https://wa.me/${waFull}?text=${encodeURIComponent(msg)}`;
      } catch (e) { console.warn('[ScheduleWA] Erro ao montar waLink:', e); }
      return { success: true, waLink };
    }),

  // Enviar link por e-mail
  sendEmail: adminProcedure
    .input(z.object({ token: z.string(), origin: z.string() }))
    .mutation(async ({ input }) => {
      const appt = await getAppointmentByToken(input.token);
      if (!appt) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });
      if (!appt.customerEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "Este cliente não possui e-mail cadastrado" });
      const cfg = await getScheduleConfig();
      const link = publicSiteUrl(`/agendar/${appt.token}`);
      const subject = cfg?.emailSubject || "Agende seu atendimento";
      const intro = cfg?.emailMessage || "Seu pedido precisa ser agendado. Clique no link abaixo para escolher a data e o horário.";
      const accent = cfg?.accentColor || "#8b5cf6";
      const serviceLine = appt.serviceName ? `<p style="margin:0 0 12px;font-size:15px;color:#333"><strong>Serviço:</strong> ${appt.serviceName}</p>` : "";
      const instrLine = appt.instructions ? `<p style="margin:0 0 12px;font-size:14px;color:#555">${appt.instructions}</p>` : "";
      const warn = cfg?.noShowWarning || "";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:12px">
          <h2 style="color:${accent};margin:0 0 16px">${cfg?.title || "Agende seu atendimento"}</h2>
          <p style="margin:0 0 12px;font-size:15px;color:#333">${intro}</p>
          ${serviceLine}
          ${instrLine}
          <p style="text-align:center;margin:24px 0">
            <a href="${link}" style="background:${accent};color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Escolher data e horário</a>
          </p>
          <p style="margin:0 0 12px;font-size:13px;color:#888">Ou copie e cole este link no navegador:<br>${link}</p>
          ${warn ? `<p style="margin:16px 0 0;font-size:13px;color:#b45309;background:#fef3c7;padding:12px;border-radius:8px">${warn}</p>` : ""}
        </div>`;
      const ok = await sendScheduleEmail(appt.customerEmail, subject, html);
      if (ok) {
        await markAppointmentEmailSent(appt.id);
        // Notificar admin por e-mail
        try {
          const transporter = nodemailer.createTransport({
          host: 'smtp.zoho.com',
          port: 465,
          secure: true,
          auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
        });
          await transporter.sendMail({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: 'h2@h2colombiano.com',
            subject: 'Link de agendamento enviado',
            html: `<h2>Link de agendamento enviado</h2><p>Pedido: <strong>#${appt.registrationId}</strong></p><p>E-mail: <strong>${appt.customerEmail}</strong></p>`,
          });
        } catch (e) { console.warn('[ScheduleEmail] Erro ao enviar e-mail:', e); }
        // Cópia para o e-mail de destino dos pedidos (mesma regra dos pedidos do site)
        const orderEmail = 'h2@h2colombiano.com';
        if (orderEmail && orderEmail !== appt.customerEmail) {
          const adminHtml = `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff;border-radius:12px">
              <h2 style="color:${accent};margin:0 0 12px">Link de agendamento enviado ao cliente</h2>
              <p style="margin:0 0 8px;font-size:14px;color:#333"><strong>Pedido:</strong> #${appt.registrationId}</p>
              <p style="margin:0 0 8px;font-size:14px;color:#333"><strong>Cliente:</strong> ${appt.customerName || ""} (${appt.customerPhone})</p>
              ${appt.serviceName ? `<p style=\"margin:0 0 8px;font-size:14px;color:#333\"><strong>Serviço:</strong> ${appt.serviceName}</p>` : ""}
              <p style="margin:0 0 8px;font-size:14px;color:#333"><strong>E-mail do cliente:</strong> ${appt.customerEmail}</p>
              <p style="margin:12px 0 0;font-size:13px;color:#888">Link: ${link}</p>
            </div>`;
          sendScheduleEmail(orderEmail, `Agendamento enviado — Pedido #${appt.registrationId}`, adminHtml).catch(() => {});
        }
      }
      return { success: ok };
    }),

  // Lista agendamentos de um pedido para a PÁGINA DE ACOMPANHAMENTO (público)
  // Retorna apenas o necessário para exibir status/data/hora e montar o link.
  listForTracking: publicProcedure
    .input(z.object({ registrationId: z.number() }))
    .query(async ({ input }) => {
      const list = await listAppointmentsByRegistration(input.registrationId);
      return list
        .filter(a => a.status !== "cancelled")
        .map(a => ({
          id: a.id,
          token: a.token,
          subOrderIndex: a.subOrderIndex,
          serviceName: a.serviceName,
          status: a.status,
          slotDate: a.slotDate,
          slotTime: a.slotTime,
        }));
    }),

  // Lista agendamentos pelo TELEFONE para a PÁGINA DE ACOMPANHAMENTO (público).
  // Mais confiável que registrationId, pois o telefone é a chave usada no acompanhamento.
  listForTrackingByPhone: publicProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      const list = await listAppointmentsByPhone(input.phone);
      return list
        .filter(a => a.status !== "cancelled" && a.status !== "completed")
        .map(a => ({
          id: a.id,
          token: a.token,
          subOrderIndex: a.subOrderIndex,
          serviceName: a.serviceName,
          status: a.status,
          slotDate: a.slotDate,
          slotTime: a.slotTime,
        }));
    }),

  // ââ€â‚¬ââ€â‚¬ââ€â‚¬ PÚBLICO (PÁGINA DO CLIENTE) ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬
  // Dados públicos mínimos: antes da identificação, não vaza pedido, cliente, status ou horários.
  getByToken: publicProcedure
    .input(z.object({ token: z.string().min(32).max(64), accessToken: z.string().min(32).max(512).optional() }))
    .query(async ({ input }) => {
      const appt = await getAppointmentByToken(input.token);
      if (!appt) return { found: false as const };
      if (!input.accessToken) return { found: true as const, requiresIdentity: true as const };
      const { customer } = await requireScheduleAccess(input.token, input.accessToken);
      return buildAuthenticatedScheduleData(appt, customer);
    }),

  // Valida telefone ou CPF contra o cadastro principal e libera uma sessão curta do agendamento.
  authorize: publicProcedure
    .input(z.object({ token: z.string().min(32).max(64), identity: z.string().min(5).max(32) }))
    .mutation(async ({ input }) => {
      const appt = await getAppointmentByToken(input.token);
      if (!appt) return { success: false as const, error: "invalid" as const };
      const rawIdentity = input.identity.trim();
      const phone = normalizeCustomerPhone(rawIdentity);
      const cpf = normalizeCustomerCpf(rawIdentity);
      if (!phone && !cpf) return { success: false as const, error: "invalid" as const };
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Agendamento temporariamente indisponível." });
      let customer = phone ? await findMainCustomerByIdentity({ phone }, db) : null;
      if (!customer || !phonesMatch(customer.phone, appt.customerPhone)) {
        customer = cpf ? await findMainCustomerByIdentity({ cpf }, db) : null;
      }
      if (!customer || customer.deletedAt || Number(customer.blocked) === 1 || !phonesMatch(customer.phone, appt.customerPhone)) {
        return { success: false as const, error: "invalid" as const };
      }
      const accessToken = createScheduleAccessToken(input.token, Number(customer.id));
      return { success: true as const, accessToken, data: await buildAuthenticatedScheduleData(appt, customer) };
    }),

  // Atualiza somente os campos que estavam faltantes no cadastro principal.
  saveMissingProfile: publicProcedure
    .input(z.object({
      token: z.string().min(32).max(64),
      accessToken: z.string().min(32).max(512),
      name: z.string().trim().min(2).max(128).optional(),
      email: z.string().trim().email().max(320).optional(),
      cpf: z.string().min(11).max(18).optional(),
      city: z.string().trim().min(2).max(128).optional(),
      uf: z.string().trim().length(2).optional(),
    }))
    .mutation(async ({ input }) => {
      const { db, appt, customer } = await requireScheduleAccess(input.token, input.accessToken);
      const missing = missingCustomerFields(customer);
      const name = input.name?.trim().replace(/\s+/g, " ");
      const email = input.email ? normalizeCustomerEmail(input.email) : "";
      const cpf = input.cpf ? normalizeCustomerCpf(input.cpf) : "";
      const city = input.city?.trim().replace(/\s+/g, " ");
      const uf = input.uf?.trim().toUpperCase();
      if (missing.includes("name") && input.name !== undefined && (!name || name.length < 2 || GENERIC_CUSTOMER_NAME.test(name))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe seu nome completo." });
      }
      if (missing.includes("email") && input.email !== undefined && !email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um e-mail válido." });
      }
      if (missing.includes("cpf") && input.cpf !== undefined && (!cpf || !isValidCPF(cpf))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um CPF válido." });
      }
      if (missing.includes("uf") && input.uf !== undefined && !uf?.match(/^[A-Z]{2}$/)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe uma UF válida." });
      }
      const cpfConflict = cpf && missing.includes("cpf") ? await findMainCustomerByIdentity({ cpf }, db) : null;
      const emailConflict = email && missing.includes("email") ? await findMainCustomerByIdentity({ email }, db) : null;
      if ((cpfConflict && Number(cpfConflict.id) !== Number(customer.id)) || (emailConflict && Number(emailConflict.id) !== Number(customer.id))) {
        throw new TRPCError({ code: "CONFLICT", message: "CPF ou e-mail já pertence a outro cadastro." });
      }
      const previousIdentity = { phone: customer.phone, cpf: customer.cpf };
      const updates: any[] = [];
      if (missing.includes("name") && name) updates.push(sql`name=${name}`);
      if (missing.includes("email") && email) updates.push(sql`email=${email}, normalizedEmail=${email}`);
      if (missing.includes("cpf") && cpf) updates.push(sql`cpf=${cpf}, normalizedCpf=${cpf}`);
      if (missing.includes("city") && city) updates.push(sql`city=${city}`);
      if (missing.includes("uf") && uf) updates.push(sql`uf=${uf}`);
      if (updates.length > 0) {
        updates.push(sql`updatedAt=NOW()`);
        await db.execute(sql`UPDATE customers SET ${sql.join(updates, sql`, `)} WHERE id=${customer.id} AND deletedAt IS NULL`);
        await syncUnifiedCustomerRegistry([previousIdentity]);
      }
      const refreshed = await loadMainCustomerById(db, Number(customer.id));
      if (!refreshed) throw new TRPCError({ code: "NOT_FOUND", message: "Cadastro não encontrado." });
      return { success: true as const, remaining: missingCustomerFields(refreshed), data: await buildAuthenticatedScheduleData(appt, refreshed) };
    }),

  // Atualiza a foto somente quando ela estiver faltante no cadastro principal.
  uploadMissingProfilePhoto: publicProcedure
    .input(z.object({ token: z.string().min(32).max(64), accessToken: z.string().min(32).max(512), imageBase64: z.string().min(100).max(8_000_000) }))
    .mutation(async ({ input }) => {
      const { db, appt, customer } = await requireScheduleAccess(input.token, input.accessToken);
      if (!missingCustomerFields(customer).includes("profilePhotoUrl")) return { success: true as const, remaining: missingCustomerFields(customer), data: await buildAuthenticatedScheduleData(appt, customer) };
      const comma = input.imageBase64.indexOf(",");
      const pureBase64 = (comma >= 0 ? input.imageBase64.slice(comma + 1) : input.imageBase64).trim();
      const buffer = Buffer.from(pureBase64, "base64");
      const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
      if (!buffer.length || buffer.length > 5 * 1024 * 1024 || (!isJpeg && !isPng && !isWebp)) throw new TRPCError({ code: "BAD_REQUEST", message: "Envie uma foto JPG, PNG ou WEBP de até 5 MB." });
      const ext = isJpeg ? "jpg" : isPng ? "png" : "webp";
      const mime = isJpeg ? "image/jpeg" : isPng ? "image/png" : "image/webp";
      const phone = normalizeCustomerPhone(customer.phone);
      const { url } = await storagePut(`profile-photos/${phone}-${Date.now()}.${ext}`, buffer, mime);
      await db.execute(sql`UPDATE customers SET profilePhotoUrl=${url}, updatedAt=NOW() WHERE id=${customer.id} AND deletedAt IS NULL`);
      const refreshed = await loadMainCustomerById(db, Number(customer.id));
      return { success: true as const, remaining: refreshed ? missingCustomerFields(refreshed) : [], data: refreshed ? await buildAuthenticatedScheduleData(appt, refreshed) : null };
    }),

  // Cliente confirma o horário escolhido (reserva exclusiva)
  confirm: publicProcedure
    .input(z.object({ token: z.string().min(32).max(64), accessToken: z.string().min(32).max(512), slotId: z.number() }))
    .mutation(async ({ input }) => {
      await requireScheduleAccess(input.token, input.accessToken);
      const result = await confirmAppointment(input.token, input.slotId);
      if (!result.ok) throw new TRPCError({ code: "CONFLICT", message: result.reason || "Não foi possível agendar" });
      const appt = result.appointment!;
      // Notificar admin por e-mail
      (async () => {
        try {
          const transporter = nodemailer.createTransport({
          host: 'smtp.zoho.com',
          port: 465,
          secure: true,
          auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
        });
          await transporter.sendMail({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: 'h2@h2colombiano.com',
            subject: 'Novo agendamento confirmado',
            html: `<h2>Novo agendamento confirmado</h2><p>Pedido: <strong>#${appt.registrationId}</strong></p><p>Cliente: <strong>${appt.customerName || appt.customerPhone}</strong></p><p>Data/Hora: <strong>${appt.slotDate} Á s ${appt.slotTime}</strong></p>`,
          });
        } catch (e) { console.warn('[ScheduleEmail] Erro ao enviar e-mail:', e); }
      })();
      // Avisa o e-mail de destino dos pedidos que o cliente escolheu o horário
      (async () => {
        const orderEmail = 'h2@h2colombiano.com';
        if (orderEmail) {
          const html = `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff;border-radius:12px">
              <h2 style="color:#16a34a;margin:0 0 12px">âÅ“â€¦ Cliente agendou o atendimento</h2>
              <p style="margin:0 0 8px;font-size:14px;color:#333"><strong>Pedido:</strong> #${appt.registrationId}</p>
              <p style="margin:0 0 8px;font-size:14px;color:#333"><strong>Cliente:</strong> ${appt.customerName || ""} (${appt.customerPhone})</p>
              ${appt.serviceName ? `<p style=\"margin:0 0 8px;font-size:14px;color:#333\"><strong>Serviço:</strong> ${appt.serviceName}</p>` : ""}
              <p style="margin:8px 0 0;font-size:16px;color:#111"><strong>Data/Hora:</strong> ${appt.slotDate} Á s ${appt.slotTime}</p>
            </div>`;
          sendScheduleEmail(orderEmail, `Agendamento confirmado — Pedido #${appt.registrationId}`, html).catch(() => {});
        }
      })().catch(() => {});
      return { success: true, appointment: appt };
    }),

  // Cliente solicita reagendamento pelo token: libera o slot atual e volta para pending
  // para que ele possa escolher um novo horário disponível.
  requestReschedule: publicProcedure
    .input(z.object({ token: z.string().min(32).max(64), accessToken: z.string().min(32).max(512) }))
    .mutation(async ({ input }) => {
      await requireScheduleAccess(input.token, input.accessToken);
      const appt = await getAppointmentByToken(input.token);
      if (!appt) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });
      if (appt.status !== "confirmed") {
        // já está pendente/sem horário — nada a fazer
        return { success: true };
      }
      const prevDate = appt.slotDate;
      const prevTime = appt.slotTime;
      await reopenAppointment(appt.id);
      // Notificar admin por e-mail
      (async () => {
        try {
          const transporter = nodemailer.createTransport({
          host: 'smtp.zoho.com',
          port: 465,
          secure: true,
          auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
        });
          await transporter.sendMail({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: 'h2@h2colombiano.com',
            subject: 'Cliente solicitou reagendamento',
            html: `<h2>Cliente solicitou reagendamento</h2><p>Pedido: <strong>#${appt.registrationId}</strong></p><p>Cliente: <strong>${appt.customerName || appt.customerPhone}</strong></p><p>Horario liberado: <strong>${prevDate ?? ""} ${prevTime ?? ""}</strong></p>`,
          });
        } catch (e) { console.warn('[ScheduleEmail] Erro ao enviar e-mail:', e); }
      })();
      (async () => {
        const orderEmail = 'h2@h2colombiano.com';
        if (orderEmail) {
          const html = `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff;border-radius:12px">
              <h2 style="color:#d97706;margin:0 0 12px">âÅ¡Â Ã¯Â¸Â Cliente solicitou reagendamento</h2>
              <p style="margin:0 0 8px;font-size:14px;color:#333"><strong>Pedido:</strong> #${appt.registrationId}</p>
              <p style="margin:0 0 8px;font-size:14px;color:#333"><strong>Cliente:</strong> ${appt.customerName || ""} (${appt.customerPhone})</p>
              <p style="margin:8px 0 0;font-size:14px;color:#333">Horário liberado: ${prevDate ?? ""} ${prevTime ?? ""}. O cliente vai escolher um novo horário.</p>
            </div>`;
          sendScheduleEmail(orderEmail, `Reagendamento solicitado — Pedido #${appt.registrationId}`, html).catch(() => {});
        }
      })().catch(() => {});
      return { success: true };
    }),

  // Admin dispensa o alerta de agendamento confirmado (marca como visto)
  dismissConfirmedAlert: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await adminDismissScheduleAlert(input.id);
      return { success: true };
    }),

  // Busca o status mais recente do pedido pelo telefone do cliente
  // Usado para substituir a variável {status} nas mensagens de WhatsApp
  getLatestOrderStatusByPhone: adminProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      const { getDb } = await import('../db');
      const db = await getDb();
      if (!db) return { status: null, label: null };
      const digits = (input.phone || '').replace(/\D/g, '').slice(-11);
      if (digits.length < 10) return { status: null, label: null };
      try {
        // Busca o status mais recente do pedido pelo telefone (normalizado)
        const rows = await db.execute(`
          SELECT osh.status, ost.label
          FROM orderStatusHistory osh
          LEFT JOIN orderStatusTypes ost ON ost.\`key\` = osh.status AND ost.isActive = 1
          WHERE REGEXP_REPLACE(osh.customerPhone, '[^0-9]', '') LIKE CONCAT('%', '${digits}')
          ORDER BY osh.createdAt DESC
          LIMIT 1
        `);
        const row = (rows as any)?.[0]?.[0] || (rows as any)?.[0];
        if (!row || !row.status) return { status: null, label: null };
        return {
          status: String(row.status),
          label: row.label ? String(row.label) : String(row.status),
        };
      } catch (e) {
        console.error('[schedule] getLatestOrderStatusByPhone error:', e);
        return { status: null, label: null };
      }
    }),
});
