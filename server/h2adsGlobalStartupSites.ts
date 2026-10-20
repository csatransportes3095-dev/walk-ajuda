import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { systemConfig } from "../drizzle/schema";
import { getDb } from "./db";

const KEY = "h2ads_global_startup_sites_v1";
export type H2AdsStartupSite = { id: string; name: string; url: string; enabled: boolean };

export function normalizeH2AdsStartupSiteUrl(input: string): string {
  let parsed: URL;
  try { parsed = new URL(input.trim()); } catch { throw new Error("Informe um link HTTPS valido."); }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) throw new Error("Somente links HTTPS publicos sem credenciais sao aceitos.");
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".test") || hostname.endsWith(".invalid") || hostname.endsWith(".onion") || hostname === "0.0.0.0" || hostname === "255.255.255.255" || hostname === "[::1]" || hostname === "127.0.0.1" || /^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) throw new Error("Enderecos locais ou privados nao sao permitidos.");
  if (parsed.href.length > 500) throw new Error("Link muito longo.");
  return parsed.href;
}

export async function listH2AdsStartupSites(): Promise<H2AdsStartupSite[]> {
  const db = await getDb();
  if (!db) throw new Error("Banco H2ADS indisponivel.");
  const rows = await db.select({ value: systemConfig.configValue }).from(systemConfig).where(eq(systemConfig.configKey, KEY)).limit(1);
  if (!rows.length) return [];
  const data: unknown = JSON.parse(rows[0].value);
  if (!Array.isArray(data)) return [];
  return data.filter((x): x is H2AdsStartupSite => Boolean(x && typeof x === "object" && typeof x.id === "string" && typeof x.name === "string" && typeof x.url === "string" && typeof x.enabled === "boolean")).slice(0, 20);
}

async function save(sites: H2AdsStartupSite[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco H2ADS indisponivel.");
  const value = JSON.stringify(sites);
  await db.insert(systemConfig).values({ configKey: KEY, configValue: value }).onDuplicateKeyUpdate({ set: { configValue: value } });
}

export async function addH2AdsStartupSite(url: string, name: string): Promise<H2AdsStartupSite[]> {
  const normalized = normalizeH2AdsStartupSiteUrl(url);
  const entries = await listH2AdsStartupSites();
  if (entries.some(x => x.url === normalized)) throw new Error("Site ja cadastrado.");
  if (entries.length >= 20) throw new Error("Limite de 20 sites atingido.");
  const updated = [...entries, { id: randomUUID(), name: name.trim().slice(0, 90), url: normalized, enabled: true }];
  await save(updated);
  return updated;
}

export async function toggleH2AdsStartupSite(id: string, enabled: boolean): Promise<H2AdsStartupSite[]> {
  const entries = await listH2AdsStartupSites();
  if (!entries.some(x => x.id === id)) throw new Error("Site nao encontrado.");
  const updated = entries.map(x => x.id === id ? { ...x, enabled } : x);
  await save(updated);
  return updated;
}

export async function removeH2AdsStartupSite(id: string): Promise<H2AdsStartupSite[]> {
  const entries = await listH2AdsStartupSites();
  if (!entries.some(x => x.id === id)) throw new Error("Site nao encontrado.");
  const updated = entries.filter(x => x.id !== id);
  await save(updated);
  return updated;
}
