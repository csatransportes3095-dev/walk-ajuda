import { describe, expect, it } from "vitest";
import { assertH2AdsSchemaStatementSafe } from "./h2adsSchemaMigration";

describe("H2 Ads base migration safety", () => {
  it("permite criar apenas tabelas H2 Ads de forma idempotente", () => {
    expect(() => assertH2AdsSchemaStatementSafe("CREATE TABLE IF NOT EXISTS `h2ads_groups` (id int)")).not.toThrow();
    expect(() => assertH2AdsSchemaStatementSafe("CREATE TABLE IF NOT EXISTS `h2ads_instances` (id int)")).not.toThrow();
  });

  it("rejeita tabelas fora do módulo e comandos de alteração de dados", () => {
    expect(() => assertH2AdsSchemaStatementSafe("CREATE TABLE customers (id int)")).toThrow();
    expect(() => assertH2AdsSchemaStatementSafe("DELETE FROM h2ads_groups")).toThrow();
    expect(() => assertH2AdsSchemaStatementSafe("ALTER TABLE h2ads_groups ADD COLUMN unsafe int")).toThrow();
  });
});
