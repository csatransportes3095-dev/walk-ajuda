import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertH2AdsSchemaStatementSafe } from "./h2adsSchemaMigration";

describe("migration de credenciais H2 Ads", () => {
  it("cria somente a tabela isolada de conteúdo cifrado", () => {
    const sql = fs.readFileSync(path.resolve(import.meta.dirname, "..", "drizzle", "0139_h2ads_proxy_credentials.sql"), "utf8");
    expect(() => assertH2AdsSchemaStatementSafe(sql)).not.toThrow();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `h2ads_instance_proxy_credentials`");
    expect(sql).toContain("encryptedPayload");
  });

  it("não cria colunas de host, porta, utilizador ou palavra-passe em texto aberto", () => {
    const sql = fs.readFileSync(path.resolve(import.meta.dirname, "..", "drizzle", "0139_h2ads_proxy_credentials.sql"), "utf8");
    for (const prohibitedField of ["proxyHost", "proxyPort", "proxyUsername", "proxyPassword", "browserWSEndpoint"]) {
      expect(sql).not.toContain(prohibitedField);
    }
  });
});
