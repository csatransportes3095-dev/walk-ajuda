import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { parse as parseCookieHeader } from "cookie";
import jwt from "jsonwebtoken";
import { getAdminJwtSecret } from "../adminJwt";
import { isSystemRestoreLocked } from "../backupRestoreService";

// Verifica se o request tem um cookie JWT admin válido (login independente)
function isAdminJwtValid(req: TrpcContext["req"]): boolean {
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

export const publicProcedure = t.procedure.use(blockDuringSystemRestore);

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

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
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
  }),
);
