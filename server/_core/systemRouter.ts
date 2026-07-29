import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { sendMail } from "./mailer";

const ADMIN_EMAIL = 'h2@h2colombiano.com';

async function sendOwnerEmail(subject: string, html: string) {
  try {
    await sendMail({
      to: ADMIN_EMAIL,
      subject,
      html,
    });
  } catch (e) {
    console.warn('[SystemEmail] Erro ao enviar e-mail:', e);
  }
}

export const systemRouter = router({
  securityAlert: publicProcedure
    .input(
      z.object({
        type: z.string(),
        phone: z.string().optional(),
        page: z.string().optional(),
        userAgent: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const title = `⚠️ ALERTA DE SEGURANÇA: ${input.type}`;
      const content = [
        `Tipo: ${input.type}`,
        input.phone ? `Telefone: ${input.phone}` : null,
        input.page ? `Página: ${input.page}` : null,
        input.userAgent ? `Navegador: ${input.userAgent}` : null,
        `Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      ].filter(Boolean).join('\n');
      // Enviar apenas por e-mail (sem notificacao push Manus)
      const htmlBody = `<h2>${title}</h2><pre style="font-family:monospace;white-space:pre-wrap">${content}</pre>`;
      await sendOwnerEmail(title, htmlBody);
      return { received: true };
    }),

  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      // Enviar apenas por e-mail (sem notificacao push Manus)
      const htmlBody = `<h2>${input.title}</h2><pre style="font-family:monospace;white-space:pre-wrap">${input.content}</pre>`;
      await sendOwnerEmail(input.title, htmlBody);
      return {
        success: true,
      } as const;
    }),
});
