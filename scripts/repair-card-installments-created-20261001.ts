import { createConnection } from "mysql2/promise";
import { bootstrapCardInvoices, createExpenseInvoiceLink, refreshInvoice } from "../server/cardsBilling";
import { buildInstallmentSchedule, saoPauloDateOnly } from "../server/cartaoInstallmentSchedule";

const MIGRATION_KEY = "card-installment-due-cycle-20261001-v1";
const CREATED_DATE = "2026-10-01";

async function run() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS cc_card_migration_log (
      migrationKey VARCHAR(96) PRIMARY KEY,
      appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      details LONGTEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [doneRows] = await connection.query<any[]>(
      "SELECT migrationKey FROM cc_card_migration_log WHERE migrationKey = ? LIMIT 1",
      [MIGRATION_KEY],
    );
    if (doneRows.length) {
      console.log("[card-installment-repair] already applied");
      return;
    }

    await bootstrapCardInvoices();

    await connection.query("CREATE TABLE IF NOT EXISTS cc_backup_20261001_installment_due_gastos LIKE cc_gastos");
    await connection.query("CREATE TABLE IF NOT EXISTS cc_backup_20261001_installment_due_parcelamentos LIKE cc_parcelamentos");
    await connection.query(`INSERT IGNORE INTO cc_backup_20261001_installment_due_parcelamentos
      SELECT * FROM cc_parcelamentos WHERE DATE(createdAt) = ?`, [CREATED_DATE]);
    await connection.query(`INSERT IGNORE INTO cc_backup_20261001_installment_due_gastos
      SELECT g.* FROM cc_gastos g
      INNER JOIN cc_parcelamentos p ON p.id = g.parcelamentoId
      WHERE DATE(p.createdAt) = ?`, [CREATED_DATE]);

    const [parcelamentos] = await connection.query<any[]>(`
      SELECT p.id, p.cartaoId, p.dataInicio, p.numParcelas,
             c.fechamentoDia, c.vencimentoDia
      FROM cc_parcelamentos p
      INNER JOIN cc_cartoes c ON c.id = p.cartaoId
      WHERE DATE(p.createdAt) = ?
      ORDER BY p.id
    `, [CREATED_DATE]);

    const today = saoPauloDateOnly();
    let parcelamentosCorrigidos = 0;
    let parcelasCorrigidas = 0;
    let parcelasHistoricasPagas = 0;

    for (const p of parcelamentos) {
      const purchaseDate = new Date(p.dataInicio).toISOString().slice(0, 10);
      const card = {
        id: Number(p.cartaoId),
        fechamentoDia: p.fechamentoDia ? Number(p.fechamentoDia) : null,
        vencimentoDia: Number(p.vencimentoDia),
      };
      const agenda = buildInstallmentSchedule(purchaseDate, Number(p.numParcelas), card, today);
      const [gastos] = await connection.query<any[]>(
        "SELECT id, numeroParcela, paga, dataOriginal, invoiceId FROM cc_gastos WHERE parcelamentoId = ? AND cartaoId = ? ORDER BY numeroParcela",
        [p.id, p.cartaoId],
      );
      const oldInvoiceIds = new Set<number>();

      for (const gasto of gastos) {
        const item = agenda[(Number(gasto.numeroParcela) || 1) - 1];
        if (!item) continue;
        if (gasto.invoiceId) oldInvoiceIds.add(Number(gasto.invoiceId));

        if (item.historicaPaga) {
          await connection.query(`
            UPDATE cc_gastos
            SET cicloFatura = ?, paga = 1,
                data = ?, dataOriginal = COALESCE(dataOriginal, ?)
            WHERE id = ?
          `, [item.competencia, item.vencimento + " 12:00:00", item.vencimento + " 12:00:00", gasto.id]);
          if (Number(gasto.paga) !== 1) parcelasHistoricasPagas++;
        } else if (Number(gasto.paga) === 0) {
          await connection.query(`
            UPDATE cc_gastos
            SET cicloFatura = ?, data = ?, dataOriginal = NULL
            WHERE id = ?
          `, [item.competencia, item.vencimento + " 12:00:00", gasto.id]);
        } else {
          // Pagamento manual já existente é preservado.
          await connection.query(`
            UPDATE cc_gastos
            SET cicloFatura = ?, dataOriginal = COALESCE(dataOriginal, ?)
            WHERE id = ?
          `, [item.competencia, item.vencimento + " 12:00:00", gasto.id]);
        }

        await createExpenseInvoiceLink(card, item.competencia, Number(gasto.id));
        parcelasCorrigidas++;
      }

      for (const invoiceId of oldInvoiceIds) {
        try { await refreshInvoice(invoiceId); } catch {}
      }
      parcelamentosCorrigidos++;
    }

    const details = JSON.stringify({
      createdDate: CREATED_DATE,
      today,
      parcelamentosCorrigidos,
      parcelasCorrigidas,
      parcelasHistoricasPagas,
    });
    await connection.query(
      "INSERT INTO cc_card_migration_log (migrationKey, details) VALUES (?, ?)",
      [MIGRATION_KEY, details],
    );
    console.log("[card-installment-repair]", details);
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("[card-installment-repair] FAILED", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
