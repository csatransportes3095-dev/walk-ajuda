/**
 * A aprovação do cadastro é diferente das permissões individuais de cada rota.
 * Clientes antigos continuam liberados; somente registros novos criados no
 * modo MANUAL aguardam a ação OK APROVADO do ADM.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type RegistrationReviewMode = "automatico" | "manual";
export type RegistrationReviewStatus = "pending" | "approved";

async function rows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  return (result[0] || result || []) as any[];
}

let schemaReady: Promise<void> | null = null;

export async function ensureRegistrationReviewSchema(db: any): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS customerRegistrationReviewConfig (
        id TINYINT NOT NULL PRIMARY KEY,
        mode VARCHAR(16) NOT NULL DEFAULT 'automatico',
        manualSince DATETIME(3) NULL,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS customerRegistrationReviews (
        customerId INT NOT NULL PRIMARY KEY,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        reviewedBy VARCHAR(120) NULL,
        reviewedAt DATETIME NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_registration_reviews_status (status,createdAt)
      )`);
      await db.execute(sql`INSERT IGNORE INTO customerRegistrationReviewConfig (id,mode)
        VALUES (1,'automatico')`);
    })().catch(err => { schemaReady = null; throw err; });
  }
  await schemaReady;
}

export async function getRegistrationReviewMode(dbArg?: any): Promise<RegistrationReviewMode> {
  const db = dbArg || await getDb();
  if (!db) throw new Error("Banco de cadastros indisponível.");
  await ensureRegistrationReviewSchema(db);
  const [setting] = await rows(db,sql`SELECT mode FROM customerRegistrationReviewConfig WHERE id=1`);
  return setting?.mode === "manual" ? "manual" : "automatico";
}

export async function setRegistrationReviewMode(mode: RegistrationReviewMode): Promise<RegistrationReviewMode> {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de cadastros indisponível.");
  await ensureRegistrationReviewSchema(db);
  await db.transaction(async (tx: any) => {
    const [current] = await rows(tx,sql`SELECT mode FROM customerRegistrationReviewConfig WHERE id=1 FOR UPDATE`);
    if (current?.mode === mode) return;
    if (mode === "automatico") {
      await tx.execute(sql`UPDATE customerRegistrationReviews SET status='approved',
        reviewedBy='Liberação automática',reviewedAt=NOW()
        WHERE status='pending'`);
      await tx.execute(sql`UPDATE customerRegistrationReviewConfig
        SET mode='automatico',manualSince=NULL WHERE id=1`);
    } else {
      await tx.execute(sql`UPDATE customerRegistrationReviewConfig
        SET mode='manual',manualSince=NOW(3) WHERE id=1`);
    }
  });
  return mode;
}

/** Called ONLY when the main customer has just been created. */
export async function registerNewCustomerForReview(customerId: number): Promise<RegistrationReviewStatus> {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de cadastros indisponível.");
  await ensureRegistrationReviewSchema(db);
  return db.transaction(async (tx: any) => {
    const [setting] = await rows(tx,sql`SELECT mode FROM customerRegistrationReviewConfig WHERE id=1 FOR UPDATE`);
    const pending = setting?.mode === "manual";
    await tx.execute(sql`INSERT INTO customerRegistrationReviews (customerId,status,reviewedBy,reviewedAt)
      VALUES (${customerId},${pending ? 'pending' : 'approved'},
        ${pending ? null : 'Liberação automática'},${pending ? null : new Date()})
      ON DUPLICATE KEY UPDATE customerId=customerId`);
    return pending ? "pending" : "approved";
  });
}

/** An untracked legacy customer is approved, unless created after manual mode began. */
export async function getRegistrationReviewStatus(db: any, customerId: number): Promise<RegistrationReviewStatus> {
  await ensureRegistrationReviewSchema(db);
  const [result] = await rows(db,sql`SELECT
      COALESCE(r.status, CASE
        WHEN cfg.mode='manual' AND cfg.manualSince IS NOT NULL AND c.createdAt >= cfg.manualSince
        THEN 'pending' ELSE 'approved' END) AS reviewStatus
      FROM customers c CROSS JOIN customerRegistrationReviewConfig cfg
      LEFT JOIN customerRegistrationReviews r ON r.customerId=c.id
      WHERE c.id=${customerId} AND c.deletedAt IS NULL LIMIT 1`);
  return result?.reviewStatus === 'approved' ? 'approved' : 'pending';
}

export async function listRegistrationReviews(): Promise<Array<{
 customerId:number;status:RegistrationReviewStatus;name:string;phone:string;profilePhotoUrl:string|null;
 customerNumber:number|null;createdAt:Date|string;
}>> {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de cadastros indisponível.");
  await ensureRegistrationReviewSchema(db);
  const found = await rows(db,sql`SELECT c.id AS customerId,c.name,c.phone,c.profilePhotoUrl,
    c.customerNumber,c.createdAt,
    COALESCE(r.status, CASE WHEN cfg.mode='manual' AND cfg.manualSince IS NOT NULL
      AND c.createdAt>=cfg.manualSince THEN 'pending' ELSE 'approved' END) AS status
    FROM customers c
    CROSS JOIN customerRegistrationReviewConfig cfg
    LEFT JOIN customerRegistrationReviews r ON r.customerId=c.id
    WHERE c.deletedAt IS NULL AND (r.customerId IS NOT NULL
      OR (cfg.mode='manual' AND cfg.manualSince IS NOT NULL AND c.createdAt>=cfg.manualSince))
    ORDER BY CASE WHEN COALESCE(r.status,CASE WHEN cfg.mode='manual'
      AND c.createdAt>=cfg.manualSince THEN 'pending' ELSE 'approved' END)='pending'
      THEN 0 ELSE 1 END,c.createdAt DESC LIMIT 500`);
  return found.map((item: any) => ({
    customerId:Number(item.customerId),status:item.status === 'pending' ? 'pending' : 'approved',
    name:String(item.name || ''),phone:String(item.phone || ''),
    profilePhotoUrl:item.profilePhotoUrl || null,
    customerNumber:item.customerNumber == null ? null : Number(item.customerNumber),
    createdAt:item.createdAt,
  }));
}

export async function approveRegistration(customerId:number): Promise<void> {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de cadastros indisponível.");
  await ensureRegistrationReviewSchema(db);
  await db.transaction(async (tx:any) => {
    const [customer] = await rows(tx,sql`SELECT id FROM customers
      WHERE id=${customerId} AND deletedAt IS NULL LIMIT 1 FOR UPDATE`);
    if (!customer) throw new Error("Cadastro não localizado.");
    await tx.execute(sql`INSERT INTO customerRegistrationReviews
      (customerId,status,reviewedBy,reviewedAt)
      VALUES (${customerId},'approved','Administrador',NOW())
      ON DUPLICATE KEY UPDATE status='approved',reviewedBy='Administrador',
      reviewedAt=NOW()`);
  });
}
