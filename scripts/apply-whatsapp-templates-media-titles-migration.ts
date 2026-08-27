import { createConnection } from "mysql2/promise";
import { ensureWhatsappTemplateTitleColumns, ensureWhatsappTemplateUtf8mb4 } from "../server/whatsappTemplateSchemaMigration";

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[whatsapp-templates-migrate] DATABASE_URL não configurada, pulando migration.");
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    const utf8mb4Updated = await ensureWhatsappTemplateUtf8mb4(connection);
    const addedColumns = await ensureWhatsappTemplateTitleColumns(connection);
    const outcomes = [
      utf8mb4Updated ? "Tabela convertida para utf8mb4." : "Tabela já está em utf8mb4.",
      addedColumns.length > 0 ? `Colunas adicionadas: ${addedColumns.join(", ")}.` : "Colunas já existentes.",
    ];
    const outcome = outcomes.join(" ");
    console.log(`[whatsapp-templates-migrate] Estrutura verificada com sucesso. ${outcome}`);
  } catch (error) {
    console.error("[whatsapp-templates-migrate] Falha:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
