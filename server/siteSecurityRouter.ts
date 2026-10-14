import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { parse as parseCookieHeader } from "cookie";
import { adminProcedure, router } from "./_core/trpc";
import { getDb, getAdminCredential } from "./db";
import { getAdminJwtSecret } from "./adminJwt";
import { siteAccessConfig, siteAccessEntries, siteAccessAudit } from "./siteAccessSchema";
import { configuredActivationState, modeActivationFailure } from "./siteAccessActivation";

export const SITE_ACCESS_MODE = ["public", "restricted", "blocked"] as const;
export type SiteAccessMode = (typeof SITE_ACCESS_MODE)[number];
export async function requireSiteOwner(req: { headers: { cookie?: string } }): Promise<string> {
  const cookie = parseCookieHeader(req.headers.cookie || "").admin_token;
  const secret = getAdminJwtSecret();
  if (!cookie || !secret) throw new TRPCError({ code: "FORBIDDEN" });
  let user: string;
  try {
    const token = jwt.verify(cookie, secret) as { sub?: string; role?: string };
    if (token.role !== "admin" || !token.sub) throw new Error("not admin");
    user = token.sub;
  } catch { throw new TRPCError({ code: "FORBIDDEN" }); }
  const owner = process.env.H2_SITE_SECURITY_OWNER?.trim();
  if (!owner || user !== owner || !(await getAdminCredential(user))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Controle exclusivo do Super Admin." });
  }
  return user;
}
export async function readSiteAccessMode(): Promise<SiteAccessMode> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ mode: siteAccessConfig.mode }).from(siteAccessConfig).where(eq(siteAccessConfig.id, 1)).limit(1);
  const mode = rows[0]?.mode;
  if (!mode) return "public";
  if (mode !== "public" && mode !== "restricted" && mode !== "blocked") throw new Error("Unknown access mode");
  return mode;
}
async function audit(actor: string, action: string, subject?: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
  await db.insert(siteAccessAudit).values({ actor, action, subject: subject || null });
}
const emailSchema = z.string().email().max(320).transform(s => s.trim().toLowerCase());
export const siteSecurityRouter = router({
  status: adminProcedure.query(async ({ ctx }) => {
    await requireSiteOwner(ctx.req);
    return { mode: await readSiteAccessMode() };
  }),
  list: adminProcedure.query(async ({ctx}) => {
    await requireSiteOwner(ctx.req);
    const db=await getDb();
    if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    return db.select({id:siteAccessEntries.id,displayName:siteAccessEntries.displayName,email:siteAccessEntries.email,phone:siteAccessEntries.phone,status:siteAccessEntries.status,expiresAt:siteAccessEntries.expiresAt,createdAt:siteAccessEntries.createdAt})
      .from(siteAccessEntries).orderBy(siteAccessEntries.id);
  }),
  setMode: adminProcedure.input(z.object({mode:z.enum(SITE_ACCESS_MODE)})).mutation(async ({ctx,input})=>{
    const actor=await requireSiteOwner(ctx.req);
    const activationError = modeActivationFailure(input.mode, configuredActivationState());
    if (activationError) throw new TRPCError({code:"PRECONDITION_FAILED",message:activationError});
    const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    await db.insert(siteAccessConfig).values({id:1,mode:input.mode,updatedBy:actor}).onDuplicateKeyUpdate({set:{mode:input.mode,updatedBy:actor}});
    await audit(actor,"MODE_CHANGED",input.mode);
    return {mode:input.mode};
  }),
  add: adminProcedure.input(z.object({displayName:z.string().trim().min(2).max(128),email:emailSchema,phone:z.string().max(32).optional(),expiresAt:z.string().datetime().nullable().optional()})).mutation(async ({ctx,input})=>{
    const actor=await requireSiteOwner(ctx.req);
    const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    const expire=input.expiresAt?new Date(input.expiresAt):null;
    if(expire && expire.getTime()<=Date.now()) throw new TRPCError({code:"BAD_REQUEST",message:"Data de vencimento já passou."});
    await db.insert(siteAccessEntries).values({displayName:input.displayName,email:input.email,phone:input.phone||null,expiresAt:expire,createdBy:actor});
    await audit(actor,"ACCESS_ADDED",input.email);
    return {success:true};
  }),
  changeStatus: adminProcedure.input(z.object({id:z.number().int().positive(),status:z.enum(["active","suspended"])})).mutation(async ({ctx,input})=>{
    const actor=await requireSiteOwner(ctx.req);
    const db=await getDb();if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    const rows=await db.select({email:siteAccessEntries.email}).from(siteAccessEntries).where(eq(siteAccessEntries.id,input.id)).limit(1);
    if(!rows.length)throw new TRPCError({code:"NOT_FOUND"});
    await db.update(siteAccessEntries).set({status:input.status,sessionVersion:sql.raw("sessionVersion + 1")}).where(eq(siteAccessEntries.id,input.id));
    await audit(actor,input.status==="active"?"ACCESS_ACTIVATED":"ACCESS_SUSPENDED",rows[0].email);
    return {success:true};
  }),
  remove:adminProcedure.input(z.object({id:z.number().int().positive()})).mutation(async ({ctx,input})=>{
    const actor=await requireSiteOwner(ctx.req);
    const db=await getDb();if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    const rows=await db.select({email:siteAccessEntries.email}).from(siteAccessEntries).where(eq(siteAccessEntries.id,input.id)).limit(1);
    if(!rows.length)throw new TRPCError({code:"NOT_FOUND"});
    await db.delete(siteAccessEntries).where(eq(siteAccessEntries.id,input.id));
    await audit(actor,"ACCESS_REMOVED",rows[0].email);
    return {success:true};
  }),
});
