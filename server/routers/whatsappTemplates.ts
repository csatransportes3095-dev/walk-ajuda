import { z } from "zod";
import { sql } from "drizzle-orm";
import { adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { snapshotUnicodeText } from "../../shared/whatsappUnicodeDiagnostics";

export const whatsappTemplatesRouter = {
  list: adminProcedure.query(async () => {
    const db = await getDb() as any;
    const rows = await db.execute(sql`SELECT * FROM whatsappTemplates ORDER BY sortOrder ASC, createdAt ASC`);
    return (rows[0] as any[]) || [];
  }),

  unicodeDiagnostics: adminProcedure.query(async () => {
    const db = await getDb() as any;
    if (!db) throw new Error("Banco indisponível para diagnóstico Unicode.");

    const [sessionRows] = await db.execute(sql`
      SELECT
        @@character_set_client AS characterSetClient,
        @@character_set_connection AS characterSetConnection,
        @@character_set_results AS characterSetResults,
        @@character_set_database AS characterSetDatabase,
        @@collation_connection AS collationConnection,
        @@collation_database AS collationDatabase
    `) as any;
    const [tableRows] = await db.execute(sql`
      SELECT TABLE_NAME AS tableName, TABLE_COLLATION AS tableCollation
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsappTemplates'
    `) as any;
    const [columnRows] = await db.execute(sql`
      SELECT
        COLUMN_NAME AS columnName,
        CHARACTER_SET_NAME AS characterSet,
        COLLATION_NAME AS collation,
        COLUMN_TYPE AS columnType
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'whatsappTemplates'
        AND COLUMN_NAME = 'message'
    `) as any;
    const [templateRows] = await db.execute(sql`
      SELECT id, title, statusKey, isDefault, sortOrder, message,
        CHAR_LENGTH(message) AS characterLength,
        LENGTH(message) AS byteLength,
        HEX(message) AS utf8BytesHex
      FROM whatsappTemplates
      WHERE statusKey IN ('pedido_entregue', 'entregue')
      ORDER BY isDefault DESC, sortOrder ASC, id ASC
    `) as any;

    return {
      mysql: {
        session: sessionRows?.[0] ?? null,
        table: tableRows?.[0] ?? null,
        column: columnRows?.[0] ?? null,
      },
      templates: (templateRows ?? []).map((template: any) => ({
        id: template.id,
        title: template.title,
        statusKey: template.statusKey,
        isDefault: template.isDefault,
        sortOrder: template.sortOrder,
        database: {
          characterLength: template.characterLength,
          byteLength: template.byteLength,
          utf8BytesHex: template.utf8BytesHex,
        },
        message: snapshotUnicodeText(String(template.message ?? "")),
      })),
    };
  }),

  reportCommissionDiagnostic: adminProcedure
    .input(z.object({
      action: z.string().max(80),
      source: z.enum(["anchor", "window.open", "auto-scan"]),
      decodedText: z.string().max(8000),
      encodedText: z.string().max(20000),
      resolvedUrl: z.string().max(24000),
      rawAttribute: z.string().max(24000).nullable().optional(),
      hasReplacementCharacter: z.boolean(),
      encodedHasReplacementUtf8: z.boolean(),
      encodedHasKnownEmojiUtf8: z.boolean(),
      codePoints: z.array(z.string()).max(8000),
      utf8BytesHex: z.string().max(40000),
      capturedAt: z.string().max(80),
    }))
    .mutation(async ({ input }) => {
      const record = {
        tag: "commission-whatsapp-diag",
        serverReceivedAt: new Date().toISOString(),
        ...input,
      };

      // Diagnóstico temporário: somente log. Não grava banco e não altera mensagens.
      process.stdout.write(`[commission-whatsapp-diag] ${JSON.stringify(record)}\n`);
      return { success: true };
    }),

  create: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      statusKey: z.string().optional().nullable(),
      message: z.string().min(1),
      imageUrl: z.string().optional().nullable(),
      imageTitle: z.string().optional().nullable(),
      videoUrl: z.string().optional().nullable(),
      videoTitle: z.string().optional().nullable(),
      mediaFileKey: z.string().optional().nullable(),
      mediaFileUrl: z.string().optional().nullable(),
      mediaType: z.enum(["image", "video"]).optional().nullable(),
      sortOrder: z.number().optional().default(0),
      isDefault: z.number().optional().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const title = input.title;
      const statusKey = input.statusKey ?? null;
      const message = input.message;
      const imageUrl = input.imageUrl ?? null;
      const imageTitle = input.imageTitle ?? null;
      const videoUrl = input.videoUrl ?? null;
      const videoTitle = input.videoTitle ?? null;
      const mediaFileKey = input.mediaFileKey ?? null;
      const mediaFileUrl = input.mediaFileUrl ?? null;
      const mediaType = input.mediaType ?? null;
      const sortOrder = input.sortOrder ?? 0;
      const isDefault = input.isDefault ?? 0;

      await db.execute(sql`
        INSERT INTO whatsappTemplates (title, statusKey, message, imageUrl, imageTitle, videoUrl, videoTitle, mediaFileKey, mediaFileUrl, mediaType, sortOrder, isDefault)
        VALUES (${title}, ${statusKey}, ${message}, ${imageUrl}, ${imageTitle}, ${videoUrl}, ${videoTitle}, ${mediaFileKey}, ${mediaFileUrl}, ${mediaType}, ${sortOrder}, ${isDefault})
      `);
      const idResult = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
      const id = (idResult[0] as any[])?.[0]?.id;
      return { success: true, id };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1),
      statusKey: z.string().optional().nullable(),
      message: z.string().min(1),
      imageUrl: z.string().optional().nullable(),
      imageTitle: z.string().optional().nullable(),
      videoUrl: z.string().optional().nullable(),
      videoTitle: z.string().optional().nullable(),
      mediaFileKey: z.string().optional().nullable(),
      mediaFileUrl: z.string().optional().nullable(),
      mediaType: z.enum(["image", "video"]).optional().nullable(),
      sortOrder: z.number().optional().default(0),
      isDefault: z.number().optional().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const id = input.id;
      const title = input.title;
      const statusKey = input.statusKey ?? null;
      const message = input.message;
      const imageUrl = input.imageUrl ?? null;
      const imageTitle = input.imageTitle ?? null;
      const videoUrl = input.videoUrl ?? null;
      const videoTitle = input.videoTitle ?? null;
      const mediaFileKey = input.mediaFileKey ?? null;
      const mediaFileUrl = input.mediaFileUrl ?? null;
      const mediaType = input.mediaType ?? null;
      const sortOrder = input.sortOrder ?? 0;
      const isDefault = input.isDefault ?? 0;

      await db.execute(sql`
        UPDATE whatsappTemplates SET
          title = ${title}, statusKey = ${statusKey}, message = ${message},
          imageUrl = ${imageUrl}, imageTitle = ${imageTitle},
          videoUrl = ${videoUrl}, videoTitle = ${videoTitle},
          mediaFileKey = ${mediaFileKey}, mediaFileUrl = ${mediaFileUrl},
          mediaType = ${mediaType}, sortOrder = ${sortOrder}, isDefault = ${isDefault}
        WHERE id = ${id}
      `);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      await db.execute(sql`DELETE FROM whatsappTemplates WHERE id = ${input.id}`);
      return { success: true };
    }),

  uploadMedia: adminProcedure
    .input(z.object({
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      mediaType: z.enum(["image", "video"]),
    }))
    .mutation(async ({ input }) => {
      const ext = input.fileName.split('.').pop() || (input.mediaType === 'video' ? 'mp4' : 'jpg');
      const fileKey = `whatsapp-templates/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const { url, key } = await storagePut(fileKey, buffer, input.mimeType);
      return { url, key };
    }),
};
