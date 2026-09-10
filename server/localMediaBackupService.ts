import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { r2GetObjectStream, r2HeadObject, r2ListObjectsPage, type R2ObjectInfo } from "./r2Storage";

const MEDIA_MAGIC = Buffer.from("H2MEDIA1\n", "utf8");
const MEDIA_IV_BYTES = 12;
const MEDIA_TAG_BYTES = 16;
const MEDIA_FORMAT_VERSION = 1;
const SOURCE_EXCLUDED_PREFIXES = [
  "system-backups/",
  "system-restores/",
  "h2-media-backup-state/",
];

export type LocalMediaBackupManifestEntry = {
  sourceKey: string;
  sourceSize: number;
  sourceEtag: string | null;
  sourceLastModified: string | null;
  fileName: string;
  encryptedBytes: number;
};

export type LocalMediaBackupManifest = {
  format: "H2_MEDIA_LOCAL_EXPORT_V1";
  createdAt: string;
  objectCount: number;
  totalSourceBytes: number;
  encryption: "AES-256-GCM:H2MEDIA1";
  keyRequired: "BACKUP_ENCRYPTION_KEY";
  keyFingerprint: string;
  objects: LocalMediaBackupManifestEntry[];
};

function rawBackupEncryptionKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim() || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) {
    throw new Error("BACKUP_ENCRYPTION_KEY ausente ou inválida para exportar o backup local de mídia.");
  }
  return raw;
}

function getMediaEncryptionKey() {
  const raw = rawBackupEncryptionKey();
  return createHmac("sha256", Buffer.from(raw, "hex")).update("h2-media-backup-v1", "utf8").digest();
}

function keyFingerprint() {
  return createHash("sha256").update(Buffer.from(rawBackupEncryptionKey(), "hex")).digest("hex").slice(0, 24);
}

function keyHash(sourceKey: string) {
  return createHash("sha256").update(sourceKey, "utf8").digest("hex");
}

function safeLocalFileName(sourceKey: string) {
  const baseName = sourceKey.split("/").filter(Boolean).pop() || "arquivo";
  const safeBase = baseName.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/[. ]+$/g, "").slice(-110) || "arquivo";
  return `H2MEDIA__${keyHash(sourceKey).slice(0, 24)}__${safeBase}.h2m.enc`;
}

function isExcludedSourceKey(key: string) {
  return SOURCE_EXCLUDED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function normalizeAllowedSourceKey(raw: string) {
  const key = raw.replace(/^\/+/, "");
  if (!key || key.length > 2048 || key.includes("\0") || isExcludedSourceKey(key)) {
    throw new Error("Arquivo de mídia inválido ou fora do escopo permitido para backup local.");
  }
  return key;
}

async function listSourceMediaObjects(): Promise<R2ObjectInfo[]> {
  const objects: R2ObjectInfo[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await r2ListObjectsPage("", continuationToken);
    for (const object of page.objects) {
      if (!isExcludedSourceKey(object.key)) objects.push(object);
    }
    continuationToken = page.nextContinuationToken || undefined;
  } while (continuationToken);
  objects.sort((left, right) => left.key.localeCompare(right.key));
  return objects;
}

function toNodeReadable(body: unknown): Readable {
  if (body instanceof Readable) return body;
  if (body && typeof (body as { getReader?: unknown }).getReader === "function") {
    return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
  }
  if (body && typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function") {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }
  throw new Error("Objeto R2 não oferece um stream compatível para o backup local.");
}

class LocalMediaEncryptTransform extends Transform {
  private readonly cipher;
  private readonly sourceHash = createHash("sha256");
  private readonly encryptedHash = createHash("sha256");
  private headerWritten = false;
  plainBytes = 0;
  encryptedBytes = 0;

  constructor(key: Buffer, private readonly iv: Buffer) {
    super();
    this.cipher = createCipheriv("aes-256-gcm", key, iv);
  }

  private emitEncrypted(buffer: Buffer) {
    if (!buffer.length) return;
    this.encryptedHash.update(buffer);
    this.encryptedBytes += buffer.length;
    this.push(buffer);
  }

  private ensureHeader() {
    if (this.headerWritten) return;
    this.headerWritten = true;
    this.emitEncrypted(Buffer.concat([MEDIA_MAGIC, this.iv]));
  }

  _transform(chunk: Buffer | Uint8Array, _encoding: BufferEncoding, callback: TransformCallback) {
    try {
      this.ensureHeader();
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      this.sourceHash.update(buffer);
      this.plainBytes += buffer.length;
      this.emitEncrypted(this.cipher.update(buffer));
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: TransformCallback) {
    try {
      this.ensureHeader();
      this.emitEncrypted(this.cipher.final());
      this.emitEncrypted(this.cipher.getAuthTag());
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  result() {
    return {
      sourceSha256: this.sourceHash.digest("hex"),
      encryptedSha256: this.encryptedHash.digest("hex"),
      plainBytes: this.plainBytes,
      encryptedBytes: this.encryptedBytes,
    };
  }
}

export async function getLocalMediaBackupManifest(): Promise<LocalMediaBackupManifest> {
  getMediaEncryptionKey();
  const objects = await listSourceMediaObjects();
  return {
    format: "H2_MEDIA_LOCAL_EXPORT_V1",
    createdAt: new Date().toISOString(),
    objectCount: objects.length,
    totalSourceBytes: objects.reduce((sum, object) => sum + object.size, 0),
    encryption: "AES-256-GCM:H2MEDIA1",
    keyRequired: "BACKUP_ENCRYPTION_KEY",
    keyFingerprint: keyFingerprint(),
    objects: objects.map((object) => ({
      sourceKey: object.key,
      sourceSize: object.size,
      sourceEtag: object.etag,
      sourceLastModified: object.lastModified?.toISOString() || null,
      fileName: safeLocalFileName(object.key),
      encryptedBytes: object.size + MEDIA_MAGIC.length + MEDIA_IV_BYTES + MEDIA_TAG_BYTES,
    })),
  };
}

export async function prepareLocalMediaBackupFile(input: {
  sourceKey: string;
  expectedSize: number;
  expectedEtag?: string | null;
}) {
  const sourceKey = normalizeAllowedSourceKey(input.sourceKey);
  if (!Number.isSafeInteger(input.expectedSize) || input.expectedSize < 0) {
    throw new Error("Tamanho esperado inválido para o arquivo de mídia.");
  }

  const head = await r2HeadObject(sourceKey);
  if (head.contentLength === null || head.contentLength !== input.expectedSize) {
    throw new Error(`A mídia mudou desde o início da exportação: tamanho atual divergente para ${sourceKey}. Reinicie a exportação para gerar um novo índice.`);
  }
  const expectedEtag = input.expectedEtag?.trim() || "";
  if (expectedEtag && head.etag !== expectedEtag) {
    throw new Error(`A mídia mudou desde o início da exportação: ETag atual divergente para ${sourceKey}. Reinicie a exportação para gerar um novo índice.`);
  }

  const tempPath = path.join("/tmp", `h2-media-local-${randomBytes(16).toString("hex")}.h2m.enc`);
  const transform = new LocalMediaEncryptTransform(getMediaEncryptionKey(), randomBytes(MEDIA_IV_BYTES));
  try {
    await pipeline(
      toNodeReadable(await r2GetObjectStream(sourceKey)),
      transform,
      createWriteStream(tempPath, { flags: "wx", mode: 0o600 }),
    );
    const result = transform.result();
    const fileInfo = await stat(tempPath);
    const expectedEncryptedBytes = input.expectedSize + MEDIA_MAGIC.length + MEDIA_IV_BYTES + MEDIA_TAG_BYTES;
    if (result.plainBytes !== input.expectedSize) {
      throw new Error(`A mídia ${sourceKey} mudou durante a leitura. Reinicie a exportação.`);
    }
    if (result.encryptedBytes !== expectedEncryptedBytes || fileInfo.size !== expectedEncryptedBytes) {
      throw new Error(`O pacote criptografado de ${sourceKey} ficou com tamanho divergente.`);
    }
    return {
      tempPath,
      fileName: safeLocalFileName(sourceKey),
      sourceKey,
      sourceSize: input.expectedSize,
      sourceEtag: head.etag,
      sourceSha256: result.sourceSha256,
      encryptedSha256: result.encryptedSha256,
      encryptedBytes: result.encryptedBytes,
      encryptionVersion: MEDIA_FORMAT_VERSION,
    };
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function getLocalMediaRecoveryToolPath() {
  return path.resolve("scripts/h2-media-recovery.mjs");
}
