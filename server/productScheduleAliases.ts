import {sql} from "drizzle-orm";
export type Alias={optionId:number;productId:number;productName:string;optionLabel:string};
export async function ensureProductScheduleAliasTable(db:any){
 await db.execute(sql`CREATE TABLE IF NOT EXISTS productScheduleAliases (
 optionId INT NOT NULL,productId INT NOT NULL,productName VARCHAR(128) NOT NULL,
 optionLabel VARCHAR(128) NOT NULL,createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(optionId,productName,optionLabel),
 INDEX idx_productScheduleAliases_productId(productId)
 ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
}
export async function captureAliasesBeforeProductRename(tx:any,productId:number,productName:string){
 const res=await tx.execute(sql`SELECT id,label FROM productOptions WHERE productId=${productId}`);
 for(const row of res[0] as Array<{id:number;label:string}>)
   await tx.execute(sql`INSERT IGNORE INTO productScheduleAliases(optionId,productId,productName,optionLabel)
     VALUES(${row.id},${productId},${productName},${row.label})`);
}
export async function captureAliasBeforeOptionRename(tx:any,optionId:number,optionLabel:string){
 await tx.execute(sql`INSERT IGNORE INTO productScheduleAliases(optionId,productId,productName,optionLabel)
   SELECT po.id,po.productId,p.name,${optionLabel} FROM productOptions po
   JOIN products p ON p.id=po.productId WHERE po.id=${optionId}`);
}
export async function loadAutomaticProductAliases(db:any,optionIds:number[]):Promise<Map<number,Alias[]>>{
 const result=new Map<number,Alias[]>();
 if(!optionIds.length)return result;
 await ensureProductScheduleAliasTable(db);
 const rows=await db.execute(sql`SELECT optionId,productId,productName,optionLabel
 FROM productScheduleAliases WHERE optionId IN (${sql.join(optionIds.map(id=>sql`${id}`),sql`, `)})`);
 for(const r of rows[0] as Alias[]){
  const id=Number(r.optionId);const list=result.get(id)||[];
  list.push({...r,optionId:id,productId:Number(r.productId)});result.set(id,list);
 }
 return result;
}
