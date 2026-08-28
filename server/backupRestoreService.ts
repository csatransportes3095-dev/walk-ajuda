import { createDecipheriv, createHash, randomBytes } from "node:crypto";
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
