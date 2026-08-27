import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { parseH2AdsProxyInput, type ParsedH2AdsProxy } from "../shared/h2adsProxyInput";

export { parseH2AdsProxyInput } from "../shared/h2adsProxyInput";
export type { H2AdsProxyProtocol, ParsedH2AdsProxy } from "../shared/h2adsProxyInput";

const CIPHER_VERSION = "v1";

function getEncryptionKey() {
  const value = process.env.H2ADS_PROXY_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("A chave segura de proxy ainda não está configurada no ambiente.");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 32) return decoded;
  if (value.length < 32) throw new Error("A chave segura de proxy do ambiente precisa ter pelo menos 32 caracteres.");
  return createHash("sha256").update(value, "utf8").digest();
}

export function isH2AdsProxyEncryptionReady() {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptH2AdsProxy(proxy: ParsedH2AdsProxy) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const content = Buffer.from(JSON.stringify(proxy), "utf8");
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  return [CIPHER_VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptH2AdsProxy(encryptedPayload: string): ParsedH2AdsProxy {
  const [version, ivText, tagText, contentText, ...extra] = encryptedPayload.split(".");
  if (version !== CIPHER_VERSION || !ivText || !tagText || !contentText || extra.length > 0) throw new Error("Credencial de proxy protegida em formato inválido.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(contentText, "base64")), decipher.final()]).toString("utf8");
    const value = JSON.parse(decrypted) as ParsedH2AdsProxy;
    return parseH2AdsProxyInput(`${value.host}:${value.port}:${value.username}:${value.password}`, value.protocol ?? "http");
  } catch {
    throw new Error("Não foi possível abrir a credencial protegida de proxy.");
  }
}

export function proxyCredentialSummary() {
  return "Credencial protegida";
}
