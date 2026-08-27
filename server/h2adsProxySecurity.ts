import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const CIPHER_VERSION = "v1";

export type ParsedH2AdsProxy = {
  host: string;
  port: number;
  username: string;
  password: string;
};

function getEncryptionKey() {
  const value = process.env.H2ADS_PROXY_ENCRYPTION_KEY;
  if (!value) throw new Error("A chave segura de proxy ainda não está configurada no ambiente.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("A chave segura de proxy do ambiente é inválida.");
  return key;
}

export function isH2AdsProxyEncryptionReady() {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function parseH2AdsProxyInput(input: string): ParsedH2AdsProxy {
  const value = input.trim();
  if (!value || /\s/.test(value)) throw new Error("Informe uma configuração de proxy válida, sem espaços.");
  const [host, portText, username, ...passwordParts] = value.split(":");
  const password = passwordParts.join(":");
  const port = Number(portText);
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !username || !password) {
    throw new Error("Formato de proxy inválido. Use host:porta:utilizador:palavra-passe.");
  }
  return { host: host.toLowerCase(), port, username, password };
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
    return parseH2AdsProxyInput(`${value.host}:${value.port}:${value.username}:${value.password}`);
  } catch {
    throw new Error("Não foi possível abrir a credencial protegida de proxy.");
  }
}

export function proxyCredentialSummary() {
  return "Credencial protegida";
}
