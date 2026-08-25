import { createHash, createCipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createConnection } from "mysql2/promise";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { r2GetObjectStream, r2ListObjectsPage, r2PutObjectStream, type R2ObjectInfo } from "./r2Storage";
import { systemBackups, type InsertSystemBackup } from "../drizzle/schema";

export const BACKUP_ARTIFACT_PREFIX = "system-backups/";
const BACKUP_SOURCE_ROOT = process.env.BACKUP_SOURCE_ROOT?.trim() || process.cwd();
const MAX_CONCURRENT_BACKUPS = 1;

type DatabaseConnectionInfo = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  useTls: boolean;
};

export type BackupR2Entry = R2ObjectInfo & {
  sha256: string;
};

export type BackupManifest = {
  formatVersion: 1;
  backupId: string;
  generatedAt: string;
  sourceCommit: string;
  database: {
    engine: "mysql-compatible";
    databaseName: string;
    tableCount: number;
    tables: Array<{ name: string; estimatedRows: number | null }>;
    dumpFile: string;
    dumpBytes: number;
    dumpSha256: string;
  };
  r2: {
    prefix: string;
    objectCount: number;
    totalBytes: number;
    objects: BackupR2Entry[];
  };
  source: {
    root: string;
    archiveFile: string;
    commit: string;
    bytes: number;
    sha256: string;
  };
  encryption: {
    algorithm: "aes-256-gcm";
    keyRequired: true;
    keyStoredInArchive: false;
  };
  verification: {
    checks: string[];
    archiveSha256: null;
    archiveBytes: null;
  };
};

function getEncryptionKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim() || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) {
    throw new Error("BACKUP_ENCRYPTION_KEY deve ser uma chave hexadecimal de 64 caracteres.");
  }
  return Buffer.from(raw, "hex");
}

export function isBackupEncryptionConfigured() {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function parseDatabaseUrl(raw: string): DatabaseConnectionInfo {
  const value = raw.trim();
  const url = new URL(value);
  if (!["mysql:", "mysql2:", "mariadb:", "mysqls:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL precisa usar um protocolo MySQL/TiDB compatível.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !url.username || !database) {
    throw new Error("DATABASE_URL não contém host, utilizador ou banco completos.");
  }
  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    useTls: url.protocol === "mysqls:" || url.searchParams.has("ssl") || url.searchParams.has("tls"),
  };
}

export function safeBackupObjectPath(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  const parts = normalized.split("/");
  if (!normalized || parts.some((part) => part === ".." || part === "." || part.includes("\\") || part.includes("\0"))) {
    throw new Error("Chave de objeto R2 inválida para backup.");
  }
  return path.join("files", ...parts);
}

function toNodeReadable(body: unknown): Readable {
  if (body instanceof Readable) return body;
  if (body && typeof (body as { getReader?: unknown }).getReader === "function") {
    return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
  }
  if (body && typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function") {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }
  throw new Error("Corpo de objeto R2 não é um stream suportado.");
}

class HashingTransform extends Transform {
  readonly hash = createHash("sha256");
  bytes = 0;

  _transform(chunk: Buffer | Uint8Array, _encoding: BufferEncoding, callback: TransformCallback) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.hash.update(buffer);
    this.bytes += buffer.length;
    callback(null, buffer);
  }
}

async function downloadR2Object(key: string, destination: string, expectedSize: number): Promise<{ bytes: number; sha256: string }> {
  await mkdir(path.dirname(destination), { recursive: true });
  const hasher = new HashingTransform();
  const body = toNodeReadable(await r2GetObjectStream(key));
  try {
    await pipeline(body, hasher, createWriteStream(destination, { flags: "wx" }));
  } catch (error) {
    await rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }
  if (hasher.bytes !== expectedSize) {
    await rm(destination, { force: true }).catch(() => undefined);
    throw new Error(`Tamanho divergente no objeto R2 ${key}.`);
  }
  return { bytes: hasher.bytes, sha256: hasher.hash.digest("hex") };
}

async function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv, stdoutFile?: string): Promise<void> {
  const child = spawn(command, args, {
    cwd: BACKUP_SOURCE_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-4000);
  });

  const outputPromise = stdoutFile && child.stdout
    ? pipeline(child.stdout, createWriteStream(stdoutFile, { flags: "wx" }))
    : Promise.resolve();
  const exitPromise = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} terminou com código ${code ?? "desconhecido"}: ${stderr.replace(/[\r\n]+/g, " ").slice(-800)}`));
    });
  });

  await Promise.all([outputPromise, exitPromise]);
}

async function dumpDatabase(databaseFile: string): Promise<{ info: DatabaseConnectionInfo; tables: Array<{ name: string; estimatedRows: number | null }>; bytes: number; sha256: string }> {
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (!rawUrl) throw new Error("DATABASE_URL não configurada para criar o backup.");
  const info = parseDatabaseUrl(rawUrl);
  const metadataConnection = await createConnection({
    host: info.host,
    port: Number(info.port),
    user: info.user,
    password: info.password,
    database: info.database,
    ...(info.useTls ? { ssl: {} } : {}),
  });
  let tables: Array<{ name: string; estimatedRows: number | null }> = [];
  try {
    const [rows] = await metadataConnection.query(
      "SELECT TABLE_NAME AS tableName, TABLE_ROWS AS estimatedRows FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
      [info.database],
    );
    tables = (rows as Array<{ tableName: string; estimatedRows: number | string | null }>).map((row) => ({
      name: String(row.tableName),
      estimatedRows: row.estimatedRows === null ? null : Number(row.estimatedRows),
    }));
  } finally {
    await metadataConnection.end();
  }

  const args = [
    "--single-transaction",
    "--quick",
    "--routines",
    "--events",
    "--triggers",
    "--hex-blob",
    "--skip-lock-tables",
    "--no-tablespaces",
    `--host=${info.host}`,
    `--port=${info.port}`,
    `--user=${info.user}`,
    "--databases",
    info.database,
  ];
  if (info.useTls) args.push("--ssl");
  await runProcess("mysqldump", args, { ...process.env, MYSQL_PWD: info.password }, databaseFile);
  const fileInfo = await stat(databaseFile);
  const sha256 = await sha256File(databaseFile);
  return { info, tables, bytes: fileInfo.size, sha256 };
}

async function createSourceSnapshot(destination: string): Promise<{ bytes: number; sha256: string }> {
  const args = [
    "-czf",
    destination,
    "--exclude=.git",
    "--exclude=node_modules",
    "--exclude=dist",
    "--exclude=.env",
    "--exclude=.env.*",
    "--exclude=*.pem",
    "--exclude=*.key",
    ".",
  ];
  await runProcess("tar", args, { ...process.env });
  const fileInfo = await stat(destination);
  const sha256 = await sha256File(destination);
  return { bytes: fileInfo.size, sha256 };
}

async function encryptTarDirectory(sourceDirectory: string, encryptedFile: string): Promise<void> {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const output = createWriteStream(encryptedFile, { flags: "wx" });
  output.write(Buffer.from("WJBACK1\n", "utf8"));
  output.write(iv);

  const tar = spawn("tar", ["-cf", "-", "-C", sourceDirectory, "."], {
    cwd: BACKUP_SOURCE_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  tar.stderr?.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-4000); });
  try {
    await pipeline(tar.stdout!, cipher, output);
    const exitCode = await new Promise<number>((resolve, reject) => {
      tar.once("error", reject);
      tar.once("close", (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0) throw new Error(`tar terminou com código ${exitCode}: ${stderr.slice(-800)}`);
    const authTag = cipher.getAuthTag();
    await writeFile(encryptedFile, authTag, { flag: "a" });
  } catch (error) {
    tar.kill("SIGTERM");
    await rm(encryptedFile, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function updateRun(id: string, patch: Partial<InsertSystemBackup>) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para atualizar o histórico do backup.");
  await db.update(systemBackups).set(patch).where(eq(systemBackups.id, id));
}

async function listAllR2Objects(): Promise<R2ObjectInfo[]> {
  const objects: R2ObjectInfo[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await r2ListObjectsPage("", continuationToken);
    objects.push(...page.objects.filter((object) => !object.key.startsWith(BACKUP_ARTIFACT_PREFIX)));
    continuationToken = page.nextContinuationToken || undefined;
  } while (continuationToken);
  return objects;
}

function summaryFromManifest(manifest: BackupManifest, archiveBytes: number, archiveSha256: string) {
  return JSON.stringify({
    formatVersion: manifest.formatVersion,
    backupId: manifest.backupId,
    generatedAt: manifest.generatedAt,
    sourceCommit: manifest.sourceCommit,
    database: {
      databaseName: manifest.database.databaseName,
      tableCount: manifest.database.tableCount,
      dumpBytes: manifest.database.dumpBytes,
      dumpSha256: manifest.database.dumpSha256,
    },
    r2: {
      objectCount: manifest.r2.objectCount,
      totalBytes: manifest.r2.totalBytes,
    },
    archiveBytes,
    archiveSha256,
  });
}

async function executeBackup(id: string): Promise<void> {
  const workDirectory = path.join("/tmp", `walk-ajuda-backup-${id}`);
  const databaseFile = path.join(workDirectory, "database.sql");
  const sourceFile = path.join(workDirectory, "source.tar.gz");
  const encryptedFile = path.join("/tmp", `walk-ajuda-backup-${id}.wajuda.enc`);
  const filesDirectory = path.join(workDirectory, "files");
  const manifestFile = path.join(workDirectory, "manifest.json");

  try {
    getEncryptionKey();
    await mkdir(filesDirectory, { recursive: true });
    await updateRun(id, { status: "running", stage: "database", progress: 5, startedAt: new Date(), errorMessage: null });
    const database = await dumpDatabase(databaseFile);
    await updateRun(id, { stage: "r2", progress: 20 });

    const r2Objects = await listAllR2Objects();
    const r2Entries: BackupR2Entry[] = [];
    let totalR2Bytes = 0;
    for (let index = 0; index < r2Objects.length; index += 1) {
      const object = r2Objects[index];
      const relativePath = safeBackupObjectPath(object.key);
      const result = await downloadR2Object(object.key, path.join(workDirectory, relativePath), object.size);
      r2Entries.push({ ...object, sha256: result.sha256 });
      totalR2Bytes += result.bytes;
      const progress = 20 + Math.floor(((index + 1) / Math.max(r2Objects.length, 1)) * 55);
      if (index === 0 || index % 10 === 0 || index === r2Objects.length - 1) {
        await updateRun(id, { stage: "r2", progress });
      }
    }

    await updateRun(id, { stage: "source", progress: 80 });
    const source = await createSourceSnapshot(sourceFile);
    const sourceCommit = process.env.RENDER_GIT_COMMIT?.trim() || process.env.COMMIT_SHA?.trim() || "unknown";
    const generatedAt = new Date().toISOString();
    const manifest: BackupManifest = {
      formatVersion: 1,
      backupId: id,
      generatedAt,
      sourceCommit,
      database: {
        engine: "mysql-compatible",
        databaseName: database.info.database,
        tableCount: database.tables.length,
        tables: database.tables,
        dumpFile: "database.sql",
        dumpBytes: database.bytes,
        dumpSha256: database.sha256,
      },
      r2: {
        prefix: "",
        objectCount: r2Entries.length,
        totalBytes: totalR2Bytes,
        objects: r2Entries,
      },
      source: {
        root: BACKUP_SOURCE_ROOT,
        archiveFile: "source.tar.gz",
        commit: sourceCommit,
        bytes: source.bytes,
        sha256: source.sha256,
      },
      encryption: {
        algorithm: "aes-256-gcm",
        keyRequired: true,
        keyStoredInArchive: false,
      },
      verification: {
        checks: [
          "mysqldump concluído com código zero",
          "inventário de tabelas capturado",
          "todos os objetos R2 paginados e comparados por tamanho",
          "SHA-256 calculado para cada objeto R2",
          "snapshot do código criado sem .env, chaves privadas, node_modules ou dist",
          "artefato cifrado com AES-256-GCM",
        ],
        archiveSha256: null,
        archiveBytes: null,
      },
    };
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2), "utf8");

    await updateRun(id, { stage: "archive", progress: 88 });
    await encryptTarDirectory(workDirectory, encryptedFile);
    const archiveInfo = await stat(encryptedFile);
    const archiveSha256 = await sha256File(encryptedFile);
    const artifactKey = `${BACKUP_ARTIFACT_PREFIX}${id}.wajuda.enc`;
    await updateRun(id, {
      stage: "upload",
      progress: 95,
      artifactKey,
      fileSize: archiveInfo.size,
      archiveSha256,
      manifestJson: summaryFromManifest(manifest, archiveInfo.size, archiveSha256),
    });
    await r2PutObjectStream(artifactKey, createReadStream(encryptedFile), "application/octet-stream", archiveInfo.size);
    await updateRun(id, {
      status: "completed",
      stage: "completed",
      progress: 100,
      completedAt: new Date(),
      manifestJson: summaryFromManifest(manifest, archiveInfo.size, archiveSha256),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no backup.";
    await updateRun(id, {
      status: "failed",
      stage: "failed",
      progress: 0,
      errorMessage: message.slice(0, 1000),
    }).catch(() => undefined);
  } finally {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
    await rm(encryptedFile, { force: true }).catch(() => undefined);
  }
}

export async function startSystemBackup(initiatedBy?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para iniciar o backup.");
  const activeRows = await db
    .select({ id: systemBackups.id })
    .from(systemBackups)
    .where(inArray(systemBackups.status, ["queued", "running"]))
    .limit(MAX_CONCURRENT_BACKUPS);
  if (activeRows.length > 0) return { accepted: false as const, id: activeRows[0].id };

  const id = randomBytes(24).toString("hex");
  await db.insert(systemBackups).values({
    id,
    status: "queued",
    stage: "queued",
    progress: 0,
    initiatedBy: initiatedBy?.slice(0, 128) || "admin",
  });
  void executeBackup(id);
  return { accepted: true as const, id };
}

export async function listSystemBackups(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(systemBackups)
    .orderBy(desc(systemBackups.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    fileSize: row.fileSize,
    archiveSha256: row.archiveSha256,
    initiatedBy: row.initiatedBy,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    driveFileId: row.driveFileId,
    driveStatus: row.driveStatus,
    driveUploadedAt: row.driveUploadedAt,
    driveError: row.driveStatus === "failed" ? row.driveError : null,
    errorMessage: row.status === "failed" ? row.errorMessage : null,
  }));
}

export async function getSystemBackup(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(systemBackups).where(eq(systemBackups.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    artifactKey: row.artifactKey,
    fileSize: row.fileSize,
    archiveSha256: row.archiveSha256,
    initiatedBy: row.initiatedBy,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    driveFileId: row.driveFileId,
    driveStatus: row.driveStatus,
    driveUploadedAt: row.driveUploadedAt,
    driveError: row.driveStatus === "failed" ? row.driveError : null,
    errorMessage: row.status === "failed" ? row.errorMessage : null,
  };
}

export async function getCompletedSystemBackup(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: systemBackups.id, status: systemBackups.status, artifactKey: systemBackups.artifactKey, fileSize: systemBackups.fileSize, archiveSha256: systemBackups.archiveSha256 })
    .from(systemBackups)
    .where(and(eq(systemBackups.id, id), eq(systemBackups.status, "completed")))
    .limit(1);
  return rows[0] || null;
}

export async function streamSystemBackupArtifact(id: string) {
  const completed = await getCompletedSystemBackup(id);
  if (!completed?.artifactKey) return null;
  return {
    ...completed,
    body: toNodeReadable(await r2GetObjectStream(completed.artifactKey)),
  };
}

export function isGoogleDriveBackupConfigured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() &&
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim(),
  );
}

async function getGoogleDriveAccessToken() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Drive não está configurado. Faltam credenciais privadas no Render.");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("Google Drive recusou a renovação da autorização.");
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Google Drive não devolveu um token de acesso.");
  return payload.access_token;
}

async function downloadArtifactForDrive(id: string, destination: string) {
  const completed = await getCompletedSystemBackup(id);
  if (!completed?.artifactKey || completed.fileSize === null || completed.fileSize === undefined) {
    throw new Error("Backup concluído sem artefato ou tamanho registrado.");
  }
  await pipeline(toNodeReadable(await r2GetObjectStream(completed.artifactKey)), createWriteStream(destination, { flags: "wx" }));
  const fileInfo = await stat(destination);
  if (fileInfo.size !== completed.fileSize) throw new Error("O tamanho do artefato baixado do R2 não confere.");
  return { ...completed, size: fileInfo.size };
}

export async function uploadSystemBackupToGoogleDrive(id: string) {
  if (!isGoogleDriveBackupConfigured()) {
    await updateRun(id, { driveStatus: "not_configured", driveError: "Google Drive não configurado no ambiente seguro." });
    throw new Error("Google Drive não está configurado no ambiente seguro do Render.");
  }
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!.trim();
  const tempFile = path.join("/tmp", `walk-ajuda-drive-${id}.wajuda.enc`);
  await updateRun(id, { driveStatus: "uploading", driveError: null });
  try {
    const artifact = await downloadArtifactForDrive(id, tempFile);
    const accessToken = await getGoogleDriveAccessToken();
    const sessionResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/octet-stream",
        "X-Upload-Content-Length": String(artifact.size),
      },
      body: JSON.stringify({ name: `walk-ajuda-backup-${id}.wajuda.enc`, parents: [folderId] }),
    });
    const uploadUrl = sessionResponse.headers.get("location");
    if (!sessionResponse.ok || !uploadUrl) throw new Error("Google Drive não criou a sessão de upload.");
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(artifact.size),
      },
      body: createReadStream(tempFile),
      duplex: "half",
    } as unknown as RequestInit & { duplex: "half" });
    if (!uploadResponse.ok) throw new Error(`Google Drive falhou no upload (HTTP ${uploadResponse.status}).`);
    const uploaded = await uploadResponse.json() as { id?: string };
    if (!uploaded.id) throw new Error("Google Drive não devolveu o ID do arquivo.");
    await updateRun(id, { driveStatus: "completed", driveFileId: uploaded.id, driveUploadedAt: new Date(), driveError: null });
    return { id: uploaded.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no Google Drive.";
    await updateRun(id, { driveStatus: "failed", driveError: message.slice(0, 1000) }).catch(() => undefined);
    throw error;
  } finally {
    await rm(tempFile, { force: true }).catch(() => undefined);
  }
}
