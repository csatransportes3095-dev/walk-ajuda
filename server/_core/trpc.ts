import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { parse as parseCookieHeader } from "cookie";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { customerPasswordSessions, customers } from "../../drizzle/schema";
import { getDb } from "../db";
import { getAdminJwtSecret } from "../adminJwt";
import { isSystemRestoreLocked } from "../backupRestoreService";
import { notifyCustomerEntry } from "./customerEntryNotification";

const ENTRY_ACTIVITY_GAP_MS = 30 * 60 * 1000;

// Verifica se o request tem um cookie JWT admin válido (login independente).
// Exportada para rotas Express administrativas que precisam da mesma garantia.
export function isAdminJwtValid(req: TrpcContext["req"]): boolean {
  try {
    const cookieHeader = req.headers.cookie || '';
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies.admin_token;
    if (!token) return false;
    const secret = getAdminJwtSecret();
    if (!secret) return false;
    const payload = jwt.verify(token, secret) as { sub: string; role: string };
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

const blockDuringSystemRestore = t.middleware(async ({ next }) => {
  if (isSystemRestoreLocked()) {
    throw new TRPCError({ code: "CONFLICT", message: "Sistema temporariamente bloqueado enquanto uma restauração protegida está em andamento." });
  }
  return next();
});

async function sendCustomerEntryNotification(phone: string, enteredAt: Date) {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) return;
    const db = (await getDb()) as any;
    if (!db) return;
    const rows = await db
      .select({
        name: customers.name,
        phone: customers.phone,
        profilePhotoUrl: customers.profilePhotoUrl,
      })
      .from(customers)
      .where(eq(customers.phone, cleanPhone))
      .limit(1);
    const customer = rows?.[0];
    await notifyCustomerEntry({
      name: customer?.name ?? null,
      phone: customer?.phone || cleanPhone,
      profilePhotoUrl: customer?.profilePhotoUrl ?? null,
      enteredAt,
    });
  } catch (error) {
    console.warn('[customer-entry] Falha ao preparar notificação:', error);
  }
}

const customerEntryNotification = t.middleware(async ({ next, path, getRawInput }) => {
  let rawInput: any = null;
  let sessionToken = '';
  let previousLastAccessAt: Date | null = null;

  try {
    if (path === 'customerPassword.login' || path === 'customerPassword.checkSession') {
      rawInput = await getRawInput();
    }

    if (path === 'customerPassword.checkSession') {
      sessionToken = String(rawInput?.token || '').trim();
      if (sessionToken) {
        const db = (await getDb()) as any;
        if (db) {
          const rows = await db
            .select({ lastAccessAt: customerPasswordSessions.lastAccessAt })
            .from(customerPasswordSessions)
            .where(eq(customerPasswordSessions.token, sessionToken))
            .limit(1);
          const value = rows?.[0]?.lastAccessAt;
          previousLastAccessAt = value ? new Date(value) : null;
        }
      }
    }
  } catch {}

  const result = await next();
  const resultAny = result as any;
  if (!resultAny?.ok) return result;

  const data = resultAny.data as any;
  const enteredAt = new Date();

  if (path === 'customerPassword.login' && data?.success === true) {
    const phone = String(rawInput?.phone || '').replace(/\D/g, '');
    if (phone) {
      void sendCustomerEntryNotification(phone, enteredAt);
    }
  }

  if (
    path === 'customerPassword.checkSession' &&
    data?.valid === true &&
    data?.source === 'customer' &&
    sessionToken
  ) {
    const phone = String(data?.phone || '').replace(/\D/g, '');
    const inactiveForMs = previousLastAccessAt
      ? enteredAt.getTime() - previousLastAccessAt.getTime()
      : 0;

    if (phone && previousLastAccessAt && inactiveForMs >= ENTRY_ACTIVITY_GAP_MS) {
      void sendCustomerEntryNotification(phone, enteredAt);
    }

    try {
      const db = (await getDb()) as any;
      if (db) {
        await db
          .update(customerPasswordSessions)
          .set({ lastAccessAt: enteredAt })
          .where(eq(customerPasswordSessions.token, sessionToken));
      }
    } catch {}
  }

  return result;
});

export const publicProcedure = t.procedure
  .use(blockDuringSystemRestore)
  .use(customerEntryNotification);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(blockDuringSystemRestore).use(requireUser);

const requireAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;

  const isJwtAdmin = isAdminJwtValid(ctx.req);

  if (!isJwtAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

const blockAdminMutationsDuringSystemRestore = t.middleware(async ({ next, type }) => {
  if (isSystemRestoreLocked() && type === "mutation") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Sistema temporariamente bloqueado para alterações administrativas enquanto uma restauração protegida está em andamento.",
    });
  }
  return next();
});

export const adminProcedure = t.procedure
  .use(requireAdmin)
  .use(blockAdminMutationsDuringSystemRestore);