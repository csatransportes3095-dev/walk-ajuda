import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { parse as parseCookies } from "cookie";
import jwt from "jsonwebtoken";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getAdminJwtSecret } from "../adminJwt";
import { assertChassisSameOrigin, ChassisRateLimiter, ChassisServiceError } from "../chassisServiceCore";
import { getChassisServiceStore } from "../chassisServiceStore";
import { CHASSIS_SESSION_COOKIE, CHASSIS_YEARS } from "../../shared/chassisService";

const limiter = new ChassisRateLimiter();
const cookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 14 * 24 * 60 * 60 * 1000 });
const phone = z.string().min(10).max(30);
const password = z.string().min(8).max(128);
const id = z.number().int().positive();
const credits = z.number().int().min(0).max(1_000_000);

const serviceProcedure = publicProcedure.use(async ({ ctx, next, type }) => {
  try {
    if (type === "mutation") assertChassisSameOrigin(ctx.req.headers.origin, ctx.req.headers.host);
    return await next();
  } catch (error) { if (error instanceof ChassisServiceError) throw new TRPCError({ code: error.code, message: error.message }); throw error; }
});
const authenticatedProcedure = serviceProcedure.use(async ({ ctx, next }) => {
  const session = await getChassisServiceStore().resolveSession(parseCookies(ctx.req.headers.cookie || "")[CHASSIS_SESSION_COOKIE]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Entre novamente na conta do serviço." });
  return next({ ctx: { ...ctx, chassis: session } });
});
const serviceAdminProcedure = adminProcedure.use(async ({ ctx, next, type }) => {
  if (type === "mutation") assertChassisSameOrigin(ctx.req.headers.origin, ctx.req.headers.host);
  const secret = getAdminJwtSecret()!;
  const payload = jwt.verify(parseCookies(ctx.req.headers.cookie || "").admin_token, secret) as { sub?: string };
  return next({ ctx: { ...ctx, chassisActor: `admin:${payload.sub || "owner"}`.slice(0, 128) } });
});
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (error) {
    if (error instanceof ChassisServiceError) throw new TRPCError({ code: error.code, message: error.message });
    if (error instanceof TRPCError) throw error;
    console.error("[Chassis Service] Operação não concluída.");
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir a operação. Tente novamente." });
  }
}

export const chassisServiceRouter = router({
  catalog: serviceProcedure.query(() => guarded(async () => ({ config: await getChassisServiceStore().getConfig(), packages: await getChassisServiceStore().listPackages() }))),
  me: serviceProcedure.query(({ ctx }) => guarded(async () => (await getChassisServiceStore().resolveSession(parseCookies(ctx.req.headers.cookie || "")[CHASSIS_SESSION_COOKIE]))?.user || null)),
  register: serviceProcedure.input(z.object({ phone, password })).mutation(({ input, ctx }) => guarded(async () => {
    limiter.check(`register:${ctx.req.ip || ctx.req.socket.remoteAddress || "unknown"}`, 5, 60 * 60 * 1000);
    return getChassisServiceStore().register(input.phone, input.password);
  })),
  login: serviceProcedure.input(z.object({ phone, password: z.string().min(1).max(128) })).mutation(({ input, ctx }) => guarded(async () => {
    limiter.check(`login-ip:${ctx.req.ip || ctx.req.socket.remoteAddress || "unknown"}`, 20, 15 * 60 * 1000);
    limiter.check(`login-phone:${input.phone.replace(/\D/g, "")}`, 10, 15 * 60 * 1000);
    const result = await getChassisServiceStore().login(input.phone, input.password);
    const secure = ctx.req.secure || ctx.req.headers["x-forwarded-proto"] === "https";
    ctx.res.cookie(CHASSIS_SESSION_COOKIE, result.token, cookieOptions(secure));
    return result.user;
  })),
  logout: serviceProcedure.mutation(({ ctx }) => guarded(async () => {
    await getChassisServiceStore().logout(parseCookies(ctx.req.headers.cookie || "")[CHASSIS_SESSION_COOKIE]);
    ctx.res.clearCookie(CHASSIS_SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax" });
    return { success: true };
  })),
  history: authenticatedProcedure.query(({ ctx }) => guarded(() => getChassisServiceStore().history(ctx.chassis.user.id))),
  generate: authenticatedProcedure.input(z.object({ requestId: z.string().uuid(), marca: z.string().trim().min(1).max(120), modelo: z.string().trim().min(1).max(160), yearCode: z.enum(CHASSIS_YEARS), quantity: z.number().int().min(1).max(10), originalVin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/).optional() })).mutation(({ input, ctx }) => guarded(async () => {
    limiter.check(`generate:${ctx.chassis.user.id}`, 60, 60_000);
    return getChassisServiceStore().generate(ctx.chassis.user.id, ctx.chassis.tokenHash, input);
  })),
  buy: authenticatedProcedure.input(z.object({ packageId: id, requestId: z.string().uuid() })).mutation(({ input, ctx }) => guarded(async () => {
    limiter.check(`buy:${ctx.chassis.user.id}`, 30, 60 * 60 * 1000);
    return getChassisServiceStore().createPurchase(ctx.chassis.user.id, ctx.chassis.tokenHash, input.packageId, input.requestId);
  })),
  cancelPurchase: authenticatedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ input, ctx }) => guarded(() => getChassisServiceStore().cancelPurchase(ctx.chassis.user.id, input.id))),
  adminUsers: serviceAdminProcedure.input(z.object({ search: z.string().max(30).default(""), offset: z.number().int().min(0).max(1_000_000).default(0) })).query(({ input }) => guarded(() => getChassisServiceStore().listUsers(input.search, input.offset))),
  adminHistory: serviceAdminProcedure.input(z.object({ userId: id })).query(({ input }) => guarded(() => getChassisServiceStore().adminHistory(input.userId))),
  adminCreateUser: serviceAdminProcedure.input(z.object({ phone, password, accountType: z.enum(["test", "paid"]), credits })).mutation(({ input, ctx }) => guarded(() => getChassisServiceStore().createUser(input, ctx.chassisActor))),
  adminAdjust: serviceAdminProcedure.input(z.object({ userId: id, delta: z.number().int().min(-1_000_000).max(1_000_000).refine(value => value !== 0), note: z.string().trim().max(300), requestId: z.string().uuid() })).mutation(({ input, ctx }) => guarded(() => getChassisServiceStore().adjustCredits(input.userId, input.delta, input.note, ctx.chassisActor, input.requestId))),
  adminUpdateUser: serviceAdminProcedure.input(z.object({ userId: id, status: z.enum(["active", "blocked"]), accountType: z.enum(["test", "paid"]) })).mutation(({ input, ctx }) => guarded(() => getChassisServiceStore().updateUser(input, ctx.chassisActor))),
  adminResetPassword: serviceAdminProcedure.input(z.object({ userId: id, password })).mutation(({ input, ctx }) => guarded(() => getChassisServiceStore().resetPassword(input.userId, input.password, ctx.chassisActor))),
  adminPackages: serviceAdminProcedure.query(() => guarded(() => getChassisServiceStore().listPackages(true))),
  adminSavePackage: serviceAdminProcedure.input(z.object({ id: id.optional(), title: z.string().trim().min(1).max(80), credits: credits.refine(value => value > 0), priceCents: z.number().int().min(1).max(100_000_000), active: z.boolean() })).mutation(({ input, ctx }) => guarded(() => getChassisServiceStore().savePackage(input, ctx.chassisActor))),
  adminConfig: serviceAdminProcedure.query(() => guarded(() => getChassisServiceStore().getConfig())),
  adminSaveConfig: serviceAdminProcedure.input(z.object({ trialCredits: credits, registrationEnabled: z.boolean(), supportPhone: z.string().max(30), paymentInstructions: z.string().trim().max(3000) })).mutation(({ input, ctx }) => guarded(() => getChassisServiceStore().setConfig(input, ctx.chassisActor))),
  adminPurchases: serviceAdminProcedure.query(() => guarded(() => getChassisServiceStore().listPurchases())),
  adminConfirmPurchase: serviceAdminProcedure.input(z.object({ id: z.string().uuid(), paymentConfirmed: z.literal(true) })).mutation(({ input, ctx }) => guarded(() => getChassisServiceStore().confirmPurchase(input.id, ctx.chassisActor))),
});
