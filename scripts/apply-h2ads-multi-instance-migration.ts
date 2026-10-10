import { createConnection } from "mysql2/promise";

/**
 * Migration isolada e idempotente: remove apenas a unicidade por pedido.
 * Mantém a chave única instanceId e o índice de consulta por pedido.
 */
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    const [tables] = await connection.query<any[]>(
      "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h2ads_order_links'"
    );
    if (Number(tables[0]?.total) !== 1) throw new Error("Tabela h2ads_order_links não encontrada. Execute a migração original primeiro.");

    const [indexes] = await connection.query<any[]>(
      "SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h2ads_order_links' ORDER BY INDEX_NAME, SEQ_IN_INDEX"
    );
    const columnsFor = (name: string) => indexes.filter(row => row.INDEX_NAME === name).map(row => String(row.COLUMN_NAME));
    if (columnsFor("h2ads_order_links_instance_unique").join(",") !== "instanceId" || indexes.some(row => row.INDEX_NAME === "h2ads_order_links_instance_unique" && Number(row.NON_UNIQUE) !== 0)) {
      throw new Error("Índice único por instância inesperado; nenhuma alteração aplicada.");
    }
    if (columnsFor("h2ads_order_links_order_idx").join(",") !== "registrationId,subOrderIndex") {
      throw new Error("Índice de consulta do pedido inesperado; nenhuma alteração aplicada.");
    }
    const orderUnique = indexes.filter(row => row.INDEX_NAME === "h2ads_order_links_order_unique");
    if (orderUnique.length === 0) {
      console.log("[H2ADS] Índice único por pedido já removido. Sem alterações.");
      return;
    }
    if (orderUnique.some(row => Number(row.NON_UNIQUE) !== 0) || columnsFor("h2ads_order_links_order_unique").join(",") !== "registrationId,subOrderIndex") {
      throw new Error("Índice único por pedido inesperado; nenhuma alteração aplicada.");
    }
    const [duplicateLinks] = await connection.query<any[]>(
      "SELECT instanceId, COUNT(*) AS total FROM h2ads_order_links GROUP BY instanceId HAVING COUNT(*) > 1 LIMIT 1"
    );
    if (duplicateLinks.length) throw new Error("Há instância vinculada mais de uma vez; migração interrompida.");
    await connection.query("ALTER TABLE `h2ads_order_links` DROP INDEX `h2ads_order_links_order_unique`");
    console.log("[H2ADS] Multi-instância por pedido habilitada.");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("[H2ADS] Migração multi-instância falhou:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
