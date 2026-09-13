import { z } from "zod";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { sendMail } from "./mailer";
import { getDb } from "../db";
import { customerPasswordSessions, customers } from "../../drizzle/schema";
import { requireCustomerSession } from "../customerSession";
import { notifyCustomerRouteActivity } from "./customerEntryNotification";
import { getCustomerRouteAuditTarget, shouldNotifyForRouteAudit } from "../../shared/customerRouteAudit";

const ADMIN_EMAIL = 'h2@h2colombiano.com';
let ensureCustomerRouteAuditColumnsPromise: Promise<void> | null = null;
const routeAuditInFlight = new Map<string, Promise<void>>();

async function ensureCustomerRouteAuditColumns() {
  if (ensureCustomerRouteAuditColumnsPromise) return ensureCustomerRouteAuditColumnsPromise;
  ensureCustomerRouteAuditColumnsPromise = (async () => {
    const db = (await getDb()) as any;
    if (!db) return;
    const statements = [
      "ALTER TABLE customerPasswordSessions ADD COLUMN IF NOT EXISTS routeAuditKey VARCHAR(255) NULL",
      "ALTER TABLE customerPasswordSessions ADD COLUMN IF NOT EXISTS routeAuditAreaName VARCHAR(255) NULL",
      "ALTER TABLE customerPasswordSessions ADD COLUMN IF NOT EXISTS routeAuditLastNotifiedAt DATETIME NULL",
      "ALTER TABLE customerPasswordSessions ADD COLUMN IF NOT EXISTS routeAuditLastSeenAt DATETIME NULL",
    ];
    for (const statement of statements) {
      try {
        await db.execute(drizzleSql.raw(statement));
      } catch {
        const fallback = statement.replace(" IF NOT EXISTS", "");
        try {
          await db.execute(drizzleSql.raw(fallback));
        } catch {}
      }
    }
  })().catch((error) => {
    ensureCustomerRouteAuditColumnsPromise = null;
    console.warn("[customer-route-audit] Falha ao garantir colunas:", error);
  });
  return ensureCustomerRouteAuditColumnsPromise;
}

async function runWithRouteAuditLock<T>(sessionToken: string, task: () => Promise<T>): Promise<T> {
  while (routeAuditInFlight.has(sessionToken)) {
    await routeAuditInFlight.get(sessionToken);
  }
  let release = () => {};
  const lock = new Promise<void>((resolve) => {
    release = resolve;
  });
  routeAuditInFlight.set(sessionToken, lock);
  try {
    return await task();
  } finally {
    routeAuditInFlight.delete(sessionToken);
    release();
  }
}

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

  customerRouteHeartbeat: publicProcedure
    .input(
      z.object({
        sessionToken: z.string().min(32),
        pathname: z.string().min(1),
        trigger: z.enum(["route_change", "heartbeat", "tab_visible"]).default("heartbeat"),
      })
    )
    .mutation(async ({ input }) => {
      return runWithRouteAuditLock(input.sessionToken, async () => {
        await ensureCustomerRouteAuditColumns();
        const target = getCustomerRouteAuditTarget(input.pathname);
        if (!target.tracked) return { tracked: false, notified: false } as const;
        const identity = await requireCustomerSession(input.sessionToken);
        const db = (await getDb()) as any;
        if (!db) throw new Error("Banco indisponível");

        const rows = await db
          .select({
            token: customerPasswordSessions.token,
            routeAuditKey: drizzleSql<string | null>`routeAuditKey`.as("routeAuditKey"),
            routeAuditAreaName: drizzleSql<string | null>`routeAuditAreaName`.as("routeAuditAreaName"),
            routeAuditLastNotifiedAt: drizzleSql<Date | string | null>`routeAuditLastNotifiedAt`.as("routeAuditLastNotifiedAt"),
          })
          .from(customerPasswordSessions)
          .where(eq(customerPasswordSessions.token, input.sessionToken))
          .limit(1);

        const session = rows?.[0];
        if (!session) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão expirada. Faça login novamente." });
        }

        const now = new Date();
        const currentKey = String(session.routeAuditKey || "");
        const parsedLastNotifiedAt = session.routeAuditLastNotifiedAt ? new Date(session.routeAuditLastNotifiedAt) : null;
        const lastNotifiedAt = parsedLastNotifiedAt && !Number.isNaN(parsedLastNotifiedAt.getTime())
          ? parsedLastNotifiedAt
          : null;
        const { routeChanged, shouldNotify } = shouldNotifyForRouteAudit({
          previousRouteKey: currentKey,
          nextRouteKey: target.routeKey,
          lastNotifiedAt,
          now,
        });

        await db.execute(
          drizzleSql`
            UPDATE customerPasswordSessions
            SET
              routeAuditKey = ${target.routeKey},
              routeAuditAreaName = ${target.areaName},
              routeAuditLastSeenAt = ${now},
              routeAuditLastNotifiedAt = ${shouldNotify ? now : (lastNotifiedAt || null)}
            WHERE token = ${input.sessionToken}
          `
        );

        if (!shouldNotify) return { tracked: true, notified: false } as const;

        let emailSent = false;
        try {
          const customerRows = await db
            .select({
              name: customers.name,
              phone: customers.phone,
              profilePhotoUrl: customers.profilePhotoUrl,
            })
            .from(customers)
            .where(eq(customers.phone, identity.phone))
            .limit(1);

          const customer = customerRows?.[0];
          await notifyCustomerRouteActivity({
            name: customer?.name ?? null,
            phone: customer?.phone || identity.phone,
            profilePhotoUrl: customer?.profilePhotoUrl ?? null,
            areaName: target.areaName,
            changedArea: routeChanged,
            happenedAt: now,
          });
          emailSent = true;
        } catch (error) {
          console.warn("[customer-route-audit] Falha ao enviar e-mail:", error);
        }

        return { tracked: true, notified: emailSent, routeChanged } as const;
      });
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
