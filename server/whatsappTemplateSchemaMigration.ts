export const WHATSAPP_TEMPLATE_TITLE_COLUMNS = [
  { name: "imageTitle", definition: "VARCHAR(200) NULL" },
  { name: "videoTitle", definition: "VARCHAR(200) NULL" },
] as const;

export type SqlQueryable = {
  query: (statement: string, values?: readonly unknown[]) => Promise<[unknown, unknown]>;
};

export async function ensureWhatsappTemplateUtf8mb4(connection: SqlQueryable): Promise<boolean> {
  const [rows] = await connection.query("SHOW TABLE STATUS LIKE ?", ["whatsappTemplates"]);
  const table = Array.isArray(rows) ? rows[0] as { Collation?: unknown } | undefined : undefined;
  const collation = String(table?.Collation ?? "").toLowerCase();

  if (collation.startsWith("utf8mb4_")) return false;

  await connection.query(
    "ALTER TABLE `whatsappTemplates` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  return true;
}

export async function ensureWhatsappTemplateTitleColumns(connection: SqlQueryable): Promise<string[]> {
  const addedColumns: string[] = [];

  for (const column of WHATSAPP_TEMPLATE_TITLE_COLUMNS) {
    const [rows] = await connection.query(
      "SHOW COLUMNS FROM `whatsappTemplates` LIKE ?",
      [column.name],
    );

    if (Array.isArray(rows) && rows.length > 0) continue;

    await connection.query(
      `ALTER TABLE \`whatsappTemplates\` ADD COLUMN \`${column.name}\` ${column.definition}`,
    );
    addedColumns.push(column.name);
  }

  return addedColumns;
}
