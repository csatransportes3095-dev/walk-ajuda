#!/usr/bin/env node
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
