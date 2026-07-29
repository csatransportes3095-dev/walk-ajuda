// storage.ts — Wrapper de storage que usa Cloudflare R2 diretamente
// Remove dependência do Manus Storage Proxy (BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY)
import { r2PutObject, buildR2PublicUrl } from './r2Storage';

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as any);
  const { url } = await r2PutObject(key, buffer, contentType);
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  const url = buildR2PublicUrl(key);
  return { key, url };
}
