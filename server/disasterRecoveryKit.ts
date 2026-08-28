import { createHash, randomBytes } from "node:crypto";
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
