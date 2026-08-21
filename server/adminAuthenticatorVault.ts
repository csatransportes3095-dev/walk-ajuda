import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const AAD = Buffer.from("walk-ajuda/admin-authenticator/v1", "utf8");

export type EncryptedTotpSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: "v1";
};

function encryptionKey(): Buffer {
  const masterKey = process.env.AUTHENTICATOR_ENCRYPTION_KEY;
  if (!masterKey || masterKey.trim().length < 32) {
    throw new Error("AUTHENTICATOR_ENCRYPTION_KEY não configurada com segurança.");
  }
  return createHash("sha256").update(masterKey, "utf8").digest();
}

export function normalizeTotpSecret(value: string): string {
  const normalized = value.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/g, "");
  if (normalized.length < 16 || !/^[A-Z2-7]+$/.test(normalized)) {
    throw new Error("A chave deve estar em Base32, com pelo menos 16 caracteres.");
  }
  return normalized;
}

export function decodeBase32(value: string): Buffer {
  const secret = normalizeTotpSecret(value);
  let bits = "";
  for (const char of secret) {
    bits += BASE32_ALPHABET.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function encryptTotpSecret(secret: string): EncryptedTotpSecret {
  const normalized = normalizeTotpSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: "v1",
  };
}

export function decryptTotpSecret(encrypted: Pick<EncryptedTotpSecret, "ciphertext" | "iv" | "tag">): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encrypted.iv, "base64"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return normalizeTotpSecret(plaintext);
}

export function generateTotp(secret: string, now = Date.now()): { code: string; expiresAt: number } {
  const stepSeconds = 30;
  const unixSeconds = Math.floor(now / 1000);
  const counter = Math.floor(unixSeconds / stepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  const code = String(number % 1_000_000).padStart(6, "0");
  return { code, expiresAt: (counter + 1) * stepSeconds * 1000 };
}
