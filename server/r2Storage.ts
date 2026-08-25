import { S3Client, PutObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { ENV } from "./_core/env";

function validateR2Config() {
  if (!ENV.r2AccessKeyId?.trim() || !ENV.r2SecretAccessKey?.trim() || !ENV.r2Endpoint?.trim() || !ENV.r2BucketName?.trim() || !ENV.r2PublicUrl?.trim()) {
    throw new Error("Cloudflare R2 storage is not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME, and R2_PUBLIC_URL.");
  }
}

function getR2Client() {
  validateR2Config();
  const endpoint = ENV.r2Endpoint.replace(/[\r\n\s]+/g, "").replace(/\/+$/, "");
  const accessKeyId = ENV.r2AccessKeyId.replace(/[\r\n\s]+/g, "");
  const secretAccessKey = ENV.r2SecretAccessKey.replace(/[\r\n\s]+/g, "");

  // --- R2 Diagnostic safe logs (DO NOT LOG SECRET CONTENT) ---
  try {
    const endpointRaw = ENV.r2Endpoint || "";
    const bucketRaw = ENV.r2BucketName || "";
    const accessRaw = ENV.r2AccessKeyId || "";
    const secretRaw = ENV.r2SecretAccessKey || "";
    const accessTrimmed = accessRaw.trim();
    const secretTrimmed = secretRaw.trim();

    // Log only non-sensitive diagnostics
    console.log('[R2 DIAG] endpoint:', endpointRaw);
    console.log('[R2 DIAG] bucket:', bucketRaw);
    console.log('[R2 DIAG] accessKeyLength:', accessTrimmed.length);
    console.log('[R2 DIAG] secretKeyLength:', secretTrimmed.length);
    console.log('[R2 DIAG] accessKeyStartsWith_cfat:', accessTrimmed.startsWith('cfat_'));
    console.log('[R2 DIAG] accessKeyContainsQuotes:', /["\']/.test(accessRaw));
    console.log('[R2 DIAG] secretKeyContainsQuotes:', /["\']/.test(secretRaw));
    console.log('[R2 DIAG] accessKeyHasSpacesOrNewline:', /[ \t\n\r]/.test(accessRaw));
    console.log('[R2 DIAG] secretKeyHasSpacesOrNewline:', /[ \t\n\r]/.test(secretRaw));
  } catch (diagErr) {
    // Never throw from diagnostics
    try { console.error('[R2 DIAG] error while diagnosing R2 env:', String(diagErr)); } catch {}
  }

  return new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function normalizeKey(key: string) {
  return key.replace(/^\/+/, "");
}

export function buildR2PublicUrl(key: string) {
  const path = normalizeKey(key);
  return `${ENV.r2PublicUrl.trim().replace(/\/+$/, "")}/${path}`;
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  if (stream instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }
  if (typeof (stream as any).getReader === "function") {
    const reader = (stream as any).getReader();
    const chunks: Buffer[] = [];
    let result = await reader.read();
    while (!result.done) {
      const chunk = result.value;
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      result = await reader.read();
    }
    return Buffer.concat(chunks);
  }
  if (typeof stream === "string" || stream instanceof Uint8Array) {
    return Buffer.from(stream as any);
  }
  throw new Error("Unable to convert stream to buffer");
}

export async function r2PutObject(key: string, body: Buffer | Uint8Array | string, contentType: string) {
  const client = getR2Client();
  const normalizedKey = normalizeKey(key);
  const command = new PutObjectCommand({
    Bucket: ENV.r2BucketName.trim(),
    Key: normalizedKey,
    Body: body,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });
  await client.send(command);
  return { key: normalizedKey, url: buildR2PublicUrl(normalizedKey) };
}

/** Uploada artefatos grandes sem materializar todo o conteúdo na memória. */
export async function r2PutObjectStream(
  key: string,
  body: Readable,
  contentType: string,
  contentLength?: number,
) {
  const client = getR2Client();
  const normalizedKey = normalizeKey(key);
  const command = new PutObjectCommand({
    Bucket: ENV.r2BucketName.trim(),
    Key: normalizedKey,
    Body: body,
    ContentType: contentType,
    ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
    CacheControl: "private, no-store",
  });
  await client.send(command);
  return { key: normalizedKey, url: buildR2PublicUrl(normalizedKey) };
}

export async function r2GetObjectBuffer(key: string) {
  const client = getR2Client();
  const normalizedKey = normalizeKey(key);
  const command = new GetObjectCommand({ Bucket: ENV.r2BucketName.trim(), Key: normalizedKey });
  const response = await client.send(command);
  if (!response.Body) {
    throw new Error(`R2 object ${normalizedKey} has no body`);
  }
  return await streamToBuffer(response.Body);
}

/** Retorna o corpo do objecto para streaming de downloads grandes. */
export async function r2GetObjectStream(key: string) {
  const client = getR2Client();
  const normalizedKey = normalizeKey(key);
  const command = new GetObjectCommand({ Bucket: ENV.r2BucketName.trim(), Key: normalizedKey });
  const response = await client.send(command);
  if (!response.Body) {
    throw new Error(`R2 object ${normalizedKey} has no body`);
  }
  return response.Body;
}

export async function r2DeleteObjects(keys: string[]) {
  if (keys.length === 0) return;
  const client = getR2Client();
  const normalizedObjects = keys
    .filter(Boolean)
    .map((key) => ({ Key: normalizeKey(key) }));
  if (normalizedObjects.length === 0) return;
  const command = new DeleteObjectsCommand({
    Bucket: ENV.r2BucketName.trim(),
    Delete: { Objects: normalizedObjects, Quiet: true },
  });
  await client.send(command);
}

export async function r2ListObjects(prefix: string) {
  const client = getR2Client();
  const normalizedPrefix = normalizeKey(prefix);
  const command = new ListObjectsV2Command({
    Bucket: ENV.r2BucketName.trim(),
    Prefix: normalizedPrefix,
  });
  const response = await client.send(command);
  return response.Contents?.map((item) => item.Key).filter(Boolean) as string[];
}

export type R2ObjectInfo = {
  key: string;
  size: number;
  etag: string | null;
  lastModified: Date | null;
};

/** Lista uma página do bucket; o chamador deve seguir nextContinuationToken até null. */
export async function r2ListObjectsPage(prefix = "", continuationToken?: string) {
  const client = getR2Client();
  const command = new ListObjectsV2Command({
    Bucket: ENV.r2BucketName.trim(),
    Prefix: normalizeKey(prefix),
    MaxKeys: 1000,
    ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
  });
  const response = await client.send(command);
  const objects: R2ObjectInfo[] = (response.Contents || [])
    .filter((item): item is typeof item & { Key: string } => Boolean(item.Key))
    .map((item) => ({
      key: item.Key,
      size: Number(item.Size || 0),
      etag: item.ETag || null,
      lastModified: item.LastModified || null,
    }));
  return {
    objects,
    nextContinuationToken: response.IsTruncated ? (response.NextContinuationToken || null) : null,
  };
}
