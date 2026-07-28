import { S3Client, PutObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { ENV } from "./_core/env";

function validateR2Config() {
  if (!ENV.r2AccessKeyId || !ENV.r2SecretAccessKey || !ENV.r2Endpoint || !ENV.r2BucketName || !ENV.r2PublicUrl) {
    throw new Error("Cloudflare R2 storage is not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME, and R2_PUBLIC_URL.");
  }
}

function getR2Client() {
  validateR2Config();
  const endpoint = ENV.r2Endpoint.replace(/\/+$/, "");
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: ENV.r2AccessKeyId,
      secretAccessKey: ENV.r2SecretAccessKey,
    },
    forcePathStyle: false,
  });
}

function normalizeKey(key: string) {
  return key.replace(/^\/+/, "");
}

export function buildR2PublicUrl(key: string) {
  const path = normalizeKey(key);
  return `${ENV.r2PublicUrl.replace(/\/+$/, "")}/${path}`;
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
    Bucket: ENV.r2BucketName,
    Key: normalizedKey,
    Body: body,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });
  await client.send(command);
  return { key: normalizedKey, url: buildR2PublicUrl(normalizedKey) };
}

export async function r2GetObjectBuffer(key: string) {
  const client = getR2Client();
  const normalizedKey = normalizeKey(key);
  const command = new GetObjectCommand({ Bucket: ENV.r2BucketName, Key: normalizedKey });
  const response = await client.send(command);
  if (!response.Body) {
    throw new Error(`R2 object ${normalizedKey} has no body`);
  }
  return await streamToBuffer(response.Body);
}

export async function r2DeleteObjects(keys: string[]) {
  if (keys.length === 0) return;
  const client = getR2Client();
  const normalizedObjects = keys
    .filter(Boolean)
    .map((key) => ({ Key: normalizeKey(key) }));
  if (normalizedObjects.length === 0) return;
  const command = new DeleteObjectsCommand({
    Bucket: ENV.r2BucketName,
    Delete: { Objects: normalizedObjects, Quiet: true },
  });
  await client.send(command);
}

export async function r2ListObjects(prefix: string) {
  const client = getR2Client();
  const normalizedPrefix = normalizeKey(prefix);
  const command = new ListObjectsV2Command({
    Bucket: ENV.r2BucketName,
    Prefix: normalizedPrefix,
  });
  const response = await client.send(command);
  return response.Contents?.map((item) => item.Key).filter(Boolean) as string[];
}
