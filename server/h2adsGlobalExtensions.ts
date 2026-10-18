import { eq } from "drizzle-orm";
import { systemConfig } from "../drizzle/schema";
import { getDb } from "./db";

const KEY = "h2ads_global_extensions_v1";
export type H2AdsExtension = { id: string; name: string; enabled: boolean };
const ID_RE = /^[a-p]{32}$/;

export function parseH2AdsExtensionUrl(url: string): string {
  let parsed: URL;
  try { parsed = new URL(url.trim()); } catch { throw new Error("Informe um link valido da Chrome Web Store."); }
  if (parsed.protocol !== "https:" || parsed.hostname !== "chromewebstore.google.com") throw new Error("Somente links HTTPS da Chrome Web Store sao aceitos.");
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "detail" || !ID_RE.test(parts[2])) throw new Error("O link precisa apontar para uma extensao da Chrome Web Store.");
  return parts[2];
}

export async function listH2AdsGlobalExtensions(): Promise<H2AdsExtension[]> {
  const db = await getDb();
  if (!db) throw new Error("Banco H2ADS indisponivel.");
  const rows = await db.select({ value: systemConfig.configValue }).from(systemConfig).where(eq(systemConfig.configKey, KEY)).limit(1);
  if (!rows[0]) return [];
  const data: unknown = JSON.parse(rows[0].value);
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is H2AdsExtension => Boolean(item && typeof item === "object" && typeof item.id === "string" && ID_RE.test(item.id) && typeof item.name === "string" && typeof item.enabled === "boolean")).slice(0, 40);
}

async function save(extensions: H2AdsExtension[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco H2ADS indisponivel.");
  await db.insert(systemConfig).values({ configKey: KEY, configValue: JSON.stringify(extensions) }).onDuplicateKeyUpdate({ set: { configValue: JSON.stringify(extensions) } });
}

export async function addH2AdsGlobalExtension(link: string, name: string): Promise<H2AdsExtension[]> {
  const id = parseH2AdsExtensionUrl(link);
  const entries = await listH2AdsGlobalExtensions();
  if (entries.some(x => x.id === id)) throw new Error("Extensao ja cadastrada.");
  if (entries.length >= 40) throw new Error("Limite de 40 extensoes atingido.");
  const updated = [...entries, { id, name: name.trim().slice(0, 90) || "Extensao Chrome", enabled: false }];
  await save(updated);
  return updated;
}

export async function setH2AdsGlobalExtension(id: string, enabled: boolean): Promise<H2AdsExtension[]> {
  if (!ID_RE.test(id)) throw new Error("Identificador invalido.");
  const entries = await listH2AdsGlobalExtensions();
  if (!entries.some(x => x.id === id)) throw new Error("Extensao nao encontrada.");
  const updated = entries.map(x => x.id === id ? { ...x, enabled } : x);
  await save(updated);
  return updated;
}

export async function removeH2AdsGlobalExtension(id: string): Promise<H2AdsExtension[]> {
  if (!ID_RE.test(id)) throw new Error("Identificador invalido.");
  const updated = (await listH2AdsGlobalExtensions()).filter(x => x.id !== id);
  await save(updated);
  return updated;
}
