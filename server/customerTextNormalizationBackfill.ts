import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { normalizedCustomerTextRecord, hasCustomerTextDifferences, type CustomerTextRecord } from "../shared/customerTextNormalization";

/** One-time, restart-safe backfill. Always preserve original text per customer
 * before any update. Never alter identity columns, route grants, photos or orders.
 */
export async function backfillCustomerTextNormalization(): Promise<{normalized:number;skipped:number}> {
  const db=await getDb() as any;
  if(!db)throw new Error("Banco indisponivel para normalizar cadastro.");
  const marker="customer_text_ascii_uppercase_20261018_v1";
  await db.execute(sql`CREATE TABLE IF NOT EXISTS customerTextNormalizationBackup (
    customerId INT NOT NULL PRIMARY KEY,
    originalJson TEXT NOT NULL,
    backedUpAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const setting=await db.execute(sql`SELECT settingValue FROM siteSettings WHERE settingKey=${marker} LIMIT 1`);
  if((setting[0] as any[]).some((row:any)=>row.settingValue==="done"))return {normalized:0,skipped:0};
  const rows=await db.execute(sql`SELECT id,name,street,addressNumber,neighborhood,addressComplement,city,uf,referredBy
    FROM customers WHERE deletedAt IS NULL ORDER BY id ASC`);
  let normalized=0,skipped=0;
  for(const original of rows[0] as any[]){
    const fields:CustomerTextRecord={
      name:original.name??null,street:original.street??null,
      addressNumber:original.addressNumber??null,neighborhood:original.neighborhood??null,
      addressComplement:original.addressComplement??null,city:original.city??null,
      uf:original.uf??null,referredBy:original.referredBy??null
    };
    const next=normalizedCustomerTextRecord(fields);
    if(!hasCustomerTextDifferences(fields,next)){skipped++;continue;}
    const id=Number(original.id);
    if(!Number.isInteger(id)||id<=0)throw new Error("Invalid customer id");
    // Archive the original only once. An interrupted run will never replace it.
    await db.execute(sql`INSERT IGNORE INTO customerTextNormalizationBackup(customerId,originalJson)
      VALUES(${id},${JSON.stringify(fields)})`);
    await db.execute(sql`UPDATE customers SET
      name=${next.name},street=${next.street},addressNumber=${next.addressNumber},
      neighborhood=${next.neighborhood},addressComplement=${next.addressComplement},
      city=${next.city},uf=${next.uf},referredBy=${next.referredBy}
      WHERE id=${id} AND deletedAt IS NULL`);
    normalized++;
  }
  await db.execute(sql`INSERT INTO siteSettings(settingKey,settingValue) VALUES(${marker},'done')
    ON DUPLICATE KEY UPDATE settingValue='done'`);
  return {normalized,skipped};
}
