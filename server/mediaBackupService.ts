import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createConnection, type Connection } from "mysql2/promise";
import { r2GetObjectStream, r2ListObjectsPage, type R2ObjectInfo } from "./r2Storage";
import { uploadGoogleDriveResumableFile } from "./googleDriveResumableUpload";

const MEDIA_MAGIC = Buffer.from("H2MEDIA1\n", "utf8");
const MEDIA_IV_BYTES = 12;
const MEDIA_TAG_BYTES = 16;
const MEDIA_FORMAT_VERSION = 1;
const MEDIA_DRIVE_FOLDER_NAME = "H2_MEDIA_BACKUP_V1";
const SOURCE_EXCLUDED_PREFIXES = [
  "system-backups/",
  "system-restores/",
  "h2-media-backup-state/",
];

export type MediaBackupStatus = "idle" | "running" | "paused" | "completed" | "failed" | "cancelled";

type MediaObjectRow = {
  keyHash: string;
  sourceKey: string;
  sourceSize: number;
  sourceEtag: string | null;
  sourceLastModified: string | null;
  sourceSha256: string;
  encryptedSha256: string;
  encryptedBytes: number;
  driveFileId: string;
  driveFileName: string;
  syncedAt: string;
};

type MediaRunRow = {
  id: string;
  status: string;
  totalObjects: number;
  totalBytes: number;
  completedObjects: number;
  completedBytes: number;
  currentKey: string | null;
  errorMessage: string | null;
  startedAt: Date | string | null;
  updatedAt: Date | string | null;
  completedAt: Date | string | null;
  driveFolderId: string | null;
  manifestDriveFileId: string | null;
};

type ActiveMediaRun = {
  id: string;
  controller: AbortController;
};

let activeRun: ActiveMediaRun | null = null;

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL não configurada para o controle do backup de mídia.");
  return value;
}

async function openMediaDb() {
  return await createConnection(databaseUrl());
}

async function ensureMediaTables(connection: Connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS systemMediaBackupRuns (
    id VARCHAR(48) NOT NULL PRIMARY KEY,
    status VARCHAR(24) NOT NULL,
    totalObjects INT NOT NULL DEFAULT 0,
    totalBytes BIGINT NOT NULL DEFAULT 0,
    completedObjects INT NOT NULL DEFAULT 0,
    completedBytes BIGINT NOT NULL DEFAULT 0,
    currentKey TEXT NULL,
    errorMessage TEXT NULL,
    driveFolderId VARCHAR(255) NULL,
    manifestDriveFileId VARCHAR(255) NULL,
    startedAt DATETIME(3) NULL,
    updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    completedAt DATETIME(3) NULL,
    INDEX idx_system_media_backup_runs_updatedAt (updatedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS systemMediaBackupObjects (
    keyHash CHAR(64) NOT NULL PRIMARY KEY,
    sourceKey TEXT NOT NULL,
    sourceSize BIGINT NOT NULL,
    sourceEtag VARCHAR(255) NULL,
    sourceLastModified VARCHAR(64) NULL,
    sourceSha256 CHAR(64) NOT NULL,
    encryptedSha256 CHAR(64) NOT NULL,
    encryptedBytes BIGINT NOT NULL,
    driveFileId VARCHAR(255) NOT NULL,
    driveFileName VARCHAR(255) NOT NULL,
    syncedAt DATETIME(3) NOT NULL,
    INDEX idx_system_media_backup_objects_syncedAt (syncedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

function keyHash(sourceKey: string) {
  return createHash("sha256").update(sourceKey, "utf8").digest("hex");
}

function getMediaEncryptionKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim() || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) {
    throw new Error("BACKUP_ENCRYPTION_KEY ausente ou inválida para o backup de mídia.");
  }
  return createHmac("sha256", Buffer.from(raw, "hex")).update("h2-media-backup-v1", "utf8").digest();
}

export function isMediaBackupConfigured() {
  return Boolean(
    /^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY?.trim() || "") &&
    process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() &&
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim(),
  );
}

function isExcludedSourceKey(key: string) {
  return SOURCE_EXCLUDED_PREFIXES.some((prefix) => key.startsWith(prefix));
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
  objects.sort((a, b) => a.key.localeCompare(b.key));
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
  throw new Error("Objeto R2 não oferece um stream compatível.");
}

class MediaEncryptTransform extends Transform {
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

async function encryptR2ObjectToTemp(object: R2ObjectInfo, runId: string) {
  const tempPath = path.join("/tmp", `h2-media-${runId}-${keyHash(object.key).slice(0, 20)}.h2m.enc`);
  await rm(tempPath, { force: true }).catch(() => undefined);
  const transform = new MediaEncryptTransform(getMediaEncryptionKey(), randomBytes(MEDIA_IV_BYTES));
  await pipeline(
    toNodeReadable(await r2GetObjectStream(object.key)),
    transform,
    createWriteStream(tempPath, { flags: "wx", mode: 0o600 }),
  );
  const result = transform.result();
  const fileInfo = await stat(tempPath);
  const expectedEncryptedBytes = object.size + MEDIA_MAGIC.length + MEDIA_IV_BYTES + MEDIA_TAG_BYTES;
  if (result.plainBytes !== object.size) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new Error(`Mídia ${object.key} mudou durante a leitura: esperado ${object.size}, recebido ${result.plainBytes}.`);
  }
  if (result.encryptedBytes !== expectedEncryptedBytes || fileInfo.size !== expectedEncryptedBytes) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new Error(`Pacote de mídia ${object.key} foi produzido com tamanho divergente.`);
  }
  return { tempPath, ...result };
}

async function getGoogleDriveAccessToken() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google Drive não configurado para o backup de mídia.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google Drive recusou a autorização do backup de mídia (HTTP ${response.status}).`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Google Drive não devolveu token para o backup de mídia.");
  return payload.access_token;
}

function driveQueryLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function ensureDriveMediaFolder(accessToken: string) {
  const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!parentId) throw new Error("GOOGLE_DRIVE_FOLDER_ID não configurado.");
  const query = `'${driveQueryLiteral(parentId)}' in parents and name='${MEDIA_DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("fields", "files(id,name)");
  listUrl.searchParams.set("spaces", "drive");
  listUrl.searchParams.set("supportsAllDrives", "true");
  listUrl.searchParams.set("includeItemsFromAllDrives", "true");
  const listed = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listed.ok) throw new Error(`Google Drive não conseguiu localizar a pasta de mídia (HTTP ${listed.status}).`);
  const payload = await listed.json() as { files?: Array<{ id?: string }> };
  const existing = payload.files?.find((file) => file.id)?.id;
  if (existing) return existing;

  const created = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ name: MEDIA_DRIVE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!created.ok) throw new Error(`Google Drive não criou a pasta de mídia (HTTP ${created.status}).`);
  const createdPayload = await created.json() as { id?: string };
  if (!createdPayload.id) throw new Error("Google Drive criou a pasta de mídia sem devolver o ID.");
  return createdPayload.id;
}

function safeDriveName(sourceKey: string) {
  const baseName = sourceKey.split("/").filter(Boolean).pop() || "arquivo";
  const safeBase = baseName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-110) || "arquivo";
  return `H2MEDIA__${keyHash(sourceKey).slice(0, 24)}__${safeBase}.h2m.enc`;
}

async function createDriveUploadSession(input: {
  accessToken: string;
  folderId: string;
  object: R2ObjectInfo;
  sourceSha256: string;
  encryptedSha256: string;
  encryptedBytes: number;
  driveName: string;
}) {
  const description = JSON.stringify({
    h2MediaVersion: MEDIA_FORMAT_VERSION,
    sourceKey: input.object.key,
    sourceSize: input.object.size,
    sourceEtag: input.object.etag,
    sourceLastModified: input.object.lastModified?.toISOString() || null,
    sourceSha256: input.sourceSha256,
    encryptedSha256: input.encryptedSha256,
    encryptedBytes: input.encryptedBytes,
    encryption: "AES-256-GCM:H2MEDIA1",
    syncedAt: new Date().toISOString(),
  });
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/octet-stream",
      "X-Upload-Content-Length": String(input.encryptedBytes),
    },
    body: JSON.stringify({ name: input.driveName, description, parents: [input.folderId] }),
  });
  const uploadUrl = response.headers.get("location");
  if (!response.ok || !uploadUrl) throw new Error(`Google Drive não criou sessão para ${input.object.key} (HTTP ${response.status}).`);
  return uploadUrl;
}

async function verifyDriveFile(accessToken: string, fileId: string, expectedBytes: number) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "id,name,size,trashed");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google Drive não confirmou o arquivo ${fileId} (HTTP ${response.status}).`);
  const payload = await response.json() as { id?: string; size?: string; trashed?: boolean };
  if (!payload.id || payload.trashed || Number(payload.size) !== expectedBytes) {
    throw new Error("Google Drive devolveu tamanho ou estado divergente para a mídia enviada.");
  }
}

async function deleteDriveFile(accessToken: string, fileId: string | null | undefined) {
  if (!fileId) return;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404) {
    console.warn(`[MediaBackup] não foi possível apagar versão antiga no Drive fileId=${fileId} http=${response.status}`);
  }
}

async function loadObjectRows(connection: Connection): Promise<Map<string, MediaObjectRow>> {
  const [rows] = await connection.query<any[]>("SELECT * FROM systemMediaBackupObjects");
  const map = new Map<string, MediaObjectRow>();
  for (const row of rows) {
    map.set(String(row.keyHash), {
      keyHash: String(row.keyHash),
      sourceKey: String(row.sourceKey),
      sourceSize: Number(row.sourceSize),
      sourceEtag: row.sourceEtag ? String(row.sourceEtag) : null,
      sourceLastModified: row.sourceLastModified ? String(row.sourceLastModified) : null,
      sourceSha256: String(row.sourceSha256),
      encryptedSha256: String(row.encryptedSha256),
      encryptedBytes: Number(row.encryptedBytes),
      driveFileId: String(row.driveFileId),
      driveFileName: String(row.driveFileName),
      syncedAt: row.syncedAt instanceof Date ? row.syncedAt.toISOString() : String(row.syncedAt),
    });
  }
  return map;
}

function objectMatches(row: MediaObjectRow | undefined, object: R2ObjectInfo) {
  if (!row || row.sourceKey !== object.key || row.sourceSize !== object.size || !row.driveFileId) return false;
  const currentEtag = object.etag || null;
  const currentModified = object.lastModified?.toISOString() || null;
  if (currentEtag && row.sourceEtag) return currentEtag === row.sourceEtag;
  return currentModified === (row.sourceLastModified || null);
}

async function upsertSyncedObject(connection: Connection, input: {
  object: R2ObjectInfo;
  sourceSha256: string;
  encryptedSha256: string;
  encryptedBytes: number;
  driveFileId: string;
  driveFileName: string;
}) {
  await connection.query(
    `INSERT INTO systemMediaBackupObjects
      (keyHash, sourceKey, sourceSize, sourceEtag, sourceLastModified, sourceSha256, encryptedSha256, encryptedBytes, driveFileId, driveFileName, syncedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
      sourceKey=VALUES(sourceKey), sourceSize=VALUES(sourceSize), sourceEtag=VALUES(sourceEtag),
      sourceLastModified=VALUES(sourceLastModified), sourceSha256=VALUES(sourceSha256), encryptedSha256=VALUES(encryptedSha256),
      encryptedBytes=VALUES(encryptedBytes), driveFileId=VALUES(driveFileId), driveFileName=VALUES(driveFileName), syncedAt=NOW(3)`,
    [
      keyHash(input.object.key),
      input.object.key,
      input.object.size,
      input.object.etag,
      input.object.lastModified?.toISOString() || null,
      input.sourceSha256,
      input.encryptedSha256,
      input.encryptedBytes,
      input.driveFileId,
      input.driveFileName,
    ],
  );
}

async function writeRunProgress(connection: Connection, runId: string, patch: {
  status?: string;
  completedObjects?: number;
  completedBytes?: number;
  currentKey?: string | null;
  errorMessage?: string | null;
  driveFolderId?: string | null;
  manifestDriveFileId?: string | null;
  completed?: boolean;
}) {
  const sets = ["updatedAt=NOW(3)"];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => { sets.push(sql); values.push(value); };
  if (patch.status !== undefined) add("status=?", patch.status);
  if (patch.completedObjects !== undefined) add("completedObjects=?", patch.completedObjects);
  if (patch.completedBytes !== undefined) add("completedBytes=?", patch.completedBytes);
  if (patch.currentKey !== undefined) add("currentKey=?", patch.currentKey);
  if (patch.errorMessage !== undefined) add("errorMessage=?", patch.errorMessage);
  if (patch.driveFolderId !== undefined) add("driveFolderId=?", patch.driveFolderId);
  if (patch.manifestDriveFileId !== undefined) add("manifestDriveFileId=?", patch.manifestDriveFileId);
  if (patch.completed) sets.push("completedAt=NOW(3)");
  values.push(runId);
  await connection.query(`UPDATE systemMediaBackupRuns SET ${sets.join(", ")} WHERE id=?`, values);
}

function runId() {
  return randomBytes(24).toString("hex");
}

async function uploadRecoveryIndex(input: {
  connection: Connection;
  accessToken: string;
  folderId: string;
  runId: string;
  sourceObjects: R2ObjectInfo[];
}) {
  const rows = await loadObjectRows(input.connection);
  const entries = input.sourceObjects.map((object) => rows.get(keyHash(object.key))).filter((row): row is MediaObjectRow => Boolean(row));
  const payload = {
    format: "H2_MEDIA_BACKUP_INDEX_V1",
    createdAt: new Date().toISOString(),
    runId: input.runId,
    objectCount: entries.length,
    totalSourceBytes: entries.reduce((sum, row) => sum + row.sourceSize, 0),
    encryption: "AES-256-GCM:H2MEDIA1",
    keyRequired: "BACKUP_ENCRYPTION_KEY",
    objects: entries,
  };
  const tempPath = path.join("/tmp", `H2_MEDIA_INDEX_${input.runId}.json`);
  const body = JSON.stringify(payload, null, 2);
  await writeFile(tempPath, body, { encoding: "utf8", mode: 0o600 });
  try {
    const bytes = Buffer.byteLength(body);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/json",
        "X-Upload-Content-Length": String(bytes),
      },
      body: JSON.stringify({
        name: `H2_MEDIA_INDEX_${input.runId}.json`,
        description: "Índice de recuperação das mídias H2. Os arquivos .h2m.enc exigem BACKUP_ENCRYPTION_KEY.",
        parents: [input.folderId],
      }),
    });
    const uploadUrl = response.headers.get("location");
    if (!response.ok || !uploadUrl) throw new Error("Google Drive não criou sessão para o índice de mídia.");
    const uploaded = await uploadGoogleDriveResumableFile({ uploadUrl, accessToken: input.accessToken, filePath: tempPath, totalBytes: bytes });
    return uploaded.id;
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

async function executeMediaBackup(id: string, signal: AbortSignal) {
  const connection = await openMediaDb();
  try {
    await ensureMediaTables(connection);
    const sourceObjects = await listSourceMediaObjects();
    const objectRows = await loadObjectRows(connection);
    const alreadySynced = sourceObjects.filter((object) => objectMatches(objectRows.get(keyHash(object.key)), object));
    let completedObjects = alreadySynced.length;
    let completedBytes = alreadySynced.reduce((sum, object) => sum + object.size, 0);
    const totalBytes = sourceObjects.reduce((sum, object) => sum + object.size, 0);

    await connection.query(
      `UPDATE systemMediaBackupRuns SET totalObjects=?, totalBytes=?, completedObjects=?, completedBytes=?, status='running', currentKey=NULL, errorMessage=NULL, updatedAt=NOW(3) WHERE id=?`,
      [sourceObjects.length, totalBytes, completedObjects, completedBytes, id],
    );

    const accessToken = await getGoogleDriveAccessToken();
    const folderId = await ensureDriveMediaFolder(accessToken);
    await writeRunProgress(connection, id, { driveFolderId: folderId });

    for (const object of sourceObjects) {
      if (signal.aborted) throw new Error("Backup de mídia pausado pelo administrador.");
      const existing = objectRows.get(keyHash(object.key));
      if (objectMatches(existing, object)) continue;

      await writeRunProgress(connection, id, { currentKey: object.key });
      const encrypted = await encryptR2ObjectToTemp(object, id);
      try {
        if (signal.aborted) throw new Error("Backup de mídia pausado pelo administrador.");
        const driveName = safeDriveName(object.key);
        const uploadUrl = await createDriveUploadSession({
          accessToken,
          folderId,
          object,
          sourceSha256: encrypted.sourceSha256,
          encryptedSha256: encrypted.encryptedSha256,
          encryptedBytes: encrypted.encryptedBytes,
          driveName,
        });
        const uploaded = await uploadGoogleDriveResumableFile({
          uploadUrl,
          accessToken,
          filePath: encrypted.tempPath,
          totalBytes: encrypted.encryptedBytes,
        });
        await verifyDriveFile(accessToken, uploaded.id, encrypted.encryptedBytes);
        await upsertSyncedObject(connection, {
          object,
          sourceSha256: encrypted.sourceSha256,
          encryptedSha256: encrypted.encryptedSha256,
          encryptedBytes: encrypted.encryptedBytes,
          driveFileId: uploaded.id,
          driveFileName: driveName,
        });
        objectRows.set(keyHash(object.key), {
          keyHash: keyHash(object.key),
          sourceKey: object.key,
          sourceSize: object.size,
          sourceEtag: object.etag,
          sourceLastModified: object.lastModified?.toISOString() || null,
          sourceSha256: encrypted.sourceSha256,
          encryptedSha256: encrypted.encryptedSha256,
          encryptedBytes: encrypted.encryptedBytes,
          driveFileId: uploaded.id,
          driveFileName: driveName,
          syncedAt: new Date().toISOString(),
        });
        completedObjects += 1;
        completedBytes += object.size;
        await writeRunProgress(connection, id, { completedObjects, completedBytes, currentKey: null });
        if (existing?.driveFileId && existing.driveFileId !== uploaded.id) {
          await deleteDriveFile(accessToken, existing.driveFileId);
        }
      } finally {
        await rm(encrypted.tempPath, { force: true }).catch(() => undefined);
      }
    }

    if (signal.aborted) throw new Error("Backup de mídia pausado pelo administrador.");
    const manifestDriveFileId = await uploadRecoveryIndex({ connection, accessToken, folderId, runId: id, sourceObjects });
    await writeRunProgress(connection, id, {
      status: "completed",
      completedObjects: sourceObjects.length,
      completedBytes: totalBytes,
      currentKey: null,
      errorMessage: null,
      manifestDriveFileId,
      completed: true,
    });
    console.log(`[MediaBackup] completed runId=${id} objects=${sourceObjects.length} bytes=${totalBytes} driveFolderId=${folderId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const paused = signal.aborted || /pausado pelo administrador/i.test(message);
    await ensureMediaTables(connection).catch(() => undefined);
    await writeRunProgress(connection, id, {
      status: paused ? "cancelled" : "failed",
      currentKey: null,
      errorMessage: message.slice(0, 2000),
    }).catch(() => undefined);
    console.error(`[MediaBackup] ${paused ? "paused" : "failed"} runId=${id} error=${message.slice(0, 500)}`);
  } finally {
    await connection.end();
    if (activeRun?.id === id) activeRun = null;
  }
}

export async function startMediaBackup() {
  if (!isMediaBackupConfigured()) throw new Error("Backup de mídia exige Google Drive e BACKUP_ENCRYPTION_KEY configurados.");
  if (activeRun) return { accepted: false as const, id: activeRun.id };
  const connection = await openMediaDb();
  let id: string;
  try {
    await ensureMediaTables(connection);
    id = runId();
    await connection.query(
      `INSERT INTO systemMediaBackupRuns (id, status, startedAt, updatedAt) VALUES (?, 'running', NOW(3), NOW(3))`,
      [id],
    );
  } finally {
    await connection.end();
  }
  const controller = new AbortController();
  activeRun = { id, controller };
  void executeMediaBackup(id, controller.signal);
  return { accepted: true as const, id };
}

export async function cancelMediaBackup() {
  if (!activeRun) return { cancelled: false as const };
  const id = activeRun.id;
  activeRun.controller.abort();
  return { cancelled: true as const, id };
}

function normalizeRun(row: MediaRunRow | undefined) {
  if (!row) {
    return {
      status: "idle" as MediaBackupStatus,
      id: null,
      progress: 0,
      totalObjects: 0,
      completedObjects: 0,
      totalBytes: 0,
      completedBytes: 0,
      currentKey: null,
      errorMessage: null,
      startedAt: null,
      updatedAt: null,
      completedAt: null,
      driveFolderId: null,
      manifestDriveFileId: null,
      active: false,
    };
  }
  const isActive = activeRun?.id === row.id;
  let status = row.status as MediaBackupStatus;
  if (status === "running" && !isActive) status = "paused";
  const totalBytes = Number(row.totalBytes || 0);
  const completedBytes = Number(row.completedBytes || 0);
  const progress = status === "completed"
    ? 100
    : totalBytes > 0
      ? Math.min(99, Math.max(0, Math.floor((completedBytes / totalBytes) * 100)))
      : 0;
  return {
    id: row.id,
    status,
    progress,
    totalObjects: Number(row.totalObjects || 0),
    completedObjects: Number(row.completedObjects || 0),
    totalBytes,
    completedBytes,
    currentKey: row.currentKey || null,
    errorMessage: row.errorMessage || null,
    startedAt: row.startedAt || null,
    updatedAt: row.updatedAt || null,
    completedAt: row.completedAt || null,
    driveFolderId: row.driveFolderId || null,
    manifestDriveFileId: row.manifestDriveFileId || null,
    active: isActive,
  };
}

export async function getMediaBackupStatus() {
  const connection = await openMediaDb();
  try {
    await ensureMediaTables(connection);
    const [rows] = await connection.query<any[]>(`SELECT * FROM systemMediaBackupRuns ORDER BY updatedAt DESC LIMIT 1`);
    return normalizeRun(rows[0] as MediaRunRow | undefined);
  } finally {
    await connection.end();
  }
}
