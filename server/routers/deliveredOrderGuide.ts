import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, getSetting, upsertSetting } from "../db";
import { requireCustomerSession } from "../customerSession";
import { sameDeliveredGuideCustomerPhone } from "../deliveredOrderGuidePhone";
import { resolveDeliveredGuideVideo } from "../../client/src/lib/deliveredGuideVideo";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";

// Orientações de pedido entregue: não são perguntas e não alteram status.
const blockSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().max(160),
  text: z.string().trim().max(4000),
  imageUrl: z.string().trim().max(2048),
  mediaType: z.enum(["image", "video"]).default("image"),
  videoUrl: z.string().trim().max(2048).default(""),
}).superRefine((block, ctx) => {
  if (!block.title && !block.text && !(block.mediaType === "video" ? block.videoUrl : block.imageUrl)) {
    ctx.addIssue({ code: "custom", message: "Adicione texto, foto ou vídeo em cada bloco." });
  }
  if (block.mediaType === "video" && !resolveDeliveredGuideVideo(block.videoUrl)) {
    ctx.addIssue({ code: "custom", path: ["videoUrl"], message: "Cole um link válido de vídeo do YouTube, Vimeo, Drive ou arquivo MP4/WebM HTTPS." });
  }
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
    if (block.mediaType === "video" && !resolveDeliveredGuideVideo(block.videoUrl)) {
      ctx.addIssue({ code: "custom", path: ["blocks", index, "videoUrl"], message: "Link de vídeo não permitido." });
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
    if (Array.isArray(parsed)) blocks = parsed.flatMap(item => {
      const result = blockSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
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

/**
 * Cadastro global: um só conjunto de orientações, fotos e prints para todos
 * os pedidos. Registros antigos com token são mantidos para não quebrar links enviados.
 */
const GLOBAL_GUIDE_KEY = "delivered_order_guide_global_v1";
const globalGuideInputSchema = z.object({
  title: z.string().trim().min(3).max(140),
  intro: z.string().trim().max(4000),
  blocks: blocksSchema,
}).superRefine((input, ctx) => {
  input.blocks.forEach((block, index) => {
    if (block.imageUrl && !allowedImageUrl(block.imageUrl)) {
      ctx.addIssue({ code: "custom", path: ["blocks", index, "imageUrl"], message: "Imagem fora do armazenamento H2 autorizado." });
    }
    if (block.mediaType === "video" && !resolveDeliveredGuideVideo(block.videoUrl)) {
      ctx.addIssue({ code: "custom", path: ["blocks", index, "videoUrl"], message: "Link de vídeo não permitido." });
    }
  });
});
const globalGuideStoredSchema = globalGuideInputSchema.safeExtend({
  status: z.enum(["draft", "published"]),
  updatedAt: z.string().datetime(),
});
type GlobalGuide = z.infer<typeof globalGuideStoredSchema>;

async function getGlobalGuide(): Promise<GlobalGuide | null> {
  const json = await getSetting(GLOBAL_GUIDE_KEY);
  if (!json) return null;
  try {
    const parsed = globalGuideStoredSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
async function saveGlobalGuide(value: GlobalGuide): Promise<GlobalGuide> {
  const payload = JSON.stringify(value);
  // siteSettings.settingValue usa TEXT (limite ~64 KiB); rejeitar conteúdos
  // maiores com erro claro sem interferir em outras tabelas ou módulos.
  if (Buffer.byteLength(payload, "utf8") > 60_000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Orientações globais excedem 60 KB. Divida os textos em blocos menores." });
  }
  await upsertSetting(GLOBAL_GUIDE_KEY, payload);
  return value;
}
function publicGlobalGuide(guide: GlobalGuide) {
  return { found: true as const, title: guide.title, intro: guide.intro, blocks: guide.blocks };
}

export const deliveredOrderGuideRouter = router({
  // Todos os cards do ADM abrem exatamente o mesmo editor.
  getGlobal: adminProcedure.query(async () => getGlobalGuide()),

  saveGlobal: adminProcedure
    .input(globalGuideInputSchema)
    .mutation(async ({ input }) => {
      const existing = await getGlobalGuide();
      return saveGlobalGuide({
        ...input,
        status: existing?.status || "draft",
        updatedAt: new Date().toISOString(),
      });
    }),

  publishGlobal: adminProcedure.mutation(async () => {
    const existing = await getGlobalGuide();
    if (!existing?.blocks.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cadastre e salve as orientações globais antes de publicar." });
    }
    return saveGlobalGuide({ ...existing, status: "published", updatedAt: new Date().toISOString() });
  }),

  unpublishGlobal: adminProcedure.mutation(async () => {
    const existing = await getGlobalGuide();
    if (!existing) return null;
    return saveGlobalGuide({ ...existing, status: "draft", updatedAt: new Date().toISOString() });
  }),


  getForOrder: adminProcedure
    .input(orderKeySchema)
    .query(async ({ input }) => getByOrder(input.registrationId, input.subOrderIndex)),

  // O mesmo formulário global atende a todos, mas cada pedido tem seu próprio token.
  // Reutiliza o token quando o ADM reabre o card, sem gerar um link diferente.
  createLinkForOrder: adminProcedure
    .input(orderKeySchema.extend({
      customerPhone: z.string().max(32).default(""),
      customerName: z.string().max(128).nullable().optional(),
      orderNumber: z.number().int().positive().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const global = await getGlobalGuide();
      if (global?.status !== "published") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Publique primeiro o formulário global de orientações." });
      }
      await ensureInfrastructure();
      const db = await getDb() as any;
      const existing = await getByOrder(input.registrationId, input.subOrderIndex);
      if (existing) {
        // Preserva o endereço já compartilhado para este mesmo pedido.
        await db.execute(sql`
          UPDATE deliveredOrderGuides
          SET status='published',
              customerPhone=${input.customerPhone},
              customerName=${input.customerName ?? null},
              orderNumber=${input.orderNumber ?? null}
          WHERE id=${existing.id}
        `);
      } else {
        const token = randomBytes(24).toString("hex");
        await db.execute(sql`
          INSERT INTO deliveredOrderGuides
            (token,registrationId,subOrderIndex,customerPhone,customerName,orderNumber,title,intro,blocks,status)
          VALUES
            (${token},${input.registrationId},${input.subOrderIndex},${input.customerPhone},
             ${input.customerName ?? null},${input.orderNumber ?? null},${"PEDIDO ENTREGUE"},
             ${""},${"[]"},'published')
        `);
      }
      return getByOrder(input.registrationId, input.subOrderIndex);
    }),

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
    .input(z.object({
      token: z.string().regex(/^[a-f0-9]{48}$/),
      customerSessionToken: z.string().min(32).max(256),
    }))
    // POST: nao enviar o token de sessao por URL/GET.
    .mutation(async ({ input }) => {
      // O link nao e mais publico: a sessao deve ser valida no servidor, nao
      // apenas no navegador. Nao consultar registros antes de validar login.
      const session = await requireCustomerSession(input.customerSessionToken);
      const record = await getByToken(input.token);
      if (!record) return { found: false as const };
      if (!sameDeliveredGuideCustomerPhone(session.phone, record.customerPhone)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Este link pertence ao telefone cadastrado no pedido. Entre na conta correta.",
        });
      }
      // O token identifica um pedido e o formulario de orientacoes e global.
      const global = await getGlobalGuide();
      if (global && global.status !== "published") return { found: false as const };
      const db = await getDb() as any;
      if (!record.openedAt) {
        await db.execute(sql`UPDATE deliveredOrderGuides SET openedAt=NOW() WHERE id=${record.id}`);
      }
      if (global) {
        return { ...publicGlobalGuide(global), customerName: record.customerName, orderNumber: record.orderNumber };
      }
      // A página do cliente não recebe telefone nem dados internos do ADM.
      return {
        found: true as const,
        title: record.title,
        intro: record.intro,
        blocks: record.blocks.filter(block => allowedImageUrl(block.imageUrl) && (block.mediaType !== "video" || Boolean(resolveDeliveredGuideVideo(block.videoUrl)))),
        customerName: record.customerName,
        orderNumber: record.orderNumber,
      };
    }),
});
