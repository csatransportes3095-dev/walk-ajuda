import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { ENV } from './_core/env';
import { r2DeleteObjects, r2GetObjectBuffer, r2PutObject } from './r2Storage';

const MAX_QR_BYTES = 3 * 1024 * 1024;
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type AuthenticatorQrImage = {
  buffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
};

function encryptionKey() {
  if (!ENV.cookieSecret || ENV.cookieSecret.trim().length < 16) {
    throw new Error('A chave de sessão do servidor não está configurada para proteger o QR do autenticador.');
  }
  return createHash('sha256').update(`walk-ajuda/private-authenticator-qr/v1:${ENV.cookieSecret}`).digest();
}

function normalizeBase64(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Imagem do QR vazia.');
  const comma = trimmed.indexOf(',');
  return comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
}

function inspectImage(buffer: Buffer): AuthenticatorQrImage['mimeType'] | null {
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (isPng) return 'image/png';
  if (isJpeg) return 'image/jpeg';
  if (isWebp) return 'image/webp';
  return null;
}

export function parseAuthenticatorQrBase64(value: string): AuthenticatorQrImage {
  const encoded = normalizeBase64(value);
  if (encoded.length > Math.ceil(MAX_QR_BYTES * 4 / 3) + 1024) {
    throw new Error('A imagem do QR excede o limite de 3 MB.');
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_QR_BYTES) {
    throw new Error('A imagem do QR está vazia ou excede o limite de 3 MB.');
  }
  const mimeType = inspectImage(buffer);
  if (!mimeType) {
    throw new Error('Formato inválido. Envie apenas PNG, JPG/JPEG ou WebP.');
  }
  return { buffer, mimeType };
}

function encrypt(buffer: Buffer) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, encrypted]);
}

function decrypt(payload: Buffer) {
  if (payload.length <= 1 + IV_BYTES + TAG_BYTES || payload[0] !== VERSION) {
    throw new Error('O QR do autenticador não possui um formato protegido válido.');
  }
  const iv = payload.subarray(1, 1 + IV_BYTES);
  const tag = payload.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const encrypted = payload.subarray(1 + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export async function storeAuthenticatorQr(image: AuthenticatorQrImage) {
  const storageKey = `private-authenticator-qr/${randomUUID()}.bin`;
  await r2PutObject(storageKey, encrypt(image.buffer), 'application/octet-stream');
  return { storageKey, mimeType: image.mimeType };
}

export async function readAuthenticatorQr(storageKey: string, mimeType: string): Promise<AuthenticatorQrImage> {
  const plain = decrypt(await r2GetObjectBuffer(storageKey));
  const realMime = inspectImage(plain);
  if (!realMime || realMime !== mimeType) {
    throw new Error('O QR do autenticador falhou na validação de integridade.');
  }
  return { buffer: plain, mimeType: realMime };
}

export async function deleteAuthenticatorQr(storageKey?: string | null) {
  if (storageKey) await r2DeleteObjects([storageKey]);
}
