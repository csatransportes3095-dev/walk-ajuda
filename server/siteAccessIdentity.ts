import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { Express, Request } from "express";
import jwt from "jsonwebtoken";
import { parse as parseCookieHeader } from "cookie";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { siteAccessEntries, siteAccessChallenges } from "./siteAccessSchema";
import { sendMail } from "./_core/mailer";

const COOKIE = "h2_site_auth";
const mail = (v: unknown) => String(v || "").trim().toLowerCase();
const secret = () => { const s=process.env.H2_SITE_ACCESS_SECRET || ""; if(s.length<32) throw new Error("Site secret unavailable"); return s; };
function hash(email:string,code:string){return createHash("sha256").update(secret()+":"+email+":"+code).digest("hex");}
const tries = new Map<string,{n:number;until:number}>();
function rate(key:string,max:number){const now=Date.now(),o=tries.get(key);if(!o||o.until<now){tries.set(key,{n:1,until:now+900000});return true;}o.n++;return o.n<=max;}
async function person(email:string){const db=await getDb();if(!db)throw new Error("database unavailable");const [p]=await db.select().from(siteAccessEntries).where(eq(siteAccessEntries.email,email)).limit(1);return p?.status==="active"&&(!p.expiresAt||p.expiresAt.getTime()>Date.now())?p:null;}
export async function authorizedSiteVisitor(req:Request):Promise<boolean>{
 const token=parseCookieHeader(req.headers.cookie||"")[COOKIE];if(!token)return false;
 try{const claims=jwt.verify(token,secret(),{algorithms:["HS256"]}) as {sub?:string;kind?:string;v?:number};if(claims.kind!=="site"||!claims.sub)return false;const p=await person(claims.sub);return !!p&&p.sessionVersion===claims.v;}catch{return false;}
}
export function registerSiteIdentity(app:Express){
 app.post("/api/site-access/request",async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const email=mail(req.body?.email), ip=String(req.ip||"");
  const generic=()=>res.json({ok:true,message:"Se autorizado, você receberá um código."});
  if(email.length>320||!email.includes("@"))return generic();
  if(!rate("request:"+ip,12)||!rate("mail:"+email,3))return generic();
  try{
   if(!(await person(email)))return generic();
   const code=String(randomInt(100000,1000000)),db=await getDb();if(!db)throw new Error("DB");
   await db.insert(siteAccessChallenges).values({email,codeHash:hash(email,code),attempts:0,expiresAt:new Date(Date.now()+600000),requestedAt:new Date()}).onDuplicateKeyUpdate({set:{codeHash:hash(email,code),attempts:0,expiresAt:new Date(Date.now()+600000),requestedAt:new Date()}});
   await sendMail({to:email,subject:"H2 Colombiano - Código de acesso",text:"Código: "+code+" (válido por 10 minutos)."});
   return generic();
  }catch{return res.status(503).json({error:"Acesso temporariamente indisponível"});}
 });
 app.post("/api/site-access/verify",async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const email=mail(req.body?.email),code=String(req.body?.code||""),ip=String(req.ip||"");
  if(email.length>320||!/^\d{6}$/.test(code))return res.status(401).json({error:"Código inválido"});
  if(!rate("verify:"+ip,20))return res.status(429).json({error:"Limite de tentativas"});
  try{
   const db=await getDb();if(!db)throw new Error("DB");
   const [item]=await db.select().from(siteAccessChallenges).where(eq(siteAccessChallenges.email,email)).limit(1);
   if(!item||item.attempts>=5||item.expiresAt.getTime()<Date.now())return res.status(401).json({error:"Código inválido"});
   await db.update(siteAccessChallenges).set({attempts:item.attempts+1}).where(eq(siteAccessChallenges.email,email));
   const a=Buffer.from(hash(email,code),"hex"),b=Buffer.from(item.codeHash,"hex");
   if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({error:"Código inválido"});
   const p=await person(email);if(!p)return res.status(401).json({error:"Código inválido"});
   await db.delete(siteAccessChallenges).where(eq(siteAccessChallenges.email,email));
   const token=jwt.sign({sub:email,kind:"site",v:p.sessionVersion},secret(),{expiresIn:"12h",algorithm:"HS256"});
   res.cookie(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:43200000});
   return res.json({ok:true});
  }catch{return res.status(503).json({error:"Acesso temporariamente indisponível"});}
 });
 app.get("/api/site-access/session",async(req,res)=>{res.setHeader("Cache-Control","no-store");try{return res.json({authorized:await authorizedSiteVisitor(req)});}catch{return res.json({authorized:false});}});
 app.post("/api/site-access/logout",(_req,res)=>{res.clearCookie(COOKIE,{path:"/",sameSite:"lax"});res.json({ok:true});});
}
