import { describe, expect, it } from "vitest";
import { ensureWhatsappTemplateTitleColumns, type SqlQueryable } from "./whatsappTemplateSchemaMigration";

function createConnectionWithColumns(existingColumns: string[]): { connection: SqlQueryable; statements: string[] } {
  const statements: string[] = [];
  const connection: SqlQueryable = {
    query: async (statement, values) => {
      statements.push(statement);
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
});
