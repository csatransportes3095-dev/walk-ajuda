import { z } from "zod";
import { transportInputItem, normalizeTransportStorageFields } from "../transportImportPayload";
import { TRPCError } from "@trpc/server";
import { and, eq, like, or, sql, desc } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { transportRecords } from "../../drizzle/schema";
import { classifyTransport, isValidTransportCnpj, normalizeTransportCnpj, normalizeTransportUf, TRANSPORT_TYPES } from "../../shared/transportes";

const item = transportInputItem;
// Inicialização isolada e idempotente: não modifica outras tabelas do sistema.
// Executada apenas após autenticação do ADM, na primeira chamada ao módulo.
let transportTableReady: Promise<void> | null = null;
const get = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
  if (!transportTableReady) {
    transportTableReady = db.execute(sql`CREATE TABLE IF NOT EXISTS transport_records (
      id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
      cnpj varchar(14) NOT NULL,
      name varchar(255) NOT NULL,
      type varchar(24) NOT NULL DEFAULT 'outros',
      uf varchar(2) NOT NULL DEFAULT 'ND',
      city varchar(160) NOT NULL DEFAULT '',
      cnae varchar(32) NOT NULL DEFAULT '',
      source text,
      notes text,
      is_used int NOT NULL DEFAULT 0,
      checksum_ok int NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY transport_records_cnpj_unique (cnpj),
      KEY transport_records_uf_city_idx (uf, city),
      KEY transport_records_type_idx (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).then(() => undefined).catch((e) => {
      transportTableReady = null;
      throw e;
    });
  }
  await transportTableReady;
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
    const data = normalizeTransportStorageFields(input, "Cadastro manual");
    const existing = await db.select().from(transportRecords).where(eq(transportRecords.cnpj, cnpj)).limit(1);
    if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "CNPJ já cadastrado. Edite o registro existente." });
    await db.insert(transportRecords).values(data);
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
    const all = Array.from(unique.entries());
    let created = 0, duplicated = 0;
    // INSERT IGNORE impede a duplicação concorrente por índice único. Não sobrescreve JÁ USADO.
    for (let i = 0; i < all.length; i += 80) {
      const batch = all.slice(i, i + 80);
      const values = batch.map(([, x]) => normalizeTransportStorageFields(x, "Importação"));
      const result: any = await db.insert(transportRecords).ignore().values(values);
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
    const data = normalizeTransportStorageFields(input, "Atualização manual");
    const { isUsed: _ignoredUsed, ...fields } = data;
    await db.update(transportRecords).set(fields).where(eq(transportRecords.id, input.id));
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