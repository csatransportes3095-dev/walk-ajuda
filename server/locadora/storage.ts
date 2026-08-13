import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import { ENV } from "../_core/env";
import { r2DeleteObjects, r2GetObjectBuffer, r2PutObject } from "../r2Storage";

const VERSION = 1;
const MAX_BYTES = 10 * 1024 * 1024;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type LocadoraPrivateFile = { buffer: Buffer; mimeType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf"; extension: "png" | "jpg" | "webp" | "pdf" };

function key() {
  if (!ENV.cookieSecret || ENV.cookieSecret.trim().length < 16) throw new Error("A chave do servidor não está configurada para proteger os documentos da locadora.");
  return createHash("sha256").update(`walk-ajuda/private-locadora/v1:${ENV.cookieSecret}`).digest();
}
function inspect(buffer: Buffer): LocadoraPrivateFile | null {
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const pdf = buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (png) return { buffer, mimeType: "image/png", extension: "png" };
  if (jpeg) return { buffer, mimeType: "image/jpeg", extension: "jpg" };
  if (webp) return { buffer, mimeType: "image/webp", extension: "webp" };
  if (pdf) return { buffer, mimeType: "application/pdf", extension: "pdf" };
  return null;
}
export function parseLocadoraPrivateFile(data: string): LocadoraPrivateFile {
  const base64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
  if (!base64 || base64.length > Math.ceil(MAX_BYTES * 4 / 3) + 2048) throw new Error("Arquivo vazio ou acima do limite de 10 MB.");
  const checked = inspect(Buffer.from(base64, "base64"));
  if (!checked || checked.buffer.length === 0 || checked.buffer.length > MAX_BYTES) throw new Error("Formato inválido. Envie somente PNG, JPG, WebP ou PDF até 10 MB.");
  return checked;
}
function encrypt(buffer: Buffer) {
  const iv = randomBytes(IV_BYTES); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), encrypted]);
}
function decrypt(payload: Buffer) {
  if (payload.length <= 1 + IV_BYTES + TAG_BYTES || payload[0] !== VERSION) throw new Error("Arquivo privado da locadora inválido.");
  const iv = payload.subarray(1, 1 + IV_BYTES); const tag = payload.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()]);
}
export async function storeLocadoraPrivateFile(tenantId: number, category: string, file: LocadoraPrivateFile) {
  const safeCategory = category.replace(/[^a-z0-9_-]/gi, "").slice(0, 48) || "arquivo";
  const storageKey = `locadora-private/${tenantId}/${safeCategory}/${randomUUID()}.bin`;
  await r2PutObject(storageKey, encrypt(file.buffer), "application/octet-stream");
  return { storageKey, mimeType: file.mimeType, extension: file.extension };
}
export async function readLocadoraPrivateFile(storageKey: string, expectedMime?: string | null) {
  const inspected = inspect(decrypt(await r2GetObjectBuffer(storageKey)));
  if (!inspected || (expectedMime && inspected.mimeType !== expectedMime)) throw new Error("Falha na validação de integridade do arquivo da locadora.");
  return inspected;
}
export async function deleteLocadoraPrivateFile(storageKey?: string | null) { if (storageKey) await r2DeleteObjects([storageKey]); }
