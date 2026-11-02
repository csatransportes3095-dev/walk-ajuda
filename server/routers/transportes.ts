import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, like, or, sql, desc } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { transportRecords } from "../../drizzle/schema";
import { classifyTransport, isValidTransportCnpj, normalizeTransportCnpj, normalizeTransportUf, TRANSPORT_TYPES } from "../../shared/transportes";

const item = z.object({
  cnpj: z.string(),
  name: z.string().trim().max(255).default(""),
  type: z.enum(TRANSPORT_TYPES).optional(),
  uf: z.string().max(30).optional(),
  city: z.string().max(160).optional(),
  cnae: z.string().max(32).optional(),
  source: z.string().max(1500).optional(),
  notes: z.string().max(5000).optional(),
  isUsed: z.boolean().optional(),
});
const get = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
  return db;
};
export const transportesRouter = router({
  list: adminProcedure.input(z.object({
    search: z.string().max(120).default(""),
    uf: z.string().max(2).optional(),
    city: z.string().max(160).optional(),
    type: z.enum(TRANSPORT_TYPES).optional(),
    used: z.enum(["todos", "usados", "disponiveis"]).default("todos"),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(50),
  })).query(async ({ input }) => {
    const db = await get();
    const search = input.search.trim();
    const conditions = [
      ...(search ? [or(like(transportRecords.name, `%${search}%`), like(transportRecords.cnpj, `%${search.replace(/\D/g, "")}%`))!] : []),
      ...(input.uf ? [eq(transportRecords.uf, input.uf)] : []),
      ...(input.city ? [like(transportRecords.city, `%${input.city.trim()}%`)] : []),
      ...(input.type ? [eq(transportRecords.type, input.type)] : []),
      ...(input.used === "usados" ? [eq(transportRecords.isUsed, 1)] : []),
      ...(input.used === "disponiveis" ? [eq(transportRecords.isUsed, 0)] : []),
    ];
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, totals] = await Promise.all([
      db.select().from(transportRecords).where(where).orderBy(desc(transportRecords.id)).limit(input.limit).offset((input.page - 1) * input.limit),
      db.select({ count: sql<number>`count(*)` }).from(transportRecords).where(where),
    ]);
    return { rows, total: Number(totals[0]?.count || 0) };
  }),
  stats: adminProcedure.query(async () => {
    const db = await get();
    const rows = await db.select({
      total: sql<number>`count(*)`,
      used: sql<number>`coalesce(sum(${transportRecords.isUsed}),0)`,
      invalid: sql<number>`coalesce(sum(case when ${transportRecords.checksumOk}=0 then 1 else 0 end),0)`,
    }).from(transportRecords);
    return { total: Number(rows[0]?.total || 0), used: Number(rows[0]?.used || 0), invalid: Number(rows[0]?.invalid || 0) };
  }),
  upsert: adminProcedure.input(item).mutation(async ({ input }) => {
    const db = await get();
    const cnpj = normalizeTransportCnpj(input.cnpj);
    if (!/^\d{14}$/.test(cnpj)) throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ precisa ter 14 dígitos. Registros inválidos devem ser revisados." });
    const data = {
      cnpj, name: input.name || "NOME NÃO INFORMADO",
      type: input.type || classifyTransport(input.name), uf: normalizeTransportUf(input.uf), city: input.city?.trim() || "",
      cnae: input.cnae?.trim() || "", source: input.source || "Cadastro manual",
      notes: input.notes || "", checksumOk: isValidTransportCnpj(cnpj) ? 1 : 0,
    };
    const existing = await db.select().from(transportRecords).where(eq(transportRecords.cnpj, cnpj)).limit(1);
    if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "CNPJ já cadastrado. Edite o registro existente." });
    await db.insert(transportRecords).values({ ...data, isUsed: input.isUsed ? 1 : 0 });
    return { created: true, validCnpj: Boolean(data.checksumOk) };
  }),
  importBatch: adminProcedure.input(z.object({ records: z.array(item).min(1).max(400) })).mutation(async ({ input }) => {
    const db = await get();
    const unique = new Map<string, z.infer<typeof item>>();
    let invalid = 0, repeatedInFile = 0;
    for (const record of input.records) {
      const cnpj = normalizeTransportCnpj(record.cnpj);
      if (!/^\d{14}$/.test(cnpj)) { invalid++; continue; }
      if (unique.has(cnpj)) { repeatedInFile++; continue; }
      unique.set(cnpj, record);
    }
    const all = [...unique.entries()];
    let created = 0, duplicated = 0;
    // INSERT IGNORE impede a duplicação concorrente por índice único. Não sobrescreve JÁ USADO.
    for (let i = 0; i < all.length; i += 80) {
      const batch = all.slice(i, i + 80);
      const values = batch.map(([cnpj, x]) => ({
        cnpj, name: x.name.trim() || "NOME NÃO INFORMADO",
        type: x.type || classifyTransport(x.name), uf: normalizeTransportUf(x.uf), city: x.city?.trim() || "",
        cnae: x.cnae?.trim() || "", source: x.source || "Importação",
        notes: x.notes || "", isUsed: x.isUsed ? 1 : 0, checksumOk: isValidTransportCnpj(cnpj) ? 1 : 0,
      }));
      const result: any = await db.insert(transportRecords).values(values).ignore();
      const inserted = Number(result?.[0]?.affectedRows ?? result?.affectedRows ?? 0);
      created += inserted;
      duplicated += batch.length - inserted;
    }
    return { received: input.records.length, created, duplicated: duplicated + repeatedInFile, invalid };
  }),
  update: adminProcedure.input(item.extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await get();
    const cnpj = normalizeTransportCnpj(input.cnpj);
    if (!/^\d{14}$/.test(cnpj)) throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ inválido" });
    const other = await db.select({ id: transportRecords.id }).from(transportRecords).where(eq(transportRecords.cnpj, cnpj)).limit(1);
    if (other[0] && other[0].id !== input.id) throw new TRPCError({ code: "CONFLICT", message: "CNPJ já existe" });
    await db.update(transportRecords).set({
      cnpj, name: input.name || "NOME NÃO INFORMADO", type: input.type || classifyTransport(input.name),
      uf: normalizeTransportUf(input.uf), city: input.city || "", cnae: input.cnae || "",
      notes: input.notes || "", source: input.source || "Atualização manual", checksumOk: isValidTransportCnpj(cnpj) ? 1 : 0,
    }).where(eq(transportRecords.id, input.id));
    return { success: true };
  }),
  markUsed: adminProcedure.input(z.object({ id: z.number().int().positive(), used: z.boolean() })).mutation(async ({ input }) => {
    const db = await get();
    await db.update(transportRecords).set({ isUsed: input.used ? 1 : 0 }).where(eq(transportRecords.id, input.id));
    return { success: true };
  }),
  delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await get();
    await db.delete(transportRecords).where(eq(transportRecords.id, input.id));
    return { success: true };
  }),
});