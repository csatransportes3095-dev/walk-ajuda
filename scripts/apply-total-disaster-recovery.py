from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_all(path: str, old: str, new: str, minimum: int = 1):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f"anchor found {count} times in {path}, expected >= {minimum}: {old[:180]!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")


kit_ts = r'''import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const DISASTER_RECOVERY_VERSION = 1 as const;
export const DISASTER_RECOVERY_DIRECTORY = "recovery";
export const DISASTER_RECOVERY_ENV_FILE = "recovery/environment.json";
export const DISASTER_RECOVERY_TOOL_FILE = "recovery/h2-recovery-bootstrap.mjs";
export const DISASTER_RECOVERY_GUIDE_FILE = "recovery/H2_TOTAL_RECOVERY_GUIDE.txt";

const SOURCE_EXTENSIONS = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "dist", ".vite", ".cache", "coverage", "tmp", "temp"]);
const NEVER_ARCHIVE_ENV = new Set([
  "BACKUP_ENCRYPTION_KEY",
  "BACKUP_RESTORE_ENABLED",
  "PORT",
  "NODE_ENV",
  "PATH",
  "HOME",
  "HOSTNAME",
  "PWD",
  "SHLVL",
  "TERM",
  "USER",
  "CI",
]);
const NEVER_ARCHIVE_PREFIXES = ["RESTORE_", "RENDER_", "GITHUB_", "RUNNER_", "ACTIONS_", "PNPM_", "NPM_CONFIG_"];
const CORE_RECOVERY_ENV = [
  "DATABASE_URL",
  "JWT_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_ENDPOINT",
  "R2_BUCKET_NAME",
] as const;
const ALWAYS_DISCOVER_ENV = [
  ...CORE_RECOVERY_ENV,
  "R2_PUBLIC_URL",
  "VITE_APP_ID",
  "OAUTH_SERVER_URL",
  "OWNER_OPEN_ID",
  "BUILT_IN_FORGE_API_URL",
  "BUILT_IN_FORGE_API_KEY",
  "SITE_GENERAL_PASSWORD",
  "ZOHO_ORG_ID",
  "ZOHO_CLIENT_ID",
  "ZOHO_CLIENT_SECRET",
  "ZOHO_REFRESH_TOKEN",
  "ZOHO_EMAIL_PASSWORD",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "GMAIL_APP_PASSWORD",
  "RESEND_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "CHAT_AI_ENABLED",
  "GOOGLE_DRIVE_FOLDER_ID",
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "GOOGLE_DRIVE_REFRESH_TOKEN",
  "ADMIN_LOAN_EDIT_PASSWORD",
  "H2ADS_PROXY_ENCRYPTION_KEY",
  "BACKUP_DUMPLING_BINARY",
  "BACKUP_DUMPLING_CA_PATH",
  "BACKUP_DUMPLING_CERT_PATH",
  "BACKUP_DUMPLING_KEY_PATH",
  "BACKUP_MARIADB_BINARY",
  "ELEVENLABS_API_KEY",
] as const;

export type DisasterRecoveryFile = {
  role: "environment" | "bootstrap" | "guide" | "tls-ca" | "tls-cert" | "tls-key";
  path: string;
  bytes: number;
  sha256: string;
  sourceVariable?: string;
};

export type DisasterRecoveryManifest = {
  version: 1;
  generatedAt: string;
  environmentVariableCount: number;
  missingCriticalVariables: string[];
  files: DisasterRecoveryFile[];
  backupEncryptionKeyStored: false;
  externalKeyRequired: true;
};

export type RecoveryDriveKitState = {
  status: "not_uploaded" | "completed" | "failed";
  uploadedAt: string | null;
  files: Array<{ name: string; id: string }>;
  error: string | null;
};

function sha256Buffer(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath: string) {
  return sha256Buffer(await readFile(filePath));
}

export function isRecoverableEnvironmentName(name: string) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return false;
  if (NEVER_ARCHIVE_ENV.has(name)) return false;
  if (NEVER_ARCHIVE_PREFIXES.some((prefix) => name.startsWith(prefix))) return false;
  return true;
}

export function selectDisasterRecoveryEnvironment(
  env: NodeJS.ProcessEnv,
  referencedNames: Iterable<string> = ALWAYS_DISCOVER_ENV,
) {
  const names = new Set<string>([...ALWAYS_DISCOVER_ENV, ...referencedNames]);
  const variables: Record<string, string> = {};
  for (const name of [...names].sort()) {
    if (!isRecoverableEnvironmentName(name)) continue;
    const value = env[name];
    if (typeof value !== "string" || value.length === 0) continue;
    variables[name] = value;
  }
  return variables;
}

async function discoverReferencedEnvironmentNames(root: string) {
  const names = new Set<string>(ALWAYS_DISCOVER_ENV);
  const direct = /process\.env\.([A-Z][A-Z0-9_]*)/g;
  const bracket = /process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g;
  const visit = async (directory: string): Promise<void> => {
    let entries: import("node:fs").Dirent[] = [];
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) await visit(path.join(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.test(entry.name)) continue;
      const filePath = path.join(directory, entry.name);
      try {
        const info = await stat(filePath);
        if (info.size > 2 * 1024 * 1024) continue;
        const source = await readFile(filePath, "utf8");
        for (const pattern of [direct, bracket]) {
          pattern.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(source))) names.add(match[1]);
        }
      } catch { /* arquivo alterado durante a varredura */ }
    }
  };
  await visit(root);
  return names;
}

async function describeFile(role: DisasterRecoveryFile["role"], absolutePath: string, relativePath: string, sourceVariable?: string) {
  const info = await stat(absolutePath);
  return {
    role,
    path: relativePath.replace(/\\/g, "/"),
    bytes: info.size,
    sha256: await sha256File(absolutePath),
    ...(sourceVariable ? { sourceVariable } : {}),
  } satisfies DisasterRecoveryFile;
}

async function captureConfiguredTlsFiles(recoveryDirectory: string) {
  const definitions: Array<{ variable: string; role: DisasterRecoveryFile["role"] }> = [
    { variable: "BACKUP_DUMPLING_CA_PATH", role: "tls-ca" },
    { variable: "BACKUP_DUMPLING_CERT_PATH", role: "tls-cert" },
    { variable: "BACKUP_DUMPLING_KEY_PATH", role: "tls-key" },
  ];
  const files: DisasterRecoveryFile[] = [];
  const tlsDirectory = path.join(recoveryDirectory, "tls");
  for (const definition of definitions) {
    const configured = process.env[definition.variable]?.trim();
    if (!configured || configured === "/etc/ssl/certs/ca-certificates.crt") continue;
    try {
      const info = await stat(configured);
      if (!info.isFile()) continue;
      await mkdir(tlsDirectory, { recursive: true });
      const targetName = `${definition.variable.toLowerCase()}${path.extname(configured) || ".pem"}`;
      const target = path.join(tlsDirectory, targetName);
      await copyFile(configured, target);
      files.push(await describeFile(definition.role, target, path.join(DISASTER_RECOVERY_DIRECTORY, "tls", targetName), definition.variable));
    } catch {
      // O manifesto mostrará a variável, mas não interrompe um backup válido por um certificado opcional ausente.
    }
  }
  return files;
}

export async function createDisasterRecoveryKitFiles(input: {
  workDirectory: string;
  sourceRoot: string;
  backupId: string;
  generatedAt: string;
}) {
  const recoveryDirectory = path.join(input.workDirectory, DISASTER_RECOVERY_DIRECTORY);
  await mkdir(recoveryDirectory, { recursive: true });
  const referencedNames = await discoverReferencedEnvironmentNames(input.sourceRoot);
  const variables = selectDisasterRecoveryEnvironment(process.env, referencedNames);
  const missingCriticalVariables = CORE_RECOVERY_ENV.filter((name) => !variables[name]);

  const environmentPath = path.join(input.workDirectory, DISASTER_RECOVERY_ENV_FILE);
  await writeFile(environmentPath, JSON.stringify({
    formatVersion: 1,
    backupId: input.backupId,
    generatedAt: input.generatedAt,
    warning: "CREDENCIAIS CONFIDENCIAIS. Este arquivo só deve existir dentro do pacote AES-256-GCM ou em um ambiente de recuperação controlado.",
    variables,
  }, null, 2), { encoding: "utf8", mode: 0o600 });

  const bootstrapSource = path.join(input.sourceRoot, DISASTER_RECOVERY_TOOL_FILE);
  const guideSource = path.join(input.sourceRoot, DISASTER_RECOVERY_GUIDE_FILE);
  const bootstrapTarget = path.join(input.workDirectory, DISASTER_RECOVERY_TOOL_FILE);
  const guideTarget = path.join(input.workDirectory, DISASTER_RECOVERY_GUIDE_FILE);
  await copyFile(bootstrapSource, bootstrapTarget);
  await copyFile(guideSource, guideTarget);

  const files: DisasterRecoveryFile[] = [
    await describeFile("environment", environmentPath, DISASTER_RECOVERY_ENV_FILE),
    await describeFile("bootstrap", bootstrapTarget, DISASTER_RECOVERY_TOOL_FILE),
    await describeFile("guide", guideTarget, DISASTER_RECOVERY_GUIDE_FILE),
    ...await captureConfiguredTlsFiles(recoveryDirectory),
  ];

  return {
    version: DISASTER_RECOVERY_VERSION,
    generatedAt: input.generatedAt,
    environmentVariableCount: Object.keys(variables).length,
    missingCriticalVariables,
    files,
    backupEncryptionKeyStored: false,
    externalKeyRequired: true,
  } satisfies DisasterRecoveryManifest;
}

export function mergeRecoveryDriveKitState(manifestJson: string | null | undefined, state: RecoveryDriveKitState) {
  let parsed: Record<string, unknown> = {};
  try { parsed = manifestJson ? JSON.parse(manifestJson) as Record<string, unknown> : {}; } catch { parsed = {}; }
  parsed.recoveryDriveKit = state;
  return JSON.stringify(parsed);
}

export function getBackupManifestSourceCommit(manifestJson: string | null | undefined) {
  try {
    const parsed = JSON.parse(manifestJson || "{}") as { sourceCommit?: unknown };
    return typeof parsed.sourceCommit === "string" && parsed.sourceCommit ? parsed.sourceCommit : "unknown";
  } catch {
    return "unknown";
  }
}

export function getDisasterRecoveryState(manifestJson: string | null | undefined) {
  try {
    const parsed = JSON.parse(manifestJson || "{}") as {
      disasterRecovery?: Partial<DisasterRecoveryManifest>;
      recoveryDriveKit?: Partial<RecoveryDriveKitState>;
    };
    const recovery = parsed.disasterRecovery;
    const drive = parsed.recoveryDriveKit;
    const missing = Array.isArray(recovery?.missingCriticalVariables)
      ? recovery!.missingCriticalVariables.filter((value): value is string => typeof value === "string")
      : [];
    const version = recovery?.version === 1 ? 1 : null;
    return {
      disasterRecoveryReady: version === 1 && missing.length === 0,
      disasterRecoveryVersion: version,
      recoveryEnvironmentCount: typeof recovery?.environmentVariableCount === "number" ? recovery.environmentVariableCount : 0,
      recoveryMissingCriticalVariables: missing,
      recoveryDriveKitStatus: drive?.status === "completed" || drive?.status === "failed" ? drive.status : "not_uploaded" as const,
      recoveryDriveKitUploadedAt: typeof drive?.uploadedAt === "string" ? drive.uploadedAt : null,
      recoveryDriveKitError: drive?.status === "failed" && typeof drive.error === "string" ? drive.error : null,
    };
  } catch {
    return {
      disasterRecoveryReady: false,
      disasterRecoveryVersion: null,
      recoveryEnvironmentCount: 0,
      recoveryMissingCriticalVariables: [] as string[],
      recoveryDriveKitStatus: "not_uploaded" as const,
      recoveryDriveKitUploadedAt: null,
      recoveryDriveKitError: null,
    };
  }
}

async function uploadSmallFileToGoogleDrive(input: {
  accessToken: string;
  folderId: string;
  name: string;
  contentType: string;
  content: Buffer;
}) {
  const boundary = `h2-recovery-${randomBytes(12).toString("hex")}`;
  const metadata = Buffer.from(JSON.stringify({ name: input.name, parents: [input.folderId] }), "utf8");
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, "utf8"),
    metadata,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${input.contentType}\r\n\r\n`, "utf8"),
    input.content,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body: body as any,
  });
  if (!response.ok) throw new Error(`Google Drive recusou arquivo auxiliar ${input.name} (HTTP ${response.status}).`);
  const payload = await response.json() as { id?: string };
  if (!payload.id) throw new Error(`Google Drive não devolveu ID para ${input.name}.`);
  return { name: input.name, id: payload.id };
}

export async function uploadDisasterRecoverySidecarsToGoogleDrive(input: {
  accessToken: string;
  folderId: string;
  sourceRoot: string;
  backupId: string;
  archiveFileName: string;
  archiveBytes: number;
  archiveSha256: string;
  sourceCommit: string;
}) {
  const tool = await readFile(path.join(input.sourceRoot, DISASTER_RECOVERY_TOOL_FILE));
  const guide = await readFile(path.join(input.sourceRoot, DISASTER_RECOVERY_GUIDE_FILE));
  const checksumName = `${input.archiveFileName}.sha256.txt`;
  const toolName = `H2_RECOVERY_TOOL-${input.backupId}.mjs`;
  const guideName = `H2_RECOVERY_GUIDE-${input.backupId}.txt`;
  const indexName = `H2_RECOVERY_INDEX-${input.backupId}.json`;
  const checksum = Buffer.from(`${input.archiveSha256}  ${input.archiveFileName}\n`, "utf8");
  const index = Buffer.from(JSON.stringify({
    formatVersion: 1,
    backupId: input.backupId,
    backupFile: input.archiveFileName,
    archiveBytes: input.archiveBytes,
    archiveSha256: input.archiveSha256,
    sourceCommit: input.sourceCommit,
    recoveryTool: toolName,
    recoveryGuide: guideName,
    checksumFile: checksumName,
    backupEncryptionKeyStoredHere: false,
    warning: "A BACKUP_ENCRYPTION_KEY deve ser guardada fora do Google Drive e fora deste kit.",
  }, null, 2), "utf8");

  const files = [];
  files.push(await uploadSmallFileToGoogleDrive({ accessToken: input.accessToken, folderId: input.folderId, name: checksumName, contentType: "text/plain; charset=utf-8", content: checksum }));
  files.push(await uploadSmallFileToGoogleDrive({ accessToken: input.accessToken, folderId: input.folderId, name: toolName, contentType: "text/javascript; charset=utf-8", content: tool }));
  files.push(await uploadSmallFileToGoogleDrive({ accessToken: input.accessToken, folderId: input.folderId, name: guideName, contentType: "text/plain; charset=utf-8", content: guide }));
  files.push(await uploadSmallFileToGoogleDrive({ accessToken: input.accessToken, folderId: input.folderId, name: indexName, contentType: "application/json", content: index }));
  return files;
}
'''

kit_test = r'''import { describe, expect, it } from "vitest";
import { getDisasterRecoveryState, isRecoverableEnvironmentName, mergeRecoveryDriveKitState, selectDisasterRecoveryEnvironment } from "./disasterRecoveryKit";

describe("disasterRecoveryKit", () => {
  it("nunca coloca a chave que abre o proprio backup dentro do pacote", () => {
    const selected = selectDisasterRecoveryEnvironment({
      DATABASE_URL: "mysql://example",
      JWT_SECRET: "jwt",
      BACKUP_ENCRYPTION_KEY: "nao-pode-entrar",
      RESTORE_DATABASE_URL: "tambem-nao",
      RENDER_GIT_COMMIT: "nao-precisa",
    }, ["DATABASE_URL", "JWT_SECRET", "BACKUP_ENCRYPTION_KEY", "RESTORE_DATABASE_URL", "RENDER_GIT_COMMIT"]);
    expect(selected.DATABASE_URL).toBe("mysql://example");
    expect(selected.JWT_SECRET).toBe("jwt");
    expect(selected.BACKUP_ENCRYPTION_KEY).toBeUndefined();
    expect(selected.RESTORE_DATABASE_URL).toBeUndefined();
    expect(selected.RENDER_GIT_COMMIT).toBeUndefined();
  });

  it("aceita nomes de configuracao da aplicacao e rejeita variaveis de plataforma", () => {
    expect(isRecoverableEnvironmentName("H2ADS_PROXY_ENCRYPTION_KEY")).toBe(true);
    expect(isRecoverableEnvironmentName("SMTP_PASS")).toBe(true);
    expect(isRecoverableEnvironmentName("GITHUB_TOKEN")).toBe(false);
    expect(isRecoverableEnvironmentName("BACKUP_ENCRYPTION_KEY")).toBe(false);
  });

  it("expõe somente estado seguro do kit no painel", () => {
    const manifest = JSON.stringify({
      disasterRecovery: { version: 1, environmentVariableCount: 18, missingCriticalVariables: [], files: [], backupEncryptionKeyStored: false, externalKeyRequired: true },
    });
    const withDrive = mergeRecoveryDriveKitState(manifest, {
      status: "completed",
      uploadedAt: "2026-08-28T12:00:00.000Z",
      files: [{ name: "tool.mjs", id: "drive-id" }],
      error: null,
    });
    expect(getDisasterRecoveryState(withDrive)).toMatchObject({
      disasterRecoveryReady: true,
      disasterRecoveryVersion: 1,
      recoveryEnvironmentCount: 18,
      recoveryDriveKitStatus: "completed",
    });
    expect(getDisasterRecoveryState(withDrive)).not.toHaveProperty("variables");
  });
});
'''

bootstrap = r'''#!/usr/bin/env node
import { createDecipheriv, createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";

const HEADER_BYTES = Buffer.byteLength("WJBACK1\n", "utf8") + 12;
const AUTH_TAG_BYTES = 16;

function fail(message) {
  console.error(`\nERRO: ${message}\n`);
  process.exit(1);
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function runTar(args, input) {
  const child = spawn("tar", args, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-3000); });
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`tar terminou com codigo ${code}: ${stderr}`)));
  });
  if (input) await Promise.all([pipeline(input, child.stdin), closed]);
  else await closed;
}

const backupFile = process.argv[2];
const outputDirectory = path.resolve(process.argv[3] || `H2-RECUPERADO-${Date.now()}`);
if (!backupFile) fail("Uso: node h2-recovery-bootstrap.mjs CAMINHO_DO_BACKUP.wajuda.enc [PASTA_DE_SAIDA]");
const keyHex = process.env.BACKUP_ENCRYPTION_KEY?.trim() || "";
if (!/^[a-f0-9]{64}$/i.test(keyHex)) fail("Defina BACKUP_ENCRYPTION_KEY com os 64 caracteres hexadecimais guardados fora do servidor.");

const absoluteBackup = path.resolve(backupFile);
const info = await stat(absoluteBackup).catch(() => null);
if (!info?.isFile() || info.size <= HEADER_BYTES + AUTH_TAG_BYTES) fail("Arquivo de backup ausente ou invalido.");

const checksumFile = `${absoluteBackup}.sha256.txt`;
try {
  const expected = (await readFile(checksumFile, "utf8")).match(/[a-f0-9]{64}/i)?.[0];
  if (expected) {
    const actual = await sha256File(absoluteBackup);
    if (actual.toLowerCase() !== expected.toLowerCase()) fail("SHA-256 do arquivo nao confere com o arquivo auxiliar baixado do Google Drive.");
    console.log("[OK] SHA-256 externo conferido.");
  }
} catch {
  console.log("[INFO] Arquivo .sha256.txt nao encontrado ao lado do backup; a autenticacao AES-GCM ainda sera validada.");
}

await mkdir(outputDirectory, { recursive: true });
const handle = await import("node:fs/promises").then((fs) => fs.open(absoluteBackup, "r"));
const header = Buffer.alloc(HEADER_BYTES);
const tag = Buffer.alloc(AUTH_TAG_BYTES);
try {
  await handle.read(header, 0, header.length, 0);
  await handle.read(tag, 0, tag.length, info.size - tag.length);
} finally {
  await handle.close();
}
const magic = Buffer.from("WJBACK1\n", "utf8");
if (!header.subarray(0, magic.length).equals(magic)) fail("Cabecalho WJBACK1 invalido.");
const iv = header.subarray(magic.length);
const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
decipher.setAuthTag(tag);

console.log("[1/4] Abrindo pacote cifrado e validando AES-256-GCM...");
const encryptedBody = createReadStream(absoluteBackup, { start: HEADER_BYTES, end: info.size - AUTH_TAG_BYTES - 1 });
const tar = spawn("tar", ["-xf", "-", "-C", outputDirectory], { stdio: ["pipe", "ignore", "pipe"] });
let tarError = "";
tar.stderr.on("data", (chunk) => { tarError = `${tarError}${String(chunk)}`.slice(-3000); });
const tarClosed = new Promise((resolve, reject) => {
  tar.once("error", reject);
  tar.once("close", (code) => code === 0 ? resolve() : reject(new Error(`tar terminou com codigo ${code}: ${tarError}`)));
});
try {
  await Promise.all([pipeline(encryptedBody, decipher, tar.stdin), tarClosed]);
} catch (error) {
  fail(`Nao foi possivel autenticar/extrair o pacote. Confirme a chave e o arquivo. ${error instanceof Error ? error.message : String(error)}`);
}
console.log("[OK] Pacote autenticado e extraido.");

console.log("[2/4] Conferindo manifesto e hashes internos...");
const manifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
async function verify(relativePath, expectedBytes, expectedSha256) {
  const filePath = path.join(outputDirectory, relativePath);
  const fileInfo = await stat(filePath);
  if (Number.isFinite(expectedBytes) && fileInfo.size !== expectedBytes) fail(`Tamanho divergente: ${relativePath}`);
  const actual = await sha256File(filePath);
  if (expectedSha256 && actual.toLowerCase() !== String(expectedSha256).toLowerCase()) fail(`SHA-256 divergente: ${relativePath}`);
}
await verify(manifest.database.dumpFile, manifest.database.dumpBytes, manifest.database.dumpSha256);
await verify(manifest.source.archiveFile, manifest.source.bytes, manifest.source.sha256);
for (const object of manifest.r2.objects || []) await verify(path.join("files", ...String(object.key).replace(/^\/+/, "").split("/")), object.size, object.sha256);
for (const file of manifest.disasterRecovery?.files || []) await verify(file.path, file.bytes, file.sha256);
console.log("[OK] Banco, codigo, R2 e cofre de recuperacao conferidos.");

console.log("[3/4] Extraindo o codigo do sistema...");
const sourceDirectory = path.join(outputDirectory, "source-restored");
await mkdir(sourceDirectory, { recursive: true });
await runTar(["-xzf", path.join(outputDirectory, manifest.source.archiveFile), "-C", sourceDirectory]);
console.log("[OK] Codigo extraido em source-restored.");

console.log("[4/4] Recuperacao local preparada.");
console.log(`\nPASTA: ${outputDirectory}`);
console.log("- database.sql: banco completo");
console.log("- files/: snapshot dos arquivos R2");
console.log("- source-restored/: codigo do sistema");
console.log("- recovery/environment.json: configuracoes confidenciais recuperadas");
console.log("- recovery/H2_TOTAL_RECOVERY_GUIDE.txt: ordem para reconstruir a infraestrutura\n");
console.log("IMPORTANTE: nao publique recovery/environment.json e nao coloque a BACKUP_ENCRYPTION_KEY dentro desta pasta.");
'''

guide = r'''H2 COLOMBIANO / WALK AJUDA - GUIA DE RECUPERACAO TOTAL
==========================================================

OBJETIVO
Este kit existe para recuperar o sistema mesmo se Render, banco, R2 e GitHub precisarem ser reconstruidos.
O arquivo .wajuda.enc contem banco, arquivos R2, codigo e um cofre de configuracao protegido pela cifra AES-256-GCM.

REGRA MAIS IMPORTANTE
A BACKUP_ENCRYPTION_KEY NAO fica no backup, no Google Drive nem no GitHub.
Guarde essa chave separadamente (cofre de senhas e/ou midia offline). Sem ela o .wajuda.enc nao pode ser aberto.

ARQUIVOS PARA GUARDAR FORA DA INFRAESTRUTURA
1. walk-ajuda-backup-<ID>.wajuda.enc
2. walk-ajuda-backup-<ID>.wajuda.enc.sha256.txt
3. H2_RECOVERY_TOOL-<ID>.mjs
4. H2_RECOVERY_GUIDE-<ID>.txt
5. H2_RECOVERY_INDEX-<ID>.json
6. BACKUP_ENCRYPTION_KEY em local DIFERENTE dos arquivos acima

RECUPERACAO EM UM COMPUTADOR WINDOWS
1. Instale Node.js 22 se ainda nao existir.
2. Confirme que o comando tar existe (Windows 10/11 normalmente ja possui).
3. Abra PowerShell na pasta dos arquivos.
4. Defina temporariamente a chave:
   $env:BACKUP_ENCRYPTION_KEY="COLE_AQUI_A_CHAVE_DE_64_CARACTERES"
5. Execute:
   node .\H2_RECOVERY_TOOL-<ID>.mjs .\walk-ajuda-backup-<ID>.wajuda.enc .\H2-RECUPERADO
6. Ao terminar, apague a chave da sessao:
   Remove-Item Env:BACKUP_ENCRYPTION_KEY

O QUE APARECE EM H2-RECUPERADO
- database.sql                     dados reais do banco
- files/                           fotos/documentos/objetos do R2
- source.tar.gz                    snapshot original do codigo
- source-restored/                 codigo pronto para ser usado
- manifest.json                    inventario e hashes
- recovery/environment.json        cofre com variaveis reais do ambiente antigo
- recovery/tls/                    certificados customizados, quando existiam

ORDEM PARA LEVANTAR DO ZERO
1. Crie um NOVO banco MySQL/TiDB vazio.
2. Crie ou confirme um bucket R2 e obtenha novas credenciais, se as antigas nao existirem mais.
3. Use source-restored/ para criar o novo repositorio/servico. O Dockerfile ja instala Node 22, mariadb-client e Dumpling.
4. Importe database.sql no novo banco.
5. Reponha os arquivos de files/ no novo bucket R2 preservando exatamente as chaves/caminhos.
6. Configure as variaveis do novo servico usando recovery/environment.json COMO REFERENCIA.
   - DATABASE_URL deve apontar para o NOVO banco se o antigo foi perdido.
   - R2_* devem apontar para o NOVO bucket se o antigo foi perdido.
   - Credenciais externas que tenham sido revogadas devem ser geradas novamente.
   - BACKUP_ENCRYPTION_KEY deve ser recolocada manualmente a partir da copia externa.
7. Faça deploy do codigo recuperado.
8. Teste login ADM, pedidos, fotos, emails, emprestimos e rotas criticas antes de apontar o dominio.
9. Reconfigure DNS/Cloudflare do h2colombiano.com para o novo servico somente depois dos testes.
10. Gere imediatamente um novo backup completo e valide SHA-256/Integridade OK.

LIMITES QUE NENHUM BACKUP LOCAL CONSEGUE ELIMINAR
- Voce ainda precisa ter acesso as contas externas (registrador do dominio, Cloudflare, Google, Zoho etc.).
- Se uma credencial de um provedor externo tiver sido revogada, ela precisa ser recriada nesse provedor.
- O backup recupera configuracao e dados; ele nao recria sua conta comercial em fornecedores externos.

SEGURANCA
- recovery/environment.json contem segredos. Nao envie por WhatsApp, email ou GitHub.
- Nunca guarde BACKUP_ENCRYPTION_KEY dentro do mesmo pacote/pasta do backup.
- Nunca restaure primeiro em producao se houver opcao de usar ambiente temporario.
'''

Path("server/disasterRecoveryKit.ts").write_text(kit_ts, encoding="utf-8")
Path("server/disasterRecoveryKit.test.ts").write_text(kit_test, encoding="utf-8")
Path("recovery").mkdir(exist_ok=True)
Path("recovery/h2-recovery-bootstrap.mjs").write_text(bootstrap, encoding="utf-8")
Path("recovery/H2_TOTAL_RECOVERY_GUIDE.txt").write_text(guide, encoding="utf-8")

# -----------------------------------------------------------------------------
# backupService.ts
# -----------------------------------------------------------------------------
p = Path("server/backupService.ts")
text = p.read_text(encoding="utf-8")

import_anchor = 'import { systemBackups, type InsertSystemBackup } from "../drizzle/schema";\n'
import_block = import_anchor + '''import {\n  createDisasterRecoveryKitFiles,\n  getBackupManifestSourceCommit,\n  getDisasterRecoveryState,\n  mergeRecoveryDriveKitState,\n  uploadDisasterRecoverySidecarsToGoogleDrive,\n  type DisasterRecoveryManifest,\n  type RecoveryDriveKitState,\n} from "./disasterRecoveryKit";\n'''
if import_anchor not in text:
    raise SystemExit("backupService import anchor not found")
text = text.replace(import_anchor, import_block, 1)

manifest_anchor = '''  encryption: {\n    algorithm: "aes-256-gcm";\n    keyRequired: true;\n    keyStoredInArchive: false;\n  };\n'''
manifest_replacement = '''  disasterRecovery: DisasterRecoveryManifest;\n  encryption: {\n    algorithm: "aes-256-gcm";\n    keyRequired: true;\n    keyStoredInArchive: false;\n  };\n'''
if manifest_anchor not in text:
    raise SystemExit("BackupManifest encryption anchor not found")
text = text.replace(manifest_anchor, manifest_replacement, 1)

source_anchor = '''    const sourceCommit = process.env.RENDER_GIT_COMMIT?.trim() || process.env.COMMIT_SHA?.trim() || "unknown";\n    const generatedAt = new Date().toISOString();\n    diagnostic.stage = "manifest";\n'''
source_replacement = '''    const sourceCommit = process.env.RENDER_GIT_COMMIT?.trim() || process.env.COMMIT_SHA?.trim() || "unknown";\n    const generatedAt = new Date().toISOString();\n    const disasterRecovery = await createDisasterRecoveryKitFiles({\n      workDirectory,\n      sourceRoot: BACKUP_SOURCE_ROOT,\n      backupId: id,\n      generatedAt,\n    });\n    diagnostic.stage = "manifest";\n'''
if source_anchor not in text:
    raise SystemExit("backup manifest prelude anchor not found")
text = text.replace(source_anchor, source_replacement, 1)

manifest_object_anchor = '''      encryption: {\n        algorithm: "aes-256-gcm",\n'''
manifest_object_replacement = '''      disasterRecovery,\n      encryption: {\n        algorithm: "aes-256-gcm",\n'''
if manifest_object_anchor not in text:
    raise SystemExit("backup manifest object anchor not found")
text = text.replace(manifest_object_anchor, manifest_object_replacement, 1)

checks_anchor = '''          "snapshot do código criado sem .env, chaves privadas, node_modules ou dist",\n          "artefato cifrado com AES-256-GCM",\n'''
checks_replacement = '''          "snapshot do código criado sem .env, chaves privadas, node_modules ou dist",\n          "cofre de recuperação total criado dentro do pacote cifrado sem armazenar BACKUP_ENCRYPTION_KEY",\n          "ferramenta independente e guia de recuperação incluídos no pacote",\n          "artefato cifrado com AES-256-GCM",\n'''
if checks_anchor not in text:
    raise SystemExit("verification checks anchor not found")
text = text.replace(checks_anchor, checks_replacement, 1)

# Expor apenas metadados seguros do kit nas listas/status.
list_anchor = '''    integrityError: getBackupRemoteVerification(row.manifestJson).error,\n    errorMessage: row.status === "failed" ? row.errorMessage : null,\n'''
list_replacement = '''    integrityError: getBackupRemoteVerification(row.manifestJson).error,\n    ...getDisasterRecoveryState(row.manifestJson),\n    errorMessage: row.status === "failed" ? row.errorMessage : null,\n'''
count = text.count(list_anchor)
if count < 2:
    raise SystemExit(f"backup list/status safe metadata anchor count={count}")
text = text.replace(list_anchor, list_replacement)

# Estado dos arquivos auxiliares do Drive fica apenas no manifestJson, sem nova migração.
verification_function_anchor = '''const activeStoredBackupVerifications = new Set<string>();\n\nasync function updateStoredBackupVerification(id: string, verification: BackupRemoteVerification) {\n'''
drive_state_helper = '''const activeStoredBackupVerifications = new Set<string>();\n\nasync function updateStoredRecoveryDriveKit(id: string, state: RecoveryDriveKitState) {\n  const db = await getDb();\n  if (!db) throw new Error("Banco indisponível para atualizar o kit de recuperação do Drive.");\n  const [row] = await db.select({ manifestJson: systemBackups.manifestJson }).from(systemBackups).where(eq(systemBackups.id, id)).limit(1);\n  if (!row) throw new Error("Backup não encontrado.");\n  await db.update(systemBackups).set({\n    manifestJson: mergeRecoveryDriveKitState(row.manifestJson, state),\n  }).where(eq(systemBackups.id, id));\n}\n\nasync function updateStoredBackupVerification(id: string, verification: BackupRemoteVerification) {\n'''
if verification_function_anchor not in text:
    raise SystemExit("stored verification anchor not found")
text = text.replace(verification_function_anchor, drive_state_helper, 1)

# Após o arquivo grande chegar ao Drive, envia checksum + ferramenta + guia + índice. Falha lateral não apaga o sucesso do backup principal.
drive_anchor = '''    if (!uploaded.id) throw new Error("Google Drive não devolveu o ID do arquivo.");\n    await updateRun(id, { driveStatus: "completed", driveFileId: uploaded.id, driveUploadedAt: new Date(), driveError: null });\n    return { id: uploaded.id };\n'''
drive_replacement = '''    if (!uploaded.id) throw new Error("Google Drive não devolveu o ID do arquivo.");\n    await updateRun(id, { driveStatus: "completed", driveFileId: uploaded.id, driveUploadedAt: new Date(), driveError: null });\n    try {\n      if (!artifact.archiveSha256) throw new Error("Backup sem SHA-256 para montar o kit de recuperação total.");\n      const sidecars = await uploadDisasterRecoverySidecarsToGoogleDrive({\n        accessToken,\n        folderId,\n        sourceRoot: BACKUP_SOURCE_ROOT,\n        backupId: id,\n        archiveFileName: `walk-ajuda-backup-${id}.wajuda.enc`,\n        archiveBytes: artifact.size,\n        archiveSha256: artifact.archiveSha256,\n        sourceCommit: getBackupManifestSourceCommit(artifact.manifestJson),\n      });\n      await updateStoredRecoveryDriveKit(id, {\n        status: "completed",\n        uploadedAt: new Date().toISOString(),\n        files: sidecars,\n        error: null,\n      });\n      return { id: uploaded.id, recoveryKit: true as const };\n    } catch (sidecarError) {\n      const sidecarMessage = sanitizeDiagnosticValue(sidecarError) || "Falha ao enviar arquivos auxiliares de recuperação total.";\n      await updateStoredRecoveryDriveKit(id, {\n        status: "failed",\n        uploadedAt: null,\n        files: [],\n        error: sidecarMessage.slice(0, 1000),\n      }).catch(() => undefined);\n      return { id: uploaded.id, recoveryKit: false as const, warning: sidecarMessage };\n    }\n'''
if drive_anchor not in text:
    raise SystemExit("Google Drive completion anchor not found")
text = text.replace(drive_anchor, drive_replacement, 1)

p.write_text(text, encoding="utf-8")

# -----------------------------------------------------------------------------
# AdminBackup.tsx: estado visual claro por backup.
# -----------------------------------------------------------------------------
p = Path("client/src/pages/AdminBackup.tsx")
text = p.read_text(encoding="utf-8")
text = text.replace(
    'O processo copia os registos reais de todas as tabelas do banco, fotos e ficheiros do R2, código e migrações. O pacote é cifrado antes de ser guardado e só fica disponível para download após conclusão e verificação.',
    'O processo copia os registos reais de todas as tabelas do banco, fotos e ficheiros do R2, código, migrações e um cofre de recuperação total. O pacote é cifrado antes de ser guardado e só fica disponível para download após conclusão e verificação.',
    1,
)
text = text.replace('className="grid gap-4 md:grid-cols-3"', 'className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"', 1)
card_anchor = '''          <div className="rounded-xl border border-white/10 bg-[#111128] p-4">\n            <Clock3 className="h-5 w-5 text-amber-300" />\n            <h3 className="mt-3 text-sm font-bold">Snapshot do momento</h3>\n            <p className="mt-1 text-xs leading-5 text-slate-400">Cada execução é uma fotografia do sistema naquele instante; ela não sincroniza alterações futuras.</p>\n          </div>\n'''
card_replacement = card_anchor + '''          <div className="rounded-xl border border-white/10 bg-[#111128] p-4">\n            <ShieldAlert className="h-5 w-5 text-violet-300" />\n            <h3 className="mt-3 text-sm font-bold">Recuperação do zero</h3>\n            <p className="mt-1 text-xs leading-5 text-slate-400">Novos backups levam cofre cifrado de configuração, ferramenta independente e guia para reconstruir o sistema sem depender do GitHub.</p>\n          </div>\n'''
if card_anchor not in text:
    raise SystemExit("AdminBackup snapshot card anchor not found")
text = text.replace(card_anchor, card_replacement, 1)

drive_line = '''                      {backup.status === "completed" && <p className="mt-1 text-xs text-slate-500">Google Drive: {backup.driveStatus === "completed" ? `enviado em ${formatDate(backup.driveUploadedAt)}` : backup.driveStatus === "uploading" ? "enviando..." : backup.driveStatus === "failed" ? "falhou" : backupConfigQuery.data?.driveConfigured ? "não enviado" : "não configurado"}</p>}\n'''
recovery_line = drive_line + '''                      {backup.status === "completed" && (\n                        <p className={`mt-1 text-xs ${backup.disasterRecoveryReady ? "text-violet-200" : backup.disasterRecoveryVersion ? "text-amber-300" : "text-slate-500"}`}>\n                          Recuperação total: {backup.disasterRecoveryReady ? backup.recoveryDriveKitStatus === "completed" ? "pronta · cofre cifrado + ferramenta no Drive" : backup.recoveryDriveKitStatus === "failed" ? "cofre pronto · ferramenta do Drive falhou" : "cofre cifrado incluído · envie ao Drive para completar o kit externo" : backup.disasterRecoveryVersion ? `incompleta · ${backup.recoveryMissingCriticalVariables.length} configuração(ões) essencial(is) ausente(s)` : "backup antigo · gere um novo backup para incluir o kit"}\n                        </p>\n                      )}\n'''
if drive_line not in text:
    raise SystemExit("AdminBackup Google Drive line anchor not found")
text = text.replace(drive_line, recovery_line, 1)
p.write_text(text, encoding="utf-8")

print("Total disaster recovery kit applied.")
