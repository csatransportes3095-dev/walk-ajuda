import { describe, expect, it } from "vitest";
import { ensureWhatsappTemplateTitleColumns, ensureWhatsappTemplateUtf8mb4, type SqlQueryable } from "./whatsappTemplateSchemaMigration";

function createConnectionWithColumns(existingColumns: string[], collation = "utf8mb4_unicode_ci"): { connection: SqlQueryable; statements: string[] } {
  const statements: string[] = [];
  const connection: SqlQueryable = {
    query: async (statement, values) => {
      statements.push(statement);
      if (statement.startsWith("SHOW TABLE STATUS")) {
        return [[{ Collation: collation }], []];
      }
      if (statement.startsWith("SHOW COLUMNS")) {
        const column = values?.[0];
        return [existingColumns.includes(column as string) ? [{ Field: column }] : [], []];
      }
      return [[], []];
    },
  };
  return { connection, statements };
}

describe("whatsapp template schema migration", () => {
  it("adiciona somente imageTitle e videoTitle quando estão ausentes", async () => {
    const { connection, statements } = createConnectionWithColumns([]);

    await expect(ensureWhatsappTemplateTitleColumns(connection)).resolves.toEqual(["imageTitle", "videoTitle"]);

    expect(statements).toContain("ALTER TABLE `whatsappTemplates` ADD COLUMN `imageTitle` VARCHAR(200) NULL");
    expect(statements).toContain("ALTER TABLE `whatsappTemplates` ADD COLUMN `videoTitle` VARCHAR(200) NULL");
    expect(statements).toHaveLength(4);
  });

  it("não executa ALTER TABLE quando as colunas já existem", async () => {
    const { connection, statements } = createConnectionWithColumns(["imageTitle", "videoTitle"]);

    await expect(ensureWhatsappTemplateTitleColumns(connection)).resolves.toEqual([]);

    expect(statements).toHaveLength(2);
    expect(statements.every(statement => statement.startsWith("SHOW COLUMNS"))).toBe(true);
  });

  it("converte a tabela para utf8mb4 somente quando a collation ainda não suporta emojis", async () => {
    const legacy = createConnectionWithColumns([], "utf8_general_ci");
    const current = createConnectionWithColumns([], "utf8mb4_unicode_ci");

    await expect(ensureWhatsappTemplateUtf8mb4(legacy.connection)).resolves.toBe(true);
    await expect(ensureWhatsappTemplateUtf8mb4(current.connection)).resolves.toBe(false);

    expect(legacy.statements).toContain("ALTER TABLE `whatsappTemplates` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    expect(current.statements).toHaveLength(1);
  });
});
