import type {Express, Request, Response} from "express";
import {createHash, createHmac, randomInt, timingSafeEqual} from "node:crypto";
import {sql} from "drizzle-orm";
import {getDb} from "./db";
import {sendH2AutoOrderCode} from "./h2-auto-order-email";
import {normalizeCustomerPhone} from "./customerAccess";
import {isOwnSiteEmailAuthorized} from "./siteAccessOwnCodes";
import {getOrderStatusVisibilityForClient} from "./orderStatusVisibility";

const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const otpDigest=(sid:string,code:string)=>{const secret=process.env.H2_SITE_ACCESS_SECRET||"";if(secret.length<32)throw Error("otp_secret_unavailable");return createHmac("sha256",secret).update("h2-auto-orders:"+sid+":"+code).digest("hex");};
const reply=(res:Response,status:number,data:unknown)=>res.status(status).set("Cache-Control","no-store").json(data);
const validConversation=(v:unknown)=>typeof v==="string" && /^[a-zA-Z0-9_.:-]{24,180}$/.test(v);
let setup:Promise<void>|undefined;
async function ensure(){
 if(!setup)setup=(async()=>{
  const db=await getDb();if(!db)throw Error("db_unavailable");
  await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_order_sessions (
   id CHAR(64) PRIMARY KEY, device_id VARCHAR(32) NOT NULL, conversation_hash CHAR(64) NOT NULL,
   customer_id INT NULL, customer_phone VARCHAR(32) NULL, email_hash CHAR(64) NULL, code_hash CHAR(64) NULL,
   code_expires BIGINT NULL, code_attempts INT NOT NULL DEFAULT 0,
   resend_after BIGINT NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL DEFAULT 0,
   issued_at BIGINT NOT NULL DEFAULT 0, used_at BIGINT NULL,
   INDEX idx_h2auto_session_expiry (expires_at)
  ) ENGINE=InnoDB`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_order_request_limits (
    limit_key CHAR(64) PRIMARY KEY,
    window_started_at BIGINT NOT NULL,
    hits INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB`);
 })().catch(e=>{setup=undefined;throw e});return setup;
}
const rows=async(q:any):Promise<any[]>=>{const db=await getDb();if(!db)throw Error("db_unavailable");const result:any=await db.execute(q);return result[0]||[];};
/** Atomic fixed-window limiter, keyed by opaque SHA-256; no email or phone is persisted. */
async function takeLimit(key:string,max:number,windowMs:number,now:number):Promise<boolean>{
 const db=await getDb();if(!db)throw Error("db_unavailable");
 const limitKey=hash("h2-auto-order-otp:"+key);
 await db.execute(sql`INSERT INTO h2_auto_order_request_limits(limit_key,window_started_at,hits)
   VALUES (${limitKey},${now},1)
   ON DUPLICATE KEY UPDATE
     hits=IF(window_started_at<=${now-windowMs},1,LEAST(hits+1,1000000)),
     window_started_at=IF(window_started_at<=${now-windowMs},${now},window_started_at)`);
 const limited=await rows(sql`SELECT hits FROM h2_auto_order_request_limits WHERE limit_key=${limitKey} LIMIT 1`);
 return Number(limited[0]?.hits||0)>max;
}

async function authenticated(req:Request){
 const deviceId=String(req.header("x-h2-device-id")||"");
 const token=String(req.header("x-h2-device-token")||"");
 if(!/^[a-f0-9]{24}$/.test(deviceId)||!/^[a-f0-9]{64}$/.test(token))return null;
 const devices=await rows(sql`SELECT id,token_hash, JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.ordersEnabled')) AS orders_enabled FROM h2_auto_devices WHERE id=${deviceId} LIMIT 1`);
 const expected=String(devices[0]?.token_hash||"");
 if(String(devices[0]?.orders_enabled)!=="true")return null;
 if(!/^[a-f0-9]{64}$/.test(expected))return null;
 if(!timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(hash(token),"hex")))return null;
 return deviceId;
}
function sessionId(deviceId:string,conversation:string){return hash(deviceId+"|"+conversation);}
async function activeCustomer(phone:string){
 const clean=normalizeCustomerPhone(phone);if(!clean)return null;
 const found=await rows(sql`SELECT id,phone,email,blocked,deletedAt FROM customers WHERE deletedAt IS NULL AND
  RIGHT(REGEXP_REPLACE(phone,'[^0-9]',''),11)=${clean.slice(-11)} LIMIT 2`);
 if(found.length!==1 || Number(found[0].blocked)!==0 || !found[0].email)return null;
 return found[0] as {id:number;phone:string;email:string;blocked:number;deletedAt:null};
}
export function registerH2AutoOrdersRoutes(app:Express){
 // Only paired devices may call this. The Android client must supply a stable, verified
 // conversation identifier; never derive it from the notification sender display name.
 app.post("/api/h2-auto/orders/start",async(req,res)=>{
  try{
   const id=await authenticated(req);const conversation=req.body?.conversationId;
   if(!id)return reply(res,401,{error:"unauthorized"});
   if(!validConversation(conversation))return reply(res,400,{error:"invalid_conversation"});
   return reply(res,200,{message:"Para consultar pedidos, informe o telefone cadastrado, com DDD.",state:"await_phone"});
  }catch{return reply(res,503,{error:"temporarily_unavailable"});}
 });
 app.post("/api/h2-auto/orders/request-code",async(req,res)=>{
  try{
   const id=await authenticated(req);const conversation=req.body?.conversationId,phone=String(req.body?.phone||"");
   if(!id)return reply(res,401,{error:"unauthorized"});
   if(!validConversation(conversation)||!normalizeCustomerPhone(phone))return reply(res,400,{error:"invalid_request"});
   await ensure();const now=Date.now(),sid=sessionId(id,conversation);
   const existing=(await rows(sql`SELECT resend_after FROM h2_auto_order_sessions WHERE id=${sid} LIMIT 1`))[0];
   if(existing && Number(existing.resend_after)>now)return reply(res,429,{error:"wait_before_resend"});
   const normalized=normalizeCustomerPhone(phone);
   if(!normalized)return reply(res,400,{error:"invalid_request"});
   const limitedDevice=await takeLimit("device:"+id,90,3600000,now);
   const limitedPhone=await takeLimit("phone:"+normalized,5,3600000,now);
   if(limitedDevice || limitedPhone)return reply(res,429,{error:"too_many_requests"});

   const customer=await activeCustomer(phone);
   // Do not expose whether this phone or e-mail is registered.
   const generic={state:"await_code",message:"Se houver cadastro elegível, enviaremos um código ao e-mail. Verifique também o spam. Código válido por 10 minutos."};
   if(!customer)return reply(res,200,generic);
   const authorizationDb=await getDb();if(!authorizationDb)throw Error("db");
   if(!(await isOwnSiteEmailAuthorized(authorizationDb,customer.email)))return reply(res,200,generic);
   const code=String(randomInt(0,1000000)).padStart(6,"0"), codeHash=otpDigest(sid,code);
   const db=await getDb();if(!db)throw Error("db");
   await db.execute(sql`INSERT INTO h2_auto_order_sessions(id,device_id,conversation_hash,customer_id,customer_phone,email_hash,code_hash,code_expires,code_attempts,resend_after,expires_at,issued_at)
    VALUES (${sid},${id},${hash(conversation)},${customer.id},${customer.phone},${hash(customer.email.trim().toLowerCase())},${codeHash},${now+600000},0,${now+60000},0,${now})
    ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id),customer_phone=VALUES(customer_phone),email_hash=VALUES(email_hash),code_hash=VALUES(code_hash),code_expires=VALUES(code_expires),code_attempts=0,resend_after=VALUES(resend_after),expires_at=0,issued_at=VALUES(issued_at),used_at=NULL`);
   try{await sendH2AutoOrderCode(customer.email,code);}
   catch{
    await db.execute(sql`UPDATE h2_auto_order_sessions SET code_hash=NULL,code_expires=NULL WHERE id=${sid} AND code_hash=${codeHash}`);
    return reply(res,503,{error:"email_unavailable",message:"Não foi possível enviar o código agora."});
   }
   return reply(res,200,generic);
  }catch{return reply(res,503,{error:"temporarily_unavailable"});}
 });
 app.post("/api/h2-auto/orders/verify",async(req,res)=>{
  try{
   const id=await authenticated(req), conversation=req.body?.conversationId,code=req.body?.code;
   if(!id)return reply(res,401,{error:"unauthorized"});
   if(!validConversation(conversation)||typeof code!=="string"||!/^\d{6}$/.test(code))return reply(res,400,{error:"invalid_request"});
   await ensure();const sid=sessionId(id,conversation), now=Date.now();
   const records=await rows(sql`SELECT * FROM h2_auto_order_sessions WHERE id=${sid} AND device_id=${id} LIMIT 1`);
   const s=records[0];
   if(!s || !s.code_hash || Number(s.code_expires)<now || Number(s.code_attempts)>=5 || s.used_at!==null)return reply(res,403,{error:"invalid_or_expired_code"});
   const db=await getDb();if(!db)throw Error("db");
   const candidate=otpDigest(sid,code);
   if(!timingSafeEqual(Buffer.from(String(s.code_hash),"hex"),Buffer.from(candidate,"hex"))){
    await db.execute(sql`UPDATE h2_auto_order_sessions SET code_attempts=code_attempts+1 WHERE id=${sid} AND code_attempts<5`);
    return reply(res,403,{error:"invalid_or_expired_code"});
   }
   const user=await rows(sql`SELECT id FROM customers WHERE id=${s.customer_id} AND deletedAt IS NULL AND blocked=0 AND SHA2(LOWER(TRIM(email)),256)=${s.email_hash} AND RIGHT(REGEXP_REPLACE(phone,'[^0-9]',''),11)=${String(s.customer_phone).replace(/\D/g,'').slice(-11)} LIMIT 1`);
   if(user.length!==1)return reply(res,403,{error:"not_authorized"});
   const result:any=await db.execute(sql`UPDATE h2_auto_order_sessions SET used_at=${now},expires_at=${now+86400000},code_hash=NULL,code_expires=NULL
    WHERE id=${sid} AND code_hash=${candidate} AND code_expires>=${now} AND code_attempts<5 AND used_at IS NULL`);
   if(!result[0]?.affectedRows)return reply(res,403,{error:"invalid_or_expired_code"});
   return reply(res,200,{verified:true,state:"verified",expiresAt:now+86400000});
  }catch{return reply(res,503,{error:"temporarily_unavailable"});}
 });
 app.post("/api/h2-auto/orders/list",async(req,res)=>{
  try{
   const id=await authenticated(req),conversation=req.body?.conversationId;
   if(!id)return reply(res,401,{error:"unauthorized"});
   if(!validConversation(conversation))return reply(res,400,{error:"invalid_conversation"});
   await ensure();const sid=sessionId(id,conversation), now=Date.now();
   const sessions=await rows(sql`SELECT s.customer_id,s.customer_phone,c.createdAt AS customer_created,c.email AS current_email FROM h2_auto_order_sessions s
     JOIN customers c ON c.id=s.customer_id WHERE s.id=${sid} AND s.device_id=${id} AND SHA2(LOWER(TRIM(c.email)),256)=s.email_hash AND RIGHT(REGEXP_REPLACE(c.phone,'[^0-9]',''),11)=RIGHT(REGEXP_REPLACE(s.customer_phone,'[^0-9]',''),11) AND s.used_at IS NOT NULL
     AND s.expires_at>${now} AND c.deletedAt IS NULL AND c.blocked=0 LIMIT 1`);
   const s=sessions[0];if(!s)return reply(res,403,{error:"authentication_required"});
   const authDb=await getDb();if(!authDb || !(await isOwnSiteEmailAuthorized(authDb,String(s.current_email))))return reply(res,403,{error:"authentication_required"});
   const orders=await rows(sql`SELECT h.id,h.registrationId,h.orderNumber,h.status,h.serviceName,h.serviceOption,h.createdAt
    FROM orderStatusHistory h INNER JOIN accessCodePhones a ON a.id=h.registrationId
    AND a.deletedAt IS NULL AND a.accessedAt>=${s.customer_created}
    AND RIGHT(REGEXP_REPLACE(a.phone,'[^0-9]',''),11)=${String(s.customer_phone).replace(/\D/g,'').slice(-11)}
    WHERE RIGHT(REGEXP_REPLACE(h.customerPhone,'[^0-9]',''),11)=${String(s.customer_phone).replace(/\D/g,"").slice(-11)}
    AND h.approval='approved'
    AND NOT EXISTS (SELECT 1 FROM orderStatusHistory old WHERE old.registrationId=h.registrationId AND old.createdAt<${s.customer_created})
    ORDER BY h.registrationId ASC,h.createdAt ASC,h.id ASC LIMIT 500`);
   const grouped=new Map<number,any[]>();
   for(const o of orders){const k=Number(o.registrationId);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k)!.push(o);}
   const statusRows=await rows(sql`SELECT \`key\` FROM orderStatusTypes WHERE isActive=1 AND isGlobal=1 ORDER BY sortOrder ASC,id ASC LIMIT 1`);
   const initialStatus=String(statusRows[0]?.key||"recebido");
   const visible=[];
   for(const [registrationId,history] of grouped){
    const groups:any[][]=[];let current:any[]=[];
    for(const entry of history){
     if(current.length>0 && (entry.status===initialStatus || entry.status==="recebido")){groups.push(current);current=[];}
     current.push(entry);
    }
    if(current.length)groups.push(current);
    const reversed=groups.reverse();
    for(let subOrderIndex=0;subOrderIndex<reversed.length;subOrderIndex++){
     const hidden=await rows(sql`SELECT id FROM hiddenSubOrders WHERE registrationId=${registrationId} AND subOrderIndex=${subOrderIndex} LIMIT 1`);
     if(hidden.length)continue;
     const entries=reversed[subOrderIndex],latest=entries[entries.length-1];
     const service=entries.find(o=>o.serviceName||o.serviceOption)||latest;
     const numbered=entries.find(o=>o.orderNumber!=null);
     const number=numbered?.orderNumber==null?null:Number(numbered.orderNumber);
     const policy=await getOrderStatusVisibilityForClient(registrationId,number,String(latest.status));
     // Current status is visible to the customer; never include hidden timeline steps.
     visible.push({registrationId,subOrderIndex,orderNumber:number,
       serviceName:String(service.serviceName||""),serviceOption:String(service.serviceOption||""),
       status:String(latest.status),updatedAt:latest.createdAt,showNextStep:policy.showNextStep});
     if(visible.length>=20)break;
    }
    if(visible.length>=20)break;
   }
   return reply(res,200,{state:"verified",orders:visible,message:visible.length?"Pedidos encontrados.":"Cadastro localizado, mas nenhum pedido disponível para consulta."});
  }catch{return reply(res,503,{error:"temporarily_unavailable"});}
 });
 app.post("/api/h2-auto/orders/logout",async(req,res)=>{
  try{
   const id=await authenticated(req),conversation=req.body?.conversationId;
   if(!id)return reply(res,401,{error:"unauthorized"});
   if(!validConversation(conversation))return reply(res,400,{error:"invalid_conversation"});
   await ensure();const db=await getDb();if(!db)throw Error("db");
   await db.execute(sql`DELETE FROM h2_auto_order_sessions WHERE id=${sessionId(id,conversation)} AND device_id=${id}`);
   return reply(res,200,{success:true});
  }catch{return reply(res,503,{error:"temporarily_unavailable"});}
 });
}
