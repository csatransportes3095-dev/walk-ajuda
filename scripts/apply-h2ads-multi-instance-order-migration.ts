import { createConnection } from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    const [tables] = await connection.query<any[]>(
      "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h2ads_order_links'"
    );
    if (Number(tables[0]?.total) !== 1) throw new Error("Tabela h2ads_order_links não encontrada; migração inicial necessária.");
    const [indexes] = await connection.query<any[]>(
      "SELECT COUNT(*) AS total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h2ads_order_links' AND INDEX_NAME = 'h2ads_order_links_order_unique'"
    );
    if (Number(indexes[0]?.total) > 0) {
      await connection.query("ALTER TABLE h2ads_order_links DROP INDEX h2ads_order_links_order_unique");
      console.log("[H2ADS] Restrição de pedido único removida; vínculo individual preservado.");
    } else {
      console.log("[H2ADS] Migração já aplicada; nenhuma alteração.");
    }
  } finally {
    await connection.end();
  }
}
main().catch(error => { console.error("[H2ADS-MULTI]", error); process.exitCode = 1; });
