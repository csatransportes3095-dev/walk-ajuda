import { sql } from "drizzle-orm";
import { getDb } from "./db";

/** An ADM override affects exactly one referred customer's first order.
 * This is NOT a payment. Existing paid/invalid states retain precedence.
 * All amounts are integer cents, never float money.
 */
export type ManualCommissionStatus = "a_liberar" | "liberado";
export type ManualCommissionOverride = {
  registrationId: number;
  commissionValue: number;
  releaseStatus: ManualCommissionStatus;
  updatedAt: string | Date | null;
};

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
let setup: Promise<void> | null = null;

export async function ensureCommissionManualSchema(db: Database): Promise<void> {
  if (!setup) setup = (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS referralCommissionManualOverrides (
      registrationId BIGINT NOT NULL PRIMARY KEY,
      commissionValue BIGINT NOT NULL,
      releaseStatus VARCHAR(20) NOT NULL,
      updatedBy VARCHAR(100) NOT NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS referralCommissionManualAudit (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      registrationId BIGINT NOT NULL,
      oldValue BIGINT NULL,
      oldStatus VARCHAR(20) NULL,
      newValue BIGINT NOT NULL,
      newStatus VARCHAR(20) NOT NULL,
      changedBy VARCHAR(100) NOT NULL,
      changedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_referral_commission_manual_audit (registrationId,changedAt)
    ) ENGINE=InnoDB`);
  })().catch((e) => { setup = null; throw e; });
  await setup;
}

export function applyManualCommissionOverride(
  original: {commissionValue: number; paymentState: string; paymentLabel: string; paymentReady: boolean},
  override: ManualCommissionOverride | null | undefined,
) {
  if (!override) return {...original, manualStatus: null as ManualCommissionStatus | null};
  const commissionValue = override.commissionValue;
  // Manual release does not cancel a payment or reinstate an invalid referral.
  if (original.paymentState === "paga" || original.paymentState === "nao_elegivel") {
    return {...original, commissionValue, manualStatus: override.releaseStatus};
  }
  const released = override.releaseStatus === "liberado";
  return {
    commissionValue,
    paymentState: released ? "liberada" : "aguardando_agendamento",
    paymentLabel: released ? "✅ Liberado para pagamento" : "⏳ A liberar",
    paymentReady: released,
    manualStatus: override.releaseStatus,
  };
}

export async function getCommissionManualOverrides(
  db: Database,
  registrationIds: number[],
): Promise<Map<number, ManualCommissionOverride>> {
  const ids = [...new Set(registrationIds)].filter(id => Number.isSafeInteger(id) && id > 0);
  const result = new Map<number, ManualCommissionOverride>();
  if (!ids.length) return result;
  await ensureCommissionManualSchema(db);
  // Prevent excess placeholders; the H2 AUTO and ADM currently expose <=500 orders.
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const rows: any = await db.execute(sql`SELECT registrationId,commissionValue,releaseStatus,updatedAt
      FROM referralCommissionManualOverrides
      WHERE registrationId IN (${sql.join(slice.map(id => sql`${id}`), sql`,`)})`);
    for (const item of ((rows[0] || []) as any[])) {
      const registrationId = Number(item.registrationId);
      const commissionValue = Number(item.commissionValue);
      const releaseStatus = String(item.releaseStatus);
      if (!Number.isSafeInteger(registrationId) || !Number.isSafeInteger(commissionValue) ||
          commissionValue < 0 || !["a_liberar", "liberado"].includes(releaseStatus)) continue;
      result.set(registrationId, {
        registrationId, commissionValue, releaseStatus: releaseStatus as ManualCommissionStatus,
        updatedAt: item.updatedAt ?? null,
      });
    }
  }
  return result;
}

export async function setCommissionManualOverride(
  db: Database,
  input: {registrationId: number; commissionValue: number; releaseStatus: ManualCommissionStatus},
  changedBy: string,
): Promise<ManualCommissionOverride> {
  const {registrationId,commissionValue,releaseStatus} = input;
  if (!Number.isSafeInteger(registrationId) || registrationId <= 0 ||
      !Number.isSafeInteger(commissionValue) || commissionValue <= 0 ||
      commissionValue > 100_000_000 || !["a_liberar", "liberado"].includes(releaseStatus))
    throw new Error("Informe um valor positivo e um status válido.");
  await ensureCommissionManualSchema(db);
  if (typeof (db as any).transaction !== "function") throw new Error("Transação indisponível");
  const actor = String(changedBy || "admin").slice(0,100);
  await (db as any).transaction(async (tx: any) => {
    // Lock only this referral's first order; exclude unrelated registrations.
    const rows: any = await tx.execute(sql`SELECT
      acp.id AS registrationId,
      COALESCE((SELECT MAX(h.commissionPaid) FROM orderStatusHistory h
        WHERE h.registrationId=acp.id),0) AS paid,
      COALESCE((SELECT MAX(h.referralInvalid) FROM orderStatusHistory h
        WHERE h.registrationId=acp.id),0) AS invalid,
      rca.status AS frozenStatus
      FROM accessCodePhones acp
      JOIN customers c ON RIGHT(REGEXP_REPLACE(c.phone,'[^0-9]',''),11)=
        RIGHT(REGEXP_REPLACE(acp.phone,'[^0-9]',''),11)
      LEFT JOIN referralCommissionAttributions rca ON rca.registrationId=acp.id
      WHERE acp.id=${registrationId}
        AND c.referredByPhone IS NOT NULL AND TRIM(c.referredByPhone)!=''
        AND EXISTS (SELECT 1 FROM orderStatusHistory h WHERE h.registrationId=acp.id)
        AND acp.id=(SELECT MIN(first.id) FROM accessCodePhones first
          WHERE RIGHT(REGEXP_REPLACE(first.phone,'[^0-9]',''),11)=
                RIGHT(REGEXP_REPLACE(acp.phone,'[^0-9]',''),11)
          AND EXISTS (SELECT 1 FROM orderStatusHistory h WHERE h.registrationId=first.id))
      LIMIT 1 FOR UPDATE`);
    const row = (rows[0] || [])[0] as any;
    if (!row) throw new Error("Indicação não encontrada no painel.");
    if (Number(row.paid) === 1 || String(row.frozenStatus) === "paga")
      throw new Error("Comissão já paga. Desfaça o pagamento antes de editar valores.");
    if (Number(row.invalid) === 1 || ["nao_elegivel","cancelada"].includes(String(row.frozenStatus)))
      throw new Error("Indicação não válida. Revalide-a antes de editar valores.");
    const prior: any = await tx.execute(sql`SELECT commissionValue,releaseStatus
      FROM referralCommissionManualOverrides
      WHERE registrationId=${registrationId} LIMIT 1 FOR UPDATE`);
    const prev = (prior[0] || [])[0] as any;
    await tx.execute(sql`INSERT INTO referralCommissionManualOverrides
      (registrationId,commissionValue,releaseStatus,updatedBy)
      VALUES (${registrationId},${commissionValue},${releaseStatus},${actor})
      ON DUPLICATE KEY UPDATE commissionValue=VALUES(commissionValue),
        releaseStatus=VALUES(releaseStatus),updatedBy=VALUES(updatedBy),updatedAt=NOW()`);
    await tx.execute(sql`INSERT INTO referralCommissionManualAudit
      (registrationId,oldValue,oldStatus,newValue,newStatus,changedBy)
      VALUES (${registrationId},${prev?.commissionValue ?? null},
        ${prev?.releaseStatus ?? null},${commissionValue},${releaseStatus},${actor})`);
  });
  return {registrationId,commissionValue,releaseStatus,updatedAt:new Date()};
}
