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
      uf VARCHAR(2) NULL,
      photoUrl TEXT NOT NULL,
      originalFilename VARCHAR(512) NULL,
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

  for (const definition of [
    "uf VARCHAR(2) NULL",
    "originalFilename VARCHAR(512) NULL",
  ]) {
    try {
      await db.execute(sql.raw(`ALTER TABLE h2bico_records ADD COLUMN IF NOT EXISTS ${definition}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column|already exists/i.test(message)) {
        console.warn("[H2BICO] coluna não garantida:", definition, message);
      }
    }
  }

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

function parseFilename(filename: string) {
  const clean = filename.split(/[\\/]/).pop() || filename;
  const base = clean.replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)\s*$/, "").trim();
  const match = base.match(/\d{11}/);
  if (!match || match.index == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Nome do arquivo sem CPF de 11 números.",
    });
  }

  const cpf = match[0];
  const rawName = base.slice(0, match.index).replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  const name = rawName.length >= 2 ? rawName.toUpperCase() : "SEM NOME";
  const suffix = base.slice(match.index + 11).replace(/^[_\-\s]+/, "").trim();
  const ufMatch = suffix.match(/^([A-Za-z]{2})(?:\b|[_\-\s])/i) || suffix.match(/^([A-Za-z]{2})$/i);
  const uf = ufMatch?.[1]?.toUpperCase() || null;

  return { name, cpf, uf, originalFilename: clean };
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
      SELECT id,name,cpf,uf,photoUrl,originalFilename,notes,source,status,linkedOrder,lastSimilarity,usedAt,createdAt,updatedAt
      FROM h2bico_records
      WHERE (${search} = '' OR name LIKE ${like} OR cpf LIKE ${like})
        AND (${status} = 'all' OR status = ${status})
      ORDER BY CASE status WHEN 'available' THEN 0 WHEN 'reserved' THEN 1 WHEN 'in_use' THEN 2 WHEN 'used' THEN 3 ELSE 4 END,
               name ASC, id DESC
      LIMIT 5000
    `);
    return (rows[0] as any[]).map(r => ({
      ...r,
      id: Number(r.id),
      lastSimilarity: r.lastSimilarity == null ? null : Number(r.lastSimilarity),
    }));
  }),

  availableForSimilarity: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db.execute(sql`
      SELECT id,name,cpf,uf,photoUrl,originalFilename
      FROM h2bico_records
      WHERE status = 'available' AND photoUrl IS NOT NULL AND photoUrl <> ''
      ORDER BY name ASC, id ASC
      LIMIT 10000
    `);
    return (rows[0] as any[]).map(r => ({
      id: Number(r.id),
      name: String(r.name || ""),
      cpf: String(r.cpf || ""),
      uf: r.uf ? String(r.uf) : null,
      photoUrl: String(r.photoUrl || ""),
      originalFilename: r.originalFilename ? String(r.originalFilename) : null,
    }));
  }),

  stats: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db.execute(sql`SELECT status, COUNT(*) total FROM h2bico_records GROUP BY status`);
    const out:any = { total:0, available:0, reserved:0, in_use:0, used:0, archived:0 };
    for (const r of rows[0] as any[]) {
      out[r.status] = Number(r.total);
      out.total += Number(r.total);
    }
    return out;
  }),

  importPhoto: adminProcedure.input(z.object({
    filename: z.string().min(1).max(512),
    base64: z.string().min(10).max(15_000_000),
    mimeType: z.enum(["image/jpeg","image/png","image/webp"]).default("image/jpeg"),
  })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const parsed = parseFilename(input.filename);

    const duplicateRows = await db.execute(sql`
      SELECT id,status,name,photoUrl,originalFilename
      FROM h2bico_records
      WHERE cpf = ${parsed.cpf}
      LIMIT 1
    `);
    const duplicate = (duplicateRows[0] as any[])[0];

    const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
    const uploadCurrentPhoto = async () => {
      const key = `h2bico/${parsed.cpf}-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      return await storagePut(key, Buffer.from(input.base64, "base64"), input.mimeType);
    };

    if (duplicate) {
      let healthy = false;
      const currentUrl = String(duplicate.photoUrl || "").trim();
      if (currentUrl) {
        try {
          const response = await fetch(currentUrl, {
            headers: { Range: "bytes=0-0", "User-Agent": "H2BICO-Photo-Check/1.0" },
          });
          const contentType = response.headers.get("content-type") || "";
          healthy = (response.ok || response.status === 206) && (!contentType || contentType.startsWith("image/"));
        } catch {
          healthy = false;
        }
      }

      if (healthy) {
        return {
          success: false as const,
          result: "duplicate" as const,
          cpf: parsed.cpf,
          name: parsed.name,
          existingId: Number(duplicate.id),
          existingStatus: String(duplicate.status || ""),
          existingName: String(duplicate.name || ""),
        };
      }

      const { url } = await uploadCurrentPhoto();
      await db.execute(sql`
        UPDATE h2bico_records
        SET photoUrl=${url},
            originalFilename=${parsed.originalFilename},
            uf=COALESCE(${parsed.uf}, uf),
            name=CASE WHEN name='SEM NOME' AND ${parsed.name} <> 'SEM NOME' THEN ${parsed.name} ELSE name END
        WHERE id=${Number(duplicate.id)}
      `);
      await db.execute(sql`
        INSERT INTO h2bico_history (recordId,action,details)
        VALUES (${Number(duplicate.id)},'photo_repaired',${"Foto reparada pela reimportação: " + parsed.originalFilename})
      `);
      return {
        success: true as const,
        result: "repaired" as const,
        id: Number(duplicate.id),
        cpf: parsed.cpf,
        name: parsed.name,
        photoUrl: url,
      };
    }

    const { url } = await uploadCurrentPhoto();

    try {
      const result:any = await db.execute(sql`
        INSERT INTO h2bico_records (name,cpf,uf,photoUrl,originalFilename,source,status)
        VALUES (${parsed.name},${parsed.cpf},${parsed.uf},${url},${parsed.originalFilename},'importacao-lote','available')
      `);
      const id = Number((result[0] as any).insertId || 0);
      if (id) {
        await db.execute(sql`
          INSERT INTO h2bico_history (recordId,action,details)
          VALUES (${id},'imported',${"Importado: " + parsed.originalFilename})
        `);
      }
      return { success: true as const, result: "imported" as const, id, ...parsed, photoUrl: url };
    } catch (error:any) {
      if (String(error?.message || "").includes("Duplicate")) {
        return { success: false as const, result: "duplicate" as const, cpf: parsed.cpf, name: parsed.name };
      }
      throw error;
    }
  }),

  create: adminProcedure.input(z.object({
    name: z.string().min(2).max(255),
    cpf: cpf11,
    photoUrl: z.string().url(),
    notes: z.string().max(5000).optional(),
    source: z.string().max(255).optional(),
  })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    try {
      const result:any = await db.execute(sql`
        INSERT INTO h2bico_records (name,cpf,photoUrl,notes,source,status)
        VALUES (${input.name.trim().toUpperCase()},${input.cpf},${input.photoUrl},${input.notes || null},${input.source || 'manual'},'available')
      `);
      const id = Number((result[0] as any).insertId || 0);
      if (id) {
        await db.execute(sql`
          INSERT INTO h2bico_history (recordId,action,details)
          VALUES (${id},'created','Registro criado manualmente no H2BICO')
        `);
      }
      return { success:true, id };
    } catch (e:any) {
      if (String(e?.message || "").includes("Duplicate")) {
        throw new TRPCError({code:"CONFLICT",message:"Este CPF já está cadastrado no H2BICO."});
      }
      throw e;
    }
  }),

  uploadPhoto: adminProcedure.input(z.object({
    filename: z.string().min(1).max(255),
    base64: z.string().min(10).max(15_000_000),
    mimeType: z.enum(["image/jpeg","image/png","image/webp"]).default("image/jpeg"),
  })).mutation(async ({ input }) => {
    const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
    const key = `h2bico/manual-${Date.now()}-${Math.random().toString(36).slice(2,10)}.${ext}`;
    const { url } = await storagePut(key, Buffer.from(input.base64, "base64"), input.mimeType);
    return { success: true, url };
  }),

  setStatus: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    status: z.enum(["available","reserved","in_use","used","archived"]),
    linkedOrder: z.string().max(64).optional().nullable(),
  })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const currentRows = await db.execute(sql`SELECT status FROM h2bico_records WHERE id=${input.id} LIMIT 1`);
    const current = (currentRows[0] as any[])[0];
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });

    if (String(current.status) === "used" && input.status !== "used") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Registro USADO é definitivo e não pode voltar a ser reutilizado.",
      });
    }

    await db.execute(sql`
      UPDATE h2bico_records
      SET status=${input.status},
          linkedOrder=${input.linkedOrder || null},
          usedAt=CASE WHEN ${input.status}='used' THEN COALESCE(usedAt,NOW()) ELSE usedAt END
      WHERE id=${input.id}
    `);
    await db.execute(sql`
      INSERT INTO h2bico_history (recordId,action,details)
      VALUES (${input.id},${"status:" + input.status},${input.linkedOrder ? "Pedido " + input.linkedOrder : null})
    `);
    return { success:true };
  }),

  history: adminProcedure.input(z.object({id:z.number().int().positive()})).query(async ({input}) => {
    const db=await dbOrThrow();
    const rows=await db.execute(sql`
      SELECT id,action,details,createdAt
      FROM h2bico_history
      WHERE recordId=${input.id}
      ORDER BY id DESC
      LIMIT 100
    `);
    return rows[0] as any[];
  }),
});
