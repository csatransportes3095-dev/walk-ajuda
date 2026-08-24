import { createConnection } from "mysql2/promise";

if (!String(process.env.DATABASE_URL || "").trim()) throw new Error("DATABASE_URL ausente");

const qid = value => `\`${String(value).replace(/`/g, "``")}\``;
const digits = value => String(value || "").replace(/\D/g, "").slice(-11);

async function main() {
  const db = await createConnection(process.env.DATABASE_URL);
  try {
    const [tableRows] = await db.query("SHOW TABLES");
    const allTables = tableRows.map(row => String(Object.values(row)[0]));
    const selected = allTables.filter(name => /(order|pedido|hidden|folder|accessCodePhone|registration)/i.test(name));
    const output = [];
    const registrationIds = new Set();
    const phoneByRegistration = new Map();
    const deliveredIds = new Set();

    for (const table of selected) {
      const [columnsRows] = await db.query(`SHOW COLUMNS FROM ${qid(table)}`);
      const columns = new Set(columnsRows.map(row => String(row.Field)));
      const [[countRow]] = await db.query(`SELECT COUNT(*) total FROM ${qid(table)}`);
      const total = Number(countRow.total || 0);
      const summary = { tabela: table, total };

      if (columns.has("registrationId")) {
        const [[row]] = await db.query(`SELECT COUNT(DISTINCT registrationId) total FROM ${qid(table)} WHERE registrationId IS NOT NULL`);
        summary.pedidosUnicos = Number(row.total || 0);
        if (total > 0) {
          const phoneColumn = columns.has("customerPhone") ? "customerPhone" : null;
          const selectPhone = phoneColumn ? `,${qid(phoneColumn)} phone` : ",NULL phone";
          const [refs] = await db.query(`SELECT DISTINCT registrationId${selectPhone} FROM ${qid(table)} WHERE registrationId IS NOT NULL`);
          for (const ref of refs) {
            const id = Number(ref.registrationId);
            if (!Number.isFinite(id)) continue;
            registrationIds.add(id);
            const phone = digits(ref.phone);
            if (phone) phoneByRegistration.set(id, phone);
          }
        }
      }

      if (columns.has("folderKey") && total > 0) {
        const [groups] = await db.query(`SELECT folderKey,COUNT(*) total,COUNT(DISTINCT registrationId) pedidos FROM ${qid(table)} GROUP BY folderKey ORDER BY folderKey`);
        summary.porPasta = groups.map(row => ({ pasta: String(row.folderKey || ""), total: Number(row.total || 0), pedidos: Number(row.pedidos || 0) }));
        const [delivered] = await db.query(`SELECT DISTINCT registrationId FROM ${qid(table)} WHERE LOWER(folderKey) LIKE '%entreg%'`);
        for (const row of delivered) deliveredIds.add(Number(row.registrationId));
      }

      if (columns.has("status") && total > 0) {
        const [groups] = await db.query(`SELECT status,COUNT(*) total,COUNT(DISTINCT ${columns.has("registrationId") ? "registrationId" : "id"}) pedidos FROM ${qid(table)} GROUP BY status ORDER BY total DESC`);
        summary.porStatus = groups.slice(0, 30).map(row => ({ status: String(row.status || ""), total: Number(row.total || 0), pedidos: Number(row.pedidos || 0) }));
        if (columns.has("registrationId")) {
          const [delivered] = await db.query(`SELECT DISTINCT registrationId FROM ${qid(table)} WHERE LOWER(status) IN ('entregue','pedido_entregue','login_de_acesso')`);
          for (const row of delivered) deliveredIds.add(Number(row.registrationId));
        }
      }

      output.push(summary);
    }

    if (allTables.includes("accessCodePhones")) {
      const [rows] = await db.query("SELECT id,phone FROM accessCodePhones");
      for (const row of rows) {
        const id = Number(row.id);
        if (!Number.isFinite(id)) continue;
        registrationIds.add(id);
        const phone = digits(row.phone);
        if (phone) phoneByRegistration.set(id, phone);
      }
    }

    const deliveredWithPhone = [...deliveredIds].filter(id => phoneByRegistration.has(id)).length;
    console.log("VARREDURA COMPLETA DAS PASTAS DE PEDIDOS", {
      tabelasEncontradas: selected.length,
      referenciasUnicasDePedido: registrationIds.size,
      referenciasComTelefone: [...registrationIds].filter(id => phoneByRegistration.has(id)).length,
      entreguesOuLoginIdentificados: deliveredIds.size,
      entreguesComTelefone: deliveredWithPhone,
    });
    console.log("CONTAGEM POR TABELA/PASTA/STATUS", output.filter(row => row.total > 0));
    console.log("MODO VARREDURA: nenhum dado foi alterado");
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error("FALHA NA VARREDURA COMPLETA", error);
  process.exit(1);
});
