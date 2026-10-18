import {createHash} from "node:crypto";
import jwt from "jsonwebtoken";
import {parse as parseCookieHeader} from "cookie";
import {TRPCError} from "@trpc/server";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {isValidCpf} from "../client/src/lib/h2bicoCpfExtractor";
import {getAdminJwtSecret} from "./adminJwt";
import {getDb} from "./db";
import {ensureH2BicoReviewSchema} from "./h2bicoReview";
import {adminProcedure,router} from "./_core/trpc";

type DB=NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Decision="confirm"|"unconfirm"|"discard"|"restore";
type ReviewState="pending"|"confirmed"|"discarded";
export type ReviewRecord={
  id:number;cpf:string;name:string;status:string;hasPhoto:boolean;
  earStatus:"com_ear"|"sem_ear"|null;reviewState:ReviewState;
  reviewedAt:Date|null;reviewer:string|null;operationId:string|null;
  linkedOrder:string|null;usedAt:Date|null;
};
const inputCpf=z.string().trim()
 .regex(/^(?:[0-9]{11}|[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2})$/)
 .transform(value=>value.replace(/[^0-9]/g,""))
 .refine(value=>isValidCpf(value),"CPF com digitos verificadores invalidos.");
const cpfList=z.array(inputCpf).min(1).max(5000);
const decisionSchema=z.enum(["confirm","unconfirm","discard","restore"]);
const reviewFilter=z.enum(["all","pending","confirmed","discarded"]);
const statusFilter=z.enum(["all","available","reserved","in_use","used","archived"]);
const earFilter=z.enum(["all","com_ear","sem_ear","none"]);
const uuid=z.string().uuid();

export function fingerprintCpfs(cpfs:readonly string[]):string{
 return createHash("sha256").update([...new Set(cpfs)].sort().join("\n")).digest("hex");
}
export function classifyCpfAction(
  decision:Decision,
  row:Pick<ReviewRecord,"status"|"reviewState"|"linkedOrder"|"usedAt">
):"updated"|"already"|"protected"{
 if(decision==="confirm"){
  if(row.reviewState==="discarded")return "protected";
  return row.reviewState==="confirmed"?"already":"updated";
 }
 if(decision==="unconfirm"){
  if(row.reviewState==="discarded")return "protected";
  return row.reviewState==="confirmed"?"updated":"already";
 }
 if(decision==="discard"){
  if(row.reviewState==="discarded")return "already";
  if(!["available","reserved","archived"].includes(row.status) ||
    !!row.usedAt || !!String(row.linkedOrder||"").trim())return "protected";
  return "updated";
 }
 if(row.reviewState!=="discarded")return "already";
 if(row.status!=="archived"||!!row.usedAt||!!String(row.linkedOrder||"").trim())
   return "protected";
 return "updated";
}

let schemaPromise:Promise<void>|null=null;
async function ensureIntelligenceTables(db:DB){
 if(!schemaPromise){
  schemaPromise=(async()=>{
   await ensureH2BicoReviewSchema(db);
   // Dedicated tables: no changes to existing H2BICO records or EAR markers.
   await db.execute(sql`CREATE TABLE IF NOT EXISTS h2bico_review_operations(
     id VARCHAR(36) NOT NULL PRIMARY KEY,
     fingerprint CHAR(64) NOT NULL,
     decision ENUM('confirm','unconfirm','discard','restore') NOT NULL,
     requested INT NOT NULL,
     found INT NOT NULL,
     missing INT NOT NULL,
     operatorId VARCHAR(128) NOT NULL,
     startedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     completedAt TIMESTAMP NULL,
     INDEX idx_h2bico_review_ops_fingerprint (fingerprint,startedAt),
     INDEX idx_h2bico_review_ops_started (startedAt)
   ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
   await db.execute(sql`CREATE TABLE IF NOT EXISTS h2bico_review_operation_items(
     operationId VARCHAR(36) NOT NULL,
     recordId INT NOT NULL,
     ordinal INT NOT NULL,
     result ENUM('pending','updated','already','protected') NOT NULL DEFAULT 'pending',
     PRIMARY KEY(operationId,recordId),
     INDEX idx_h2bico_ops_queue (operationId,result,ordinal)
   ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
   await db.execute(sql`CREATE TABLE IF NOT EXISTS h2bico_review_attribution(
     recordId INT NOT NULL PRIMARY KEY,
     operatorId VARCHAR(128) NOT NULL,
     operationId VARCHAR(36) NOT NULL,
     changedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  })().catch(error=>{schemaPromise=null;throw error;});
 }
 await schemaPromise;
}
async function intelligenceDb(){
 const db=await getDb();
 if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Banco H2BICO indisponivel."});
 await ensureIntelligenceTables(db);
 return db;
}
function actorFromAdminCookie(req:{headers:{cookie?:string}}):string{
 try{
  const token=parseCookieHeader(req.headers.cookie||"").admin_token;
  const secret=getAdminJwtSecret();
  if(token&&secret){
   const payload=jwt.verify(token,secret) as {sub?:unknown;role?:string};
   if(payload.role==="admin"&&typeof payload.sub==="string"&&payload.sub)
     return payload.sub.slice(0,128);
  }
 }catch{/* adminProcedure has already validated authentication */}
 return "admin";
}
function sqlReviewFilter(value:z.infer<typeof reviewFilter>){
 if(value==="confirmed")return sql`rv.reviewState='confirmed'`;
 if(value==="discarded")return sql`rv.reviewState='discarded'`;
 if(value==="pending")return sql`rv.recordId IS NULL`;
 return sql`1=1`;
}
function sqlStatusFilter(value:z.infer<typeof statusFilter>){
 if(value==="all")return sql`1=1`;
 return sql`r.status=${value}`;
}
function sqlEarFilter(value:z.infer<typeof earFilter>){
 if(value==="all")return sql`1=1`;
 if(value==="none")return sql`em.recordId IS NULL`;
 return sql`em.earStatus=${value}`;
}
function convertRow(row:any):ReviewRecord{
 return {
  id:Number(row.id),cpf:String(row.cpf),name:String(row.name),
  status:String(row.status),hasPhoto:!!String(row.photoUrl||"").trim(),
  earStatus:row.earStatus==="com_ear"||row.earStatus==="sem_ear"?row.earStatus:null,
  reviewState:row.reviewState==="confirmed"||row.reviewState==="discarded"?row.reviewState:"pending",
  reviewedAt:row.reviewedAt||null,reviewer:row.operatorId?String(row.operatorId):null,
  operationId:row.operationId?String(row.operationId):null,
  linkedOrder:row.linkedOrder||null,usedAt:row.usedAt||null,
 };
}
async function loadRows(db:any,cpfs:string[]):Promise<ReviewRecord[]>{
 const rows:ReviewRecord[]=[];
 for(let i=0;i<cpfs.length;i+=250){
  const page=cpfs.slice(i,i+250);
  const result=await db.execute(sql`SELECT r.id,r.cpf,r.name,r.status,r.photoUrl,r.linkedOrder,r.usedAt,
     rv.reviewState,rv.reviewedAt,em.earStatus,at.operatorId,at.operationId
    FROM h2bico_records r
    LEFT JOIN h2bico_review rv ON rv.recordId=r.id
    LEFT JOIN h2bico_ear_marks em ON em.recordId=r.id
    LEFT JOIN h2bico_review_attribution at ON at.recordId=r.id
    WHERE r.cpf IN (${sql.join(page.map(cpf=>sql`${cpf}`),sql`, `)})`);
  rows.push(...(result[0] as any[]).map(convertRow));
 }
 return rows;
}
async function progress(db:any,id:string){
 const found=await db.execute(sql`SELECT id,fingerprint,decision,requested,found,missing,
    operatorId,startedAt,completedAt FROM h2bico_review_operations WHERE id=${id} LIMIT 1`);
 const r=(found[0] as any[])[0];
 if(!r)throw new TRPCError({code:"NOT_FOUND",message:"Processamento H2BICO nao encontrado."});
 const results=await db.execute(sql`SELECT result,COUNT(*) AS count
   FROM h2bico_review_operation_items WHERE operationId=${id} GROUP BY result`);
 const counts:{pending:number;updated:number;already:number;protected:number}={pending:0,updated:0,already:0,protected:0};
 for(const row of results[0] as any[])if(row.result in counts)
  counts[row.result as keyof typeof counts]=Number(row.count);
 return {
  id:String(r.id),fingerprint:String(r.fingerprint),decision:String(r.decision) as Decision,
  requested:Number(r.requested),found:Number(r.found),missing:Number(r.missing),
  operatorId:String(r.operatorId),startedAt:r.startedAt,completedAt:r.completedAt||null,
  ...counts,processed:Number(r.found)-counts.pending,complete:counts.pending===0,
 };
}
async function markItems(tx:any,operationId:string,ids:number[],result:"updated"|"already"|"protected"){
 if(!ids.length)return;
 await tx.execute(sql`UPDATE h2bico_review_operation_items SET result=${result}
   WHERE operationId=${operationId} AND result='pending'
   AND recordId IN (${sql.join(ids.map(id=>sql`${id}`),sql`, `)})`);
}
async function applyDecision(tx:any,decision:Decision,ids:number[],operatorId:string,operationId:string){
 if(!ids.length)return;
 const set=sql.join(ids.map(id=>sql`${id}`),sql`, `);
 if(decision==="discard"){
  await tx.execute(sql`UPDATE h2bico_records SET status='archived'
   WHERE id IN (${set}) AND status IN ('available','reserved','archived')
   AND usedAt IS NULL AND (linkedOrder IS NULL OR linkedOrder='')`);
 }
 if(decision==="restore"){
  await tx.execute(sql`UPDATE h2bico_records SET status='available'
   WHERE id IN (${set}) AND status='archived'
   AND usedAt IS NULL AND (linkedOrder IS NULL OR linkedOrder='')`);
 }
 if(decision==="confirm"||decision==="discard"){
  const state=decision==="confirm"?"confirmed":"discarded";
  await tx.execute(sql`INSERT INTO h2bico_review(recordId,reviewState)
   VALUES ${sql.join(ids.map(id=>sql`(${id},${state})`),sql`, `)}
   ON DUPLICATE KEY UPDATE reviewState=VALUES(reviewState),reviewedAt=CURRENT_TIMESTAMP`);
  await tx.execute(sql`INSERT INTO h2bico_review_attribution(recordId,operatorId,operationId)
   VALUES ${sql.join(ids.map(id=>sql`(${id},${operatorId},${operationId})`),sql`, `)}
   ON DUPLICATE KEY UPDATE operatorId=VALUES(operatorId),
     operationId=VALUES(operationId),changedAt=CURRENT_TIMESTAMP`);
 }else{
  const prior=decision==="unconfirm"?"confirmed":"discarded";
  await tx.execute(sql`DELETE FROM h2bico_review WHERE recordId IN (${set})
   AND reviewState=${prior}`);
  await tx.execute(sql`DELETE FROM h2bico_review_attribution WHERE recordId IN (${set})`);
 }
 const action=decision==="confirm"?"review_confirmed":decision==="discard"?"review_discarded":
  decision==="unconfirm"?"review_unconfirmed":"review_restored";
 const details="Gestao inteligente; operacao "+operationId+"; operador "+operatorId;
 await tx.execute(sql`INSERT INTO h2bico_history(recordId,action,details)
   VALUES ${sql.join(ids.map(id=>sql`(${id},${action},${details})`),sql`, `)}`);
}
const reviewSearchInput=z.object({
 review:reviewFilter.default("confirmed"),
 status:statusFilter.default("all"),
 ear:earFilter.default("all"),
 search:z.string().max(100).default(""),
 page:z.number().int().min(0).max(10000).default(0),
 pageSize:z.number().int().min(1).max(100).default(30),
}).strict();

export const h2bicoIntelligenceRouter=router({
 analyzePaste:adminProcedure.input(z.object({cpfs:cpfList}).strict()).mutation(async({input})=>{
  const db=await intelligenceDb();
  const cpfs=[...new Set(input.cpfs)];
  const found=await loadRows(db,cpfs);
  const byCpf=new Map(found.map(r=>[r.cpf,r]));
  const matches=cpfs.flatMap(cpf=>byCpf.has(cpf)?[byCpf.get(cpf)!]:[]);
  const missing=cpfs.filter(cpf=>!byCpf.has(cpf));
  const fingerprint=fingerprintCpfs(cpfs);
  const usedBefore=await db.execute(sql`SELECT id,decision,operatorId,startedAt,completedAt
   FROM h2bico_review_operations WHERE fingerprint=${fingerprint}
   ORDER BY startedAt DESC LIMIT 1`);
  const recent=(usedBefore[0] as any[])[0];
  return {
   fingerprint,total:cpfs.length,found:matches.length,missing,
   confirmed:matches.filter(r=>r.reviewState==="confirmed").length,
   pending:matches.filter(r=>r.reviewState==="pending").length,
   discarded:matches.filter(r=>r.reviewState==="discarded").length,
   missingPhoto:matches.filter(r=>!r.hasPhoto).length,
   counts:{
    confirm:matches.filter(r=>classifyCpfAction("confirm",r)==="updated").length,
    unconfirm:matches.filter(r=>classifyCpfAction("unconfirm",r)==="updated").length,
    discard:matches.filter(r=>classifyCpfAction("discard",r)==="updated").length,
    restore:matches.filter(r=>classifyCpfAction("restore",r)==="updated").length,
   },
   records:matches.map(r=>({
    ...r,linkedOrder:undefined,usedAt:undefined,
    warnings:[
      ...(!r.hasPhoto?["SEM FOTO"]:[]),
      ...(r.reviewState==="discarded"?["BLOQUEADO PARA REENTRADA"]:[]),
    ],
   })),
   previousProcessing:recent?{
    id:String(recent.id),decision:String(recent.decision),
    startedAt:recent.startedAt,completedAt:recent.completedAt,
   }:null,
  };
 }),
 listReviewed:adminProcedure.input(reviewSearchInput).query(async({input})=>{
  const db=await intelligenceDb();
  const filter=sqlReviewFilter(input.review);
  const scope=sqlStatusFilter(input.status);
  const ear=sqlEarFilter(input.ear);
  const search=input.search.trim();
  const term="%"+search+"%";
  const searchWhere=search?sql`(r.cpf LIKE ${term} OR r.name LIKE ${term})`:sql`1=1`;
  const count=await db.execute(sql`SELECT COUNT(*) total FROM h2bico_records r
   LEFT JOIN h2bico_review rv ON rv.recordId=r.id
   LEFT JOIN h2bico_ear_marks em ON em.recordId=r.id
   WHERE ${filter} AND ${scope} AND ${ear} AND ${searchWhere}`);
  const limit=input.pageSize,offset=input.page*input.pageSize;
  const data=await db.execute(sql`SELECT r.id,r.cpf,r.name,r.status,r.photoUrl,r.linkedOrder,r.usedAt,
   rv.reviewState,rv.reviewedAt,em.earStatus,at.operatorId,at.operationId
   FROM h2bico_records r
   LEFT JOIN h2bico_review rv ON rv.recordId=r.id
   LEFT JOIN h2bico_ear_marks em ON em.recordId=r.id
   LEFT JOIN h2bico_review_attribution at ON at.recordId=r.id
   WHERE ${filter} AND ${scope} AND ${ear} AND ${searchWhere}
   ORDER BY rv.reviewedAt DESC,r.id DESC LIMIT ${limit} OFFSET ${offset}`);
  return {total:Number((count[0] as any[])[0]?.total||0),
   page:input.page,pageSize:limit,records:(data[0] as any[]).map(convertRow)};
 }),
 history:adminProcedure.input(z.object({recordId:z.number().int().positive()}).strict()).query(async({input})=>{
  const db=await intelligenceDb();
  const found=await db.execute(sql`SELECT action,details,createdAt
   FROM h2bico_history WHERE recordId=${input.recordId}
   ORDER BY id DESC LIMIT 40`);
  return (found[0] as any[]).map(r=>({
   action:String(r.action),details:String(r.details||""),createdAt:r.createdAt,
  }));
 }),
 recentOperations:adminProcedure.query(async()=>{
  const db=await intelligenceDb();
  const result=await db.execute(sql`SELECT id FROM h2bico_review_operations
   ORDER BY startedAt DESC LIMIT 15`);
  const ids=(result[0] as Array<{id:string}>).map(row=>String(row.id));
  return await Promise.all(ids.map(id=>progress(db,id)));
 }),
 operation:adminProcedure.input(z.object({id:uuid}).strict()).query(async({input})=>{
  const db=await intelligenceDb();
  return progress(db,input.id);
 }),
 startOperation:adminProcedure.input(z.object({
  id:uuid,decision:decisionSchema,cpfs:cpfList,
 }).strict()).mutation(async({input,ctx})=>{
  const db=await intelligenceDb();
  const cpfs=[...new Set(input.cpfs)];
  const fingerprint=fingerprintCpfs(cpfs);
  const actor=actorFromAdminCookie(ctx.req);
  return db.transaction(async tx=>{
   const found=await tx.execute(sql`SELECT id,fingerprint,decision
    FROM h2bico_review_operations WHERE id=${input.id} LIMIT 1 FOR UPDATE`);
   const existing=(found[0] as any[])[0];
   if(existing){
    if(String(existing.fingerprint)!==fingerprint||String(existing.decision)!==input.decision)
      throw new TRPCError({code:"CONFLICT",message:"Identificador de operação reutilizado para outra lista."});
    return progress(tx,input.id);
   }
   const allIds:number[]=[];
   for(let i=0;i<cpfs.length;i+=250){
    const slice=cpfs.slice(i,i+250);
    const rows=await tx.execute(sql`SELECT id FROM h2bico_records WHERE cpf IN
      (${sql.join(slice.map(cpf=>sql`${cpf}`),sql`, `)}) ORDER BY id`);
    allIds.push(...(rows[0] as Array<{id:number}>).map(row=>Number(row.id)));
   }
   const ids=[...new Set(allIds)].sort((a,b)=>a-b);
   await tx.execute(sql`INSERT INTO h2bico_review_operations(
     id,fingerprint,decision,requested,found,missing,operatorId,completedAt)
    VALUES(${input.id},${fingerprint},${input.decision},${cpfs.length},
     ${ids.length},${cpfs.length-ids.length},${actor},${ids.length?null:new Date()})`);
   for(let i=0;i<ids.length;i+=250){
    const chunk=ids.slice(i,i+250);
    await tx.execute(sql`INSERT INTO h2bico_review_operation_items(operationId,recordId,ordinal)
      VALUES ${sql.join(chunk.map((id,j)=>sql`(${input.id},${id},${i+j})`),sql`, `)}`);
   }
   return progress(tx,input.id);
  });
 }),
 processOperation:adminProcedure.input(z.object({id:uuid}).strict()).mutation(async({input})=>{
  const db=await intelligenceDb();
  return db.transaction(async tx=>{
   const result=await tx.execute(sql`SELECT id,decision,operatorId FROM h2bico_review_operations
     WHERE id=${input.id} LIMIT 1 FOR UPDATE`);
   const operation=(result[0] as any[])[0];
   if(!operation)throw new TRPCError({code:"NOT_FOUND",message:"Operacao nao encontrada."});
   const action=String(operation.decision) as Decision;
   const batch=await tx.execute(sql`
     SELECT r.id,r.status,r.linkedOrder,r.usedAt,rv.reviewState
     FROM h2bico_review_operation_items i
     JOIN h2bico_records r ON r.id=i.recordId
     LEFT JOIN h2bico_review rv ON rv.recordId=r.id
     WHERE i.operationId=${input.id} AND i.result='pending'
     ORDER BY i.ordinal ASC LIMIT 250 FOR UPDATE`);
   const applied:number[]=[],already:number[]=[],protectedIds:number[]=[];
   for(const row of batch[0] as any[]){
    const id=Number(row.id);
    const classification=classifyCpfAction(action,{
      status:String(row.status),
      reviewState:row.reviewState==="confirmed"||row.reviewState==="discarded"?row.reviewState:"pending",
      linkedOrder:row.linkedOrder||null,usedAt:row.usedAt||null,
    });
    if(classification==="updated")applied.push(id);
    else if(classification==="already")already.push(id);
    else protectedIds.push(id);
   }
   await applyDecision(tx,action,applied,String(operation.operatorId),input.id);
   await markItems(tx,input.id,applied,"updated");
   await markItems(tx,input.id,already,"already");
   await markItems(tx,input.id,protectedIds,"protected");
   const remaining=await tx.execute(sql`SELECT COUNT(*) remaining
     FROM h2bico_review_operation_items WHERE operationId=${input.id} AND result='pending'`);
   if(Number((remaining[0] as any[])[0].remaining)===0)
     await tx.execute(sql`UPDATE h2bico_review_operations
       SET completedAt=COALESCE(completedAt,CURRENT_TIMESTAMP) WHERE id=${input.id}`);
   return progress(tx,input.id);
  });
 }),
});
