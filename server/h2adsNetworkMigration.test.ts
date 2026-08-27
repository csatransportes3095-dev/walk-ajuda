import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertH2AdsSchemaStatementSafe } from "./h2adsSchemaMigration";

describe("migration de metadados de conectividade H2 Ads", () => {
  it("cria somente o perfil isolado por instância H2 Ads", () => {
    const sql = fs.readFileSync(path.resolve(import.meta.dirname, "..", "drizzle", "0138_h2ads_network_metadata.sql"), "utf8");
    expect(() => assertH2AdsSchemaStatementSafe(sql)).not.toThrow();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `h2ads_instance_network_profiles`");
    expect(sql).toContain("UNIQUE KEY `h2ads_network_profile_instance_uq` (`instanceId`)");
  });

  it("não guarda endpoint, credencial ou segredo de proxy", () => {
    const sql = fs.readFileSync(path.resolve(import.meta.dirname, "..", "drizzle", "0138_h2ads_network_metadata.sql"), "utf8");
    for (const prohibitedField of ["proxyUrl", "proxyPassword", "browserWSEndpoint", "credential", "secret"]) {
      expect(sql).not.toContain(prohibitedField);
    }
  });
});
