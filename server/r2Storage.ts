import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
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

  return new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    maxAttempts: 3,
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

const R2_MULTIPART_PART_SIZE = 8 * 1024 * 1024;
const R2_MULTIPART_MAX_ATTEMPTS = 3;

function isRetryableR2UploadError(error: unknown): boolean {
  const candidate = error as { code?: string; name?: string; $metadata?: { httpStatusCode?: number } } | null;
  const code = candidate?.code || candidate?.name;
  const status = candidate?.$metadata?.httpStatusCode;
  return code === "ECONNRESET" || code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "TimeoutError" || (typeof status === "number" && status >= 500);
}

const waitForR2Retry = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

/** Faz upload grande em multipart: cada parte tem tamanho conhecido e é repetível sem materializar o pacote inteiro. */
export async function r2PutObjectStream(
  key: string,
  body: Readable,
  contentType: string,
  contentLength?: number,
  diagnostic?: { backupId: string; stage?: string },
) {
  const client = getR2Client();
  const normalizedKey = normalizeKey(key);
  const startedAt = Date.now();
  let bytesSent = 0;
  let uploadId: string | undefined;
  const parts: Array<{ PartNumber: number; ETag: string }> = [];
  const logUpload = (event: string, metadata: { httpStatus?: number | null; etag?: string | null; error?: unknown } = {}) => {
    if (!diagnostic) return;
    const message = metadata.error instanceof Error ? metadata.error.message : metadata.error === undefined ? "" : String(metadata.error);
    const safeMessage = message
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, "<url-redacted>")
      .replace(/(password|secret|token|authorization|cookie|database_url|r2_[a-z_]+|backup_encryption_key)[^\s]*/gi, "$1=<redacted>")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 500);
    console.log(`[BACKUP-DIAG][R2-UPLOAD] backupId=${diagnostic.backupId} stage=${diagnostic.stage || "r2-upload"} timestamp=${new Date().toISOString()} elapsedMs=${Date.now() - startedAt} event=${event} bytesSent=${bytesSent} expectedBytes=${contentLength ?? "unknown"} completed=${event === "completed"} httpStatus=${metadata.httpStatus ?? "null"} etag=${metadata.etag ?? "null"}${safeMessage ? ` error=${safeMessage}` : ""}`);
  };
  const sendPart = async (partBody: Buffer, partNumber: number) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= R2_MULTIPART_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await client.send(new UploadPartCommand({
          Bucket: ENV.r2BucketName.trim(),
          Key: normalizedKey,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: partBody,
          ContentLength: partBody.length,
        }));
        const etag = response.ETag;
        if (!etag) throw new Error(`R2 não retornou ETag para a parte ${partNumber}.`);
        return etag;
      } catch (error) {
        lastError = error;
        if (attempt >= R2_MULTIPART_MAX_ATTEMPTS || !isRetryableR2UploadError(error)) throw error;
        logUpload("part-retry", { error });
        await waitForR2Retry(250 * attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };
  logUpload("started", { httpStatus: null, etag: null });
  try {
    const created = await client.send(new CreateMultipartUploadCommand({
      Bucket: ENV.r2BucketName.trim(),
      Key: normalizedKey,
      ContentType: contentType,
      CacheControl: "private, no-store",
    }));
    uploadId = created.UploadId;
    if (!uploadId) throw new Error("R2 não retornou UploadId para o multipart.");

    let partBuffer = Buffer.allocUnsafe(R2_MULTIPART_PART_SIZE);
    let partBytes = 0;
    let partNumber = 1;
    const flushPart = async () => {
      if (partBytes === 0) return;
      const currentBytes = partBytes;
      const etag = await sendPart(partBuffer.subarray(0, currentBytes), partNumber);
      parts.push({ PartNumber: partNumber, ETag: etag });
      bytesSent += currentBytes;
      partNumber += 1;
      partBuffer = Buffer.allocUnsafe(R2_MULTIPART_PART_SIZE);
      partBytes = 0;
      logUpload("part-completed", { etag });
    };

    for await (const chunk of body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      let offset = 0;
      while (offset < buffer.length) {
        const copied = Math.min(buffer.length - offset, R2_MULTIPART_PART_SIZE - partBytes);
        buffer.copy(partBuffer, partBytes, offset, offset + copied);
        partBytes += copied;
        offset += copied;
        if (partBytes === R2_MULTIPART_PART_SIZE) await flushPart();
      }
    }
    await flushPart();
    if (parts.length === 0) throw new Error("R2 multipart recebeu um corpo vazio inesperado.");
    if (contentLength !== undefined && bytesSent !== contentLength) {
      throw new Error(`Content-Length divergente no multipart: esperado ${contentLength}, enviado ${bytesSent}.`);
    }

    const response = await client.send(new CompleteMultipartUploadCommand({
      Bucket: ENV.r2BucketName.trim(),
      Key: normalizedKey,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }));
    logUpload("completed", {
      httpStatus: response.$metadata?.httpStatusCode ?? null,
      etag: response.ETag ?? null,
    });
    return {
      key: normalizedKey,
      url: buildR2PublicUrl(normalizedKey),
      httpStatus: response.$metadata?.httpStatusCode ?? null,
      etag: response.ETag ?? null,
      bytesSent,
    };
  } catch (error) {
    if (uploadId) {
      try {
        await client.send(new AbortMultipartUploadCommand({
          Bucket: ENV.r2BucketName.trim(),
          Key: normalizedKey,
          UploadId: uploadId,
        }));
        logUpload("aborted", { httpStatus: null, etag: null });
      } catch (abortError) {
        logUpload("abort-failed", { error: abortError, httpStatus: null, etag: null });
      }
    }
    logUpload("failed", { error, httpStatus: null, etag: null });
    throw error;
  }
}

export async function r2HeadObject(key: string) {
  const client = getR2Client();
  const normalizedKey = normalizeKey(key);
  const response = await client.send(new HeadObjectCommand({
    Bucket: ENV.r2BucketName.trim(),
    Key: normalizedKey,
  }));
  return {
    contentLength: response.ContentLength ?? null,
    httpStatus: response.$metadata?.httpStatusCode ?? null,
    etag: response.ETag ?? null,
  };
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

export async function r2ListObjects(prefix: string): Promise<string[]> {
  const client = getR2Client();
  const normalizedPrefix = normalizeKey(prefix);
  const command = new ListObjectsV2Command({
    Bucket: ENV.r2BucketName.trim(),
    Prefix: normalizedPrefix,
  });
  const response = await client.send(command);
  return (response.Contents || [])
    .map((item) => item.Key)
    .filter((key): key is string => Boolean(key));
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
