import { createConnection } from "mysql2/promise";
import { r2ListObjects, buildR2PublicUrl } from "../server/r2Storage";

const CUTOFF = "2026-08-22";
const MARKER = "walk-ajuda-loans-confirmed-current-through-2026-08-22-v1";

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

function sameIdentity(a: any, b: any) {
  const ac = digits(a?.cpf);
  const bc = digits(b?.cpf);
  if (ac.length === 11 && ac === bc) return true;
  const ap = digits(a?.phone);
  const bp = digits(b?.phone);
  return !!ap && !!bp && (ap === bp || ap.endsWith(bp) || bp.endsWith(ap));
}

async function repairFinancialState(db: any) {
  await db.query(`CREATE TABLE IF NOT EXISTS loanRecoveryMeta (
    recoveryKey VARCHAR(100) NOT NULL,
    appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    summaryJson TEXT NULL,
    PRIMARY KEY(recoveryKey)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  const [done]: any = await db.execute("SELECT recoveryKey FROM loanRecoveryMeta WHERE recoveryKey=? LIMIT 1", [MARKER]);
  if (Array.isArray(done) && done.length) {
    console.log("[loans-20260822-fix] correção financeira já aplicada.");
    return { alreadyApplied: true, installmentsFixed: 0, loansClosed: 0 };
  }

  await db.beginTransaction();
  try {
    // Informação operacional confirmada pelo proprietário em 24/08/2026:
    // não havia parcelas em atraso até 22/08/2026. O backup é de 28/07 e,
    // portanto, deixou como pendentes parcelas que foram quitadas depois do backup.
    const [updateInstallments]: any = await db.execute(`
      UPDATE loanInstallments
      SET status='pago',
          paidBy=COALESCE(NULLIF(paidBy,''), 'RECUPERAÇÃO ATÉ 22/08/2026'),
          notes=CASE
            WHEN notes IS NULL OR TRIM(notes)='' THEN 'Situação recuperada: sem atraso confirmado até 22/08/2026.'
            WHEN notes NOT LIKE '%sem atraso confirmado até 22/08/2026%' THEN CONCAT(notes, '\nSituação recuperada: sem atraso confirmado até 22/08/2026.')
            ELSE notes
          END,
          updatedAt=NOW()
      WHERE dueDate <= ?
        AND status IN ('pendente','atrasado')
    `, [CUTOFF]);

    // Fecha somente empréstimos que, depois da correção, não possuem nenhuma
    // parcela aberta. Empréstimos com parcelas futuras continuam ativos.
    const [updateLoans]: any = await db.execute(`
      UPDATE loans l
      SET l.status='pago',
          l.paidBy=COALESCE(NULLIF(l.paidBy,''), 'RECUPERAÇÃO ATÉ 22/08/2026'),
          l.updatedAt=NOW()
      WHERE l.status NOT IN ('pago','cancelado','reprovado')
        AND EXISTS (SELECT 1 FROM loanInstallments li0 WHERE li0.loanId=l.id)
        AND NOT EXISTS (
          SELECT 1 FROM loanInstallments li
          WHERE li.loanId=l.id
            AND li.status NOT IN ('pago','pago_juros')
        )
    `);

    const summary = {
      cutoff: CUTOFF,
      installmentsFixed: Number(updateInstallments?.affectedRows || 0),
      loansClosed: Number(updateLoans?.affectedRows || 0),
    };
    await db.execute("INSERT INTO loanRecoveryMeta(recoveryKey,summaryJson) VALUES (?,?)", [MARKER, JSON.stringify(summary)]);
    await db.commit();
    console.log("[loans-20260822-fix] situação financeira corrigida:", JSON.stringify(summary));
    return summary;
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

async function repairLoanCustomerPhotos(db: any) {
  const [loanRowsRaw]: any = await db.query("SELECT id,name,phone,cpf FROM loanClients");
  const [customersRaw]: any = await db.query("SELECT id,name,phone,cpf,profilePhotoUrl FROM customers WHERE deletedAt IS NULL");
  const loanRows = Array.isArray(loanRowsRaw) ? loanRowsRaw : [];
  const customers = Array.isArray(customersRaw) ? customersRaw : [];

  let repaired = 0;
  let foundExistingR2 = 0;
  let noR2Object = 0;

  for (const loanClient of loanRows) {
    const customer = customers.find((row: any) => sameIdentity(row, loanClient));
    if (!customer) continue;

    const currentUrl = String(customer.profilePhotoUrl || "").trim();
    const needsRepair = !currentUrl || currentUrl.includes("d2xsxph8kpxj0f.cloudfront.net");
    if (!needsRepair) continue;

    const phone = digits(customer.phone || loanClient.phone);
    if (!phone) continue;

    try {
      const listedKeys = await r2ListObjects(`profile-photos/${phone}`);
      const keys = Array.isArray(listedKeys) ? listedKeys : [];
      const imageKeys = keys
        .filter((key) => /\.(jpg|jpeg|png|webp)$/i.test(String(key)))
        .sort();
      const key = imageKeys.at(-1);
      if (!key) {
        noR2Object++;
        continue;
      }
      foundExistingR2++;
      const newUrl = buildR2PublicUrl(key);
      if (newUrl !== currentUrl) {
        await db.execute("UPDATE customers SET profilePhotoUrl=?, updatedAt=NOW() WHERE id=?", [newUrl, customer.id]);
        repaired++;
      }
    } catch (error) {
      console.warn(`[loans-20260822-fix] foto não localizada no R2 para customer ${customer.id}:`, error instanceof Error ? error.message : String(error));
    }
  }

  const result = { repaired, foundExistingR2, noR2Object };
  console.log("[loans-20260822-fix] fotos:", JSON.stringify(result));
  return result;
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[loans-20260822-fix] DATABASE_URL ausente; pulando.");
    return;
  }

  const db = await createConnection(process.env.DATABASE_URL);
  try {
    await repairFinancialState(db);
    await repairLoanCustomerPhotos(db);
  } catch (error) {
    console.error("[loans-20260822-fix] falha:", error instanceof Error ? error.message : String(error));
    // Não derruba o site. A correção pode ser repetida no próximo deploy.
  } finally {
    await db.end();
  }
}

void run();
