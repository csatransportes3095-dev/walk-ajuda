import { r2GetObjectBuffer, r2HeadObject } from "./r2Storage";

export const COLOMBIA_BOT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export type ColombiaBotPhotoPreview = { buffer: Buffer; contentType: string };

// A URL enviada no WhatsApp só pode apontar para uma foto de perfil do domínio
// de mídia H2. Não aceitar servidores externos, portas, credenciais ou query.
export function parseColombiaBotPhotoSource(raw: unknown): URL | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 1024) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "midia.h2colombiano.com" ||
      url.port || url.username || url.password || url.search || url.hash) return null;
  const key = url.pathname.replace(/^\//, "");
  if (!/^profile-photos\/[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,220}\.(?:jpg|jpeg|png|webp)$/i.test(key) ||
      key.includes("..")) return null;
  return url;
}

export async function loadColombiaBotPhotoFromR2(
  sourceUrl: URL,
  storage: {
    head: (key: string) => Promise<{ contentLength: number | null }>;
    get: (key: string) => Promise<Buffer>;
  } = { head: r2HeadObject, get: r2GetObjectBuffer },
): Promise<ColombiaBotPhotoPreview | null> {
  if (!parseColombiaBotPhotoSource(sourceUrl.toString())) return null;
  const key = sourceUrl.pathname.slice(1);
  const metadata = await storage.head(key);
  const expectedBytes = metadata.contentLength;
  if (!Number.isSafeInteger(expectedBytes) || !expectedBytes ||
      expectedBytes <= 0 || expectedBytes > COLOMBIA_BOT_PHOTO_MAX_BYTES) return null;
  const buffer = await storage.get(key);
  if (!Buffer.isBuffer(buffer) || buffer.length !== expectedBytes ||
      buffer.length > COLOMBIA_BOT_PHOTO_MAX_BYTES) return null;
  const ext = key.split(".").pop()?.toLowerCase();
  const contentType = ext === "png" ? "image/png" :
    ext === "webp" ? "image/webp" : "image/jpeg";
  return { buffer, contentType };
}
