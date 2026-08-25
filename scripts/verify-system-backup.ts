import { createCipheriv, createHash, createDecipheriv } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { safeBackupObjectPath } from "../server/backupService";

const MAGIC = Buffer.from("WJBACK1\n", "utf8");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim() || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error("BACKUP_ENCRYPTION_KEY deve ser hexadecimal de 64 caracteres.");
  return Buffer.from(raw, "hex");
}

function sha256File(filePath: string) {
  return new Promise<{ bytes: number; sha256: string }>((resolve, reject) => {
    const hash = createHash("sha256");
    let bytes = 0;
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: Buffer) => { hash.update(chunk); bytes += chunk.length; });
    stream.once("error", reject);
    stream.once("end", () => resolve({ bytes, sha256: hash.digest("hex") }));
  });
}

async function runProcess(command: string, args: string[], outputFile?: string) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-3000); });
  const output = outputFile && child.stdout
    ? pipeline(child.stdout, createWriteStream(outputFile, { flags: "wx" }))
    : Promise.resolve();
  const exit = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} terminou com código ${code ?? 1}: ${stderr.slice(-800)}`)));
  });
  await Promise.all([output, exit]);
}

async function decryptArchive(encryptedFile: string, tarFile: string) {
  const key = getEncryptionKey();
  const handle = await open(encryptedFile, "r");
  try {
    const encryptedStat = await handle.stat();
    const minimumSize = MAGIC.length + IV_LENGTH + TAG_LENGTH + 1;
    if (encryptedStat.size < minimumSize) throw new Error("Pacote cifrado demasiado pequeno.");
    const header = Buffer.alloc(MAGIC.length + IV_LENGTH);
    await handle.read(header, 0, header.length, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Formato de backup desconhecido.");
    const iv = header.subarray(MAGIC.length);
    const tag = Buffer.alloc(TAG_LENGTH);
    await handle.read(tag, 0, tag.length, encryptedStat.size - TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(encryptedFile, { start: header.length, end: encryptedStat.size - TAG_LENGTH - 1 }),
      decipher,
      createWriteStream(tarFile, { flags: "wx" }),
    );
  } finally {
    await handle.close();
  }
}

function validateTarEntries(entries: string[]) {
  for (const entry of entries) {
    const normalized = entry.replace(/^\.\/+/, "").replace(/\/$/, "");
    if (!normalized) continue;
    if (normalized.startsWith("/") || normalized.includes("\\") || normalized.split("/").includes("..")) {
      throw new Error(`Entrada insegura no pacote: ${entry}`);
    }
    if (normalized !== "files" && !normalized.startsWith("files/") && !["database.sql", "source.tar.gz", "manifest.json"].includes(normalized)) {
      throw new Error(`Entrada inesperada no pacote: ${entry}`);
    }
  }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const items = await readdir(current, { withFileTypes: true });
  const result: string[] = [];
  for (const item of items) {
    const full = path.join(current, item.name);
    if (item.isDirectory()) result.push(...await listFiles(root, full));
    else result.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return result;
}

export async function verifySystemBackup(encryptedFile: string, outputRoot: string) {
  const tempRoot = path.join(outputRoot, ".verify-work");
  const tarFile = path.join(tempRoot, "backup.tar");
  const entriesFile = path.join(tempRoot, "entries.txt");
  const manifestFile = path.join(tempRoot, "manifest.json");
  const extractedRoot = path.join(tempRoot, "extracted");
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
  try {
    await decryptArchive(encryptedFile, tarFile);
    await runProcess("tar", ["-tf", tarFile], entriesFile);
    const entries = (await readFile(entriesFile, "utf8")).split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    validateTarEntries(entries);
    await runProcess("tar", ["-xpf", tarFile, "--no-same-owner", "--no-same-permissions", "-C", tempRoot, "database.sql", "source.tar.gz", "manifest.json", "files"]);
    await mkdir(extractedRoot, { recursive: true });
    // O tar é extraído em tempRoot; manter uma raiz previsível para as comparações.
    await writeFile(manifestFile, await readFile(path.join(tempRoot, "manifest.json"), "utf8"), "utf8");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as {
      backupId: string;
      database: { tableCount: number; dumpBytes: number; dumpSha256: string };
      r2: { objectCount: number; totalBytes: number; objects: Array<{ key: string; size: number; sha256: string }> };
      source: { bytes: number; sha256: string };
    };
    if (!manifest.backupId || !manifest.database || !manifest.r2 || !manifest.source) throw new Error("Manifesto incompleto.");

    const database = await sha256File(path.join(tempRoot, "database.sql"));
    if (database.bytes !== manifest.database.dumpBytes || database.sha256 !== manifest.database.dumpSha256) throw new Error("Hash ou tamanho do database.sql não confere.");
    const source = await sha256File(path.join(tempRoot, "source.tar.gz"));
    if (source.bytes !== manifest.source.bytes || source.sha256 !== manifest.source.sha256) throw new Error("Hash ou tamanho do source.tar.gz não confere.");

    const filesRoot = path.join(tempRoot, "files");
    const actualFiles = await listFiles(filesRoot);
    let totalBytes = 0;
    for (const object of manifest.r2.objects) {
      const relative = safeBackupObjectPath(object.key);
      const filePath = path.join(tempRoot, relative);
      const digest = await sha256File(filePath);
      if (digest.bytes !== object.size || digest.sha256 !== object.sha256) throw new Error(`Hash ou tamanho divergente no objeto ${object.key}.`);
      totalBytes += digest.bytes;
    }
    if (actualFiles.length !== manifest.r2.objectCount) throw new Error("A quantidade de objetos R2 extraídos não confere com o manifesto.");
    if (totalBytes !== manifest.r2.totalBytes) throw new Error("O tamanho total dos objetos R2 não confere com o manifesto.");

    const report = {
      status: "approved",
      backupId: manifest.backupId,
      databaseTables: manifest.database.tableCount,
      databaseBytes: database.bytes,
      r2Objects: actualFiles.length,
      r2Bytes: totalBytes,
      sourceBytes: source.bytes,
      checks: ["formato cifrado", "entradas tar seguras", "database.sql SHA-256", "source.tar.gz SHA-256", "todos os objetos R2 SHA-256", "quantidade e tamanho total do R2"],
    };
    const reportFile = path.join(outputRoot, `restore-verification-${manifest.backupId}.json`);
    await writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");
    return { ...report, reportFile };
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main() {
  const encryptedFile = process.argv[2];
  const outputRoot = process.argv[3] || path.resolve("backup-verification");
  if (!encryptedFile) throw new Error("Uso: pnpm exec tsx scripts/verify-system-backup.ts <backup.wajuda.enc> [pasta-de-saida]");
  const result = await verifySystemBackup(path.resolve(encryptedFile), path.resolve(outputRoot));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Verificação reprovada:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
