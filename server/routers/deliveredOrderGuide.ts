import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";

// Orientações de pedido entregue: não são perguntas e não alteram status.
const blockSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().max(160),
  text: z.string().trim().max(4000),
  imageUrl: z.string().trim().max(2048),
}).refine(block => Boolean(block.title || block.text || block.imageUrl), {
  message: "Adicione texto ou uma imagem em cada bloco.",
});
const blocksSchema = z.array(blockSchema).min(1).max(24);
type Block = z.infer<typeof blockSchema>;

function allowedImageUrl(value: string): boolean {
  if (!value) return true;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return false;
    const hosts = new Set(["midia.h2colombiano.com"]);
    if (process.env.R2_PUBLIC_URL) {
      try {
        const trusted = new URL(process.env.R2_PUBLIC_URL);
        if (trusted.protocol === "https:") hosts.add(trusted.hostname);
      } catch { /* não aceitar domínios extras em caso de configuração inválida */ }
    }
    return hosts.has(u.hostname) && u.pathname.startsWith("/") && !u.pathname.includes("..");
  } catch { return false; }
}

const orderKeySchema = z.object({
  registrationId: z.number().int().positive(),
  subOrderIndex: z.number().int().min(0).default(0),
});
const saveSchema = orderKeySchema.extend({
  customerPhone: z.string().max(32).default(""),
  customerName: z.string().max(128).nullable().optional(),
  orderNumber: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(3).max(140),
  intro: z.string().trim().max(4000),
  blocks: blocksSchema,
}).superRefine((input, ctx) => {
  input.blocks.forEach((block, index) => {
    if (block.imageUrl && !allowedImageUrl(block.imageUrl)) {
      ctx.addIssue({ code: "custom", path: ["blocks", index, "imageUrl"], message: "Imagem fora do armazenamento H2 autorizado." });
    }
  });
});

let infrastructureReady = false;
async function ensureInfrastructure() {
  if (infrastructureReady) return;
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  await db.execute(sql.raw(
    "CREATE TABLE IF NOT EXISTS deliveredOrderGuides (" +
    "id INT NOT NULL AUTO_INCREMENT PRIMARY KEY," +
    "token VARCHAR(64) NOT NULL," +
    "registrationId INT NOT NULL," +
    "subOrderIndex INT NOT NULL DEFAULT 0," +
    "customerPhone VARCHAR(32) NOT NULL DEFAULT ''," +
    "customerName VARCHAR(128) NULL," +
    "orderNumber INT NULL," +
    "title VARCHAR(140) NOT NULL," +
    "intro TEXT NOT NULL," +
    "blocks LONGTEXT NOT NULL," +
    "status VARCHAR(16) NOT NULL DEFAULT 'draft'," +
    "openedAt DATETIME NULL," +
    "createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
    "updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
    "UNIQUE KEY uq_delivered_order_guide_token (token)," +
    "UNIQUE KEY uq_delivered_order_guide_order (registrationId,subOrderIndex)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  ));
  infrastructureReady = true;
}

function normalizeRow(row: any) {
  if (!row) return null;
  let blocks: Block[] = [];
  try {
    const parsed = JSON.parse(String(row.blocks || "[]"));
    if (Array.isArray(parsed)) blocks = parsed.filter(item => blockSchema.safeParse(item).success);
  } catch { /* não expor conteúdo inválido */ }
  return {
    id: Number(row.id),
    token: String(row.token),
    registrationId: Number(row.registrationId),
    subOrderIndex: Number(row.subOrderIndex || 0),
    customerPhone: String(row.customerPhone || ""),
    customerName: row.customerName ? String(row.customerName) : null,
    orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
    title: String(row.title || "PEDIDO ENTREGUE"),
    intro: String(row.intro || ""),
    blocks,
    status: String(row.status || "draft") as "draft" | "published",
    openedAt: row.openedAt ? new Date(row.openedAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}
async function getByOrder(registrationId: number, subOrderIndex: number) {
  await ensureInfrastructure();
  const db = await getDb() as any;
  const result: any = await db.execute(sql`
    SELECT * FROM deliveredOrderGuides
    WHERE registrationId=${registrationId} AND subOrderIndex=${subOrderIndex}
    LIMIT 1
  `);
  return normalizeRow((Array.isArray(result) ? result[0] : [])?.[0]);
}
async function getByToken(token: string) {
  await ensureInfrastructure();
  const db = await getDb() as any;
  const result: any = await db.execute(sql`
    SELECT * FROM deliveredOrderGuides WHERE token=${token} AND status='published' LIMIT 1
  `);
  return normalizeRow((Array.isArray(result) ? result[0] : [])?.[0]);
}
export const deliveredOrderGuideRouter = router({
  getForOrder: adminProcedure
    .input(orderKeySchema)
    .query(async ({ input }) => getByOrder(input.registrationId, input.subOrderIndex)),

  saveForOrder: adminProcedure
    .input(saveSchema)
    .mutation(async ({ input }) => {
      await ensureInfrastructure();
      const db = await getDb() as any;
      const existing = await getByOrder(input.registrationId, input.subOrderIndex);
      if (existing) {
        await db.execute(sql`
          UPDATE deliveredOrderGuides
          SET customerPhone=${input.customerPhone},
              customerName=${input.customerName ?? null},
              orderNumber=${input.orderNumber ?? null},
              title=${input.title}, intro=${input.intro},
              blocks=${JSON.stringify(input.blocks)}
          WHERE id=${existing.id}
        `);
      } else {
        const token = randomBytes(24).toString("hex");
        await db.execute(sql`
          INSERT INTO deliveredOrderGuides
          (token,registrationId,subOrderIndex,customerPhone,customerName,orderNumber,title,intro,blocks,status)
          VALUES (${token},${input.registrationId},${input.subOrderIndex},
            ${input.customerPhone},${input.customerName ?? null},${input.orderNumber ?? null},
            ${input.title},${input.intro},${JSON.stringify(input.blocks)},'draft')
        `);
      }
      return await getByOrder(input.registrationId, input.subOrderIndex);
    }),

  publish: adminProcedure
    .input(orderKeySchema)
    .mutation(async ({ input }) => {
      const record = await getByOrder(input.registrationId, input.subOrderIndex);
      if (!record || !record.blocks.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Salve as orientações antes de publicar." });
      }
      const db = await getDb() as any;
      await db.execute(sql`UPDATE deliveredOrderGuides SET status='published' WHERE id=${record.id}`);
      return await getByOrder(input.registrationId, input.subOrderIndex);
    }),

  unpublish: adminProcedure
    .input(orderKeySchema)
    .mutation(async ({ input }) => {
      const record = await getByOrder(input.registrationId, input.subOrderIndex);
      if (!record) return null;
      const db = await getDb() as any;
      await db.execute(sql`UPDATE deliveredOrderGuides SET status='draft' WHERE id=${record.id}`);
      return await getByOrder(input.registrationId, input.subOrderIndex);
    }),

  getPublic: publicProcedure
    .input(z.object({ token: z.string().regex(/^[a-f0-9]{48}$/) }))
    .query(async ({ input }) => {
      const record = await getByToken(input.token);
      if (!record) return { found: false as const };
      const db = await getDb() as any;
      if (!record.openedAt) {
        await db.execute(sql`UPDATE deliveredOrderGuides SET openedAt=NOW() WHERE id=${record.id}`);
      }
      // A página do cliente não recebe telefone nem dados internos do ADM.
      return {
        found: true as const,
        title: record.title,
        intro: record.intro,
        blocks: record.blocks.filter(block => allowedImageUrl(block.imageUrl)),
        customerName: record.customerName,
        orderNumber: record.orderNumber,
      };
    }),
});
