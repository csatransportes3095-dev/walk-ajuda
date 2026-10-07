import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { storagePut } from "../storage";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS h2bico_records (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      cpf VARCHAR(11) NOT NULL UNIQUE,
      photoUrl TEXT NULL,
      extraPhotos LONGTEXT NULL,
      notes TEXT NULL,
      source VARCHAR(255) NULL,
      status ENUM('available','reserved','in_use','used','archived') NOT NULL DEFAULT 'available',
      linkedOrder VARCHAR(64) NULL,
      lastSimilarity DECIMAL(5,2) NULL,
      usedAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_h2bico_name (name),
      INDEX idx_h2bico_status (status)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS h2bico_history (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      recordId INT NOT NULL,
      action VARCHAR(64) NOT NULL,
      details TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_h2bico_history_record (recordId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  return db;
}

const cpf11 = z.string().transform(v => v.replace(/\D/g, "")).refine(v => v.length === 11, "CPF deve ter 11 números");

export const h2bicoRouter = router({
  list: adminProcedure.input(z.object({
    search: z.string().optional().default(""),
    status: z.enum(["all","available","reserved","in_use","used","archived"]).optional().default("all"),
  }).optional()).query(async ({ input }) => {
    const db = await dbOrThrow();
    const search = (input?.search || "").trim();
    const status = input?.status || "all";
    const like = `%${search}%`;
    const rows = await db.execute(sql`
      SELECT id,name,cpf,photoUrl,extraPhotos,notes,source,status,linkedOrder,lastSimilarity,usedAt,createdAt,updatedAt
      FROM h2bico_records
      WHERE (${search} = '' OR name LIKE ${like} OR cpf LIKE ${like})
        AND (${status} = 'all' OR status = ${status})
      ORDER BY CASE status WHEN 'available' THEN 0 WHEN 'reserved' THEN 1 WHEN 'in_use' THEN 2 WHEN 'used' THEN 3 ELSE 4 END,
               name ASC, id DESC
      LIMIT 1000
    `);
    return (rows[0] as any[]).map(r => ({...r, id:Number(r.id), lastSimilarity:r.lastSimilarity == null ? null : Number(r.lastSimilarity)}));
  }),
  stats: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db.execute(sql`SELECT status, COUNT(*) total FROM h2bico_records GROUP BY status`);
    const out:any = { total:0, available:0, reserved:0, in_use:0, used:0, archived:0 };
    for (const r of rows[0] as any[]) { out[r.status]=Number(r.total); out.total += Number(r.total); }
    return out;
  }),
  create: adminProcedure.input(z.object({
    name: z.string().min(2).max(255),
    cpf: cpf11,
    photoUrl: z.string().url().optional().nullable(),
    notes: z.string().max(5000).optional(),
    source: z.string().max(255).optional(),
  })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    try {
      const result:any = await db.execute(sql`INSERT INTO h2bico_records (name,cpf,photoUrl,notes,source) VALUES (${input.name.trim()},${input.cpf},${input.photoUrl || null},${input.notes || null},${input.source || null})`);
      const id = Number((result[0] as any).insertId || 0);
      if (id) await db.execute(sql`INSERT INTO h2bico_history (recordId,action,details) VALUES (${id},'created','Registro criado no H2BICO')`);
      return { success:true, id };
    } catch (e:any) {
      if (String(e?.message || "").includes("Duplicate")) throw new TRPCError({code:"CONFLICT",message:"Este CPF já está cadastrado no H2BICO."});
      throw e;
    }
  }),
  uploadPhoto: adminProcedure.input(z.object({
    filename: z.string().min(1).max(255),
    base64: z.string().min(10).max(15_000_000),
    mimeType: z.enum(["image/jpeg","image/png","image/webp"]).default("image/jpeg"),
  })).mutation(async ({ input }) => {
    const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
    const key = `h2bico/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${ext}`;
    const { url } = await storagePut(key, Buffer.from(input.base64, "base64"), input.mimeType);
    return { url };
  }),
  setStatus: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    status: z.enum(["available","reserved","in_use","used","archived"]),
    linkedOrder: z.string().max(64).optional().nullable(),
  })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    await db.execute(sql`UPDATE h2bico_records SET status=${input.status}, linkedOrder=${input.linkedOrder || null}, usedAt=CASE WHEN ${input.status}='used' THEN NOW() ELSE usedAt END WHERE id=${input.id}`);
    await db.execute(sql`INSERT INTO h2bico_history (recordId,action,details) VALUES (${input.id},${"status:" + input.status},${input.linkedOrder ? "Pedido " + input.linkedOrder : null})`);
    return { success:true };
  }),
  history: adminProcedure.input(z.object({id:z.number().int().positive()})).query(async ({input}) => {
    const db=await dbOrThrow();
    const rows=await db.execute(sql`SELECT id,action,details,createdAt FROM h2bico_history WHERE recordId=${input.id} ORDER BY id DESC LIMIT 100`);
    return rows[0] as any[];
  }),
});
