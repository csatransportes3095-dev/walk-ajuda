#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const MAGIC = Buffer.from('H2MEDIA1\n', 'utf8');
const IV_BYTES = 12;
const TAG_BYTES = 16;

function fail(message) {
  console.error(`[H2-MEDIA-RECOVERY] ${message}`);
  process.exit(1);
}

function encryptionKey() {
  const raw = String(process.env.BACKUP_ENCRYPTION_KEY || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(raw)) {
    fail('Defina BACKUP_ENCRYPTION_KEY com exatamente 64 caracteres hexadecimais antes de executar.');
  }
  return crypto.createHmac('sha256', Buffer.from(raw, 'hex')).update('h2-media-backup-v1', 'utf8').digest();
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function safeOutput(root, sourceKey) {
  const clean = sourceKey.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.split('/').some((part) => part === '..')) fail(`Caminho inseguro no índice: ${sourceKey}`);
  const target = path.resolve(root, ...clean.split('/'));
  const resolvedRoot = path.resolve(root) + path.sep;
  if (!target.startsWith(resolvedRoot)) fail(`Caminho saiu da pasta de destino: ${sourceKey}`);
  return target;
}

class GcmDecryptTransform extends Transform {
  constructor(key, iv, authTag, expectedPlainSha256) {
    super();
    this.decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    this.decipher.setAuthTag(authTag);
    this.hash = crypto.createHash('sha256');
    this.expectedPlainSha256 = expectedPlainSha256;
    this.bytes = 0;
  }
  _transform(chunk, _encoding, callback) {
    try {
      const plain = this.decipher.update(chunk);
      this.hash.update(plain);
      this.bytes += plain.length;
      callback(null, plain);
    } catch (error) { callback(error); }
  }
  _flush(callback) {
    try {
      const tail = this.decipher.final();
      this.hash.update(tail);
      this.bytes += tail.length;
      if (tail.length) this.push(tail);
      const digest = this.hash.digest('hex');
      if (digest !== this.expectedPlainSha256) return callback(new Error(`SHA-256 restaurado divergente: esperado ${this.expectedPlainSha256}, obtido ${digest}`));
      callback();
    } catch (error) { callback(error); }
  }
}

async function recoverOne(entry, encryptedDir, outputDir, key) {
  const encryptedPath = path.join(encryptedDir, entry.driveFileName);
  const info = await fsp.stat(encryptedPath).catch(() => null);
  if (!info?.isFile()) throw new Error(`Arquivo criptografado ausente: ${entry.driveFileName}`);
  if (Number(entry.encryptedBytes) !== info.size) throw new Error(`Tamanho criptografado divergente: ${entry.driveFileName}`);
  const encryptedSha = await sha256File(encryptedPath);
  if (encryptedSha !== entry.encryptedSha256) throw new Error(`SHA-256 criptografado divergente: ${entry.driveFileName}`);

  const handle = await fsp.open(encryptedPath, 'r');
  let header;
  let authTag;
  try {
    header = Buffer.alloc(MAGIC.length + IV_BYTES);
    const h = await handle.read(header, 0, header.length, 0);
    if (h.bytesRead !== header.length || !header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error(`Cabeçalho H2MEDIA1 inválido: ${entry.driveFileName}`);
    authTag = Buffer.alloc(TAG_BYTES);
    const tagPos = info.size - TAG_BYTES;
    const t = await handle.read(authTag, 0, TAG_BYTES, tagPos);
    if (t.bytesRead !== TAG_BYTES) throw new Error(`Tag AES-GCM ausente: ${entry.driveFileName}`);
  } finally {
    await handle.close();
  }

  const iv = header.subarray(MAGIC.length);
  const payloadStart = MAGIC.length + IV_BYTES;
  const payloadEnd = info.size - TAG_BYTES - 1;
  const outputPath = safeOutput(outputDir, entry.sourceKey);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.h2restore-part`;
  await fsp.rm(tempPath, { force: true });
  try {
    const decrypt = new GcmDecryptTransform(key, iv, authTag, entry.sourceSha256);
    await pipeline(
      fs.createReadStream(encryptedPath, { start: payloadStart, end: payloadEnd }),
      decrypt,
      fs.createWriteStream(tempPath, { flags: 'wx', mode: 0o600 }),
    );
    const restored = await fsp.stat(tempPath);
    if (restored.size !== Number(entry.sourceSize)) throw new Error(`Tamanho restaurado divergente para ${entry.sourceKey}`);
    await fsp.rename(tempPath, outputPath);
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function main() {
  const [indexFile, encryptedDir, outputDir] = process.argv.slice(2);
  if (!indexFile || !encryptedDir || !outputDir) {
    fail('Uso: node H2_MEDIA_RECOVERY_TOOL.mjs <H2_MEDIA_INDEX.json> <pasta-dos-.h2m.enc> <pasta-saida>');
  }
  const index = JSON.parse(await fsp.readFile(indexFile, 'utf8'));
  if (index?.format !== 'H2_MEDIA_BACKUP_INDEX_V1' || !Array.isArray(index.objects)) fail('Índice de mídia inválido ou incompatível.');
  const key = encryptionKey();
  await fsp.mkdir(outputDir, { recursive: true });
  let done = 0;
  for (const entry of index.objects) {
    await recoverOne(entry, encryptedDir, outputDir, key);
    done += 1;
    console.log(`[H2-MEDIA-RECOVERY] ${done}/${index.objects.length} restaurado: ${entry.sourceKey}`);
  }
  console.log(`[H2-MEDIA-RECOVERY] OK: ${done} arquivo(s) restaurado(s) e verificado(s).`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
