import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { PassThrough, Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, eq } from "drizzle-orm";
import { h2AdsInstanceBrowserRuns, h2AdsInstanceWorkerAssignments } from "../drizzle/schema";
import { getDb } from "./db";
import { r2DeleteObjects, r2GetObjectStream, r2PutObjectStream } from "./r2Storage";

const SNAPSHOT_PREFIX = "h2ads-profile-snapshots/";
const SNAPSHOT_MAGIC = Buffer.from("H2P1\n", "utf8");
const SNAPSHOT_IV_BYTES = 12;
const SNAPSHOT_TAG_BYTES = 16;
const SNAPSHOT_HEADER_BYTES = SNAPSHOT_MAGIC.length + SNAPSHOT_IV_BYTES;
const MAX_SNAPSHOT_BYTES = 1_500_000_000;

function getSnapshotEncryptionKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim() || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error("BACKUP_ENCRYPTION_KEY ausente ou inválida para snapshots H2ADS.");
  return createHmac("sha256", Buffer.from(raw, "hex")).update("h2ads-profile-snapshot-v1", "utf8").digest();
}

function toNodeReadable(body: unknown): Readable {
  if (body instanceof Readable) return body;
  if (body && typeof (body as { getReader?: unknown }).getReader === "function") return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
  if (body && typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function") return Readable.from(body as AsyncIterable<Uint8Array>);
  throw new Error("Snapshot H2ADS não oferece um stream compatível.");
}

class EncryptAndHashTransform extends Transform {
  private readonly cipher;
  private readonly hash = createHash("sha256");
  bytes = 0;

  constructor(key: Buffer, iv: Buffer) {
    super();
    this.cipher = createCipheriv("aes-256-gcm", key, iv);
  }

  _transform(chunk: Buffer | Uint8Array, _encoding: BufferEncoding, callback: TransformCallback) {
    try {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      this.hash.update(buffer);
      this.bytes += buffer.length;
      callback(null, this.cipher.update(buffer));
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: TransformCallback) {
    try {
      this.push(this.cipher.final());
      this.push(this.cipher.getAuthTag());
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  digest() {
    return this.hash.digest("hex");
  }
}

async function requireAssignment(workerId: number, instanceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para snapshot H2ADS.");
  const rows = await db.select().from(h2AdsInstanceWorkerAssignments).where(and(eq(h2AdsInstanceWorkerAssignments.instanceId, instanceId), eq(h2AdsInstanceWorkerAssignments.workerId, workerId))).limit(1);
  if (!rows[0]) throw new Error("Instância não atribuída a este Worker.");
  return { db, assignment: rows[0] };
}

export async function storeH2AdsProfileSnapshot(input: {
  workerId: number;
  instanceId: number;
  body: Readable;
  plainBytes: number;
  plainSha256: string;
}) {
  if (!Number.isSafeInteger(input.plainBytes) || input.plainBytes < 1 || input.plainBytes > MAX_SNAPSHOT_BYTES) throw new Error("Tamanho de snapshot H2ADS inválido.");
  if (!/^[a-f0-9]{64}$/i.test(input.plainSha256)) throw new Error("SHA-256 de snapshot H2ADS inválido.");

  const { db, assignment } = await requireAssignment(input.workerId, input.instanceId);
  const run = await db.select({ state: h2AdsInstanceBrowserRuns.state }).from(h2AdsInstanceBrowserRuns).where(and(eq(h2AdsInstanceBrowserRuns.instanceId, input.instanceId), eq(h2AdsInstanceBrowserRuns.workerId, input.workerId))).limit(1);
  if (run[0]?.state === "browser_open") throw new Error("Snapshot bloqueado enquanto o browser está aberto.");

  const key = `${SNAPSHOT_PREFIX}instance-${input.instanceId}/latest.h2p.enc`;
  const iv = randomBytes(SNAPSHOT_IV_BYTES);
  const encryptor = new EncryptAndHashTransform(getSnapshotEncryptionKey(), iv);
  const encrypted = new PassThrough();
  encrypted.write(Buffer.concat([SNAPSHOT_MAGIC, iv]));
  const encryptedBytes = input.plainBytes + SNAPSHOT_HEADER_BYTES + SNAPSHOT_TAG_BYTES;

  try {
    const uploadPromise = r2PutObjectStream(key, encrypted, "application/octet-stream", encryptedBytes, { backupId: `h2ads-${input.instanceId}`, stage: "profile-snapshot" });
    await Promise.all([pipeline(input.body, encryptor, encrypted), uploadPromise]);
    const actualHash = encryptor.digest();
    if (encryptor.bytes !== input.plainBytes || actualHash.toLowerCase() !== input.plainSha256.toLowerCase()) {
      await r2DeleteObjects([key]).catch(() => undefined);
      throw new Error("Integridade do snapshot H2ADS não confere com o arquivo recebido.");
    }

    await db.update(h2AdsInstanceWorkerAssignments).set({
      profileState: "snapshot_ready",
      profileVersion: Math.max(assignment.profileVersion || 0, 0) + 1,
      snapshotKey: key,
      integrityHash: actualHash,
      snapshotSizeBytes: input.plainBytes,
      lastSnapshotAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(h2AdsInstanceWorkerAssignments.id, assignment.id));

    return { key, bytes: input.plainBytes, sha256: actualHash };
  } catch (error) {
    encrypted.destroy(error as Error);
    throw error;
  }
}

export async function openH2AdsProfileSnapshot(workerId: number, instanceId: number) {
  const { assignment } = await requireAssignment(workerId, instanceId);
  if (!assignment.snapshotKey || !assignment.integrityHash || !assignment.snapshotSizeBytes) return null;
  const encryptedBody = toNodeReadable(await r2GetObjectStream(assignment.snapshotKey));
  const key = getSnapshotEncryptionKey();

  const decrypted = Readable.from((async function* () {
    let header = Buffer.alloc(0);
    let tail = Buffer.alloc(0);
    let decipher: ReturnType<typeof createDecipheriv> | null = null;

    for await (const chunk of encryptedBody) {
      let buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      if (!decipher) {
        header = Buffer.concat([header, buffer]);
        if (header.length < SNAPSHOT_HEADER_BYTES) continue;
        if (!header.subarray(0, SNAPSHOT_MAGIC.length).equals(SNAPSHOT_MAGIC)) throw new Error("Cabeçalho do snapshot H2ADS inválido.");
        const iv = header.subarray(SNAPSHOT_MAGIC.length, SNAPSHOT_HEADER_BYTES);
        decipher = createDecipheriv("aes-256-gcm", key, iv);
        buffer = header.subarray(SNAPSHOT_HEADER_BYTES);
        header = Buffer.alloc(0);
      }
      if (buffer.length === 0) continue;
      const combined = tail.length ? Buffer.concat([tail, buffer]) : buffer;
      if (combined.length <= SNAPSHOT_TAG_BYTES) {
        tail = combined;
        continue;
      }
      const ciphertext = combined.subarray(0, combined.length - SNAPSHOT_TAG_BYTES);
      tail = combined.subarray(combined.length - SNAPSHOT_TAG_BYTES);
      const output = decipher.update(ciphertext);
      if (output.length) yield output;
    }

    if (!decipher || tail.length !== SNAPSHOT_TAG_BYTES) throw new Error("Snapshot H2ADS cifrado está incompleto.");
    decipher.setAuthTag(tail);
    const final = decipher.final();
    if (final.length) yield final;
  })());

  return {
    body: decrypted,
    sha256: assignment.integrityHash,
    bytes: Number(assignment.snapshotSizeBytes),
    profileVersion: assignment.profileVersion,
    lastSnapshotAt: assignment.lastSnapshotAt,
  };
}

export async function recordH2AdsProfileRestoreResult(input: { workerId: number; instanceId: number; restored: boolean }) {
  const { db, assignment } = await requireAssignment(input.workerId, input.instanceId);
  await db.update(h2AdsInstanceWorkerAssignments).set({
    profileState: input.restored ? (assignment.snapshotKey ? "snapshot_ready" : "local_only") : "restore_failed",
    updatedAt: new Date(),
  }).where(eq(h2AdsInstanceWorkerAssignments.id, assignment.id));
}
