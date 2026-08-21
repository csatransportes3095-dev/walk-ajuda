import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { sendMailDirect } from "../_core/sendMailDirect";
import { publicSiteUrl } from "../../shared/publicLinks";
import {
  getScheduleConfig, updateScheduleConfig,
  listScheduleTemplates, createScheduleTemplate, updateScheduleTemplate, deleteScheduleTemplate, getScheduleTemplateById,
  listScheduleSlots, listAvailableScheduleSlots, createScheduleSlots, deleteScheduleSlot, toggleScheduleSlot, cleanupOldScheduleSlots, setScheduleSlotTemplate,
  getAppointmentByOrder, getAppointmentByToken, createAppointment, markAppointmentEmailSent, listAppointmentsByRegistration, listAppointmentsByPhone,
  cancelAppointment, reopenAppointment, confirmAppointment, listAppointments, deleteAppointment, completeAppointment,
  getAppointmentById, manualConfirmAppointment, adminDismissScheduleAlert,
  getSetting, getLatestOrderStatus, getStatusLabelFromDb,
} from "../db";

function makeToken(): string {
  return crypto.randomBytes(16).toString("hex");
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
  // Dados do agendamento pelo token + slots disponíveis + config
  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const appt = await getAppointmentByToken(input.token);
      if (!appt) return { found: false as const };
      const cfg = await getScheduleConfig();
      // envia slots disponíveis sempre, para permitir reagendamento
      const slots = await listAvailableScheduleSlots(appt.templateId ?? null);
      return { found: true as const, appointment: appt, config: cfg, slots };
    }),

  // Cliente confirma o horário escolhido (reserva exclusiva)
  confirm: publicProcedure
    .input(z.object({ token: z.string(), slotId: z.number() }))
    .mutation(async ({ input }) => {
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
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
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
