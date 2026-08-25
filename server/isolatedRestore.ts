import { createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, readdir, rm, stat, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import {
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { parseDatabaseUrl, safeBackupObjectPath, type BackupManifest } from "./backupService";

const MAGIC = Buffer.from("WJBACK1\n", "utf8");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const MAX_ERROR_LENGTH = 800;
const MYSQL_CLIENT = process.env.RESTORE_MYSQL_CLIENT?.trim() || "mysql";

export type IsolatedRestoreOptions = {
  encryptedFile: string;
  outputDir: string;
  dryRun: boolean;
};

type DatabaseTarget = ReturnType<typeof parseDatabaseUrl>;

type RestoreManifest = Pick<BackupManifest, "formatVersion" | "backupId" | "database" | "r2" | "source">;

type FileDigest = { bytes: number; sha256: string };

type DatabaseCheck = {
  expectedTableCount: number;
  actualTableCount: number;
  missingTables: string[];
  unexpectedTables: string[];
  exactRowCounts: Record<string, number> | null;
};

type R2Check = {
  expectedObjects: number;
  uploadedObjects: number;
  expectedBytes: number;
  uploadedBytes: number;
  prefix: string;
};

function getEncryptionKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim() || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) {
    throw new Error("BACKUP_ENCRYPTION_KEY deve ser hexadecimal de 64 caracteres.");
  }
  return Buffer.from(raw, "hex");
}

function cleanError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[\r\n]+/g, " ").slice(-MAX_ERROR_LENGTH);
}

function normalizeEndpoint(raw: string): string {
  return raw.replace(/[\r\n\s]+/g, "").replace(/\/+$/, "");
}

function normalizePrefix(raw: string): string {
  const value = raw.trim().replace(/^\/+|\/+$/g, "");
  if (!value || value.split("/").some((part) => part === ".." || part === "." || part.includes("\\") || part.includes("\0"))) {
    throw new Error("RESTORE_R2_PREFIX deve ser um prefixo isolado não vazio.");
  }
  return value;
}

function quoteIdentifier(value: string): string {
  if (!value || /[\0\r\n]/.test(value)) throw new Error("Identificador SQL inválido no manifesto.");
  return `\`${value.replace(/`/g, "``")}\``;
}

async function sha256File(filePath: string): Promise<FileDigest> {
  const hash = createHash("sha256");
  let bytes = 0;
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    hash.update(buffer);
    bytes += buffer.length;
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function runProcess(command: string, args: string[], stdoutFile?: string): Promise<void> {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
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
      else reject(new Error(`${command} terminou com código ${code ?? "desconhecido"}: ${cleanError(stderr)}`));
    });
  });
  await Promise.all([outputPromise, exitPromise]);
}

async function runMysqlImport(databaseFile: string, target: DatabaseTarget): Promise<void> {
  const args = [
    "--protocol=TCP",
    `--host=${target.host}`,
    `--port=${target.port}`,
    `--user=${target.user}`,
    "--binary-mode=1",
    "--max-allowed-packet=1G",
  ];
  if (target.useTls) args.push("--ssl");

  const child = spawn(MYSQL_CLIENT, args, {
    stdio: ["pipe", "ignore", "pipe"],
    shell: false,
    env: { ...process.env, MYSQL_PWD: target.password },
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-4000);
  });
  const inputPromise = pipeline(createReadStream(databaseFile), child.stdin!);
  const exitPromise = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Importação SQL falhou com código ${code ?? "desconhecido"}: ${cleanError(stderr)}`));
    });
  });
  await Promise.all([inputPromise, exitPromise]);
}

async function decryptArchive(encryptedFile: string, tarFile: string): Promise<void> {
  const key = getEncryptionKey();
  const handle = await open(encryptedFile, "r");
  try {
    const encryptedStat = await handle.stat();
    const minimumSize = MAGIC.length + IV_LENGTH + TAG_LENGTH + 1;
    if (encryptedStat.size < minimumSize) throw new Error("Pacote cifrado demasiado pequeno.");

    const header = Buffer.alloc(MAGIC.length + IV_LENGTH);
    await handle.read(header, 0, header.length, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Formato de backup desconhecido.");

    const authTag = Buffer.alloc(TAG_LENGTH);
    await handle.read(authTag, 0, TAG_LENGTH, encryptedStat.size - TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(MAGIC.length));
    decipher.setAuthTag(authTag);

    await pipeline(
      createReadStream(encryptedFile, { start: header.length, end: encryptedStat.size - TAG_LENGTH - 1 }),
      decipher,
      createWriteStream(tarFile, { flags: "wx" }),
    );
  } finally {
    await handle.close();
  }
}

export function normalizeArchiveEntry(entry: string): string {
  return entry.replace(/^\.\/+/, "").replace(/\/$/, "");
}

export function validateArchiveEntries(entries: string[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    const normalized = normalizeArchiveEntry(entry);
    if (!normalized) continue;
    if (seen.has(normalized)) throw new Error(`Entrada duplicada no pacote: ${entry}`);
    seen.add(normalized);
    if (normalized.startsWith("/") || normalized.includes("\\") || normalized.split("/").includes("..")) {
      throw new Error(`Entrada insegura no pacote: ${entry}`);
    }
    const allowed = normalized === "database.sql"
      || normalized === "source.tar.gz"
      || normalized === "manifest.json"
      || normalized === "files"
      || normalized.startsWith("files/");
    if (!allowed) throw new Error(`Entrada inesperada no pacote: ${entry}`);
  }
}

function validateTarTypes(verboseEntries: string[]): void {
  for (const line of verboseEntries) {
    const type = line.trimStart().slice(0, 1);
    if (type && type !== "d" && type !== "-") {
      throw new Error("O pacote contém link ou tipo de ficheiro não permitido.");
    }
  }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const items = await readdir(current, { withFileTypes: true });
  const result: string[] = [];
  for (const item of items) {
    const full = path.join(current, item.name);
    const info = await lstat(full);
    if (info.isSymbolicLink() || info.isBlockDevice() || info.isCharacterDevice() || info.isSocket() || info.isFIFO()) {
      throw new Error(`Tipo de ficheiro não permitido em ${path.relative(root, full)}.`);
    }
    if (item.isDirectory()) result.push(...await listFiles(root, full));
    else if (info.isFile()) result.push(path.relative(root, full).split(path.sep).join("/"));
    else throw new Error(`Entrada não regular em ${path.relative(root, full)}.`);
  }
  return result;
}

async function extractValidatedArchive(tarFile: string, destination: string): Promise<void> {
  const entriesFile = path.join(destination, ".archive-entries.txt");
  const verboseFile = path.join(destination, ".archive-verbose.txt");
  await runProcess("tar", ["-tf", tarFile], entriesFile);
  await runProcess("tar", ["-tvf", tarFile], verboseFile);
  const entries = (await readFile(entriesFile, "utf8")).split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  validateArchiveEntries(entries);
  validateTarTypes((await readFile(verboseFile, "utf8")).split(/\r?\n/).filter(Boolean));
  await mkdir(path.join(destination, "payload"), { recursive: true });
  await runProcess("tar", [
    "-xpf",
    tarFile,
    "--no-same-owner",
    "--no-same-permissions",
    "--no-overwrite-dir",
    "-C",
    path.join(destination, "payload"),
    "./database.sql",
    "./source.tar.gz",
    "./manifest.json",
    "./files",
  ]);
}

function validateManifest(raw: unknown): RestoreManifest {
  if (!raw || typeof raw !== "object") throw new Error("Manifesto ausente ou inválido.");
  const manifest = raw as Partial<RestoreManifest>;
  if (manifest.formatVersion !== 1 || typeof manifest.backupId !== "string" || !/^[a-f0-9]{48}$/i.test(manifest.backupId)) {
    throw new Error("Versão ou ID do manifesto inválido.");
  }
  if (!manifest.database || !manifest.r2 || !manifest.source) throw new Error("Manifesto incompleto.");
  if (typeof manifest.database.databaseName !== "string" || !/^[A-Za-z0-9_$-]+$/.test(manifest.database.databaseName)) {
    throw new Error("Nome lógico do banco inválido no manifesto.");
  }
  if (!Array.isArray(manifest.database.tables) || !Array.isArray(manifest.r2.objects)) {
    throw new Error("Manifesto sem tabelas ou objetos R2.");
  }
  if (!Number.isInteger(manifest.database.tableCount) || manifest.database.tableCount < 0) throw new Error("Quantidade de tabelas inválida.");
  if (manifest.database.tableCount !== manifest.database.tables.length) throw new Error("Contagem de tabelas divergente no manifesto.");
  if (!Number.isInteger(manifest.r2.objectCount) || manifest.r2.objectCount < 0) throw new Error("Quantidade de objetos R2 inválida.");
  if (manifest.r2.objectCount !== manifest.r2.objects.length) throw new Error("Contagem de objetos divergente no manifesto.");
  if (!Number.isInteger(manifest.r2.totalBytes) || manifest.r2.totalBytes < 0) throw new Error("Tamanho total do R2 inválido.");
  if (!Number.isInteger(manifest.database.dumpBytes) || manifest.database.dumpBytes < 0) throw new Error("Tamanho do dump inválido.");
  if (!Number.isInteger(manifest.source.bytes) || manifest.source.bytes < 0) throw new Error("Tamanho do snapshot inválido.");
  if (!/^[a-f0-9]{64}$/i.test(manifest.database.dumpSha256)) throw new Error("Hash do dump inválido.");
  if (!/^[a-f0-9]{64}$/i.test(manifest.source.sha256)) throw new Error("Hash do código inválido.");

  const tableNames = new Set<string>();
  for (const table of manifest.database.tables) {
    if (!table || typeof table.name !== "string" || !table.name || /[\0\r\n]/.test(table.name)) throw new Error("Nome de tabela inválido no manifesto.");
    if (tableNames.has(table.name)) throw new Error("Tabela duplicada no manifesto.");
    tableNames.add(table.name);
  }

  const objectKeys = new Set<string>();
  for (const object of manifest.r2.objects) {
    if (!object || typeof object.key !== "string" || objectKeys.has(object.key)) throw new Error("Chave R2 duplicada ou inválida.");
    if (!Number.isInteger(object.size) || object.size < 0 || !/^[a-f0-9]{64}$/i.test(object.sha256)) throw new Error("Metadado de objeto R2 inválido.");
    safeBackupObjectPath(object.key);
    objectKeys.add(object.key);
  }
  return manifest as RestoreManifest;
}

async function validatePayload(payloadRoot: string, manifest: RestoreManifest): Promise<void> {
  const databaseFile = path.join(payloadRoot, "database.sql");
  const sourceFile = path.join(payloadRoot, "source.tar.gz");
  const manifestFile = path.join(payloadRoot, "manifest.json");
  const database = await sha256File(databaseFile);
  if (database.bytes !== manifest.database.dumpBytes || database.sha256 !== manifest.database.dumpSha256) {
    throw new Error("Hash ou tamanho do database.sql não confere com o manifesto.");
  }
  const source = await sha256File(sourceFile);
  if (source.bytes !== manifest.source.bytes || source.sha256 !== manifest.source.sha256) {
    throw new Error("Hash ou tamanho do source.tar.gz não confere com o manifesto.");
  }
  const filesRoot = path.join(payloadRoot, "files");
  const actualFiles = await listFiles(filesRoot);
  const expectedFiles = manifest.r2.objects.map((object) => safeBackupObjectPath(object.key).replace(/^files\//, "")).sort();
  if (actualFiles.slice().sort().join("\n") !== expectedFiles.join("\n")) {
    throw new Error("A lista de objetos R2 extraídos não confere com o manifesto.");
  }
  let totalBytes = 0;
  for (const object of manifest.r2.objects) {
    const relative = safeBackupObjectPath(object.key);
    const digest = await sha256File(path.join(payloadRoot, relative));
    if (digest.bytes !== object.size || digest.sha256 !== object.sha256) {
      throw new Error(`Hash ou tamanho divergente no objeto R2 ${object.key}.`);
    }
    totalBytes += digest.bytes;
  }
  if (totalBytes !== manifest.r2.totalBytes) throw new Error("Tamanho total de objetos R2 divergente.");
  await stat(manifestFile);
}

async function extractSourceSnapshot(sourceFile: string, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const entriesFile = path.join(outputDir, ".source-entries.txt");
  const verboseFile = path.join(outputDir, ".source-verbose.txt");
  await runProcess("tar", ["-tzf", sourceFile], entriesFile);
  await runProcess("tar", ["-tvzf", sourceFile], verboseFile);
  const entries = (await readFile(entriesFile, "utf8")).split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  for (const entry of entries) {
    const normalized = normalizeArchiveEntry(entry);
    if (normalized.startsWith("/") || normalized.includes("\\") || normalized.split("/").includes("..")) {
      throw new Error(`Entrada insegura no snapshot de código: ${entry}`);
    }
  }
  validateTarTypes((await readFile(verboseFile, "utf8")).split(/\r?\n/).filter(Boolean));
  await runProcess("tar", ["-xzf", sourceFile, "--no-same-owner", "--no-same-permissions", "--no-overwrite-dir", "-C", outputDir]);
  await listFiles(outputDir);
}

function sameDatabaseTarget(a: DatabaseTarget, b: DatabaseTarget): boolean {
  return a.host.toLowerCase() === b.host.toLowerCase()
    && a.port === b.port
    && a.database === b.database;
}

export function assertIsolatedConfirmation(): void {
  if (process.env.RESTORE_MODE !== "isolated") {
    throw new Error("Restore bloqueado: defina RESTORE_MODE=isolated.");
  }
  if (process.env.RESTORE_CONFIRM !== "I_UNDERSTAND_THIS_ISOLATED_TARGET") {
    throw new Error("Restore bloqueado: confirme explicitamente o destino isolado em RESTORE_CONFIRM.");
  }
  const label = process.env.RESTORE_TARGET_LABEL?.trim() || "";
  if (!label || /prod|live|produção|producao/i.test(label)) {
    throw new Error("Restore bloqueado: RESTORE_TARGET_LABEL deve identificar um ambiente não produtivo.");
  }
}

function getIsolatedDatabaseTarget(manifest: RestoreManifest): DatabaseTarget {
  const raw = process.env.RESTORE_DATABASE_URL?.trim();
  if (!raw) throw new Error("Defina RESTORE_DATABASE_URL para o banco temporário.");
  const target = parseDatabaseUrl(raw);
  if (target.database !== manifest.database.databaseName) {
    throw new Error("O banco temporário deve usar o mesmo nome lógico do manifesto; renomeação não é suportada.");
  }
  const liveRaw = process.env.DATABASE_URL?.trim();
  if (liveRaw) {
    let live: DatabaseTarget;
    try {
      live = parseDatabaseUrl(liveRaw);
    } catch {
      throw new Error("DATABASE_URL do ambiente atual não pôde ser comparada; restore bloqueado.");
    }
    if (sameDatabaseTarget(target, live)) throw new Error("Restore bloqueado: alvo coincide com DATABASE_URL.");
  }
  return target;
}

function getIsolatedR2Target() {
  const endpoint = normalizeEndpoint(process.env.RESTORE_R2_ENDPOINT || "");
  const accessKeyId = process.env.RESTORE_R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.RESTORE_R2_SECRET_ACCESS_KEY?.trim() || "";
  const bucket = process.env.RESTORE_R2_BUCKET_NAME?.trim() || "";
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Defina RESTORE_R2_ENDPOINT, RESTORE_R2_ACCESS_KEY_ID, RESTORE_R2_SECRET_ACCESS_KEY e RESTORE_R2_BUCKET_NAME.");
  }
  const productionBucket = process.env.R2_BUCKET_NAME?.trim() || "";
  if (productionBucket && bucket === productionBucket) {
    throw new Error("Restore bloqueado: bucket R2 de destino coincide com o bucket de produção.");
  }
  const protocol = new URL(endpoint).protocol;
  if (protocol !== "https:" && !(/^(localhost|127\.0\.0\.1|::1)$/i.test(new URL(endpoint).hostname) && process.env.RESTORE_ALLOW_INSECURE_LOCAL_R2 === "1")) {
    throw new Error("RESTORE_R2_ENDPOINT deve usar HTTPS, salvo teste local explicitamente permitido.");
  }
  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

function createRestoreR2Client(target: ReturnType<typeof getIsolatedR2Target>): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: target.endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: target.accessKeyId, secretAccessKey: target.secretAccessKey },
  });
}

async function checkDatabase(connection: Awaited<ReturnType<typeof import("mysql2/promise").createConnection>>, manifest: RestoreManifest): Promise<DatabaseCheck> {
  const [rows] = await connection.query(
    "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
    [manifest.database.databaseName],
  );
  const actualTables = (rows as Array<{ tableName: string }>).map((row) => String(row.tableName));
  const expected = manifest.database.tables.map((table) => table.name);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actualTables);
  const missingTables = expected.filter((name) => !actualSet.has(name));
  const unexpectedTables = actualTables.filter((name) => !expectedSet.has(name));

  let exactRowCounts: Record<string, number> | null = null;
  if (process.env.RESTORE_EXACT_ROW_COUNTS === "1" && missingTables.length === 0 && unexpectedTables.length === 0) {
    exactRowCounts = {};
    for (const table of expected) {
      const tableName = quoteIdentifier(table);
      const databaseName = quoteIdentifier(manifest.database.databaseName);
      const [countRows] = await connection.query(`SELECT COUNT(*) AS rowCount FROM ${databaseName}.${tableName}`);
      exactRowCounts[table] = Number((countRows as Array<{ rowCount: number | string }>)[0]?.rowCount || 0);
    }
  }
  if (missingTables.length || unexpectedTables.length) {
    throw new Error(`Schema restaurado divergente: faltam ${missingTables.length} tabela(s) e sobram ${unexpectedTables.length}.`);
  }
  return {
    expectedTableCount: expected.length,
    actualTableCount: actualTables.length,
    missingTables,
    unexpectedTables,
    exactRowCounts,
  };
}

function remoteKey(prefix: string, key: string): string {
  return prefix ? `${prefix}/${key}` : key;
}

async function putAndCheckObject(client: S3Client, bucket: string, key: string, sourceFile: string, digest: FileDigest): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(sourceFile),
    ContentLength: digest.bytes,
    ContentType: "application/octet-stream",
    Metadata: { sha256: digest.sha256 },
  }));
  const head: HeadObjectCommandOutput = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const remoteSize = Number(head.ContentLength || 0);
  const remoteHash = head.Metadata?.sha256?.toLowerCase() || "";
  if (remoteSize !== digest.bytes || remoteHash !== digest.sha256) {
    throw new Error(`Verificação remota divergente no objeto ${key}.`);
  }
}

async function restoreR2Files(payloadRoot: string, manifest: RestoreManifest): Promise<R2Check> {
  const target = getIsolatedR2Target();
  const prefix = normalizePrefix(process.env.RESTORE_R2_PREFIX || `restore-tests/${manifest.backupId}`);
  const client = createRestoreR2Client(target);
  let uploadedObjects = 0;
  let uploadedBytes = 0;
  try {
    const existing = await client.send(new ListObjectsV2Command({ Bucket: target.bucket, Prefix: `${prefix}/`, MaxKeys: 1 }));
    if ((existing.KeyCount || 0) > 0) throw new Error("RESTORE_R2_PREFIX já contém objetos; escolha um prefixo novo.");
    for (const object of manifest.r2.objects) {
      const sourceFile = path.join(payloadRoot, safeBackupObjectPath(object.key));
      const digest = await sha256File(sourceFile);
      await putAndCheckObject(client, target.bucket, remoteKey(prefix, object.key), sourceFile, digest);
      uploadedObjects += 1;
      uploadedBytes += digest.bytes;
    }
  } finally {
    client.destroy();
  }
  if (uploadedObjects !== manifest.r2.objectCount || uploadedBytes !== manifest.r2.totalBytes) {
    throw new Error("Quantidade ou tamanho dos objetos enviados ao R2 temporário diverge do manifesto.");
  }
  return {
    expectedObjects: manifest.r2.objectCount,
    uploadedObjects,
    expectedBytes: manifest.r2.totalBytes,
    uploadedBytes,
    prefix,
  };
}

export async function restoreSystemBackup(options: IsolatedRestoreOptions) {
  if (!options.encryptedFile || !options.outputDir) throw new Error("Arquivo e pasta de saída são obrigatórios.");
  const encryptedFile = path.resolve(options.encryptedFile);
  const outputDir = path.resolve(options.outputDir);
  if (outputDir === path.resolve(process.cwd())) throw new Error("Pasta de saída não pode ser a raiz do projeto.");
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const runId = randomBytes(12).toString("hex");
  const workDir = path.join(outputDir, `.restore-work-${runId}`);
  const tarFile = path.join(workDir, "backup.tar");
  const payloadRoot = path.join(workDir, "payload");
  const sourceOutput = path.join(outputDir, `source-${runId}`);

  try {
    await stat(encryptedFile);
    await mkdir(workDir, { recursive: true });
    await decryptArchive(encryptedFile, tarFile);
    await extractValidatedArchive(tarFile, workDir);
    const manifest = validateManifest(JSON.parse(await readFile(path.join(payloadRoot, "manifest.json"), "utf8")));
    await validatePayload(payloadRoot, manifest);

    const sourceDigest = await sha256File(path.join(payloadRoot, "source.tar.gz"));
    await extractSourceSnapshot(path.join(payloadRoot, "source.tar.gz"), sourceOutput);
    const report: Record<string, unknown> = {
      status: options.dryRun ? "dry_run_approved" : "validated_before_restore",
      backupId: manifest.backupId,
      sourceCommit: manifest.source.commit,
      database: {
        expectedTableCount: manifest.database.tableCount,
        dumpBytes: manifest.database.dumpBytes,
        dumpSha256: manifest.database.dumpSha256,
      },
      r2: {
        expectedObjects: manifest.r2.objectCount,
        expectedBytes: manifest.r2.totalBytes,
      },
      source: { bytes: sourceDigest.bytes, sha256: sourceDigest.sha256, outputDir: sourceOutput },
      checks: ["AES-256-GCM", "entradas tar seguras", "manifesto", "SHA-256 do SQL", "SHA-256 do código", "SHA-256 de todos os objetos R2"],
    };

    if (!options.dryRun) {
      assertIsolatedConfirmation();
      const databaseTarget = getIsolatedDatabaseTarget(manifest);
      const connection = await import("mysql2/promise").then(({ createConnection }) => createConnection({
        host: databaseTarget.host,
        port: Number(databaseTarget.port),
        user: databaseTarget.user,
        password: databaseTarget.password,
        ...(databaseTarget.useTls ? { ssl: {} } : {}),
      }));
      try {
        const [existingRows] = await connection.query(
          "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? LIMIT 1",
          [databaseTarget.database],
        );
        if ((existingRows as Array<{ tableName: string }>).length > 0) {
          throw new Error("Banco temporário não está vazio; restore interrompido.");
        }
        await runMysqlImport(path.join(payloadRoot, "database.sql"), databaseTarget);
        const databaseCheck = await checkDatabase(connection, manifest);
        report.database = { ...report.database as object, ...databaseCheck };
      } finally {
        await connection.end();
      }
      report.r2 = { ...report.r2 as object, ...(await restoreR2Files(payloadRoot, manifest)) };
      report.status = "restored_isolated";
      report.targetLabel = process.env.RESTORE_TARGET_LABEL?.trim();
    }

    const reportFile = path.join(outputDir, `restore-report-${manifest.backupId}.json`);
    await writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");
    return { ...report, reportFile };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseRestoreArgs(argv);
  const result = await restoreSystemBackup(options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export function parseRestoreArgs(argv: string[]): IsolatedRestoreOptions {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const encryptedFile = args[0] || "";
  let outputDir = "";
  let dryRun = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--output") outputDir = args[++index] || "";
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  if (!encryptedFile || !outputDir) {
    throw new Error("Uso: pnpm run restore:isolated -- <backup.wajuda.enc> --output <pasta> [--dry-run]");
  }
  return { encryptedFile, outputDir, dryRun };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error("Restore isolado reprovado:", cleanError(error));
    process.exit(1);
  });
}
