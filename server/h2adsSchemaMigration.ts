export const H2ADS_MIGRATION_FILE = "0137_h2ads_base.sql";

export function assertH2AdsSchemaStatementSafe(statement: string): void {
  const normalized = statement.trim().toLowerCase();
  if (!normalized.startsWith("create table if not exists `h2ads_")) {
    throw new Error("A migração H2 Ads só pode criar tabelas próprias com prefixo h2ads_.");
  }
  const withoutSafeTimestampClause = normalized.replace(/\bon\s+update\s+current_timestamp(?:\s*\(\s*\d+\s*\))?\b/g, "");
  if (/\b(drop|truncate|delete|update|insert|alter)\b/.test(withoutSafeTimestampClause)) {
    throw new Error("Comando não permitido na migração base H2 Ads.");
  }
}
