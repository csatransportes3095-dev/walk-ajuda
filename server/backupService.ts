import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, rm, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { PassThrough, Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createConnection } from "mysql2/promise";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { r2GetObjectStream, r2HeadObject, r2ListObjectsPage, r2PutObjectStream, type R2ObjectInfo } from "./r2Storage";
import { systemBackups, type InsertSystemBackup } from "../drizzle/schema";

export const BACKUP_ARTIFACT_PREFIX = "system-backups/";
const BACKUP_SOURCE_ROOT = process.env.BACKUP_SOURCE_ROOT?.trim() || process.cwd();
const MAX_CONCURRENT_BACKUPS = 1;
export const BACKUP_HEARTBEAT_INTERVAL_MS = 30_000;
export const BACKUP_ARCHIVE_IDLE_TIMEOUT_MS = 10 * 60_000;
export const BACKUP_STALE_AFTER_MS = 10 * 60_000;
const DUMPLING_BINARY = process.env.BACKUP_DUMPLING_BINARY?.trim() || "dumpling";
const DUMPLING_FILE_SIZE = "256MiB";
export const DEFAULT_DUMPLING_CA_PATH = "/etc/ssl/certs/ca-certificates.crt";
export const BACKUP_ARCHIVE_HEADER_BYTES = Buffer.byteLength("WJBACK1\n", "utf8") + 12;
export const BACKUP_ARCHIVE_AUTH_TAG_BYTES = 16;

type BackupDiagnosticContext = {
  backupId: string;
  stage: string;
  startedAt: number;
};

const activeBackupDiagnostics = new Map<string, BackupDiagnosticContext>();

function sanitizeDiagnosticValue(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, "<url-redacted>")
    .replace(/(password|secret|token|authorization|cookie|database_url|r2_[a-z_]+|backup_encryption_key)[^\s]*/gi, "$1=<redacted>")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 800);
}

function logBackupDiagnostic(context: BackupDiagnosticContext, event: string, details: Record<string, string | number | boolean | null | undefined> = {}) {
  const fields = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === "string" ? sanitizeDiagnosticValue(value) : String(value)}`)
    .join(" ");
  console.log(`[BACKUP-DIAG] backupId=${context.backupId} stage=${context.stage} timestamp=${new Date().toISOString()} elapsedMs=${Date.now() - context.startedAt} event=${event}${fields ? ` ${fields}` : ""}`);
}

function logMemoryDiagnostic(context: BackupDiagnosticContext, event = "memory") {
  const memory = process.memoryUsage();
  logBackupDiagnostic(context, event, {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
  });
}

function logEventLoopDiagnostic(context: BackupDiagnosticContext, delayMs: number) {
  console.warn(`[BACKUP-DIAG][EVENT_LOOP] backupId=${context.backupId} stage=${context.stage} timestamp=${new Date().toISOString()} elapsedMs=${Date.now() - context.startedAt} delayMs=${delayMs}`);
}

async function getDirectoryBytes(directory: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await getDirectoryBytes(fullPath);
    else if (entry.isFile()) {
      try { total += (await stat(fullPath)).size; } catch { /* execução pode estar limpando o arquivo */ }
    }
  }
  return total;
}

async function logDiskDiagnostic(context: BackupDiagnosticContext, workDirectory: string, stage: string) {
  const databaseBytes = await getFileBytes(path.join(workDirectory, "database.sql"));
  const r2FilesBytes = await getDirectoryBytes(path.join(workDirectory, "files"));
  const sourceSnapshotBytes = await getFileBytes(path.join(workDirectory, "source.tar.gz"));
  const manifestBytes = await getFileBytes(path.join(workDirectory, "manifest.json"));
  let freeBytes: number | null = null;
  let totalBytes: number | null = null;
  let usedBytes: number | null = null;
  try {
    const filesystem = await statfs(workDirectory).catch(() => statfs(path.dirname(workDirectory)));
    totalBytes = Number(filesystem.blocks) * Number(filesystem.bsize);
    freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
    usedBytes = Math.max(totalBytes - Number(filesystem.bfree) * Number(filesystem.bsize), 0);
  } catch { /* statfs não disponível ou diretório ainda inexistente */ }
  logBackupDiagnostic({ ...context, stage }, "disk", {
    workspaceBytes: databaseBytes + r2FilesBytes + sourceSnapshotBytes + manifestBytes,
    databaseBytes,
    r2FilesBytes,
    sourceSnapshotBytes,
    manifestBytes,
    freeBytes,
    totalBytes,
    usedBytes,
  });
}

async function getFileBytes(filePath: string): Promise<number> {
  try { return (await stat(filePath)).size; } catch { return 0; }
}

function getActiveBackupDiagnostic(): BackupDiagnosticContext | null {
  const active = activeBackupDiagnostics.values().next().value as BackupDiagnosticContext | undefined;
  return active ? { ...active } : null;
}

export function logProcessDiagnostic(event: string, details: Record<string, string | number | boolean | null | undefined> = {}) {
  const active = getActiveBackupDiagnostic();
  const context = active || { backupId: "none", stage: "idle", startedAt: Date.now() };
  const fields = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === "string" ? sanitizeDiagnosticValue(value) : String(value)}`)
    .join(" ");
  console.error(`[PROCESS-DIAG] backupRunning=${Boolean(active)} backupId=${context.backupId} stage=${context.stage} timestamp=${new Date().toISOString()} elapsedMs=${Date.now() - context.startedAt} event=${event}${fields ? ` ${fields}` : ""}`);
}

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
    dumpTool: "dumpling";
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

async function runProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdoutFile?: string,
  diagnostic?: BackupDiagnosticContext,
  onStdoutBytes?: (bytes: number) => void,
): Promise<void> {
  const commandName = path.basename(command);
  const processStartedAt = Date.now();
  if (diagnostic) logBackupDiagnostic(diagnostic, "process-start", { commandName });
  const child = spawn(command, args, {
    cwd: BACKUP_SOURCE_ROOT,
    env,
    stdio: ["ignore", stdoutFile || onStdoutBytes ? "pipe" : "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-4000);
  });

  const outputPromise = stdoutFile && child.stdout
    ? pipeline(child.stdout, createWriteStream(stdoutFile, { flags: "wx" }))
    : onStdoutBytes && child.stdout
      ? pipeline(child.stdout, new Transform({
        transform(chunk, _encoding, callback) {
          onStdoutBytes(Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk)));
          callback();
        },
      }))
      : Promise.resolve();
  const exitPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (event: string, code: number | null, signal: NodeJS.Signals | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      if (diagnostic) logBackupDiagnostic(diagnostic, event, {
        commandName,
        durationMs: Date.now() - processStartedAt,
        exitCode: code,
        signal,
        stderr: error || code !== 0 ? sanitizeDiagnosticValue(error || stderr.slice(-800)) : undefined,
      });
    };
    child.once("error", (error) => {
      finish("process-failed", null, null, error);
      reject(error);
    });
    child.once("close", (code, signal) => {
      finish(code === 0 ? "process-end" : "process-failed", code, signal);
      if (code === 0) resolve();
      else reject(new Error(`${commandName} terminou com código ${code ?? "desconhecido"}${signal ? ` por ${signal}` : ""}: ${sanitizeDiagnosticValue(stderr.slice(-800))}`));
    });
  });

  await Promise.all([outputPromise, exitPromise]);
}

export function resolveDumplingTlsPaths(caRaw: string | undefined, certRaw: string | undefined, keyRaw: string | undefined) {
  const caPath = caRaw?.trim() || DEFAULT_DUMPLING_CA_PATH;
  const certPath = certRaw?.trim() || "";
  const keyPath = keyRaw?.trim() || "";
  if ((certPath && !keyPath) || (!certPath && keyPath)) {
    throw new Error("BACKUP_DUMPLING_CERT_PATH e BACKUP_DUMPLING_KEY_PATH devem ser configurados em par.");
  }
  return {
    caPath,
    certPath,
    keyPath,
    useEphemeralClientCertificate: !certPath && !keyPath,
  } as const;
}

// Dumpling v8.5.7 exige um par PEM mesmo quando o servidor usa TLS de mão única.
// Este certificado não é uma credencial: é descartável e removido antes de continuar o backup.
async function createEphemeralDumplingClientCertificate(directory: string, diagnostic?: BackupDiagnosticContext): Promise<{ certPath: string; keyPath: string }> {
  const certPath = path.join(directory, "client.crt.pem");
  const keyPath = path.join(directory, "client.key.pem");
  await mkdir(directory, { recursive: true });
  await runProcess("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    `-keyout=${keyPath}`,
    `-out=${certPath}`,
    "-days",
    "1",
    "-subj",
    "/CN=walk-ajuda-backup-ephemeral",
  ], { PATH: process.env.PATH ?? "/usr/bin:/bin" }, undefined, diagnostic);
  return { certPath, keyPath };
}

function quoteSqlIdentifier(value: string): string {
  if (!value || /[\0\r\n]/.test(value)) throw new Error("Nome de banco inválido para o dump.");
  return `\`${value.replace(/`/g, "``")}\``;
}

export function orderDumplingSqlFiles(fileNames: string[]): string[] {
  const rank = (name: string) => {
    if (name.endsWith("-schema-create.sql")) return 10;
    if (name.endsWith("-schema.sql")) return 20;
    if (/-schema-(view|trigger|triggers|post)\.sql$/i.test(name)) return 40;
    return 30;
  };
  return fileNames
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .slice()
    .sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
}

export async function concatenateDumplingSqlFiles(outputDirectory: string, databaseFile: string, databaseName: string): Promise<void> {
  const entries = await readdir(outputDirectory, { withFileTypes: true });
  const sqlNames: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`Dumpling produziu link simbólico inesperado: ${entry.name}`);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".sql")) sqlNames.push(entry.name);
  }
  const orderedSqlNames = orderDumplingSqlFiles(sqlNames);
  if (orderedSqlNames.length === 0) throw new Error("Dumpling terminou sem produzir arquivos SQL.");

  const output = await open(databaseFile, "wx");
  try {
    const hasSchemaCreate = orderedSqlNames.some((name) => name.endsWith("-schema-create.sql"));
    if (!hasSchemaCreate) await output.write(Buffer.from(`USE ${quoteSqlIdentifier(databaseName)};\n`, "utf8"));
    for (const name of orderedSqlNames) {
      const input = createReadStream(path.join(outputDirectory, name));
      for await (const chunk of input) {
        await output.write(chunk as Buffer);
      }
      await output.write(Buffer.from("\n", "utf8"));
      if (name.endsWith("-schema-create.sql")) {
        await output.write(Buffer.from(`USE ${quoteSqlIdentifier(databaseName)};\n`, "utf8"));
      }
    }
  } finally {
    await output.close();
  }
}

async function dumpDatabase(databaseFile: string, diagnostic?: BackupDiagnosticContext): Promise<{ info: DatabaseConnectionInfo; tables: Array<{ name: string; estimatedRows: number | null }>; bytes: number; sha256: string }> {
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

  const outputDirectory = `${databaseFile}.dumpling`;
  const tlsDirectory = path.join(path.dirname(databaseFile), "dumpling-tls");
  const args = [
    `--host=${info.host}`,
    `--port=${info.port}`,
    `--user=${info.user}`,
    `--password=${info.password}`,
    `--database=${info.database}`,
    `--output=${outputDirectory}`,
    "--filetype=sql",
    "--consistency=auto",
    "--threads=2",
    `--filesize=${DUMPLING_FILE_SIZE}`,
    "--statement-size=1000000",
    "--no-views=false",
    "--compress=no-compression",
    "--loglevel=warn",
  ];
  if (info.useTls) {
    const tls = resolveDumplingTlsPaths(
      process.env.BACKUP_DUMPLING_CA_PATH,
      process.env.BACKUP_DUMPLING_CERT_PATH,
      process.env.BACKUP_DUMPLING_KEY_PATH,
    );
    const clientCertificate = tls.useEphemeralClientCertificate
      ? await createEphemeralDumplingClientCertificate(tlsDirectory, diagnostic)
      : { certPath: tls.certPath, keyPath: tls.keyPath };
    args.push(`--ca=${tls.caPath}`, `--cert=${clientCertificate.certPath}`, `--key=${clientCertificate.keyPath}`);
  }

  try {
    await mkdir(outputDirectory, { recursive: true });
    await runProcess(DUMPLING_BINARY, args, { ...process.env }, undefined, diagnostic);
    await concatenateDumplingSqlFiles(outputDirectory, databaseFile, info.database);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true }).catch(() => undefined);
    await rm(tlsDirectory, { recursive: true, force: true }).catch(() => undefined);
  }

  const fileInfo = await stat(databaseFile);
  if (fileInfo.size <= 0) throw new Error("Dumpling produziu um database.sql vazio.");
  const sha256 = await sha256File(databaseFile);
  return { info, tables, bytes: fileInfo.size, sha256 };
}

export async function measureTarArchiveBytes(sourceDirectory: string, diagnostic?: BackupDiagnosticContext): Promise<number> {
  let bytes = 0;
  await runProcess("tar", ["-cf", "-", "-C", sourceDirectory, "."], { ...process.env }, undefined, diagnostic, (chunkBytes) => {
    bytes += chunkBytes;
  });
  return bytes;
}

export function encryptedArchiveLength(plaintextTarBytes: number): number {
  if (!Number.isSafeInteger(plaintextTarBytes) || plaintextTarBytes < 0) {
    throw new Error("Tamanho do tar inválido para calcular o Content-Length.");
  }
  return BACKUP_ARCHIVE_HEADER_BYTES + plaintextTarBytes + BACKUP_ARCHIVE_AUTH_TAG_BYTES;
}

async function createSourceSnapshot(destination: string, diagnostic?: BackupDiagnosticContext): Promise<{ bytes: number; sha256: string }> {
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
  await runProcess("tar", args, { ...process.env }, undefined, diagnostic);
  const fileInfo = await stat(destination);
  const sha256 = await sha256File(destination);
  return { bytes: fileInfo.size, sha256 };
}

type EncryptedArchiveStream = {
  stream: PassThrough;
  completion: Promise<{ bytes: number; sha256: string }>;
  cancel: (error?: Error) => void;
};

export function createEncryptedArchiveStream(
  sourceDirectory: string,
  signal?: AbortSignal,
  onBytes?: (bytes: number) => void,
  diagnostic?: BackupDiagnosticContext,
  idleTimeoutMs = BACKUP_ARCHIVE_IDLE_TIMEOUT_MS,
): EncryptedArchiveStream {
  throwIfBackupAborted(signal);
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const output = new PassThrough();
  const artifactCounter = new HashingTransform();
  const header = Buffer.concat([Buffer.from("WJBACK1\n", "utf8"), iv]);
  if (header.length !== BACKUP_ARCHIVE_HEADER_BYTES) throw new Error("Formato do cabeçalho cifrado inesperado.");
  artifactCounter.hash.update(header);
  artifactCounter.bytes = header.length;
  output.write(header);

  if (diagnostic) logBackupDiagnostic(diagnostic, "archive-start", { commandName: "tar" });
  const processStartedAt = Date.now();
  const tar = spawn("tar", ["-cf", "-", "-C", sourceDirectory, "."], {
    cwd: BACKUP_SOURCE_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  let processedBytes = 0;
  let timedOut = false;
  let cancelled = false;
  const stopTar = () => {
    if (!tar.killed) tar.kill("SIGTERM");
  };
  let idleTimeout = setTimeout(() => {
    timedOut = true;
    if (diagnostic) logBackupDiagnostic(diagnostic, "archive-timeout", { timeoutMs: idleTimeoutMs });
    stopTar();
  }, idleTimeoutMs);
  const resetIdleTimeout = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      timedOut = true;
      if (diagnostic) logBackupDiagnostic(diagnostic, "archive-timeout", { timeoutMs: idleTimeoutMs });
      stopTar();
    }, idleTimeoutMs);
  };
  tar.stdout?.on("data", resetIdleTimeout);
  const progressCounter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      processedBytes += buffer.length;
      onBytes?.(processedBytes);
      callback(null, buffer);
    },
  });
  artifactCounter.pipe(output, { end: false });
  const onAbort = () => {
    if (diagnostic) logBackupDiagnostic(diagnostic, "archive-aborted");
    stopTar();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  tar.stderr?.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-4000); });
  const exitPromise = new Promise<number>((resolve, reject) => {
    tar.once("error", (error) => {
      if (diagnostic) logBackupDiagnostic(diagnostic, "process-failed", { commandName: "tar", durationMs: Date.now() - processStartedAt, exitCode: null, signal: null, stderr: sanitizeDiagnosticValue(error) });
      reject(error);
    });
    tar.once("close", (code, signal) => {
      if (diagnostic) logBackupDiagnostic(diagnostic, code === 0 ? "process-end" : "process-failed", { commandName: "tar", durationMs: Date.now() - processStartedAt, exitCode: code ?? 1, signal, stderr: code === 0 ? undefined : sanitizeDiagnosticValue(stderr.slice(-800)) });
      resolve(code ?? 1);
    });
  });
  const cancel = (error = new Error("Backup encerrado antes da conclusão; nenhum artefato foi validado.")) => {
    if (cancelled) return;
    cancelled = true;
    if (diagnostic) logBackupDiagnostic(diagnostic, "archive-cancelled", { reason: error?.message || "unknown" });
    stopTar();
    progressCounter.destroy(error);
    artifactCounter.destroy(error);
    output.destroy(error);
  };
  const completion = (async () => {
    try {
      if (diagnostic) logBackupDiagnostic(diagnostic, "encryption-start", { algorithm: "aes-256-gcm" });
      await pipeline(tar.stdout!, progressCounter, cipher, artifactCounter);
      const exitCode = await exitPromise;
      if (timedOut) throw new Error(`Cifragem do pacote ficou sem progresso por ${idleTimeoutMs} ms.`);
      throwIfBackupAborted(signal);
      if (exitCode !== 0) throw new Error(`tar terminou com código ${exitCode}: ${stderr.slice(-800)}`);
      const authTag = cipher.getAuthTag();
      artifactCounter.hash.update(authTag);
      artifactCounter.bytes += authTag.length;
      if (authTag.length !== BACKUP_ARCHIVE_AUTH_TAG_BYTES) throw new Error("Tamanho do auth tag inesperado.");
      output.write(authTag);
      output.end();
      const result = { bytes: artifactCounter.bytes, sha256: artifactCounter.hash.digest("hex") };
      if (diagnostic) logBackupDiagnostic(diagnostic, "encryption-end", { bytes: result.bytes, sha256: result.sha256 });
      return result;
    } catch (error) {
      if (diagnostic) logBackupDiagnostic(diagnostic, "archive-failed", { error: sanitizeDiagnosticValue(error) });
      cancel(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      clearTimeout(idleTimeout);
      tar.stdout?.removeListener("data", resetIdleTimeout);
      signal?.removeEventListener("abort", onAbort);
    }
  })();
  return { stream: output, completion, cancel };
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function verifyEncryptedArchiveStreamContent(
  body: Readable,
  expectedBytes: number,
  expectedSha256: string,
  signal?: AbortSignal,
): Promise<{ bytes: number; sha256: string }> {
  const magic = Buffer.from("WJBACK1\n", "utf8");
  const hash = createHash("sha256");
  let bytes = 0;
  let header = Buffer.alloc(0);
  let tail = Buffer.alloc(0);
  let decipher: any = null; // createDecipheriv(aes-256-gcm) exposes setAuthTag at runtime; Node typings widen the return type.

  for await (const chunkValue of body) {
    throwIfBackupAborted(signal);
    const raw = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue as Uint8Array);
    hash.update(raw);
    bytes += raw.length;

    let chunk = raw;
    if (!decipher) {
      header = Buffer.concat([header, chunk]);
      if (header.length < BACKUP_ARCHIVE_HEADER_BYTES) continue;
      if (!header.subarray(0, magic.length).equals(magic)) {
        throw new Error("Cabeçalho do backup cifrado é inválido.");
      }
      const iv = header.subarray(magic.length, BACKUP_ARCHIVE_HEADER_BYTES);
      decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
      chunk = header.subarray(BACKUP_ARCHIVE_HEADER_BYTES);
      header = Buffer.alloc(0);
    }

    if (chunk.length > 0) {
      const combined = tail.length > 0 ? Buffer.concat([tail, chunk]) : chunk;
      if (combined.length > BACKUP_ARCHIVE_AUTH_TAG_BYTES) {
        const splitAt = combined.length - BACKUP_ARCHIVE_AUTH_TAG_BYTES;
        decipher.update(combined.subarray(0, splitAt));
        tail = Buffer.from(combined.subarray(splitAt));
      } else {
        tail = Buffer.from(combined);
      }
    }
  }

  throwIfBackupAborted(signal);
  const sha256 = hash.digest("hex");
  if (bytes !== expectedBytes) {
    throw new Error(`Tamanho remoto divergente: esperado ${expectedBytes}, recebido ${bytes}.`);
  }
  if (sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error("SHA-256 remoto divergente do pacote criado.");
  }
  if (!decipher || tail.length !== BACKUP_ARCHIVE_AUTH_TAG_BYTES) {
    throw new Error("Pacote cifrado incompleto para validação AES-GCM.");
  }
  try {
    decipher.setAuthTag(tail);
    decipher.final();
  } catch {
    throw new Error("Falha de autenticação AES-GCM: o pacote armazenado não pode ser validado com a chave atual.");
  }
  return { bytes, sha256 };
}

async function verifyStoredBackupObject(
  artifactKey: string,
  expectedBytes: number,
  expectedSha256: string,
  signal?: AbortSignal,
): Promise<{ bytes: number; sha256: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    throwIfBackupAborted(signal);
    try {
      const body = toNodeReadable(await r2GetObjectStream(artifactKey));
      return await verifyEncryptedArchiveStreamContent(body, expectedBytes, expectedSha256, signal);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const deterministic = /SHA-256 remoto divergente|Tamanho remoto divergente|Cabeçalho do backup|AES-GCM|Pacote cifrado incompleto/i.test(message);
      if (deterministic || attempt >= 3 || signal?.aborted) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function throwIfBackupAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Backup encerrado antes da conclusão; nenhum artefato foi validado.");
}

async function updateRun(id: string, patch: Partial<InsertSystemBackup>) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para atualizar o histórico do backup.");
  await db.update(systemBackups).set(patch).where(eq(systemBackups.id, id));
}

const activeBackupControllers = new Map<string, AbortController>();

export function isBackupStale(updatedAt: Date | string | number | null | undefined, now = Date.now()): boolean {
  if (updatedAt === null || updatedAt === undefined) return false;
  const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
  return Number.isFinite(timestamp) && now - timestamp >= BACKUP_STALE_AFTER_MS;
}

export async function reconcileStaleSystemBackups(now = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const activeRows = await db
    .select({ id: systemBackups.id, status: systemBackups.status, stage: systemBackups.stage, progress: systemBackups.progress, updatedAt: systemBackups.updatedAt })
    .from(systemBackups)
    .where(inArray(systemBackups.status, ["queued", "running"]));
  const staleRows = activeRows.filter((row) => isBackupStale(row.updatedAt, now.getTime()));
  for (const row of staleRows) {
    activeBackupControllers.get(row.id)?.abort();
    await db.update(systemBackups).set({
      status: "failed",
      stage: "failed",
      progress: 0,
      errorMessage: `Execução encerrada por falta de atualização. Último estágio persistido: ${row.stage}. Último progresso persistido: ${row.progress}%. Causa do encerramento não determinada pelo processo recuperado; nenhum artefato foi validado.`,
    }).where(eq(systemBackups.id, row.id));
  }
  return staleRows.length;
}

export async function cancelSystemBackup(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para encerrar o backup.");
  const [row] = await db.select({ status: systemBackups.status }).from(systemBackups).where(eq(systemBackups.id, id)).limit(1);
  if (!row || (row.status !== "queued" && row.status !== "running")) return false;
  activeBackupControllers.get(id)?.abort();
  await db.update(systemBackups).set({
    status: "failed",
    stage: "failed",
    progress: 0,
    errorMessage: "Execução encerrada pelo administrador; nenhum artefato foi validado.",
  }).where(and(eq(systemBackups.id, id), inArray(systemBackups.status, ["queued", "running"])));
  return true;
}

export async function reconcileBackupsAfterRestart(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const activeRows = await db
    .select({ id: systemBackups.id, stage: systemBackups.stage, progress: systemBackups.progress })
    .from(systemBackups)
    .where(inArray(systemBackups.status, ["queued", "running"]));
  for (const row of activeRows) {
    await db.update(systemBackups).set({
      status: "failed",
      stage: "failed",
      progress: 0,
      errorMessage: `Execução interrompida após reinício do serviço. Último estágio persistido: ${row.stage}. Último progresso persistido: ${row.progress}%. Causa do encerramento da instância não determinada pelo processo recuperado; nenhum artefato foi validado.`,
    }).where(eq(systemBackups.id, row.id));
  }
  const completedRows = await db
    .select({ id: systemBackups.id, manifestJson: systemBackups.manifestJson })
    .from(systemBackups)
    .where(eq(systemBackups.status, "completed"));
  let interruptedVerifications = 0;
  for (const row of completedRows) {
    if (getBackupRemoteVerification(row.manifestJson).status !== "verifying") continue;
    interruptedVerifications += 1;
    await updateStoredBackupVerification(row.id, {
      status: "failed",
      verifiedAt: null,
      bytes: null,
      sha256: null,
      error: "Verificação profunda interrompida após reinício do serviço. Execute a verificação novamente.",
    });
  }
  return activeRows.length + interruptedVerifications;
}

async function listAllR2Objects(): Promise<R2ObjectInfo[]> {
  const objects: R2ObjectInfo[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await r2ListObjectsPage("", continuationToken);
    objects.push(...page.objects.filter((object) => !object.key.startsWith(BACKUP_ARTIFACT_PREFIX) && !object.key.startsWith("system-restores/")));
    continuationToken = page.nextContinuationToken || undefined;
  } while (continuationToken);
  return objects;
}

export type BackupRemoteVerificationStatus = "not_verified" | "verifying" | "verified" | "failed";
export type BackupRemoteVerification = {
  status: BackupRemoteVerificationStatus;
  verifiedAt: string | null;
  bytes: number | null;
  sha256: string | null;
  error: string | null;
};

const DEFAULT_REMOTE_VERIFICATION: BackupRemoteVerification = {
  status: "not_verified",
  verifiedAt: null,
  bytes: null,
  sha256: null,
  error: null,
};

export function getBackupRemoteVerification(manifestJson: string | null | undefined): BackupRemoteVerification {
  if (!manifestJson) return { ...DEFAULT_REMOTE_VERIFICATION };
  try {
    const parsed = JSON.parse(manifestJson) as { remoteVerification?: Partial<BackupRemoteVerification> };
    const candidate = parsed.remoteVerification;
    if (!candidate || !["not_verified", "verifying", "verified", "failed"].includes(String(candidate.status))) {
      return { ...DEFAULT_REMOTE_VERIFICATION };
    }
    return {
      status: candidate.status as BackupRemoteVerificationStatus,
      verifiedAt: typeof candidate.verifiedAt === "string" ? candidate.verifiedAt : null,
      bytes: typeof candidate.bytes === "number" ? candidate.bytes : null,
      sha256: typeof candidate.sha256 === "string" ? candidate.sha256 : null,
      error: typeof candidate.error === "string" ? candidate.error : null,
    };
  } catch {
    return { ...DEFAULT_REMOTE_VERIFICATION };
  }
}

function withBackupRemoteVerification(manifestJson: string | null | undefined, verification: BackupRemoteVerification): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = manifestJson ? JSON.parse(manifestJson) as Record<string, unknown> : {};
  } catch {
    parsed = {};
  }
  parsed.remoteVerification = verification;
  return JSON.stringify(parsed);
}

function summaryFromManifest(manifest: BackupManifest, archiveBytes: number, archiveSha256: string) {
  return JSON.stringify({
    formatVersion: manifest.formatVersion,
    backupId: manifest.backupId,
    generatedAt: manifest.generatedAt,
    sourceCommit: manifest.sourceCommit,
    database: {
      dumpTool: manifest.database.dumpTool,
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

async function executeBackup(id: string, signal: AbortSignal): Promise<void> {
  const diagnostic: BackupDiagnosticContext = { backupId: id, stage: "queued", startedAt: Date.now() };
  activeBackupDiagnostics.set(id, diagnostic);
  const heartbeat = setInterval(() => {
    void updateRun(id, { updatedAt: new Date() }).catch(() => undefined);
  }, BACKUP_HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();
  const workDirectory = path.join("/tmp", `walk-ajuda-backup-${id}`);
  let diskMeasurementActive = false;
  const eventLoopMonitor: IntervalHistogram = monitorEventLoopDelay({ resolution: 20 });
  eventLoopMonitor.enable();
  const eventLoopHeartbeat = setInterval(() => {
    const delayMs = Math.round(eventLoopMonitor.max / 1_000_000);
    if (delayMs >= 500) logEventLoopDiagnostic(diagnostic, delayMs);
    eventLoopMonitor.reset();
  }, BACKUP_HEARTBEAT_INTERVAL_MS);
  eventLoopHeartbeat.unref?.();
  const resourceHeartbeat = setInterval(() => {
    logMemoryDiagnostic(diagnostic, "heartbeat");
    if (diagnostic.stage === "r2-upload" && !diskMeasurementActive) {
      diskMeasurementActive = true;
      void logDiskDiagnostic(diagnostic, workDirectory, diagnostic.stage)
        .catch(() => undefined)
        .finally(() => { diskMeasurementActive = false; });
    }
  }, BACKUP_HEARTBEAT_INTERVAL_MS);
  resourceHeartbeat.unref?.();
  const databaseFile = path.join(workDirectory, "database.sql");
  const sourceFile = path.join(workDirectory, "source.tar.gz");
  const filesDirectory = path.join(workDirectory, "files");
  const manifestFile = path.join(workDirectory, "manifest.json");

  try {
    getEncryptionKey();
    throwIfBackupAborted(signal);
    await mkdir(filesDirectory, { recursive: true });
    logBackupDiagnostic(diagnostic, "start", { sourceRoot: "configured", tempRoot: "backup-workspace" });
    logMemoryDiagnostic(diagnostic, "start");
    await logDiskDiagnostic(diagnostic, workDirectory, "queued");
    diagnostic.stage = "database";
    logBackupDiagnostic(diagnostic, "stage-start", { progress: 5 });
    logMemoryDiagnostic(diagnostic);
    await updateRun(id, { status: "running", stage: "database", progress: 5, startedAt: new Date(), errorMessage: null });
    const database = await dumpDatabase(databaseFile, diagnostic);
    logBackupDiagnostic(diagnostic, "stage-end", { stageName: "database", bytes: database.bytes, tableCount: database.tables.length });
    logMemoryDiagnostic(diagnostic);
    await logDiskDiagnostic(diagnostic, workDirectory, "database");
    diagnostic.stage = "r2-list";
    logBackupDiagnostic(diagnostic, "stage-start", { progress: 20 });
    await updateRun(id, { stage: "r2-list", progress: 20 });
    throwIfBackupAborted(signal);
    const r2Objects = await listAllR2Objects();
    logBackupDiagnostic(diagnostic, "stage-end", { stageName: "r2-list", objectCount: r2Objects.length });
    logMemoryDiagnostic(diagnostic);
    diagnostic.stage = "r2-download";
    logBackupDiagnostic(diagnostic, "stage-start", { progress: 20, objectCount: r2Objects.length });
    await updateRun(id, { stage: "r2-download", progress: 20 });
    const r2Entries: BackupR2Entry[] = [];
    let totalR2Bytes = 0;
    for (let index = 0; index < r2Objects.length; index += 1) {
      throwIfBackupAborted(signal);
      const object = r2Objects[index];
      const relativePath = safeBackupObjectPath(object.key);
      const result = await downloadR2Object(object.key, path.join(workDirectory, relativePath), object.size);
      r2Entries.push({ ...object, sha256: result.sha256 });
      totalR2Bytes += result.bytes;
      const progress = 20 + Math.floor(((index + 1) / Math.max(r2Objects.length, 1)) * 55);
      if (index === 0 || index % 10 === 0 || index === r2Objects.length - 1) {
        await updateRun(id, { stage: "r2-download", progress });
      }
    }
    logBackupDiagnostic(diagnostic, "stage-end", { stageName: "r2-download", objectCount: r2Entries.length, bytes: totalR2Bytes });
    logMemoryDiagnostic(diagnostic);
    await logDiskDiagnostic(diagnostic, workDirectory, "r2-download");

    diagnostic.stage = "source-snapshot";
    logBackupDiagnostic(diagnostic, "stage-start", { progress: 80 });
    await updateRun(id, { stage: "source-snapshot", progress: 80 });
    throwIfBackupAborted(signal);
    const source = await createSourceSnapshot(sourceFile, diagnostic);
    logBackupDiagnostic(diagnostic, "stage-end", { stageName: "source-snapshot", bytes: source.bytes });
    logMemoryDiagnostic(diagnostic);
    await logDiskDiagnostic(diagnostic, workDirectory, "source-snapshot");
    const sourceCommit = process.env.RENDER_GIT_COMMIT?.trim() || process.env.COMMIT_SHA?.trim() || "unknown";
    const generatedAt = new Date().toISOString();
    diagnostic.stage = "manifest";
    logBackupDiagnostic(diagnostic, "stage-start", { progress: 84 });
    await updateRun(id, { stage: "manifest", progress: 84 });
    const manifest: BackupManifest = {
      formatVersion: 1,
      backupId: id,
      generatedAt,
      sourceCommit,
      database: {
        engine: "mysql-compatible",
        dumpTool: "dumpling",
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
          "Dumpling concluído com código zero",
          "arquivos SQL do Dumpling ordenados e concatenados deterministicamente",
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
    logBackupDiagnostic(diagnostic, "stage-end", { stageName: "manifest", bytes: await getFileBytes(manifestFile) });
    logMemoryDiagnostic(diagnostic);
    await logDiskDiagnostic(diagnostic, workDirectory, "manifest");
    throwIfBackupAborted(signal);

    diagnostic.stage = "archive";
    logBackupDiagnostic(diagnostic, "stage-start", { progress: 88 });
    await updateRun(id, { stage: "archive", progress: 88 });
    await logDiskDiagnostic(diagnostic, workDirectory, "archive");
    diagnostic.stage = "archive-size";
    logBackupDiagnostic(diagnostic, "archive-size-pass-start", { progress: 88 });
    const plaintextTarBytes = await measureTarArchiveBytes(workDirectory, diagnostic);
    const expectedContentLength = encryptedArchiveLength(plaintextTarBytes);
    logBackupDiagnostic(diagnostic, "archive-size-pass-end", {
      plaintextTarBytes,
      expectedContentLength,
      overheadBytes: expectedContentLength - plaintextTarBytes,
    });
    diagnostic.stage = "archive";
    const archiveInputBytes = Math.max(plaintextTarBytes, 1);
    let lastArchiveProgressAt = 0;
    const encrypted = createEncryptedArchiveStream(workDirectory, signal, (processedBytes) => {
      const now = Date.now();
      if (now - lastArchiveProgressAt < 5_000) return;
      lastArchiveProgressAt = now;
      const progress = 88 + Math.min(6, Math.floor((processedBytes / archiveInputBytes) * 6));
      void updateRun(id, { stage: "archive", progress }).catch(() => undefined);
    }, diagnostic);
    const artifactKey = `${BACKUP_ARTIFACT_PREFIX}${id}.wajuda.enc`;
    const uploadOutcome = r2PutObjectStream(artifactKey, encrypted.stream, "application/octet-stream", expectedContentLength, { backupId: id, stage: "r2-upload" }).then(
      (result) => ({ result, error: null as Error | null }),
      (error) => {
        const failure = error instanceof Error ? error : new Error(String(error));
        encrypted.cancel(failure);
        return { result: null, error: failure };
      },
    );
    let archiveInfo: { bytes: number; sha256: string };
    try {
      archiveInfo = await encrypted.completion;
      if (archiveInfo.bytes !== expectedContentLength) {
        throw new Error(`Tamanho cifrado divergente: esperado ${expectedContentLength}, produzido ${archiveInfo.bytes}.`);
      }
      diagnostic.stage = "r2-upload";
      logBackupDiagnostic(diagnostic, "stage-start", { progress: 95, expectedBytes: archiveInfo.bytes });
      await updateRun(id, { stage: "r2-upload", progress: 95 });
      const uploadOutcomeResult = await uploadOutcome;
      if (uploadOutcomeResult.error) throw uploadOutcomeResult.error;
      logBackupDiagnostic(diagnostic, "stage-end", {
        stageName: "r2-upload",
        bytesSent: uploadOutcomeResult.result?.bytesSent ?? archiveInfo.bytes,
        httpStatus: uploadOutcomeResult.result?.httpStatus ?? null,
        etag: uploadOutcomeResult.result?.etag ?? null,
      });
    } catch (error) {
      await uploadOutcome;
      throw error;
    }
    throwIfBackupAborted(signal);
    diagnostic.stage = "verification";
    logBackupDiagnostic(diagnostic, "stage-start", { progress: 98, expectedBytes: archiveInfo.bytes });
    await updateRun(id, { stage: "verification", progress: 98 });
    const finalObject = await r2HeadObject(artifactKey);
    if (finalObject.contentLength !== archiveInfo.bytes) {
      throw new Error(`Tamanho final do objeto R2 divergente: esperado ${archiveInfo.bytes}, recebido ${finalObject.contentLength ?? "desconhecido"}.`);
    }
    const remoteVerification = await verifyStoredBackupObject(artifactKey, archiveInfo.bytes, archiveInfo.sha256, signal);
    const verifiedAt = new Date().toISOString();
    const finalSummary = withBackupRemoteVerification(
      summaryFromManifest(manifest, archiveInfo.bytes, archiveInfo.sha256),
      {
        status: "verified",
        verifiedAt,
        bytes: remoteVerification.bytes,
        sha256: remoteVerification.sha256,
        error: null,
      },
    );
    logBackupDiagnostic(diagnostic, "stage-end", {
      stageName: "verification",
      objectExists: true,
      expectedBytes: archiveInfo.bytes,
      actualBytes: finalObject.contentLength,
      remoteSha256: remoteVerification.sha256,
      aesGcmAuthenticated: true,
      httpStatus: finalObject.httpStatus,
      etag: finalObject.etag,
    });
    await updateRun(id, { artifactKey, fileSize: archiveInfo.bytes, archiveSha256: archiveInfo.sha256, manifestJson: finalSummary });
    throwIfBackupAborted(signal);
    await updateRun(id, {
      status: "completed",
      stage: "completed",
      progress: 100,
      completedAt: new Date(),
      manifestJson: finalSummary,
    });
    logBackupDiagnostic(diagnostic, "completed", { archiveBytes: archiveInfo.bytes, archiveSha256: archiveInfo.sha256 });
  } catch (error) {
    const message = sanitizeDiagnosticValue(error) || "Falha desconhecida no backup.";
    logBackupDiagnostic(diagnostic, "failed", { error: message });
    logMemoryDiagnostic(diagnostic, "failed-memory");
    await updateRun(id, {
      status: "failed",
      stage: "failed",
      progress: 0,
      errorMessage: message.slice(0, 1000),
    }).catch(() => undefined);
  } finally {
    clearInterval(heartbeat);
    clearInterval(resourceHeartbeat);
    clearInterval(eventLoopHeartbeat);
    eventLoopMonitor.disable();
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
    await logDiskDiagnostic(diagnostic, workDirectory, "cleanup").catch(() => undefined);
    logMemoryDiagnostic(diagnostic, "cleanup-memory");
    activeBackupControllers.delete(id);
    activeBackupDiagnostics.delete(id);
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
  const controller = new AbortController();
  activeBackupControllers.set(id, controller);
  void executeBackup(id, controller.signal);
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
    integrityStatus: getBackupRemoteVerification(row.manifestJson).status,
    integrityVerifiedAt: getBackupRemoteVerification(row.manifestJson).verifiedAt,
    integrityError: getBackupRemoteVerification(row.manifestJson).error,
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
    integrityStatus: getBackupRemoteVerification(row.manifestJson).status,
    integrityVerifiedAt: getBackupRemoteVerification(row.manifestJson).verifiedAt,
    integrityError: getBackupRemoteVerification(row.manifestJson).error,
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

const activeStoredBackupVerifications = new Set<string>();

async function updateStoredBackupVerification(id: string, verification: BackupRemoteVerification) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para atualizar a verificação do backup.");
  const [row] = await db.select({ manifestJson: systemBackups.manifestJson }).from(systemBackups).where(eq(systemBackups.id, id)).limit(1);
  if (!row) throw new Error("Backup não encontrado.");
  await db.update(systemBackups).set({
    manifestJson: withBackupRemoteVerification(row.manifestJson, verification),
  }).where(eq(systemBackups.id, id));
}

export async function startStoredSystemBackupVerification(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para verificar o backup.");
  const [row] = await db.select({
    status: systemBackups.status,
    artifactKey: systemBackups.artifactKey,
    fileSize: systemBackups.fileSize,
    archiveSha256: systemBackups.archiveSha256,
    manifestJson: systemBackups.manifestJson,
  }).from(systemBackups).where(eq(systemBackups.id, id)).limit(1);
  if (!row || row.status !== "completed" || !row.artifactKey || row.fileSize === null || row.fileSize === undefined || !row.archiveSha256) {
    throw new Error("Somente backups concluídos com tamanho e SHA-256 podem ser verificados.");
  }
  if (activeStoredBackupVerifications.has(id) || getBackupRemoteVerification(row.manifestJson).status === "verifying") {
    return { accepted: false as const, id };
  }
  activeStoredBackupVerifications.add(id);
  await updateStoredBackupVerification(id, {
    status: "verifying",
    verifiedAt: null,
    bytes: null,
    sha256: null,
    error: null,
  });
  void (async () => {
    try {
      const verified = await verifyStoredBackupObject(row.artifactKey!, Number(row.fileSize), row.archiveSha256!);
      await updateStoredBackupVerification(id, {
        status: "verified",
        verifiedAt: new Date().toISOString(),
        bytes: verified.bytes,
        sha256: verified.sha256,
        error: null,
      });
    } catch (error) {
      const message = sanitizeDiagnosticValue(error) || "Falha desconhecida na verificação profunda.";
      await updateStoredBackupVerification(id, {
        status: "failed",
        verifiedAt: null,
        bytes: null,
        sha256: null,
        error: message.slice(0, 1000),
      }).catch(() => undefined);
    } finally {
      activeStoredBackupVerifications.delete(id);
    }
  })();
  return { accepted: true as const, id };
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
