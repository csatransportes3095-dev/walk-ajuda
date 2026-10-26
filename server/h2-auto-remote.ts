import type { Express, Request, Response } from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

const hash = (s:string)=>createHash("sha256").update(s).digest("hex");
const mediaSchema=z.object({
 enabled:z.boolean().default(false),
 transcribeAudio:z.boolean().default(false),
 audioFallback:z.string().max(3000).default("🎤 Recebemos seu áudio. Por favor, envie sua dúvida por escrito ou digite 6 para falar com um atendente."),
 photoReply:z.string().max(3000).default("📸 Recebemos sua foto. Descreva sua dúvida por escrito ou digite 6."),
 videoReply:z.string().max(3000).default("🎥 Recebemos seu vídeo. Descreva sua dúvida por escrito ou digite 6."),
 documentReply:z.string().max(3000).default("📄 Recebemos seu documento. Descreva sua solicitação por escrito ou digite 6."),
 stickerReply:z.string().max(3000).default("📎 Recebemos sua mídia. Digite MENU para escolher uma opção."),
 unknownReply:z.string().max(3000).default("📎 Recebemos sua mídia. Escreva sua dúvida ou digite MENU."),
 cooldownSeconds:z.number().int().min(15).max(3600).default(120),
 maxAudioSeconds:z.number().int().min(5).max(120).default(30)
});
const configSchema=z.object({
 media:mediaSchema.default({}),
 enabled:z.boolean(),
 ordersEnabled:z.boolean().default(false),
 orderSessionHours:z.number().int().min(1).max(72).default(24),
 orderCodeTtlMinutes:z.number().int().min(5).max(30).default(10),
 orderCodeMaxAttempts:z.number().int().min(3).max(10).default(5),
 orderNoOrdersMessage:z.string().max(600).default("Cadastro localizado com sucesso, mas não encontramos nenhum pedido associado a este cadastro no momento."),
 welcome:z.string().max(6000),
 menu:z.array(z.string().max(6000)).length(9),
 whatsappMode:z.number().int().min(-1).max(1),
 pauseMinutes:z.number().int().min(1).max(1440),
 scheduleOn:z.boolean(),
 scheduleStart:z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
 scheduleEnd:z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
 blocked:z.string().max(10000),
 rules:z.array(z.object({trigger:z.string().max(120),reply:z.string().max(6000),mode:z.enum(["exact","contains"]),enabled:z.boolean()})).max(100)
});
type RemoteConfig=z.infer<typeof configSchema>;
const initial:RemoteConfig={media:mediaSchema.parse({}),ordersEnabled:false,orderSessionHours:24,orderCodeTtlMinutes:10,orderCodeMaxAttempts:5,orderNoOrdersMessage:"Cadastro localizado com sucesso, mas não encontramos nenhum pedido associado a este cadastro no momento.",enabled:false,welcome:"",menu:Array(9).fill(""),whatsappMode:-1,pauseMinutes:60,scheduleOn:false,scheduleStart:"09:00",scheduleEnd:"18:00",blocked:"",rules:[]};
let ready:Promise<void>|undefined;
function ensure() {
 if(!ready) ready=(async()=>{
 const db=await getDb();if(!db) throw new Error("DB unavailable");
 await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_devices (
 id VARCHAR(32) PRIMARY KEY,
 label VARCHAR(80) NOT NULL,
 pairing_hash CHAR(64) NULL,
 pairing_expires BIGINT NULL,
 pair_attempts INT NOT NULL DEFAULT 0,
 token_hash CHAR(64) NULL,
 config_json JSON NOT NULL,
 revision INT NOT NULL DEFAULT 1,
 last_seen BIGINT NULL,
 applied_revision INT NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL
 )`);
 await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_local_snapshots (
 device_id VARCHAR(32) PRIMARY KEY,
 snapshot_json JSON NOT NULL,
 received_at BIGINT NOT NULL
 )`);
 })().catch(e=>{ready=undefined;throw e});
 return ready;
}
const rows=async (query:any):Promise<any[]>=>{
 const db=await getDb();if(!db)throw new Error("DB unavailable");
 const result:any=await db.execute(query);return result[0]||[];
};
const decodeConfig=(raw:any):RemoteConfig=>configSchema.parse(typeof raw==="string"?JSON.parse(raw):raw);
const safeDevice=(r:any)=>({id:r.id,label:r.label,paired:Boolean(r.token_hash),revision:Number(r.revision),lastSeen:r.last_seen?Number(r.last_seen):null,appliedRevision:Number(r.applied_revision||0),config:decodeConfig(r.config_json),snapshotConfig:r.snapshot_json==null?null:decodeConfig(r.snapshot_json),snapshotReceivedAt:r.received_at==null?null:Number(r.received_at)});
function mergeWithoutDeleting(remote:RemoteConfig, local:RemoteConfig):RemoteConfig {
 const empty=!remote.welcome.trim() && remote.menu.every(t=>!t.trim()) && remote.rules.length===0 && !remote.blocked.trim();
 if(empty)return {...local,media:remote.media,ordersEnabled:remote.ordersEnabled,orderSessionHours:remote.orderSessionHours,orderCodeTtlMinutes:remote.orderCodeTtlMinutes,orderCodeMaxAttempts:remote.orderCodeMaxAttempts,orderNoOrdersMessage:remote.orderNoOrdersMessage};
 const seen=new Set(remote.rules.map(r=>r.trigger.trim().toLowerCase()+"|"+r.mode));
 const rules=remote.rules.slice();
 for(const r of local.rules){const k=r.trigger.trim().toLowerCase()+"|"+r.mode;if(!seen.has(k) && rules.length<100){rules.push(r);seen.add(k)}}
 const blocked=[...new Set([...remote.blocked.split(/[\n;,]/),...local.blocked.split(/[\n;,]/)].map(v=>v.trim()).filter(Boolean))].join("\n").slice(0,10000);
 return {...remote,media:remote.media,ordersEnabled:remote.ordersEnabled,welcome:remote.welcome.trim()?remote.welcome:local.welcome,
 menu:remote.menu.map((v,i)=>v.trim()?v:local.menu[i]),rules,blocked};
}
/** Unlinking must also revoke customer-order sessions. The order feature may
 * never have been activated, so its session table can legitimately be absent. */
function isMissingH2AutoSessionTable(error:unknown):boolean{
 const e=error as {code?:string;errno?:number;cause?:{code?:string;errno?:number}}|null;
 return e?.code==="ER_NO_SUCH_TABLE" || e?.errno===1146 ||
        e?.cause?.code==="ER_NO_SUCH_TABLE" || e?.cause?.errno===1146;
}
async function clearH2AutoCustomerSessions(db:any,deviceId:string):Promise<void>{
 try{
  await db.execute(sql`DELETE FROM h2_auto_order_sessions WHERE device_id=${deviceId}`);
 }catch(error){
  if(!isMissingH2AutoSessionTable(error))throw error;
 }
}
export const h2AutoAdminRouter=router({
 list:adminProcedure.query(async()=>{await ensure();return (await rows(sql`SELECT d.*, s.snapshot_json, s.received_at FROM h2_auto_devices d LEFT JOIN h2_auto_local_snapshots s ON s.device_id=d.id ORDER BY d.created_at DESC LIMIT 30`)).map(safeDevice);}),
 create:adminProcedure.input(z.object({label:z.string().trim().min(1).max(80)})).mutation(async({input})=>{
   await ensure(); const id=randomBytes(12).toString("hex"),code=String(randomBytes(4).readUInt32BE()%100000000).padStart(8,"0");
   const db=await getDb();if(!db)throw new Error("DB unavailable");
   await db.execute(sql`INSERT INTO h2_auto_devices (id,label,pairing_hash,pairing_expires,token_hash,config_json,revision,created_at) VALUES (
   ${id},${input.label},${hash(code)},${Date.now()+10*60*1000},NULL,${JSON.stringify(initial)},0,${Date.now()})`);
   return {id,code,expiresInSeconds:600};
 }),
 pairCode:adminProcedure.input(z.object({id:z.string().length(24)})).mutation(async({input})=>{
   await ensure();const code=String(randomBytes(4).readUInt32BE()%100000000).padStart(8,"0");
   const db=await getDb();if(!db)throw new Error("DB unavailable");
   await db.execute(sql`UPDATE h2_auto_devices SET pairing_hash=${hash(code)},pairing_expires=${Date.now()+600000},pair_attempts=0 WHERE id=${input.id}`);
   return {code,expiresInSeconds:600};
 }),
 save:adminProcedure.input(z.object({id:z.string().length(24),config:configSchema,expectedRevision:z.number().int().min(0)})).mutation(async({input})=>{
   await ensure();const db=await getDb();if(!db)throw new Error("DB unavailable");
   const result:any=await db.execute(sql`UPDATE h2_auto_devices SET config_json=${JSON.stringify(input.config)},revision=revision+1 WHERE id=${input.id} AND revision=${input.expectedRevision}`);
   if(!result[0]?.affectedRows)throw new TRPCError({code:"CONFLICT",message:"A configuração mudou. Atualize antes de salvar para não sobrescrever alterações."});
   return {success:true};
 }),
 mergeLocal:adminProcedure.input(z.object({id:z.string().length(24),expectedRevision:z.number().int().min(0)})).mutation(async({input})=>{
   await ensure();const data=await rows(sql`SELECT d.config_json,d.revision,s.snapshot_json FROM h2_auto_devices d LEFT JOIN h2_auto_local_snapshots s ON s.device_id=d.id WHERE d.id=${input.id} LIMIT 1`);
   const row=data[0];
   if(!row?.snapshot_json)throw new TRPCError({code:"NOT_FOUND",message:"O aparelho ainda não enviou sua cópia local."});
   if(Number(row.revision)!==input.expectedRevision)throw new TRPCError({code:"CONFLICT",message:"O ADM foi alterado. Recarregue para evitar sobrescrever."});
   const merged=mergeWithoutDeleting(decodeConfig(row.config_json),decodeConfig(row.snapshot_json));
   const db=await getDb();if(!db)throw Error("db");
   const result:any=await db.execute(sql`UPDATE h2_auto_devices SET config_json=${JSON.stringify(merged)},revision=revision+1 WHERE id=${input.id} AND revision=${input.expectedRevision}`);
   if(!result[0]?.affectedRows)throw new TRPCError({code:"CONFLICT",message:"O ADM foi alterado durante a importação."});
   return {success:true};
 }),
 revoke:adminProcedure.input(z.object({id:z.string().regex(/^[a-f0-9]{24}$/)})).mutation(async({input})=>{
   await ensure();const db=await getDb();if(!db)throw new Error("DB unavailable");
   const exists=await rows(sql`SELECT id FROM h2_auto_devices WHERE id=${input.id} LIMIT 1`);
   if(!exists.length)throw new TRPCError({code:"NOT_FOUND",message:"Celular não encontrado no H2 AUTO."});
   // Stop all remote sync and order lookups while preserving ADM configuration.
   await db.execute(sql`UPDATE h2_auto_devices SET token_hash=NULL,pairing_hash=NULL,pairing_expires=NULL,pair_attempts=0,applied_revision=0,last_seen=NULL WHERE id=${input.id}`);
   await clearH2AutoCustomerSessions(db,input.id);
   return {success:true,removed:false};
 }),
 remove:adminProcedure.input(z.object({id:z.string().regex(/^[a-f0-9]{24}$/)})).mutation(async({input})=>{
   await ensure();const db=await getDb();if(!db)throw new Error("DB unavailable");
   const exists=await rows(sql`SELECT id FROM h2_auto_devices WHERE id=${input.id} LIMIT 1`);
   if(!exists.length)throw new TRPCError({code:"NOT_FOUND",message:"Celular já removido ou não encontrado."});
   // Revoke first, then delete only this device, its immutable local snapshot,
   // and any active client-verification sessions linked to this device.
   await db.execute(sql`UPDATE h2_auto_devices SET token_hash=NULL,pairing_hash=NULL,pairing_expires=NULL,applied_revision=0 WHERE id=${input.id}`);
   await clearH2AutoCustomerSessions(db,input.id);
   await db.execute(sql`DELETE FROM h2_auto_local_snapshots WHERE device_id=${input.id}`);
   await db.execute(sql`DELETE FROM h2_auto_devices WHERE id=${input.id}`);
   return {success:true,removed:true};
 })
});
const respond=(res:Response,status:number,body:unknown)=>res.status(status).set("Cache-Control","no-store").json(body);
export function registerH2AutoDeviceRoutes(app:Express) {
 // Request bodies contain only the pairing code or opaque device token; no WhatsApp content.
 app.post("/api/h2-auto/pair",async(req:Request,res:Response)=>{
 try {
   const parsed=z.object({deviceId:z.string().length(24),code:z.string().regex(/^\d{8}$/)}).safeParse(req.body);
   if(!parsed.success)return respond(res,400,{error:"invalid_request"});
   await ensure();
   const data=await rows(sql`SELECT * FROM h2_auto_devices WHERE id=${parsed.data.deviceId} LIMIT 1`);
   const d=data[0];const supplied=Buffer.from(hash(parsed.data.code),"hex");
   if(!d || !d.pairing_hash || Number(d.pairing_expires)<Date.now() || Number(d.pair_attempts)>=5 ||
      !timingSafeEqual(Buffer.from(String(d.pairing_hash),"hex"),supplied))
      {
        if(d?.id && d.pairing_hash && Number(d.pair_attempts)<5) {
          const db=await getDb();
          if(db)await db.execute(sql`UPDATE h2_auto_devices SET pair_attempts=pair_attempts+1 WHERE id=${d.id}`);
        }
        return respond(res,403,{error:"invalid_or_expired_code"});
      }
   const token=randomBytes(32).toString("hex");const db=await getDb();if(!db)throw Error("db");
   const updated:any=await db.execute(sql`UPDATE h2_auto_devices SET token_hash=${hash(token)},pairing_hash=NULL,pairing_expires=NULL
     WHERE id=${d.id} AND pairing_hash=${d.pairing_hash} AND pairing_expires>=${Date.now()}`);
   if(!updated[0]?.affectedRows)return respond(res,409,{error:"code_used"});
   return respond(res,200,{token,deviceId:d.id});
 } catch{return respond(res,500,{error:"temporary_error"});}
 });
 app.get("/api/h2-auto/config",async(req:Request,res:Response)=>{
 try {
   const id=String(req.header("x-h2-device-id")||"");const token=String(req.header("x-h2-device-token")||"");
   if(!/^[a-f0-9]{24}$/.test(id)||!/^[a-f0-9]{64}$/.test(token))return respond(res,401,{error:"unauthorized"});
   await ensure();const data=await rows(sql`SELECT * FROM h2_auto_devices WHERE id=${id} LIMIT 1`),d=data[0];
   if(!d?.token_hash || !timingSafeEqual(Buffer.from(String(d.token_hash),"hex"),Buffer.from(hash(token),"hex")))
     return respond(res,401,{error:"unauthorized"});
   const db=await getDb();if(db)await db.execute(sql`UPDATE h2_auto_devices SET last_seen=${Date.now()} WHERE id=${id}`);
   return respond(res,200,{revision:Number(d.revision),needsInitialImport:Number(d.revision)===0,config:Number(d.revision)===0?null:safeDevice(d).config});
 }catch{return respond(res,500,{error:"temporary_error"});}
 });
 // A paired phone uploads its LOCAL snapshot before applying remote changes.
 // Keep the first snapshot immutable: a later sync must never erase the old settings.
 app.post("/api/h2-auto/import",async(req:Request,res:Response)=>{
  try {
   const id=String(req.header("x-h2-device-id")||"");
   const token=String(req.header("x-h2-device-token")||"");
   if(!/^[a-f0-9]{24}$/.test(id)||!/^[a-f0-9]{64}$/.test(token))return respond(res,401,{error:"unauthorized"});
   const parsed=configSchema.safeParse(req.body?.config ?? req.body);
   if(!parsed.success)return respond(res,400,{error:"invalid_local_configuration"});
   await ensure();
   const data=await rows(sql`SELECT token_hash,revision FROM h2_auto_devices WHERE id=${id} LIMIT 1`);
   const device=data[0];
   if(!device?.token_hash || !timingSafeEqual(Buffer.from(String(device.token_hash),"hex"),Buffer.from(hash(token),"hex")))
     return respond(res,401,{error:"unauthorized"});
   const db=await getDb();if(!db)throw Error("db");
   await db.execute(sql`INSERT IGNORE INTO h2_auto_local_snapshots (device_id,snapshot_json,received_at)
     VALUES (${id},${JSON.stringify(parsed.data)},${Date.now()})`);
   if(Number(device.revision)!==0)return respond(res,200,{success:true,imported:false,snapshotStored:true,reason:"admin_configuration_preserved",revision:Number(device.revision)});
   // Promote the local settings only if the ADM has NEVER been saved.
   const result:any=await db.execute(sql`UPDATE h2_auto_devices SET config_json=${JSON.stringify(parsed.data)},revision=1,last_seen=${Date.now()}
     WHERE id=${id} AND token_hash=${hash(token)} AND revision=0`);
   if(!result[0]?.affectedRows)return respond(res,200,{success:true,imported:false,snapshotStored:true,reason:"admin_configuration_preserved"});
   return respond(res,200,{success:true,imported:true,snapshotStored:true,revision:1,source:"android_local_settings"});
  }catch(error){
   console.error("[H2Auto] initial import failed",error instanceof Error?error.message:String(error));
   return respond(res,500,{error:"temporary_error"});
  }
 });

 app.post("/api/h2-auto/ack",async(req:Request,res:Response)=>{
 try {
   const id=String(req.header("x-h2-device-id")||""), token=String(req.header("x-h2-device-token")||"");
   const p=z.object({revision:z.number().int().min(1)}).safeParse(req.body);
   if(!/^[a-f0-9]{24}$/.test(id)||!/^[a-f0-9]{64}$/.test(token)||!p.success)
      return respond(res,401,{error:"unauthorized"});
   await ensure();
   const data=await rows(sql`SELECT token_hash, revision FROM h2_auto_devices WHERE id=${id} LIMIT 1`);
   const d=data[0];
   if(!d?.token_hash || !timingSafeEqual(Buffer.from(String(d.token_hash),"hex"),Buffer.from(hash(token),"hex")))
      return respond(res,401,{error:"unauthorized"});
   if(Number(d.revision)!==p.data.revision)return respond(res,409,{error:"outdated_revision"});
   const db=await getDb();if(!db)throw Error("db");
   await db.execute(sql`UPDATE h2_auto_devices SET applied_revision=${p.data.revision},last_seen=${Date.now()} WHERE id=${id} AND revision=${p.data.revision}`);
   return respond(res,200,{success:true});
 }catch{return respond(res,500,{error:"temporary_error"});}
 });

}
