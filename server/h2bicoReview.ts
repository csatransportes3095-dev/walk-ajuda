import {TRPCError} from "@trpc/server";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {getDb} from "./db";
import {adminProcedure,router} from "./_core/trpc";

const LOT_SIZE=1500;
const filterSchema=z.enum(["all","pending","confirmed","discarded"]);
const scopeSchema=z.enum(["all","active","archived","used"]);
const cpfSchema=z.string().trim()
  .regex(/^(?:[0-9]{11}|[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2})$/,"CPF de 11 digitos, com ou sem pontuacao")
  .transform(cpf=>cpf.replace(/[^0-9]/g,""));
const lotRefSchema=z.object({
  runId:z.number().int().positive(),
  lotIndex:z.number().int().min(0),
}).strict();

type Database=NonNullable<Awaited<ReturnType<typeof getDb>>>;
let schemaReady:Promise<void>|null=null;

/** Does not alter any existing H2BICO record or existing EAR marker. */
export async function ensureH2BicoReviewSchema(db:Database):Promise<void>{
  if(!schemaReady){
    schemaReady=(async()=>{
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS h2bico_review (
          recordId INT NOT NULL PRIMARY KEY,
          reviewState ENUM('confirmed','discarded') NOT NULL,
          reviewedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_h2bico_review_state (reviewState)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS h2bico_review_runs (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          reviewFilter ENUM('all','pending','confirmed','discarded') NOT NULL,
          statusScope ENUM('all','active','archived','used') NOT NULL,
          total INT NOT NULL DEFAULT 0,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_h2bico_review_runs_created (createdAt)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS h2bico_review_run_items (
          runId BIGINT UNSIGNED NOT NULL,
          recordId INT NOT NULL,
          ordinal INT NOT NULL,
          PRIMARY KEY (runId,recordId),
          UNIQUE KEY idx_h2bico_review_run_ordinal (runId,ordinal)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
    })().catch(error=>{schemaReady=null;throw error;});
  }
  await schemaReady;
}
async function reviewDb(){
  const db=await getDb();
  if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Banco H2BICO indisponivel."});
  await ensureH2BicoReviewSchema(db);
  return db;
}
function statePredicate(value:z.infer<typeof filterSchema>){
  if(value==="pending")return sql`rv.recordId IS NULL`;
  if(value==="confirmed")return sql`rv.reviewState='confirmed'`;
  if(value==="discarded")return sql`rv.reviewState='discarded'`;
  return sql`1=1`;
}
function statusPredicate(value:z.infer<typeof scopeSchema>){
  if(value==="active")return sql`r.status IN ('available','reserved','in_use')`;
  if(value==="archived")return sql`r.status='archived'`;
  if(value==="used")return sql`r.status='used'`;
  return sql`1=1`;
}
function checkedLot(index:number){
  if(index>1_000_000)throw new TRPCError({code:"BAD_REQUEST",message:"Numero de lote invalido."});
  return {begin:index*LOT_SIZE,end:(index+1)*LOT_SIZE-1};
}
async function assertRun(db:Database,runId:number){
  const rows=await db.execute(sql`SELECT id,total,reviewFilter,statusScope,createdAt
    FROM h2bico_review_runs WHERE id=${runId} LIMIT 1`);
  const run=(rows[0] as any[])[0];
  if(!run)throw new TRPCError({code:"NOT_FOUND",message:"Conferencia nao encontrada."});
  return {id:Number(run.id),total:Number(run.total),reviewFilter:String(run.reviewFilter),statusScope:String(run.statusScope),createdAt:run.createdAt};
}
async function updateReviewState(tx:any,ids:number[],state:"confirmed"|"discarded",history:string){
  // Chunked writes protect the database from oversized queries. The caller
  // performs full eligibility validation before starting this transaction.
  for(let start=0;start<ids.length;start+=250){
    const chunk=ids.slice(start,start+250);
    if(!chunk.length)continue;
    const values=sql.join(chunk.map(id=>sql`(${id},${state})`),sql`, `);
    await tx.execute(sql`
      INSERT INTO h2bico_review(recordId,reviewState)
      VALUES ${values}
      ON DUPLICATE KEY UPDATE reviewState=VALUES(reviewState), reviewedAt=CURRENT_TIMESTAMP
    `);
    await tx.execute(sql`INSERT INTO h2bico_history(recordId,action,details)
      VALUES ${sql.join(chunk.map(id=>sql`(${id},${history},'Conferencia de CPFs por lote no ADM H2BICO')`),sql`, `)}`);
  }
}
type LockedRow={id:number;cpf:string;status:string;linkedOrder:string|null;usedAt:Date|null;reviewState:"confirmed"|"discarded"|null};
const lockedRows=(rows:any[]):LockedRow[]=>rows.map(r=>({
  id:Number(r.id),cpf:String(r.cpf),status:String(r.status),
  linkedOrder:r.linkedOrder,usedAt:r.usedAt,
  reviewState:r.reviewState==="confirmed"||r.reviewState==="discarded"?r.reviewState:null,
}));
function canDiscard(row:LockedRow){
  return ["available","reserved","archived"].includes(row.status)&&
    row.usedAt==null&&!String(row.linkedOrder||"").trim();
}
function canRestore(row:LockedRow){
  return row.reviewState==="discarded"&&row.status==="archived"&&
    row.usedAt==null&&!String(row.linkedOrder||"").trim();
}

export const h2bicoReviewRouter=router({
  stats:adminProcedure.query(async()=>{
    const db=await reviewDb();
    const rows=await db.execute(sql`
      SELECT COUNT(*) total,
       SUM(CASE WHEN rv.reviewState='confirmed' THEN 1 ELSE 0 END) confirmed,
       SUM(CASE WHEN rv.reviewState='discarded' THEN 1 ELSE 0 END) discarded,
       SUM(CASE WHEN rv.recordId IS NULL THEN 1 ELSE 0 END) pending
      FROM h2bico_records r LEFT JOIN h2bico_review rv ON rv.recordId=r.id
    `);
    const r=(rows[0] as any[])[0];
    return {total:Number(r.total||0),confirmed:Number(r.confirmed||0),
      discarded:Number(r.discarded||0),pending:Number(r.pending||0),lotSize:LOT_SIZE};
  }),
  runs:adminProcedure.query(async()=>{
    const db=await reviewDb();
    const rows=await db.execute(sql`
      SELECT id,total,reviewFilter,statusScope,createdAt
      FROM h2bico_review_runs ORDER BY id DESC LIMIT 25
    `);
    return (rows[0] as any[]).map(r=>({
      id:Number(r.id),total:Number(r.total),
      reviewFilter:String(r.reviewFilter),statusScope:String(r.statusScope),
      createdAt:r.createdAt,lotCount:Math.ceil(Number(r.total)/LOT_SIZE),
    }));
  }),
  createRun:adminProcedure.input(z.object({
    reviewFilter:filterSchema,statusScope:scopeSchema,
  }).strict()).mutation(async({input})=>{
    const db=await reviewDb();
    return db.transaction(async tx=>{
      const inserted:any=await tx.execute(sql`INSERT INTO h2bico_review_runs(reviewFilter,statusScope)
        VALUES(${input.reviewFilter},${input.statusScope})`);
      const runId=Number((inserted[0] as any).insertId);
      if(!Number.isSafeInteger(runId)||runId<=0)throw new Error("Falha ao criar conferencia.");
      const stateWhere=statePredicate(input.reviewFilter);
      const statusWhere=statusPredicate(input.statusScope);
      await tx.execute(sql`
        INSERT INTO h2bico_review_run_items(runId,recordId,ordinal)
        SELECT ${runId},ordered.id,ordered.ordinal FROM (
          SELECT r.id,ROW_NUMBER() OVER (ORDER BY r.id ASC)-1 AS ordinal
          FROM h2bico_records r
          LEFT JOIN h2bico_review rv ON rv.recordId=r.id
          WHERE ${stateWhere} AND ${statusWhere}
        ) ordered
      `);
      const count=await tx.execute(sql`SELECT COUNT(*) total FROM h2bico_review_run_items WHERE runId=${runId}`);
      const total=Number((count[0] as any[])[0].total||0);
      await tx.execute(sql`UPDATE h2bico_review_runs SET total=${total} WHERE id=${runId}`);
      return {runId,total,lotCount:Math.ceil(total/LOT_SIZE),lotSize:LOT_SIZE};
    });
  }),
  lots:adminProcedure.input(z.object({runId:z.number().int().positive()}).strict()).query(async({input})=>{
    const db=await reviewDb();
    const run=await assertRun(db,input.runId);
    const rows=await db.execute(sql`
      SELECT FLOOR(i.ordinal / ${LOT_SIZE}) lotIndex,COUNT(*) total,
       SUM(CASE WHEN rv.reviewState='confirmed' THEN 1 ELSE 0 END) confirmed,
       SUM(CASE WHEN rv.reviewState='discarded' THEN 1 ELSE 0 END) discarded
      FROM h2bico_review_run_items i
      LEFT JOIN h2bico_review rv ON rv.recordId=i.recordId
      WHERE i.runId=${input.runId}
      GROUP BY FLOOR(i.ordinal / ${LOT_SIZE})
      ORDER BY lotIndex ASC
    `);
    return {run,lotSize:LOT_SIZE,lots:(rows[0] as any[]).map(r=>({
      index:Number(r.lotIndex),total:Number(r.total),confirmed:Number(r.confirmed||0),
      discarded:Number(r.discarded||0),
      pending:Number(r.total)-Number(r.confirmed||0)-Number(r.discarded||0),
    }))};
  }),
  lot:adminProcedure.input(lotRefSchema).query(async({input})=>{
    const db=await reviewDb();
    const run=await assertRun(db,input.runId);
    const {begin,end}=checkedLot(input.lotIndex);
    if(begin>=run.total)throw new TRPCError({code:"BAD_REQUEST",message:"Lote fora desta conferencia."});
    const rows=await db.execute(sql`
      SELECT r.id,r.cpf,r.name,r.status,r.photoUrl,rv.reviewState
      FROM h2bico_review_run_items i
      JOIN h2bico_records r ON r.id=i.recordId
      LEFT JOIN h2bico_review rv ON rv.recordId=i.recordId
      WHERE i.runId=${input.runId} AND i.ordinal BETWEEN ${begin} AND ${end}
      ORDER BY i.ordinal ASC
    `);
    const records=(rows[0] as any[]).map(r=>({
      id:Number(r.id),cpf:String(r.cpf),name:String(r.name),
      status:String(r.status),hasPhoto:!!String(r.photoUrl||"").trim(),
      reviewState:r.reviewState==="confirmed"||r.reviewState==="discarded"?r.reviewState:"pending" as const,
    }));
    return {runId:input.runId,lotIndex:input.lotIndex,lotSize:LOT_SIZE,
      records,total:records.length,
      confirmed:records.filter(r=>r.reviewState==="confirmed").length,
      discarded:records.filter(r=>r.reviewState==="discarded").length,
      pending:records.filter(r=>r.reviewState==="pending").length};
  }),
  decide:adminProcedure.input(lotRefSchema.extend({
    decision:z.enum(["confirm","discard","unconfirm","restore"]),
    cpfs:z.array(cpfSchema).min(1).max(LOT_SIZE),
  }).strict()).mutation(async({input})=>{
    const db=await reviewDb();
    const {begin,end}=checkedLot(input.lotIndex);
    await assertRun(db,input.runId);
    const cpfs=[...new Set(input.cpfs)];
    return db.transaction(async tx=>{
      const found=await tx.execute(sql`
        SELECT r.id,r.cpf,r.status,r.linkedOrder,r.usedAt,rv.reviewState
        FROM h2bico_review_run_items i
        JOIN h2bico_records r ON r.id=i.recordId
        LEFT JOIN h2bico_review rv ON rv.recordId=r.id
        WHERE i.runId=${input.runId} AND i.ordinal BETWEEN ${begin} AND ${end}
          AND r.cpf IN (${sql.join(cpfs.map(cpf=>sql`${cpf}`),sql`, `)})
        FOR UPDATE
      `);
      const rows=lockedRows(found[0] as any[]);
      if(rows.length!==cpfs.length)
        throw new TRPCError({code:"CONFLICT",message:"Um CPF nao pertence a este lote. Recarregue a conferencia."});
      if(input.decision==="discard"&&rows.some(r=>!canDiscard(r)))
        throw new TRPCError({code:"FORBIDDEN",message:"Ha CPF usado, em uso ou vinculado. Descarte cancelado."});
      if(input.decision==="restore"&&rows.some(r=>!canRestore(r)))
        throw new TRPCError({code:"FORBIDDEN",message:"Somente CPFs descartados e arquivados podem ser restaurados."});
      if(input.decision==="confirm"&&rows.some(r=>r.reviewState==="discarded"))
        throw new TRPCError({code:"FORBIDDEN",message:"Restaure os CPFs descartados antes de confirmar."});
      if(input.decision==="unconfirm"&&rows.some(r=>r.reviewState!=="confirmed"))
        throw new TRPCError({code:"CONFLICT",message:"Somente CPFs confirmados podem voltar a pendente."});
      const changed=rows.filter(r=>{
        if(input.decision==="confirm")return r.reviewState!=="confirmed";
        if(input.decision==="discard")return r.reviewState!=="discarded";
        return true;
      });
      const ids=changed.map(r=>r.id);
      for(let start=0;start<ids.length;start+=250){
        const chunk=ids.slice(start,start+250);
        const membership=sql.join(chunk.map(id=>sql`${id}`),sql`, `);
        if(input.decision==="discard")await tx.execute(sql`
          UPDATE h2bico_records SET status='archived'
          WHERE id IN (${membership}) AND status IN ('available','reserved','archived')
            AND usedAt IS NULL AND (linkedOrder IS NULL OR linkedOrder='')
        `);
        if(input.decision==="restore")await tx.execute(sql`
          UPDATE h2bico_records SET status='available'
          WHERE id IN (${membership}) AND status='archived'
            AND usedAt IS NULL AND (linkedOrder IS NULL OR linkedOrder='')
        `);
      }
      if(input.decision==="confirm"||input.decision==="discard"){
        await updateReviewState(tx,ids,input.decision==="confirm"?"confirmed":"discarded",
          input.decision==="confirm"?"review_confirmed":"review_discarded");
      }else{
        for(let start=0;start<ids.length;start+=250){
          const chunk=ids.slice(start,start+250);
          await tx.execute(sql`DELETE FROM h2bico_review WHERE recordId IN
            (${sql.join(chunk.map(id=>sql`${id}`),sql`, `)})`);
          await tx.execute(sql`INSERT INTO h2bico_history(recordId,action,details)
            VALUES ${sql.join(chunk.map(id=>sql`(${id},${input.decision==="restore"?"review_restored":"review_unconfirmed"},'Alteracao manual da conferencia do ADM H2BICO')`),sql`, `)}`);
        }
      }
      return {updated:ids.length,unchanged:rows.length-ids.length};
    });
  }),
  // Desfaz SOMENTE a confirmacao dos CPFs deste lote (ate 1500).
  // O filtro e aplicado no banco, evitando enviar 1500 CPFs pelo navegador.
  // Preserva os descartados, status, fotos, EAR e historico do pedido.
  unconfirmLot:adminProcedure.input(lotRefSchema).mutation(async({input})=>{
    const db=await reviewDb();
    const run=await assertRun(db,input.runId);
    const {begin,end}=checkedLot(input.lotIndex);
    if(begin>=run.total)
      throw new TRPCError({code:"BAD_REQUEST",message:"Lote fora desta conferencia."});
    return db.transaction(async tx=>{
      const result=await tx.execute(sql`
        SELECT i.recordId AS id
        FROM h2bico_review_run_items i
        JOIN h2bico_review rv ON rv.recordId=i.recordId AND rv.reviewState='confirmed'
        WHERE i.runId=${input.runId} AND i.ordinal BETWEEN ${begin} AND ${end}
        FOR UPDATE
      `);
      const ids=(result[0] as Array<{id:number}>).map(row=>Number(row.id));
      for(let start=0;start<ids.length;start+=250){
        const chunk=ids.slice(start,start+250);
        const membership=sql.join(chunk.map(id=>sql`${id}`),sql`, `);
        await tx.execute(sql`
          DELETE FROM h2bico_review
          WHERE recordId IN (${membership}) AND reviewState='confirmed'
        `);
        await tx.execute(sql`INSERT INTO h2bico_history(recordId,action,details)
          VALUES ${sql.join(chunk.map(id=>sql`(${id},'review_unconfirmed','Confirmacao do lote desfeita no ADM H2BICO')`),sql`, `)}
        `);
      }
      return {unconfirmed:ids.length,skipped:Math.min(LOT_SIZE,run.total-begin)-ids.length};
    });
  }),
  confirmLot:adminProcedure.input(lotRefSchema).mutation(async({input})=>{
    const db=await reviewDb();
    const run=await assertRun(db,input.runId);
    const {begin,end}=checkedLot(input.lotIndex);
    if(begin>=run.total)throw new TRPCError({code:"BAD_REQUEST",message:"Lote invalido."});
    return db.transaction(async tx=>{
      const result=await tx.execute(sql`
        SELECT r.id FROM h2bico_review_run_items i
        JOIN h2bico_records r ON r.id=i.recordId
        LEFT JOIN h2bico_review rv ON rv.recordId=r.id
        WHERE i.runId=${input.runId} AND i.ordinal BETWEEN ${begin} AND ${end}
          AND rv.recordId IS NULL
        FOR UPDATE
      `);
      const ids=(result[0] as Array<{id:number}>).map(row=>Number(row.id));
      await updateReviewState(tx,ids,"confirmed","review_confirmed");
      return {confirmed:ids.length,skipped:Math.min(LOT_SIZE,run.total-begin)-ids.length};
    });
  }),
});
