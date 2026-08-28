from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


restore_service = r'''import { createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createConnection } from "mysql2/promise";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  BACKUP_ARCHIVE_AUTH_TAG_BYTES,
  BACKUP_ARCHIVE_HEADER_BYTES,
  getBackupRemoteVerification,
  getSystemBackup,
  parseDatabaseUrl,
  safeBackupObjectPath,
  startSystemBackup,
} from "./backupService";
import {
  r2DeleteObjects,
  r2GetObjectStream,
  r2ListObjectsPage,
  r2PutObject,
  r2PutObjectStream,
} from "./r2Storage";
import { systemBackups } from "../drizzle/schema";

const RESTORE_SESSION_TTL_MS = 10 * 60_000;
const RESTORE_SAFETY_BACKUP_TIMEOUT_MS = 45 * 60_000;
const RESTORE_PROTECTED_PREFIXES = ["system-backups/", "system-restores/"] as const;
const RESTORE_MARIADB_BINARY = process.env.BACKUP_MARIADB_BINARY?.trim() || "/usr/bin/mariadb";

type RestoreManifest = {
  formatVersion: number;
  backupId: string;
  generatedAt: string;
  sourceCommit: string;
  database: {
    databaseName: string;
    tableCount: number;
    tables: Array<{ name: string; estimatedRows: number | null }>;
    dumpFile: string;
    dumpBytes: number;
    dumpSha256: string;
  };
  r2: {
    objectCount: number;
    totalBytes: number;
    objects: Array<{ key: string; size: number; sha256: string }>;
  };
  source: {
    archiveFile: string;
    commit: string;
    bytes: number;
    sha256: string;
  };
};

type RestoreSession = {
  token: string;
  backupId: string;
  expiresAt: number;
};

export type BackupRestoreStage =
  | "safety-backup"
  | "validating"
  | "database"
  | "r2-upload"
  | "r2-prune"
  | "completed"
  | "failed";

export type BackupRestoreStatus = {
  restoreId: string;
  backupId: string;
  stage: BackupRestoreStage;
  progress: number;
  message: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  safetyBackupId: string | null;
  sourceCommit: string | null;
  currentCommit: string;
  sourceCommitMatchesCurrent: boolean | null;
  artifactSource: "r2" | "drive" | null;
  error: string | null;
};

const restoreSessions = new Map<string, RestoreSession>();
let activeRestore: BackupRestoreStatus | null = null;
let lastRestore: BackupRestoreStatus | null = null;
let restoreLocked = false;

function nowIso() {
  return new Date().toISOString();
}

function currentCommit() {
  return process.env.RENDER_GIT_COMMIT?.trim() || process.env.COMMIT_SHA?.trim() || "unknown";
}

function sanitizeRestoreError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error ?? "Falha desconhecida na restauração.");
  return value
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, "<url-redacted>")
    .replace(/(password|secret|token|authorization|cookie|database_url|r2_[a-z_]+|backup_encryption_key)[^\s]*/gi, "$1=<redacted>")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 1000);
}

function updateRestore(patch: Partial<BackupRestoreStatus>) {
  if (!activeRestore) return;
  activeRestore = { ...activeRestore, ...patch, updatedAt: nowIso() };
}

export function isBackupRestoreEnabled() {
  return /^(1|true|yes|sim)$/i.test(process.env.BACKUP_RESTORE_ENABLED?.trim() || "");
}

export function isSystemRestoreLocked() {
  return restoreLocked;
}

export function isSystemRestoreInProgress() {
  return activeRestore !== null;
}

export function getSystemBackupRestoreStatus() {
  return activeRestore || lastRestore;
}

export function restoreConfirmationPhrase(backupId: string) {
  return `RESTAURAR ${backupId.slice(-8).toUpperCase()}`;
}

export function isProtectedRestoreR2Key(key: string) {
  const normalized = key.replace(/^\/+/, "");
  return RESTORE_PROTECTED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function inferRestoreContentType(key: string) {
  const extension = path.extname(key).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".json": "application/json",
    ".txt": "text/plain; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".zip": "application/zip",
  };
  return types[extension] || "application/octet-stream";
}

function getEncryptionKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim() || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error("BACKUP_ENCRYPTION_KEY ausente ou inválida para restauração.");
  return Buffer.from(raw, "hex");
}

function toNodeReadable(body: unknown): Readable {
  if (body instanceof Readable) return body;
  if (body && typeof (body as { getReader?: unknown }).getReader === "function") return Readable.fromWeb(body as any);
  if (body && typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function") return Readable.from(body as AsyncIterable<Uint8Array>);
  throw new Error("Fonte do arquivo de backup não oferece um stream compatível.");
}

class HashingCounter extends Transform {
  readonly hash = createHash("sha256");
  bytes = 0;

  _transform(chunk: Buffer | Uint8Array, _encoding: BufferEncoding, callback: TransformCallback) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.hash.update(buffer);
    this.bytes += buffer.length;
    callback(null, buffer);
  }
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  const body = createReadStream(filePath);
  for await (const chunk of body) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function getRestoreCandidate(backupId: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para preparar a restauração.");
  const [row] = await db.select({
    id: systemBackups.id,
    status: systemBackups.status,
    artifactKey: systemBackups.artifactKey,
    fileSize: systemBackups.fileSize,
    archiveSha256: systemBackups.archiveSha256,
    manifestJson: systemBackups.manifestJson,
    driveFileId: systemBackups.driveFileId,
    createdAt: systemBackups.createdAt,
  }).from(systemBackups).where(eq(systemBackups.id, backupId)).limit(1);
  if (!row || row.status !== "completed" || !row.artifactKey || row.fileSize === null || row.fileSize === undefined || !row.archiveSha256) {
    throw new Error("Somente um backup concluído, com arquivo e SHA-256 registrados, pode ser restaurado.");
  }
  const integrity = getBackupRemoteVerification(row.manifestJson);
  if (integrity.status !== "verified") {
    throw new Error("Restauração bloqueada: execute 'Verificar arquivo' e aguarde Integridade OK.");
  }
  return row;
}

function parseStoredSummary(manifestJson: string | null) {
  try {
    const parsed = JSON.parse(manifestJson || "{}") as {
      sourceCommit?: string;
      database?: { tableCount?: number };
      r2?: { objectCount?: number; totalBytes?: number };
    };
    return {
      sourceCommit: typeof parsed.sourceCommit === "string" ? parsed.sourceCommit : "unknown",
      tableCount: typeof parsed.database?.tableCount === "number" ? parsed.database.tableCount : null,
      r2ObjectCount: typeof parsed.r2?.objectCount === "number" ? parsed.r2.objectCount : null,
      r2TotalBytes: typeof parsed.r2?.totalBytes === "number" ? parsed.r2.totalBytes : null,
    };
  } catch {
    return { sourceCommit: "unknown", tableCount: null, r2ObjectCount: null, r2TotalBytes: null };
  }
}

function cleanupExpiredSessions() {
  const current = Date.now();
  for (const [token, session] of restoreSessions.entries()) {
    if (session.expiresAt <= current) restoreSessions.delete(token);
  }
}

export async function prepareSystemBackupRestore(backupId: string) {
  if (activeRestore) throw new Error("Já existe uma restauração em andamento.");
  cleanupExpiredSessions();
  const row = await getRestoreCandidate(backupId);
  const summary = parseStoredSummary(row.manifestJson);
  const token = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + RESTORE_SESSION_TTL_MS;
  restoreSessions.set(token, { token, backupId, expiresAt });
  const deployedCommit = currentCommit();
  return {
    token,
    expiresAt: new Date(expiresAt).toISOString(),
    confirmationPhrase: restoreConfirmationPhrase(backupId),
    restoreEnabled: isBackupRestoreEnabled(),
    backup: {
      id: row.id,
      createdAt: row.createdAt,
      fileSize: row.fileSize,
      archiveSha256: row.archiveSha256,
      sourceCommit: summary.sourceCommit,
      sourceCommitMatchesCurrent: summary.sourceCommit !== "unknown" && deployedCommit !== "unknown" ? summary.sourceCommit === deployedCommit : null,
      currentCommit: deployedCommit,
      tableCount: summary.tableCount,
      r2ObjectCount: summary.r2ObjectCount,
      r2TotalBytes: summary.r2TotalBytes,
      driveAvailable: Boolean(row.driveFileId),
    },
  };
}

async function getGoogleDriveAccessToken() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google Drive não está autorizado para recuperar o backup.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error("Google Drive recusou a renovação da autorização para restauração.");
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Google Drive não devolveu token de acesso para restauração.");
  return payload.access_token;
}

async function openBackupArtifactStream(row: Awaited<ReturnType<typeof getRestoreCandidate>>) {
  try {
    return { body: toNodeReadable(await r2GetObjectStream(row.artifactKey!)), source: "r2" as const };
  } catch (r2Error) {
    if (!row.driveFileId) throw r2Error;
    const accessToken = await getGoogleDriveAccessToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(row.driveFileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok || !response.body) throw new Error(`R2 indisponível e Google Drive não conseguiu fornecer o arquivo (HTTP ${response.status}).`);
    return { body: toNodeReadable(response.body), source: "drive" as const };
  }
}

async function downloadAndValidateOuterArchive(row: Awaited<ReturnType<typeof getRestoreCandidate>>, destination: string) {
  const source = await openBackupArtifactStream(row);
  updateRestore({ artifactSource: source.source, message: source.source === "r2" ? "Lendo o pacote cifrado do R2." : "R2 indisponível; recuperando a cópia do Google Drive." });
  const counter = new HashingCounter();
  await pipeline(source.body, counter, createWriteStream(destination, { flags: "wx" }));
  const sha256 = counter.hash.digest("hex");
  if (counter.bytes !== Number(row.fileSize)) throw new Error(`Tamanho do pacote divergente: esperado ${row.fileSize}, recebido ${counter.bytes}.`);
  if (sha256.toLowerCase() !== row.archiveSha256!.toLowerCase()) throw new Error("SHA-256 do pacote não confere com o backup selecionado.");
  return { source: source.source, bytes: counter.bytes, sha256 };
}

async function extractAuthenticatedArchive(encryptedFile: string, outputDirectory: string) {
  const fileInfo = await stat(encryptedFile);
  if (fileInfo.size <= BACKUP_ARCHIVE_HEADER_BYTES + BACKUP_ARCHIVE_AUTH_TAG_BYTES) throw new Error("Pacote cifrado pequeno demais para restauração.");
  const handle = await open(encryptedFile, "r");
  const header = Buffer.alloc(BACKUP_ARCHIVE_HEADER_BYTES);
  const authTag = Buffer.alloc(BACKUP_ARCHIVE_AUTH_TAG_BYTES);
  try {
    await handle.read(header, 0, header.length, 0);
    await handle.read(authTag, 0, authTag.length, fileInfo.size - authTag.length);
  } finally {
    await handle.close();
  }
  const magic = Buffer.from("WJBACK1\n", "utf8");
  if (!header.subarray(0, magic.length).equals(magic)) throw new Error("Cabeçalho do pacote cifrado é inválido.");
  const iv = header.subarray(magic.length);
  const decipher: any = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  await mkdir(outputDirectory, { recursive: true });
  const tar = spawn("tar", ["-xf", "-", "-C", outputDirectory], { stdio: ["pipe", "ignore", "pipe"] });
  if (!tar.stdin) throw new Error("Não foi possível abrir a entrada do tar para restauração.");
  let stderr = "";
  tar.stderr?.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-2000); });
  const closed = new Promise<void>((resolve, reject) => {
    tar.once("error", reject);
    tar.once("close", (code) => code === 0 ? resolve() : reject(new Error(`tar de restauração terminou com código ${code}: ${stderr.slice(-800)}`)));
  });
  try {
    await Promise.all([
      pipeline(createReadStream(encryptedFile, { start: BACKUP_ARCHIVE_HEADER_BYTES, end: fileInfo.size - BACKUP_ARCHIVE_AUTH_TAG_BYTES - 1 }), decipher, tar.stdin),
      closed,
    ]);
  } catch (error) {
    if (!tar.killed) tar.kill("SIGTERM");
    throw new Error(`Falha ao autenticar/extrair o pacote AES-GCM: ${sanitizeRestoreError(error)}`);
  }
}

async function validateExtractedSnapshot(root: string, expectedBackupId: string) {
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RestoreManifest;
  if (manifest.formatVersion !== 1 || manifest.backupId !== expectedBackupId) throw new Error("Manifesto não pertence ao backup selecionado.");
  if (!manifest.database?.dumpFile || !manifest.database.dumpSha256 || !manifest.source?.archiveFile || !Array.isArray(manifest.r2?.objects)) {
    throw new Error("Manifesto do backup está incompleto para restauração automática.");
  }

  const databasePath = path.join(root, manifest.database.dumpFile);
  const databaseInfo = await stat(databasePath);
  if (databaseInfo.size !== manifest.database.dumpBytes) throw new Error("database.sql tem tamanho diferente do manifesto.");
  if ((await sha256File(databasePath)).toLowerCase() !== manifest.database.dumpSha256.toLowerCase()) throw new Error("database.sql falhou no SHA-256.");

  const sourcePath = path.join(root, manifest.source.archiveFile);
  const sourceInfo = await stat(sourcePath);
  if (sourceInfo.size !== manifest.source.bytes) throw new Error("Snapshot do código tem tamanho diferente do manifesto.");
  if ((await sha256File(sourcePath)).toLowerCase() !== manifest.source.sha256.toLowerCase()) throw new Error("Snapshot do código falhou no SHA-256.");

  const objects = manifest.r2.objects;
  for (let index = 0; index < objects.length; index += 1) {
    const object = objects[index];
    const filePath = path.join(root, safeBackupObjectPath(object.key));
    const info = await stat(filePath);
    if (info.size !== object.size) throw new Error(`Arquivo R2 divergente no pacote: ${object.key}.`);
    if ((await sha256File(filePath)).toLowerCase() !== object.sha256.toLowerCase()) throw new Error(`SHA-256 divergente no arquivo R2: ${object.key}.`);
    if (index === 0 || index % 10 === 0 || index === objects.length - 1) {
      updateRestore({ progress: 24 + Math.floor(((index + 1) / Math.max(objects.length, 1)) * 11), message: `Validando arquivos internos: ${index + 1}/${objects.length}.` });
    }
  }
  if (manifest.r2.objectCount !== objects.length) throw new Error("Quantidade de objetos R2 do manifesto não confere.");
  return manifest;
}

function databaseConnectionOptions() {
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (!rawUrl) throw new Error("DATABASE_URL não configurada para restauração.");
  const info = parseDatabaseUrl(rawUrl);
  return { info, options: {
    host: info.host,
    port: Number(info.port),
    user: info.user,
    password: info.password,
    database: info.database,
    ...(info.useTls ? { ssl: {} } : {}),
  } };
}

function quoteIdentifier(value: string) {
  return `\`${value.replace(/`/g, "``")}\``;
}

async function clearCurrentDatabase(manifest: RestoreManifest) {
  const { info, options } = databaseConnectionOptions();
  if (manifest.database.databaseName !== info.database) {
    throw new Error(`Backup pertence ao banco ${manifest.database.databaseName}, mas o serviço atual usa ${info.database}.`);
  }
  const connection = await createConnection(options);
  try {
    const [rows] = await connection.query(
      "SELECT TABLE_NAME AS tableName, TABLE_TYPE AS tableType FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY CASE WHEN TABLE_TYPE = 'VIEW' THEN 0 ELSE 1 END, TABLE_NAME",
      [info.database],
    );
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    for (const row of rows as Array<{ tableName: string; tableType: string }>) {
      const objectType = row.tableType === "VIEW" ? "VIEW" : "TABLE";
      await connection.query(`DROP ${objectType} IF EXISTS ${quoteIdentifier(String(row.tableName))}`);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    await connection.end();
  }
}

async function importDatabase(databaseFile: string) {
  const { info } = databaseConnectionOptions();
  const args = [
    `--host=${info.host}`,
    `--port=${info.port}`,
    `--user=${info.user}`,
    `--database=${info.database}`,
    "--protocol=TCP",
    "--default-character-set=utf8mb4",
    "--binary-mode=1",
    "--max-allowed-packet=1073741824",
  ];
  if (info.useTls) {
    args.push("--ssl", `--ssl-ca=${process.env.BACKUP_DUMPLING_CA_PATH?.trim() || "/etc/ssl/certs/ca-certificates.crt"}`);
  }
  const child = spawn(RESTORE_MARIADB_BINARY, args, {
    env: { ...process.env, MYSQL_PWD: info.password },
    stdio: ["pipe", "ignore", "pipe"],
  });
  if (!child.stdin) throw new Error("mariadb não abriu a entrada para restaurar database.sql.");
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-4000); });
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`mariadb terminou com código ${code}: ${stderr.slice(-1000)}`)));
  });
  await Promise.all([pipeline(createReadStream(databaseFile), child.stdin), closed]);
}

async function verifyRestoredDatabase(manifest: RestoreManifest) {
  const { info, options } = databaseConnectionOptions();
  const connection = await createConnection(options);
  try {
    const [rows] = await connection.query("SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [info.database]);
    const names = new Set((rows as Array<{ tableName: string }>).map((row) => String(row.tableName)));
    const missing = (manifest.database.tables || []).map((table) => table.name).filter((name) => !names.has(name));
    if (missing.length > 0) throw new Error(`Banco restaurado sem ${missing.length} tabela(s) esperada(s): ${missing.slice(0, 5).join(", ")}.`);
  } finally {
    await connection.end();
  }
}

async function listCurrentRestoreableR2Objects() {
  const result: Array<{ key: string; size: number }> = [];
  let continuationToken: string | undefined;
  do {
    const page = await r2ListObjectsPage("", continuationToken);
    result.push(...page.objects.filter((object) => !isProtectedRestoreR2Key(object.key)).map((object) => ({ key: object.key, size: object.size })));
    continuationToken = page.nextContinuationToken || undefined;
  } while (continuationToken);
  return result;
}

async function restoreR2Snapshot(root: string, manifest: RestoreManifest, restoreId: string) {
  const snapshotObjects = manifest.r2.objects.filter((object) => !isProtectedRestoreR2Key(object.key));
  const snapshotMap = new Map(snapshotObjects.map((object) => [object.key, object]));
  for (let index = 0; index < snapshotObjects.length; index += 1) {
    const object = snapshotObjects[index];
    const filePath = path.join(root, safeBackupObjectPath(object.key));
    if (object.size === 0) {
      await r2PutObject(object.key, Buffer.alloc(0), inferRestoreContentType(object.key));
    } else {
      await r2PutObjectStream(object.key, createReadStream(filePath), inferRestoreContentType(object.key), object.size, { backupId: restoreId, stage: "restore-r2" });
    }
    if (index === 0 || index % 5 === 0 || index === snapshotObjects.length - 1) {
      updateRestore({ progress: 48 + Math.floor(((index + 1) / Math.max(snapshotObjects.length, 1)) * 42), message: `Restaurando arquivos R2: ${index + 1}/${snapshotObjects.length}.` });
    }
  }

  updateRestore({ stage: "r2-prune", progress: 92, message: "Removendo somente arquivos atuais que não existiam no snapshot; backups permanecem protegidos." });
  const currentObjects = await listCurrentRestoreableR2Objects();
  const extras = currentObjects.filter((object) => !snapshotMap.has(object.key)).map((object) => object.key);
  for (let index = 0; index < extras.length; index += 500) await r2DeleteObjects(extras.slice(index, index + 500));

  const finalObjects = await listCurrentRestoreableR2Objects();
  const finalMap = new Map(finalObjects.map((object) => [object.key, object.size]));
  for (const object of snapshotObjects) {
    if (finalMap.get(object.key) !== object.size) throw new Error(`R2 restaurado não confirmou o tamanho de ${object.key}.`);
  }
}

async function captureSafetyBackupRow(backupId: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(systemBackups).where(eq(systemBackups.id, backupId)).limit(1);
  return row || null;
}

async function preserveSafetyBackupRow(row: Awaited<ReturnType<typeof captureSafetyBackupRow>>) {
  if (!row) return;
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(systemBackups).values({
      id: row.id,
      status: "completed",
      stage: "completed",
      progress: 100,
      artifactKey: row.artifactKey,
      fileSize: row.fileSize,
      archiveSha256: row.archiveSha256,
      manifestJson: row.manifestJson,
      initiatedBy: "restore-safety",
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      driveFileId: row.driveFileId,
      driveStatus: row.driveStatus,
      driveError: row.driveError,
      driveUploadedAt: row.driveUploadedAt,
      createdAt: row.createdAt,
      updatedAt: new Date(),
    }).onDuplicateKeyUpdate({ set: {
      artifactKey: row.artifactKey,
      fileSize: row.fileSize,
      archiveSha256: row.archiveSha256,
      manifestJson: row.manifestJson,
      status: "completed",
      stage: "completed",
      progress: 100,
    } });
  } catch {
    // A restauração principal não deve ser invalidada apenas porque o snapshot de segurança não reapareceu no histórico.
  }
}

async function waitForSafetyBackup() {
  updateRestore({ stage: "safety-backup", progress: 1, message: "Criando automaticamente um backup de segurança do estado atual antes de substituir qualquer dado." });
  const started = await startSystemBackup("restore-safety");
  if (!started.accepted) throw new Error("Já existe um backup em processamento. Aguarde a conclusão antes de restaurar.");
  updateRestore({ safetyBackupId: started.id });
  const deadline = Date.now() + RESTORE_SAFETY_BACKUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await getSystemBackup(started.id);
    if (!status) throw new Error("O backup de segurança desapareceu do histórico durante a preparação.");
    updateRestore({ progress: 1 + Math.floor(Math.max(0, Math.min(100, status.progress)) * 0.18), message: `Backup de segurança: ${status.progress}% · ${status.stage}.` });
    if (status.status === "failed") throw new Error(`Backup de segurança falhou: ${status.errorMessage || "sem detalhe"}`);
    if (status.status === "completed") {
      if (status.integrityStatus !== "verified") throw new Error("Backup de segurança terminou sem Integridade OK.");
      return started.id;
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error("Backup de segurança excedeu 45 minutos; restauração cancelada antes de qualquer alteração.");
}

async function writeRestoreAudit(restoreId: string, payload: Record<string, unknown>) {
  try {
    await r2PutObject(`system-restores/${restoreId}.json`, JSON.stringify({ ...payload, updatedAt: nowIso() }), "application/json");
  } catch {
    // Auditoria auxiliar não bloqueia a restauração principal.
  }
}

async function executeRestore(row: Awaited<ReturnType<typeof getRestoreCandidate>>, restoreId: string) {
  const tempRoot = path.join("/tmp", `walk-ajuda-restore-${restoreId}`);
  const encryptedFile = path.join(tempRoot, "backup.wajuda.enc");
  const extractedRoot = path.join(tempRoot, "snapshot");
  let safetyRow: Awaited<ReturnType<typeof captureSafetyBackupRow>> = null;
  try {
    await mkdir(tempRoot, { recursive: true });
    const safetyBackupId = await waitForSafetyBackup();
    safetyRow = await captureSafetyBackupRow(safetyBackupId);

    restoreLocked = true;
    updateRestore({ stage: "validating", progress: 20, message: "Sistema bloqueado para alterações. Revalidando e abrindo o backup selecionado." });
    await writeRestoreAudit(restoreId, { status: "validating", backupId: row.id, safetyBackupId });
    await downloadAndValidateOuterArchive(row, encryptedFile);
    await extractAuthenticatedArchive(encryptedFile, extractedRoot);
    const manifest = await validateExtractedSnapshot(extractedRoot, row.id);
    const deployed = currentCommit();
    updateRestore({
      sourceCommit: manifest.sourceCommit || manifest.source.commit || "unknown",
      currentCommit: deployed,
      sourceCommitMatchesCurrent: (manifest.sourceCommit || manifest.source.commit || "unknown") !== "unknown" && deployed !== "unknown" ? (manifest.sourceCommit || manifest.source.commit) === deployed : null,
      stage: "database",
      progress: 38,
      message: "Pacote autenticado. Restaurando o banco de dados.",
    });

    await clearCurrentDatabase(manifest);
    await importDatabase(path.join(extractedRoot, manifest.database.dumpFile));
    await verifyRestoredDatabase(manifest);
    await preserveSafetyBackupRow(safetyRow);

    updateRestore({ stage: "r2-upload", progress: 48, message: "Banco restaurado e validado. Restaurando fotos e arquivos do R2." });
    await restoreR2Snapshot(extractedRoot, manifest, restoreId);
    await preserveSafetyBackupRow(safetyRow);

    const completed: BackupRestoreStatus = {
      ...(activeRestore as BackupRestoreStatus),
      stage: "completed",
      progress: 100,
      message: "Restauração concluída: banco e arquivos R2 voltaram ao snapshot selecionado.",
      completedAt: nowIso(),
      updatedAt: nowIso(),
      error: null,
    };
    await writeRestoreAudit(restoreId, { status: "completed", backupId: row.id, safetyBackupId, sourceCommit: completed.sourceCommit, sourceCommitMatchesCurrent: completed.sourceCommitMatchesCurrent });
    lastRestore = completed;
    activeRestore = null;
  } catch (error) {
    const message = sanitizeRestoreError(error);
    const failed: BackupRestoreStatus = {
      ...(activeRestore as BackupRestoreStatus),
      stage: "failed",
      message: "Restauração interrompida. Consulte o erro antes de qualquer nova tentativa.",
      completedAt: nowIso(),
      updatedAt: nowIso(),
      error: message,
    };
    await writeRestoreAudit(restoreId, { status: "failed", backupId: row.id, safetyBackupId: failed.safetyBackupId, error: message });
    lastRestore = failed;
    activeRestore = null;
  } finally {
    restoreLocked = false;
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function startProtectedSystemBackupRestore(input: { backupId: string; token: string; confirmation: string }) {
  if (!isBackupRestoreEnabled()) throw new Error("Trava de emergência ativa. Defina BACKUP_RESTORE_ENABLED=true no Render somente quando realmente precisar restaurar.");
  if (activeRestore) throw new Error("Já existe uma restauração em andamento.");
  cleanupExpiredSessions();
  const session = restoreSessions.get(input.token);
  if (!session || session.backupId !== input.backupId || session.expiresAt <= Date.now()) throw new Error("Sessão de restauração expirou. Abra o botão Restaurar backup novamente.");
  const expected = restoreConfirmationPhrase(input.backupId);
  if (input.confirmation.trim().toUpperCase() !== expected) throw new Error(`Confirmação incorreta. Digite exatamente: ${expected}`);

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para iniciar a restauração.");
  const activeBackups = await db.select({ id: systemBackups.id }).from(systemBackups).where(inArray(systemBackups.status, ["queued", "running"])).limit(1);
  if (activeBackups.length > 0) throw new Error("Há um backup em processamento. Aguarde antes de restaurar.");

  const row = await getRestoreCandidate(input.backupId);
  const restoreId = randomBytes(12).toString("hex");
  const startedAt = nowIso();
  activeRestore = {
    restoreId,
    backupId: row.id,
    stage: "safety-backup",
    progress: 0,
    message: "Restauração protegida iniciada.",
    startedAt,
    updatedAt: startedAt,
    completedAt: null,
    safetyBackupId: null,
    sourceCommit: null,
    currentCommit: currentCommit(),
    sourceCommitMatchesCurrent: null,
    artifactSource: null,
    error: null,
  };
  lastRestore = null;
  restoreSessions.delete(input.token);
  void executeRestore(row, restoreId);
  return { accepted: true as const, restoreId };
}
'''

Path("server/backupRestoreService.ts").write_text(restore_service, encoding="utf-8")

restore_test = r'''import { describe, expect, it } from "vitest";
import { inferRestoreContentType, isProtectedRestoreR2Key, restoreConfirmationPhrase } from "./backupRestoreService";

describe("backupRestoreService protections", () => {
  it("exige frase ligada aos ultimos 8 caracteres do backup", () => {
    expect(restoreConfirmationPhrase("abcdef0123456789")).toBe("RESTAURAR 23456789");
  });

  it("nunca trata backups e auditorias de restore como midia restauravel", () => {
    expect(isProtectedRestoreR2Key("system-backups/abc.wajuda.enc")).toBe(true);
    expect(isProtectedRestoreR2Key("system-restores/abc.json")).toBe(true);
    expect(isProtectedRestoreR2Key("clientes/foto.jpg")).toBe(false);
  });

  it("restaura tipos comuns de midia com Content-Type coerente", () => {
    expect(inferRestoreContentType("clientes/foto.JPG")).toBe("image/jpeg");
    expect(inferRestoreContentType("docs/arquivo.pdf")).toBe("application/pdf");
    expect(inferRestoreContentType("sem-extensao")).toBe("application/octet-stream");
  });
});
'''
Path("server/backupRestoreService.test.ts").write_text(restore_test, encoding="utf-8")

# Não permitir que backups/auditorias de restauração entrem recursivamente no próximo snapshot do R2.
replace_once(
    "server/backupService.ts",
    'objects.push(...page.objects.filter((object) => !object.key.startsWith(BACKUP_ARTIFACT_PREFIX)));',
    'objects.push(...page.objects.filter((object) => !object.key.startsWith(BACKUP_ARTIFACT_PREFIX) && !object.key.startsWith("system-restores/")));',
)

# Rotas administrativas da restauração protegida.
router_path = Path("server/routers/backup.ts")
router_text = router_path.read_text(encoding="utf-8")
router_anchor = 'import {\n  cancelSystemBackup,\n'
if router_anchor not in router_text:
    raise SystemExit("backup router import anchor not found")
insert_after = '} from "../backupService";\n'
restore_import = '''} from "../backupService";\nimport {\n  getSystemBackupRestoreStatus,\n  isBackupRestoreEnabled,\n  isSystemRestoreLocked,\n  prepareSystemBackupRestore,\n  startProtectedSystemBackupRestore,\n} from "../backupRestoreService";\n'''
if insert_after not in router_text:
    raise SystemExit("backup router service import end not found")
router_text = router_text.replace(insert_after, restore_import, 1)
route_anchor = '''  start: adminProcedure.mutation(async () => {\n'''
restore_routes = '''  restoreConfig: adminProcedure.query(() => ({\n    enabled: isBackupRestoreEnabled(),\n    locked: isSystemRestoreLocked(),\n  })),\n\n  restoreStatus: adminProcedure.query(() => getSystemBackupRestoreStatus()),\n\n  prepareRestore: adminProcedure\n    .input(z.object({ id: z.string().regex(/^[a-f0-9]{48}$/i) }))\n    .mutation(({ input }) => prepareSystemBackupRestore(input.id)),\n\n  startRestore: adminProcedure\n    .input(z.object({\n      id: z.string().regex(/^[a-f0-9]{48}$/i),\n      token: z.string().min(32).max(128),\n      confirmation: z.string().min(1).max(80),\n    }))\n    .mutation(({ input }) => startProtectedSystemBackupRestore({ backupId: input.id, token: input.token, confirmation: input.confirmation })),\n\n'''
if route_anchor not in router_text:
    raise SystemExit("backup router start anchor not found")
router_text = router_text.replace(route_anchor, restore_routes + route_anchor, 1)
router_path.write_text(router_text, encoding="utf-8")

# Bloqueia procedimentos públicos/protegidos enquanto a fase destrutiva está em andamento; admin do backup continua acessível para acompanhar.
trpc_path = Path("server/_core/trpc.ts")
trpc_text = trpc_path.read_text(encoding="utf-8")
import_anchor = 'import { getAdminJwtSecret } from "../adminJwt";\n'
if import_anchor not in trpc_text:
    raise SystemExit("trpc import anchor not found")
trpc_text = trpc_text.replace(import_anchor, import_anchor + 'import { isSystemRestoreLocked } from "../backupRestoreService";\n', 1)
old_public = '''export const router = t.router;\nexport const publicProcedure = t.procedure;\n'''
new_public = '''export const router = t.router;\n\nconst blockDuringSystemRestore = t.middleware(async ({ next }) => {\n  if (isSystemRestoreLocked()) {\n    throw new TRPCError({ code: "CONFLICT", message: "Sistema temporariamente bloqueado enquanto uma restauração protegida está em andamento." });\n  }\n  return next();\n});\n\nexport const publicProcedure = t.procedure.use(blockDuringSystemRestore);\n'''
if old_public not in trpc_text:
    raise SystemExit("trpc public procedure anchor not found")
trpc_text = trpc_text.replace(old_public, new_public, 1)
old_protected = 'export const protectedProcedure = t.procedure.use(requireUser);'
new_protected = 'export const protectedProcedure = t.procedure.use(blockDuringSystemRestore).use(requireUser);'
if old_protected not in trpc_text:
    raise SystemExit("trpc protected procedure anchor not found")
trpc_text = trpc_text.replace(old_protected, new_protected, 1)
trpc_path.write_text(trpc_text, encoding="utf-8")

# Interface: botão, status e confirmação em três travas.
admin_path = Path("client/src/pages/AdminBackup.tsx")
admin = admin_path.read_text(encoding="utf-8")
admin = admin.replace('import { useMemo } from "react";', 'import { useMemo, useState } from "react";', 1)
admin = admin.replace(
    'import { AlertTriangle, CheckCircle2, Clock3, CloudUpload, DatabaseBackup, Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";',
    'import { AlertTriangle, CheckCircle2, Clock3, CloudUpload, DatabaseBackup, Download, Loader2, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, X } from "lucide-react";',
    1,
)
stage_end = '''  return labels[stage] || stage;\n}\n\nexport default function AdminBackup() {\n'''
restore_stage = '''  return labels[stage] || stage;\n}\n\nfunction restoreStageLabel(stage: string) {\n  const labels: Record<string, string> = {\n    "safety-backup": "Criando backup de segurança atual",\n    validating: "Validando e abrindo o pacote",\n    database: "Restaurando banco de dados",\n    "r2-upload": "Restaurando fotos e arquivos",\n    "r2-prune": "Sincronizando snapshot do R2",\n    completed: "Restauração concluída",\n    failed: "Restauração interrompida",\n  };\n  return labels[stage] || stage;\n}\n\ntype RestorePreview = {\n  token: string;\n  expiresAt: string;\n  confirmationPhrase: string;\n  restoreEnabled: boolean;\n  backup: {\n    id: string;\n    createdAt: Date | string;\n    fileSize: number | null;\n    archiveSha256: string;\n    sourceCommit: string;\n    sourceCommitMatchesCurrent: boolean | null;\n    currentCommit: string;\n    tableCount: number | null;\n    r2ObjectCount: number | null;\n    r2TotalBytes: number | null;\n    driveAvailable: boolean;\n  };\n};\n\nexport default function AdminBackup() {\n'''
if stage_end not in admin:
    raise SystemExit("AdminBackup stage anchor not found")
admin = admin.replace(stage_end, restore_stage, 1)

verify_anchor = '''  const cancelMut = trpc.backup.cancel.useMutation({\n'''
restore_hooks = '''  const restoreConfigQuery = trpc.backup.restoreConfig.useQuery(undefined, { refetchInterval: 5000 });\n  const restoreStatusQuery = trpc.backup.restoreStatus.useQuery(undefined, { refetchInterval: 2000 });\n  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);\n  const [restoreConfirmation, setRestoreConfirmation] = useState("");\n  const [restoreChecks, setRestoreChecks] = useState({ safety: false, destructive: false, code: false });\n\n  const prepareRestoreMut = trpc.backup.prepareRestore.useMutation({\n    onSuccess: (data) => {\n      setRestorePreview(data as RestorePreview);\n      setRestoreConfirmation("");\n      setRestoreChecks({ safety: false, destructive: false, code: false });\n    },\n    onError: (error) => toast.error(error.message || "Não foi possível preparar a restauração."),\n  });\n\n  const startRestoreMut = trpc.backup.startRestore.useMutation({\n    onSuccess: () => {\n      toast.success("Restauração protegida iniciada. Primeiro será criado um backup de segurança do estado atual.");\n      setRestorePreview(null);\n      setRestoreConfirmation("");\n      void restoreStatusQuery.refetch();\n      void backupsQuery.refetch();\n    },\n    onError: (error) => toast.error(error.message || "Não foi possível iniciar a restauração."),\n  });\n\n'''
if verify_anchor not in admin:
    raise SystemExit("AdminBackup cancel mutation anchor not found")
admin = admin.replace(verify_anchor, restore_hooks + verify_anchor, 1)

busy_old = '''  const isStarting = startMut.isPending;\n  const isBusy = Boolean(activeBackup) || isStarting;\n'''
busy_new = '''  const restoreStatus = restoreStatusQuery.data;\n  const restoreActive = Boolean(restoreStatus && restoreStatus.stage !== "completed" && restoreStatus.stage !== "failed");\n  const isStarting = startMut.isPending;\n  const isBusy = Boolean(activeBackup) || isStarting || restoreActive;\n'''
if busy_old not in admin:
    raise SystemExit("AdminBackup busy anchor not found")
admin = admin.replace(busy_old, busy_new, 1)

active_section_end = '''        )}\n\n        <section className="rounded-2xl border border-white/10 bg-[#111128] p-5">\n'''
restore_status_section = '''        )}\n\n        {restoreStatus && (\n          <section className={`rounded-2xl border p-5 ${restoreStatus.stage === "failed" ? "border-red-300/30 bg-red-300/10" : restoreStatus.stage === "completed" ? "border-emerald-300/30 bg-emerald-300/10" : "border-violet-300/30 bg-violet-300/10"}`}>\n            <div className="flex items-start gap-3">\n              {restoreActive ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-violet-200" /> : restoreStatus.stage === "completed" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-200" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-red-200" />}\n              <div className="min-w-0 flex-1">\n                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">\n                  <div><p className="text-sm font-black">{restoreStageLabel(restoreStatus.stage)}</p><p className="mt-1 text-xs text-slate-300">{restoreStatus.message}</p></div>\n                  <span className="text-2xl font-black">{restoreStatus.progress}%</span>\n                </div>\n                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-violet-300 transition-all" style={{ width: `${Math.max(0, Math.min(100, restoreStatus.progress))}%` }} /></div>\n                <div className="mt-3 grid gap-1 text-[11px] text-slate-300 sm:grid-cols-2">\n                  <span>Backup restaurado: <strong className="font-mono">{restoreStatus.backupId.slice(-12)}</strong></span>\n                  <span>Backup de segurança: <strong className="font-mono">{restoreStatus.safetyBackupId ? restoreStatus.safetyBackupId.slice(-12) : "aguardando"}</strong></span>\n                  {restoreStatus.artifactSource && <span>Fonte do pacote: <strong>{restoreStatus.artifactSource === "r2" ? "R2" : "Google Drive"}</strong></span>}\n                  {restoreStatus.sourceCommit && <span>Commit do snapshot: <strong className="font-mono">{restoreStatus.sourceCommit.slice(0, 12)}</strong></span>}\n                </div>\n                {restoreStatus.sourceCommitMatchesCurrent === false && restoreStatus.stage === "completed" && <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">Os dados foram restaurados, mas o snapshot pertence a outro commit. Faça o rollback do código no Render/GitHub para o commit mostrado antes de considerar a recuperação encerrada.</p>}\n                {restoreStatus.error && <p className="mt-3 flex items-start gap-2 text-xs text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />{restoreStatus.error}</p>}\n              </div>\n            </div>\n          </section>\n        )}\n\n        <section className="rounded-2xl border border-white/10 bg-[#111128] p-5">\n'''
if active_section_end not in admin:
    raise SystemExit("AdminBackup active section end anchor not found")
admin = admin.replace(active_section_end, restore_status_section, 1)

# Inserir botão de restauração depois do botão do Drive.
drive_button_end = '''                          {backup.driveStatus === "completed" ? "No Drive" : "Enviar ao Drive"}\n                        </button>\n'''
restore_button = '''                          {backup.driveStatus === "completed" ? "No Drive" : "Enviar ao Drive"}\n                        </button>\n                        <button\n                          type="button"\n                          onClick={() => prepareRestoreMut.mutate({ id: backup.id })}\n                          disabled={backup.integrityStatus !== "verified" || prepareRestoreMut.isPending || restoreActive}\n                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-xs font-black text-amber-100 hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-40"\n                          title={backup.integrityStatus === "verified" ? "Abrir restauração protegida em múltiplas etapas" : "Faça a verificação profunda antes de restaurar"}\n                        >\n                          {prepareRestoreMut.isPending && prepareRestoreMut.variables?.id === backup.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}\n                          Restaurar backup\n                        </button>\n'''
if drive_button_end not in admin:
    raise SystemExit("AdminBackup Drive button anchor not found")
admin = admin.replace(drive_button_end, restore_button, 1)

info_old = '''        <section className="rounded-xl border border-blue-300/15 bg-blue-300/5 p-4 text-xs leading-5 text-blue-100/75">\n          <strong className="text-blue-100">Google Drive:</strong> o botão envia somente um backup cifrado já concluído para a pasta privada configurada no ambiente seguro. As credenciais não ficam no pacote, no banco ou no GitHub. A restauração será uma função separada e nunca substituirá o banco atual com um clique.\n        </section>\n'''
info_new = '''        <section className="rounded-xl border border-blue-300/15 bg-blue-300/5 p-4 text-xs leading-5 text-blue-100/75">\n          <strong className="text-blue-100">Recuperação protegida:</strong> o Google Drive mantém uma segunda cópia do pacote cifrado. A restauração tenta o R2 primeiro e pode usar a cópia do Drive se o artefato principal estiver indisponível. Nenhum clique simples substitui dados: é exigida Integridade OK, backup automático de segurança, três confirmações, frase vinculada ao ID e a trava de emergência do Render.\n        </section>\n'''
if info_old not in admin:
    raise SystemExit("AdminBackup info anchor not found")
admin = admin.replace(info_old, info_new, 1)

main_close = '''      </main>\n    </div>\n  );\n}\n'''
modal = '''        {restorePreview && (\n          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">\n            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-300/30 bg-[#101024] p-5 shadow-2xl sm:p-6">\n              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">\n                <div><p className="text-[11px] font-black tracking-[0.18em] text-amber-200">RESTAURAÇÃO PROTEGIDA</p><h2 className="mt-1 text-xl font-black">Restaurar este backup</h2><p className="mt-1 text-xs text-slate-400">Esta janela não altera nada até todas as travas abaixo serem atendidas.</p></div>\n                <button type="button" onClick={() => setRestorePreview(null)} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>\n              </div>\n\n              <div className="mt-4 rounded-xl border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">\n                <div className="flex gap-2"><ShieldAlert className="mt-0.5 h-5 w-5 flex-none" /><div><strong>Operação destrutiva.</strong><p className="mt-1 text-xs leading-5 text-red-100/80">Depois da validação, o banco atual e os arquivos ativos do R2 serão substituídos pelo snapshot. Os próprios backups e auditorias de restauração nunca são apagados.</p></div></div>\n              </div>\n\n              <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-xs sm:grid-cols-2">\n                <span>Data: <strong>{formatDate(restorePreview.backup.createdAt)}</strong></span>\n                <span>Tamanho: <strong>{formatBytes(restorePreview.backup.fileSize)}</strong></span>\n                <span>Tabelas: <strong>{restorePreview.backup.tableCount ?? "—"}</strong></span>\n                <span>Arquivos R2: <strong>{restorePreview.backup.r2ObjectCount ?? "—"}</strong></span>\n                <span>Commit do backup: <strong className="font-mono">{restorePreview.backup.sourceCommit.slice(0, 12)}</strong></span>\n                <span>Commit atual: <strong className="font-mono">{restorePreview.backup.currentCommit.slice(0, 12)}</strong></span>\n                <span className="sm:col-span-2">Cópia no Drive: <strong>{restorePreview.backup.driveAvailable ? "disponível" : "não registrada"}</strong></span>\n              </div>\n\n              {restorePreview.backup.sourceCommitMatchesCurrent === false && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100"><strong>Atenção ao código:</strong> este backup foi criado em outro commit. O botão restaura banco + R2; o código do Render não é trocado automaticamente. Após recuperar os dados, faça rollback do código para o commit do snapshot.</div>}\n\n              {!restorePreview.restoreEnabled && <div className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100"><strong>Trava de emergência ativa.</strong> Para liberar o último botão somente quando houver necessidade real, crie no Render <code className="rounded bg-black/30 px-1.5 py-0.5">BACKUP_RESTORE_ENABLED=true</code> e faça o deploy. No uso normal deixe ausente/false.</div>}\n\n              <div className="mt-5 space-y-3">\n                <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-200"><input type="checkbox" checked={restoreChecks.safety} onChange={(event) => setRestoreChecks((current) => ({ ...current, safety: event.target.checked }))} className="mt-1" /><span><strong>Backup de segurança automático:</strong> entendo que antes de apagar qualquer dado o sistema criará e verificará uma nova cópia do estado atual; se ela falhar, a restauração será cancelada.</span></label>\n                <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-200"><input type="checkbox" checked={restoreChecks.destructive} onChange={(event) => setRestoreChecks((current) => ({ ...current, destructive: event.target.checked }))} className="mt-1" /><span><strong>Banco e arquivos:</strong> entendo que tabelas atuais serão substituídas e arquivos do R2 que não existiam no snapshot serão removidos, exceto os diretórios protegidos de backup.</span></label>\n                <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-200"><input type="checkbox" checked={restoreChecks.code} onChange={(event) => setRestoreChecks((current) => ({ ...current, code: event.target.checked }))} className="mt-1" /><span><strong>Código:</strong> entendo que o Render/GitHub não é alterado automaticamente e, se o commit for diferente, farei o rollback do código separadamente.</span></label>\n              </div>\n\n              <label className="mt-5 block"><span className="text-xs font-bold text-slate-300">Digite exatamente <strong className="font-mono text-amber-200">{restorePreview.confirmationPhrase}</strong></span><input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 font-mono text-sm text-white outline-none focus:border-amber-300/60" /></label>\n\n              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">\n                <button type="button" onClick={() => setRestorePreview(null)} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-white/5">Cancelar</button>\n                <button\n                  type="button"\n                  onClick={() => startRestoreMut.mutate({ id: restorePreview.backup.id, token: restorePreview.token, confirmation: restoreConfirmation })}\n                  disabled={!restorePreview.restoreEnabled || !restoreChecks.safety || !restoreChecks.destructive || !restoreChecks.code || restoreConfirmation.trim().toUpperCase() !== restorePreview.confirmationPhrase || startRestoreMut.isPending || restoreActive}\n                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-35"\n                >\n                  {startRestoreMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}\n                  {startRestoreMut.isPending ? "Iniciando proteção..." : "Confirmar restauração protegida"}\n                </button>\n              </div>\n            </div>\n          </div>\n        )}\n      </main>\n    </div>\n  );\n}\n'''
if main_close not in admin:
    raise SystemExit("AdminBackup main close anchor not found")
admin = admin.replace(main_close, modal, 1)
admin_path.write_text(admin, encoding="utf-8")

# Variáveis documentadas, destrutivas desligadas por padrão.
env_path = Path(".env.example")
env_text = env_path.read_text(encoding="utf-8")
if "BACKUP_RESTORE_ENABLED=" not in env_text:
    env_text += '''\n# Restauração destrutiva: deixe false no uso normal. Ative somente durante recuperação confirmada no painel.\nBACKUP_RESTORE_ENABLED=false\nBACKUP_MARIADB_BINARY=/usr/bin/mariadb\n'''
env_path.write_text(env_text, encoding="utf-8")

print("Protected backup restore implementation applied.")
