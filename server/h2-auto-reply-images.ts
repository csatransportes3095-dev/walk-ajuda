import type { Express, Request, Response } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import {
  H2_AUTO_REPLY_IMAGE_MAX_BYTES, H2_AUTO_REPLY_IMAGE_MAX_DIMENSION,
  h2AutoReplyImagePath, h2AutoReplyImageSchema, type H2AutoReplyImage,
} from "../shared/h2AutoReplyImage";
import { getDb } from "./db";
import { isAdminJwtValid } from "./_core/trpc";
import { storagePut } from "./storage";
import { r2DeleteObjects, r2GetObjectBuffer, r2HeadObject } from "./r2Storage";

const deviceIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const h2AutoReplyImageUploadSchema = z.object({
  id: deviceIdSchema,
  imageBase64: z.string().min(4).max(Math.ceil(H2_AUTO_REPLY_IMAGE_MAX_BYTES / 3) * 4),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
}).strict();

type ImageRow = {
  id: string; device_id: string; storage_key: string; sha256: string;
  mime_type: "image/jpeg" | "image/png"; file_size: number; width: number; height: number;
};
let ready: Promise<void> | undefined;
function resultRows<T>(result: unknown): T[] {
  const values = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(values) ? values as T[] : [];
}
async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco indisponível. Tente novamente." });
  return db;
}
export async function ensureH2AutoReplyImages() {
  if (!ready) ready = (async () => {
    const db = await database();
    await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_reply_images (
      device_id VARCHAR(32) NOT NULL,
      id CHAR(32) NOT NULL,
      storage_key VARCHAR(255) NOT NULL,
      sha256 CHAR(64) NOT NULL,
      mime_type VARCHAR(32) NOT NULL,
      file_size INT UNSIGNED NOT NULL,
      width INT UNSIGNED NOT NULL,
      height INT UNSIGNED NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (device_id, id)
    ) ENGINE=InnoDB`);
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
function rowImage(row: ImageRow): H2AutoReplyImage {
  return h2AutoReplyImageSchema.parse({ id: row.id, sha256: row.sha256,
    mimeType: row.mime_type, fileSize: Number(row.file_size), width: Number(row.width),
    height: Number(row.height), downloadPath: h2AutoReplyImagePath(row.device_id, row.id) });
}

/** Decode and re-encode the pixels: extensions, MIME declarations and metadata are untrusted. */
export async function normalizeH2AutoReplyImage(imageBase64: string, declaredMime: string) {
  if (imageBase64.length > Math.ceil(H2_AUTO_REPLY_IMAGE_MAX_BYTES / 3) * 4 ||
      imageBase64.length % 4 !== 0 ||
      /[^A-Za-z0-9+/=]/.test(imageBase64)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O arquivo da imagem é inválido." });
  }
  const buffer = Buffer.from(imageBase64, "base64");
  if (!buffer.length || buffer.length > H2_AUTO_REPLY_IMAGE_MAX_BYTES)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha uma imagem de até 5 MB." });
  if (buffer.toString("base64") !== imageBase64)
    throw new TRPCError({ code: "BAD_REQUEST", message: "O arquivo da imagem é inválido." });
  try {
    const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: "error", animated: false });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || !["jpeg", "png", "webp"].includes(meta.format || "") ||
        declaredMime !== `image/${meta.format}` || (meta.pages ?? 1) > 1) throw new Error("invalid_image");
    const mimeType = meta.hasAlpha ? "image/png" as const : "image/jpeg" as const;
    const resized = image.rotate().resize({ width: H2_AUTO_REPLY_IMAGE_MAX_DIMENSION,
      height: H2_AUTO_REPLY_IMAGE_MAX_DIMENSION, fit: "inside", withoutEnlargement: true });
    const { data, info } = await (mimeType === "image/png"
      ? resized.png({ compressionLevel: 9 }) : resized.jpeg({ quality: 90, mozjpeg: true }))
      .toBuffer({ resolveWithObject: true });
    if (!data.length || data.length > H2_AUTO_REPLY_IMAGE_MAX_BYTES) throw new Error("too_large");
    return { buffer: data, mimeType, fileSize: data.length, width: info.width, height: info.height,
      sha256: createHash("sha256").update(data).digest("hex") };
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Use uma imagem JPEG, PNG ou WebP válida, de até 5 MB." });
  }
}

export async function uploadH2AutoReplyImage(input: z.infer<typeof h2AutoReplyImageUploadSchema>) {
  await ensureH2AutoReplyImages();
  const db = await database();
  const device = await db.execute(sql`SELECT id FROM h2_auto_devices WHERE id=${input.id} LIMIT 1`);
  if (!resultRows<{id:string}>(device).length)
    throw new TRPCError({ code: "NOT_FOUND", message: "Aparelho H2 Auto não encontrado." });
  const normalized = await normalizeH2AutoReplyImage(input.imageBase64, input.mimeType);
  const imageId = randomBytes(16).toString("hex");
  const storageKey = `h2-auto/reply-images/${input.id}/${imageId}.${normalized.mimeType === "image/png" ? "png" : "jpg"}`;
  await storagePut(storageKey, normalized.buffer, normalized.mimeType);
  try {
    await db.execute(sql`INSERT INTO h2_auto_reply_images
      (device_id,id,storage_key,sha256,mime_type,file_size,width,height,created_at)
      VALUES (${input.id},${imageId},${storageKey},${normalized.sha256},${normalized.mimeType},
        ${normalized.fileSize},${normalized.width},${normalized.height},${Date.now()})`);
  } catch (error) {
    // Only clean up this new, unpublished upload, never a previously saved image.
    await r2DeleteObjects([storageKey]).catch(() => undefined);
    throw error;
  }
  const image = h2AutoReplyImageSchema.parse({ id: imageId, sha256: normalized.sha256,
    mimeType: normalized.mimeType, fileSize: normalized.fileSize, width: normalized.width,
    height: normalized.height, downloadPath: h2AutoReplyImagePath(input.id, imageId) });
  return { image };
}

/** A config write cannot invent image metadata, reuse another device's upload or add arbitrary URLs. */
export async function assertH2AutoReplyImages(deviceId: string, faq: readonly { image?: H2AutoReplyImage }[]) {
  const images = faq.map(entry => entry.image).filter((image): image is H2AutoReplyImage => Boolean(image));
  if (!images.length) return;
  await ensureH2AutoReplyImages();
  const db = await database();
  const ids = [...new Set(images.map(image => image.id))];
  const found = await db.execute(sql`SELECT * FROM h2_auto_reply_images
    WHERE device_id=${deviceId} AND id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
  const byId = new Map(resultRows<ImageRow>(found).map(row => [row.id, rowImage(row)]));
  for (const image of images) {
    const canonical = byId.get(image.id);
    if (!canonical || Object.keys(canonical).some(key => canonical[key as keyof H2AutoReplyImage] !== image[key as keyof H2AutoReplyImage])) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A imagem não pertence a este aparelho ou foi alterada. Anexe novamente." });
    }
  }
}

function tokenMatches(stored: unknown, supplied: string): boolean {
  if (typeof stored !== "string" || !/^[a-f0-9]{64}$/.test(stored)) return false;
  return timingSafeEqual(Buffer.from(stored, "hex"), createHash("sha256").update(supplied).digest());
}
const errorResponse = (res: Response, status: number, error: string) =>
  res.status(status).set("Cache-Control", "no-store").json({ error });

export function registerH2AutoReplyImageRoutes(app: Express) {
  app.get("/api/h2-auto/reply-images/:deviceId/:imageId", async (req: Request, res: Response) => {
    try {
      const { deviceId, imageId } = req.params;
      if (!deviceIdSchema.safeParse(deviceId).success || !/^[a-f0-9]{32}$/.test(imageId))
        return errorResponse(res, 404, "not_found");
      const admin = isAdminJwtValid(req);
      const token = String(req.header("x-h2-device-token") || "");
      if (!admin && (req.header("x-h2-device-id") !== deviceId || !/^[a-f0-9]{64}$/.test(token)))
        return errorResponse(res, 401, "unauthorized");
      await ensureH2AutoReplyImages();
      const db = await database();
      const devices = await db.execute(sql`SELECT token_hash,config_json FROM h2_auto_devices
        WHERE id=${deviceId} LIMIT 1`);
      const device = resultRows<{token_hash:unknown;config_json:any}>(devices)[0];
      if (!device) return errorResponse(res, 404, "not_found");
      if (!admin) {
        if (!tokenMatches(device.token_hash, token)) return errorResponse(res, 401, "unauthorized");
        const config = typeof device.config_json === "string" ? JSON.parse(device.config_json) : device.config_json;
        const linked = Array.isArray(config?.personalization?.faq) &&
          config.personalization.faq.some((entry: any) => entry?.enabled !== false && entry?.image?.id === imageId &&
            entry.image.downloadPath === h2AutoReplyImagePath(deviceId, imageId));
        if (!linked) return errorResponse(res, 404, "not_found");
      }
      const result = await db.execute(sql`SELECT * FROM h2_auto_reply_images
        WHERE device_id=${deviceId} AND id=${imageId} LIMIT 1`);
      const row = resultRows<ImageRow>(result)[0];
      if (!row) return errorResponse(res, 404, "not_found");
      const metadata = rowImage(row);
      const head = await r2HeadObject(row.storage_key);
      if (head.contentLength !== metadata.fileSize || head.contentLength > H2_AUTO_REPLY_IMAGE_MAX_BYTES)
        return errorResponse(res, 503, "image_unavailable");
      const buffer = await r2GetObjectBuffer(row.storage_key);
      if (buffer.length !== metadata.fileSize || createHash("sha256").update(buffer).digest("hex") !== metadata.sha256)
        return errorResponse(res, 503, "image_unavailable");
      return res.status(200).set({
        "Cache-Control": "private, no-store",
        "Content-Type": metadata.mimeType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename="h2-${imageId}.${metadata.mimeType === "image/png" ? "png" : "jpg"}"`,
        "X-Content-Type-Options": "nosniff",
        "X-H2-Image-Sha256": metadata.sha256,
      }).send(buffer);
    } catch {
      return errorResponse(res, 503, "image_unavailable");
    }
  });
}
