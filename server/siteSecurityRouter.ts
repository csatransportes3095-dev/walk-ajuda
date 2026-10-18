import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, sql, inArray } from "drizzle-orm";
import { customers, orderStatusHistory } from "../drizzle/schema";
import { prepareSiteBulkCandidates, filterSiteBulkCandidates, siteBulkFilters, siteBulkEmail, validSiteBulkEmail, selectVisibleSiteBulkOrders } from "../shared/siteSecurityBulk";
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

  bulkCandidates: adminProcedure.input(z.object({filter:z.enum(siteBulkFilters).default("all"), search:z.string().max(160).default("")})).query(async ({ctx,input})=>{
    await requireSiteOwner(ctx.req);
    const db=await getDb();if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    const [customerRows,orderRows,hiddenRows,initialRows,entryRows]=await Promise.all([
      db.select({id:customers.id,name:customers.name,email:customers.email,phone:customers.phone,blocked:customers.blocked,deletedAt:customers.deletedAt})
        .from(customers).where(sql`${customers.deletedAt} IS NULL AND ${customers.blocked} = 0`),
      db.select({registrationId:orderStatusHistory.registrationId,customerPhone:orderStatusHistory.customerPhone,status:orderStatusHistory.status,id:orderStatusHistory.id})
        .from(orderStatusHistory).orderBy(orderStatusHistory.id),
      db.execute(sql`SELECT registrationId, subOrderIndex FROM hiddenSubOrders`),
      db.execute(sql`SELECT \`key\` FROM orderStatusTypes WHERE isActive = 1 AND isGlobal = 1 ORDER BY sortOrder ASC, id ASC LIMIT 1`),
      db.select({email:siteAccessEntries.email}).from(siteAccessEntries),
    ]);
    // One current status per registration; historical rows must never be counted as separate orders.
    const hidden=(hiddenRows as any)[0] as Array<{registrationId:number;subOrderIndex:number}>;
    const initial=(initialRows as any)[0] as Array<{key:string}>;
    const latest=selectVisibleSiteBulkOrders(orderRows,hidden,initial?.[0]?.key||"recebido");
    return filterSiteBulkCandidates(prepareSiteBulkCandidates(customerRows,latest,entryRows.map(x=>x.email)),input.filter,input.search);
  }),
  bulkAdd: adminProcedure.input(z.object({customerIds:z.array(z.number().int().positive()).min(1).max(500)})).mutation(async ({ctx,input})=>{
    const actor=await requireSiteOwner(ctx.req);
    const db=await getDb();if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    const ids=[...new Set(input.customerIds)];
    const rows=await db.select({id:customers.id,name:customers.name,email:customers.email,phone:customers.phone,blocked:customers.blocked,deletedAt:customers.deletedAt})
      .from(customers).where(inArray(customers.id,ids));
    if(rows.length!==ids.length)throw new TRPCError({code:"BAD_REQUEST",message:"Lista desatualizada. Atualize a seleção."});
    const available=rows.filter(x=>!x.deletedAt && x.blocked===0 && validSiteBulkEmail(siteBulkEmail(x.email)));
    if(available.length!==ids.length)throw new TRPCError({code:"BAD_REQUEST",message:"Algum cliente foi bloqueado, excluído ou está sem e-mail válido. Atualize a seleção."});
    const unique=new Set(available.map(x=>siteBulkEmail(x.email)));
    if(unique.size!==ids.length)throw new TRPCError({code:"BAD_REQUEST",message:"Existem e-mails repetidos na seleção. Atualize a lista."});
    let added=0,already=0;
    // Unique index on e-mail prevents duplicates across simultaneous requests.
    await db.transaction(async tx=>{
      for(const c of available) {
        const email=siteBulkEmail(c.email);
        const result=await tx.insert(siteAccessEntries).values({displayName:c.name,email,phone:c.phone,customerId:c.id,createdBy:actor})
          .onDuplicateKeyUpdate({set:{email:sql`${siteAccessEntries.email}`}});
        const affected=Number((result as any)[0]?.affectedRows ?? (result as any).affectedRows ?? 0);
        if(affected===1)added++;else already++;
      }
      await tx.insert(siteAccessAudit).values({actor,action:"BULK_ACCESS_ADDED",subject:JSON.stringify({added,already,total:ids.length})});
    });
    return {added,already,total:ids.length};
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
