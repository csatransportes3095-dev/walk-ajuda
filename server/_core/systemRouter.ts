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

function rowsOf<T>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function normalizePhone(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

function brazilToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function reconcileOrphanVipInstallmentPlans(db: any, customerId?: number) {
  const orphanResult = await db.execute(drizzleSql`
    SELECT p.id, p.customerId, p.status, p.balanceCents
    FROM vipInstallmentPlans p
    WHERE p.balanceCents > 0
      AND p.status NOT IN ('paid', 'cancelled')
      AND (${customerId == null ? 1 : 0}=1 OR p.customerId=${customerId ?? 0})
      AND NOT (
        EXISTS (
          SELECT 1
          FROM vipInstallmentCheckoutIntents ci
          INNER JOIN accessCodePhones acp ON acp.id=ci.finalizedRegistrationId
          WHERE ci.finalizedPlanId=p.id
            AND ci.finalizedRegistrationId IS NOT NULL
            AND acp.deletedAt IS NULL
            AND EXISTS (
              SELECT 1 FROM orderStatusHistory osh0
              WHERE osh0.registrationId=ci.finalizedRegistrationId
                AND osh0.orderNumber=CAST(p.orderNumber AS UNSIGNED)
            )
            AND NOT EXISTS (
              SELECT 1 FROM hiddenSubOrders h
              WHERE h.registrationId=ci.finalizedRegistrationId
            )
        )
        OR (
          NOT EXISTS (
            SELECT 1 FROM vipInstallmentCheckoutIntents ci2
            WHERE ci2.finalizedPlanId=p.id
          )
          AND EXISTS (
            SELECT 1
            FROM orderStatusHistory osh
            INNER JOIN accessCodePhones acp2 ON acp2.id=osh.registrationId
            WHERE osh.orderNumber=CAST(p.orderNumber AS UNSIGNED)
              AND acp2.deletedAt IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM hiddenSubOrders h2
                WHERE h2.registrationId=osh.registrationId
              )
          )
        )
      )
  `);

  for (const row of rowsOf<any>(orphanResult)) {
    const planId = Number(row.id);
    if (!Number.isSafeInteger(planId) || planId <= 0) continue;
    const previousBalance = Number(row.balanceCents || 0);

    await db.execute(drizzleSql`
      UPDATE vipInstallments
      SET status='cancelled'
      WHERE planId=${planId}
        AND status IN ('pending', 'overdue', 'awaiting_confirmation')
    `);
    await db.execute(drizzleSql`
      UPDATE vipInstallmentPlans
      SET status='cancelled', balanceCents=0, openSlotCustomerId=NULL
      WHERE id=${planId}
        AND status NOT IN ('paid', 'cancelled')
    `);
    await db.execute(drizzleSql`
      INSERT INTO vipInstallmentHistory
        (planId, installmentId, action, actorType, actorId, previousValue, newValue, notes)
      SELECT ${planId}, NULL, 'order_deleted_plan_cancelled', 'system', 'system',
             ${JSON.stringify({ status: String(row.status || ''), balanceCents: previousBalance })},
             ${JSON.stringify({ status: 'cancelled', balanceCents: 0 })},
             'Pedido de origem excluído; saldo restante cancelado automaticamente.'
      WHERE NOT EXISTS (
        SELECT 1 FROM vipInstallmentHistory
        WHERE planId=${planId} AND action='order_deleted_plan_cancelled'
      )
    `);
  }
}

async function tryReconcileOrphanVipInstallmentPlans(db: any, customerId?: number) {
  try {
    await reconcileOrphanVipInstallmentPlans(db, customerId);
  } catch (error) {
    console.warn("[vip-installments] Falha ao reconciliar plano órfão; consulta seguirá apenas com pedidos válidos.", error);
  }
}

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
    await sendMail({ to: ADMIN_EMAIL, subject, html });
  } catch (e) {
    console.warn('[SystemEmail] Erro ao enviar e-mail:', e);
  }
}

export const systemRouter = router({
  securityAlert: publicProcedure
    .input(z.object({
      type: z.string(),
      phone: z.string().optional(),
      page: z.string().optional(),
      userAgent: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const title = `⚠️ ALERTA DE SEGURANÇA: ${input.type}`;
      const content = [
        `Tipo: ${input.type}`,
        input.phone ? `Telefone: ${input.phone}` : null,
        input.page ? `Página: ${input.page}` : null,
        input.userAgent ? `Navegador: ${input.userAgent}` : null,
        `Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      ].filter(Boolean).join('\n');
      const htmlBody = `<h2>${title}</h2><pre style="font-family:monospace;white-space:pre-wrap">${content}</pre>`;
      await sendOwnerEmail(title, htmlBody);
      return { received: true };
    }),

  customerInstallmentDebt: publicProcedure
    .input(z.object({ sessionToken: z.string().min(32) }))
    .query(async ({ input }) => {
      const identity = await requireCustomerSession(input.sessionToken);
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

      const phone = normalizePhone(identity.phone);
      const customerResult = await db.execute(drizzleSql`
        SELECT id
        FROM customers
        WHERE deletedAt IS NULL
          AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 11) = RIGHT(${phone}, 11)
        LIMIT 1
      `);
      const customer = rowsOf<any>(customerResult)[0];
      if (!customer) return { plan: null } as const;

      await tryReconcileOrphanVipInstallmentPlans(db, Number(customer.id));

      const planResult = await db.execute(drizzleSql`
        SELECT p.id, p.orderNumber, p.productName, p.totalAmountCents, p.paidAmountCents,
               p.balanceCents, p.installmentCount, p.status
        FROM vipInstallmentPlans p
        WHERE p.customerId=${Number(customer.id)}
          AND p.balanceCents > 0
          AND p.status NOT IN ('paid', 'cancelled')
          AND p.orderNumber IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM vipInstallmentCheckoutIntents ci
              INNER JOIN accessCodePhones acp ON acp.id=ci.finalizedRegistrationId
              WHERE ci.finalizedPlanId=p.id
                AND ci.finalizedRegistrationId IS NOT NULL
                AND acp.deletedAt IS NULL
                AND EXISTS (
                  SELECT 1 FROM orderStatusHistory osh0
                  WHERE osh0.registrationId=ci.finalizedRegistrationId
                    AND osh0.orderNumber=CAST(p.orderNumber AS UNSIGNED)
                )
                AND NOT EXISTS (
                  SELECT 1 FROM hiddenSubOrders h
                  WHERE h.registrationId=ci.finalizedRegistrationId
                )
            )
            OR (
              NOT EXISTS (
                SELECT 1 FROM vipInstallmentCheckoutIntents ci2
                WHERE ci2.finalizedPlanId=p.id
              )
              AND EXISTS (
                SELECT 1
                FROM orderStatusHistory osh
                INNER JOIN accessCodePhones acp2 ON acp2.id=osh.registrationId
                WHERE osh.orderNumber=CAST(p.orderNumber AS UNSIGNED)
                  AND acp2.deletedAt IS NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM hiddenSubOrders h2
                    WHERE h2.registrationId=osh.registrationId
                  )
              )
            )
          )
        ORDER BY p.id DESC
        LIMIT 1
      `);
      const plan = rowsOf<any>(planResult)[0];
      if (!plan) return { plan: null } as const;

      const today = brazilToday();
      await db.execute(drizzleSql`
        UPDATE vipInstallments
        SET status=CASE WHEN dueDate < ${today} THEN 'overdue' ELSE 'pending' END,
            proofUrl=NULL,
            proofMimeType=NULL,
            proofSubmittedAtMs=NULL
        WHERE planId=${Number(plan.id)}
          AND status='awaiting_confirmation'
          AND TRIM(COALESCE(proofUrl, ''))=''
      `);

      const installmentsResult = await db.execute(drizzleSql`
        SELECT i.id, i.installmentNumber, i.amountCents, i.dueDate, i.paidAmountCents,
               i.status, i.proofUrl, i.proofMimeType, i.proofSubmittedAtMs, i.paidAtMs,
               (
                 SELECT h.notes
                 FROM vipInstallmentHistory h
                 WHERE h.installmentId=i.id AND h.action='proof_rejected'
                 ORDER BY h.id DESC LIMIT 1
               ) AS lastRejectionReason
        FROM vipInstallments i
        WHERE i.planId=${Number(plan.id)}
          AND i.status <> 'cancelled'
        ORDER BY i.installmentNumber ASC
      `);

      const installments = rowsOf<any>(installmentsResult).map((row) => {
        const proofUrl = String(row.proofUrl || "").trim();
        const proofMimeType = String(row.proofMimeType || "");
        return {
          id: Number(row.id),
          installmentNumber: Number(row.installmentNumber),
          amountCents: Number(row.amountCents || 0),
          dueDate: row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate || "").slice(0, 10),
          paidAmountCents: Number(row.paidAmountCents || 0),
          status: String(row.status || "pending"),
          hasProof: proofUrl.length > 0,
          proofKind: proofUrl.length > 0 && proofMimeType.startsWith("h2-payoff:") ? "payoff" as const : "installment" as const,
          proofSubmittedAtMs: row.proofSubmittedAtMs == null ? null : Number(row.proofSubmittedAtMs),
          paidAtMs: row.paidAtMs == null ? null : Number(row.paidAtMs),
          lastRejectionReason: row.lastRejectionReason == null ? null : String(row.lastRejectionReason),
        };
      });

      return {
        plan: {
          id: Number(plan.id),
          orderNumber: String(plan.orderNumber || ''),
          productName: String(plan.productName || ""),
          totalAmountCents: Number(plan.totalAmountCents || 0),
          paidAmountCents: Number(plan.paidAmountCents || 0),
          balanceCents: Number(plan.balanceCents || 0),
          installmentCount: Number(plan.installmentCount || 0),
          status: String(plan.status || ""),
          installments,
        },
      } as const;
    }),

  adminInstallmentReceivables: adminProcedure.query(async () => {
    const db = (await getDb()) as any;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    await tryReconcileOrphanVipInstallmentPlans(db);

    const today = brazilToday();
    await db.execute(drizzleSql`
      UPDATE vipInstallments i
      INNER JOIN vipInstallmentPlans p ON p.id=i.planId
      SET i.status=CASE WHEN i.dueDate < ${today} THEN 'overdue' ELSE 'pending' END,
          i.proofUrl=NULL,
          i.proofMimeType=NULL,
          i.proofSubmittedAtMs=NULL
      WHERE p.status NOT IN ('paid', 'cancelled')
        AND i.status='awaiting_confirmation'
        AND TRIM(COALESCE(i.proofUrl, ''))=''
    `);

    const result = await db.execute(drizzleSql`
      SELECT i.id AS installmentId, i.planId, i.installmentNumber, i.amountCents, i.dueDate,
             i.paidAmountCents, i.status, i.proofUrl, i.proofMimeType, i.proofSubmittedAtMs, i.paidAtMs,
             p.orderNumber, p.productName, p.totalAmountCents, p.paidAmountCents AS planPaidAmountCents,
             p.balanceCents, p.installmentCount, p.frequency, p.status AS planStatus,
             c.id AS customerId, c.name AS customerName, c.phone AS customerPhone, c.customerNumber
      FROM vipInstallments i
      INNER JOIN vipInstallmentPlans p ON p.id=i.planId
      INNER JOIN customers c ON c.id=p.customerId
      WHERE p.status <> 'cancelled'
        AND (
          p.status='paid'
          OR EXISTS (
            SELECT 1
            FROM vipInstallmentCheckoutIntents ci
            INNER JOIN accessCodePhones acp ON acp.id=ci.finalizedRegistrationId
            WHERE ci.finalizedPlanId=p.id
              AND acp.deletedAt IS NULL
              AND EXISTS (
                SELECT 1 FROM orderStatusHistory osh0
                WHERE osh0.registrationId=ci.finalizedRegistrationId
                  AND osh0.orderNumber=CAST(p.orderNumber AS UNSIGNED)
              )
              AND NOT EXISTS (
                SELECT 1 FROM hiddenSubOrders h
                WHERE h.registrationId=ci.finalizedRegistrationId
              )
          )
          OR (
            NOT EXISTS (
              SELECT 1 FROM vipInstallmentCheckoutIntents ci2
              WHERE ci2.finalizedPlanId=p.id
            )
            AND EXISTS (
              SELECT 1 FROM orderStatusHistory osh
              INNER JOIN accessCodePhones acp2 ON acp2.id=osh.registrationId
              WHERE osh.orderNumber=CAST(p.orderNumber AS UNSIGNED)
                AND acp2.deletedAt IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM hiddenSubOrders h2
                  WHERE h2.registrationId=osh.registrationId
                )
            )
          )
        )
      ORDER BY FIELD(i.status, 'awaiting_confirmation', 'overdue', 'pending', 'paid'), i.dueDate ASC, i.id ASC
      LIMIT 1000
    `);

    return rowsOf<any>(result).map((row) => ({
      installmentId: Number(row.installmentId),
      planId: Number(row.planId),
      installmentNumber: Number(row.installmentNumber),
      amountCents: Number(row.amountCents || 0),
      dueDate: row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate || '').slice(0, 10),
      paidAmountCents: Number(row.paidAmountCents || 0),
      status: String(row.status || ''),
      proofUrl: row.proofUrl == null ? null : String(row.proofUrl),
      proofMimeType: row.proofMimeType == null ? null : String(row.proofMimeType),
      proofSubmittedAtMs: row.proofSubmittedAtMs == null ? null : Number(row.proofSubmittedAtMs),
      paidAtMs: row.paidAtMs == null ? null : Number(row.paidAtMs),
      orderNumber: row.orderNumber == null ? null : String(row.orderNumber),
      productName: String(row.productName || ''),
      totalAmountCents: Number(row.totalAmountCents || 0),
      planPaidAmountCents: Number(row.planPaidAmountCents || 0),
      balanceCents: Number(row.balanceCents || 0),
      installmentCount: Number(row.installmentCount || 0),
      frequency: String(row.frequency || ''),
      planStatus: String(row.planStatus || ''),
      customerId: Number(row.customerId),
      customerName: String(row.customerName || ''),
      customerPhone: normalizePhone(row.customerPhone),
      customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
    }));
  }),

  customerRouteHeartbeat: publicProcedure
    .input(z.object({
      sessionToken: z.string().min(32),
      pathname: z.string().min(1),
      trigger: z.enum(["route_change", "heartbeat", "tab_visible"]).default("heartbeat"),
    }))
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
        const lastNotifiedAt = parsedLastNotifiedAt && !Number.isNaN(parsedLastNotifiedAt.getTime()) ? parsedLastNotifiedAt : null;
        const { routeChanged, shouldNotify } = shouldNotifyForRouteAudit({
          previousRouteKey: currentKey,
          nextRouteKey: target.routeKey,
          lastNotifiedAt,
          now,
        });

        await db.execute(drizzleSql`
          UPDATE customerPasswordSessions
          SET routeAuditKey=${target.routeKey},
              routeAuditAreaName=${target.areaName},
              routeAuditLastSeenAt=${now},
              routeAuditLastNotifiedAt=${shouldNotify ? now : (lastNotifiedAt || null)}
          WHERE token=${input.sessionToken}
        `);

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
    .input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") }))
    .query(() => ({ ok: true })),

  notifyOwner: adminProcedure
    .input(z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required"),
    }))
    .mutation(async ({ input }) => {
      const htmlBody = `<h2>${input.title}</h2><pre style="font-family:monospace;white-space:pre-wrap">${input.content}</pre>`;
      await sendOwnerEmail(input.title, htmlBody);
      return { success: true } as const;
    }),
});
