import { eq } from "drizzle-orm";
import { systemConfig } from "../drizzle/schema";
import { getDb } from "./db";

const PREFIX = "h2ads_auto_refresh_v1_";
export const H2ADS_AUTO_REFRESH_MIN_SECONDS = 30;
export const H2ADS_AUTO_REFRESH_MAX_SECONDS = 86_400;

export type H2AdsAutoRefreshPolicy = {
  instanceId: number;
  intervalSeconds: number;
};

export function validateH2AdsAutoRefreshInterval(value: number): number {
  // Zero explicitly disables the capability for this instance.
  if (!Number.isInteger(value) ||
      (value !== 0 && (value < H2ADS_AUTO_REFRESH_MIN_SECONDS ||
                       value > H2ADS_AUTO_REFRESH_MAX_SECONDS))) {
    throw new Error("Informe 0 para desativar ou entre 30 e 86400 segundos.");
  }
  return value;
}

function key(instanceId: number): string {
  if (!Number.isSafeInteger(instanceId) || instanceId < 1) {
    throw new Error("Instância H2 Ads inválida.");
  }
  return `${PREFIX}${instanceId}`;
}

export async function getH2AdsAutoRefreshPolicy(instanceId: number): Promise<H2AdsAutoRefreshPolicy> {
  const db = await getDb();
  if (!db) throw new Error("Banco H2 Ads indisponível.");
  const rows = await db.select({ value: systemConfig.configValue })
    .from(systemConfig).where(eq(systemConfig.configKey, key(instanceId))).limit(1);
  let intervalSeconds = 0;
  if (rows[0]) {
    const candidate = Number(rows[0].value);
    try { intervalSeconds = validateH2AdsAutoRefreshInterval(candidate); }
    catch { intervalSeconds = 0; }
  }
  return { instanceId, intervalSeconds };
}

export async function saveH2AdsAutoRefreshPolicy(
  instanceId: number, intervalSeconds: number,
): Promise<H2AdsAutoRefreshPolicy> {
  const value = validateH2AdsAutoRefreshInterval(intervalSeconds);
  const db = await getDb();
  if (!db) throw new Error("Banco H2 Ads indisponível.");
  await db.insert(systemConfig).values({
    configKey: key(instanceId), configValue: String(value),
  }).onDuplicateKeyUpdate({ set: { configValue: String(value) } });
  return { instanceId, intervalSeconds: value };
}
