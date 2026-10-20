import { randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { parse as parseCookieHeader } from 'cookie';
import { sql } from 'drizzle-orm';
import { getDb } from './db';
import { getAdminJwtSecret } from './adminJwt';
import { ensureOwnSiteCodeStore, takeOwnSiteLimit, reserveOwnSiteCode, finishOwnSiteCodeDelivery, consumeOwnSiteCode, readOwnSiteSession, revokeOwnSiteSession, ownSiteErrorCode } from './siteAccessOwnCodes';
import { deliverOwnSiteCode } from './siteAccessCodeDelivery';
import { SITE_CODE_LENGTH, SITE_CODE_RESEND_SECONDS, normalizeSiteCode, validSiteCode } from '../shared/siteAccessCodePolicy';

const COOKIE='h2_site_auth';
const normalizeEmail=(value:unknown):string=>typeof value==='string'?value.trim().toLowerCase():'';
export function isSiteAccessEmail(email:string):boolean { return email.length<=320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
export function isSameOriginSiteRequest(req:Pick<Request,'headers'>):boolean {
  const origin=req.headers.origin,host=req.headers.host;
  if (!origin||!host||typeof origin!=='string') return false;
  try {const url=new URL(origin);return (url.protocol==='https:'||(process.env.NODE_ENV!=='production'&&url.protocol==='http:'))&&url.host.toLowerCase()===host.toLowerCase();}
  catch {return false;}
}
function tokenFrom(req:Request):string {
  try{return parseCookieHeader(req.headers.cookie||'')[COOKIE]||'';}catch{return '';}
}
function ownerSession(req:Request):boolean {
  try {
    const secret=getAdminJwtSecret(),owner=process.env.H2_SITE_SECURITY_OWNER?.trim();
    const token=parseCookieHeader(req.headers.cookie||'').admin_token;
    if(!secret||!owner||!token)return false;
    const payload=jwt.verify(token,secret,{algorithms:['HS256']}) as jwt.JwtPayload;
    return payload.role==='admin'&&payload.sub===owner;
  }catch{return false;}
}
export async function authorizedSiteVisitor(req:Request):Promise<boolean> {
  const token=tokenFrom(req);
  if(!/^[a-f0-9]{64}$/.test(token))return false;
  const db=await getDb();
  if(!db)return false;
  return !!await readOwnSiteSession(db,token);
}
function noStore(res:Response) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('CDN-Cache-Control','no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control','no-store');
}
function limited(res:Response,seconds:number) {
  res.setHeader('Retry-After',String(seconds));
  return res.status(429).json({error:'Aguarde antes de tentar novamente.',retryAfter:seconds});
}
function failure(res:Response,error:unknown,stage:string,requestId:string) {
  console.error('[SiteCode] request='+requestId+' stage='+stage+' code='+ownSiteErrorCode(error));
  return res.status(503).json({error:'Não foi possível concluir agora. Aguarde e tente novamente.',requestId});
}
export type SiteIdentityDependencies = {
  db: typeof getDb;
  delivery: typeof deliverOwnSiteCode;
  now: ()=>number;
};
const defaultDependencies:SiteIdentityDependencies={db:getDb,delivery:deliverOwnSiteCode,now:Date.now};
export function registerSiteIdentity(app:Express,deps:SiteIdentityDependencies=defaultDependencies):void {
  // Warm additive tables. A failure never opens restricted routes; later requests retry safely.
  void deps.db().then(db=>db?ensureOwnSiteCodeStore(db):undefined).then(()=>{
    console.info('[SiteCode] internal generator storage ready');
  }).catch(error=>console.error('[SiteCode] initialization code='+ownSiteErrorCode(error)));

  app.post('/api/site-access/request',async(req,res)=>{
    noStore(res);
    if(!isSameOriginSiteRequest(req))return res.status(403).json({error:'Origem não autorizada.'});
    const email=normalizeEmail(req.body?.email),requestId=randomBytes(8).toString('hex');
    if(!isSiteAccessEmail(email))return res.status(400).json({error:'Informe um e-mail válido.'});
    try {
      const db=await deps.db();if(!db)throw new Error('DATABASE_UNAVAILABLE');
      const now=deps.now(),windowMs=15*60_000;
      // Origin proxy addresses may be shared by many legitimate customers. Keep a high
      // aggregate ceiling, with the strict limits scoped to each normalized email.
      const network=String(req.ip||req.socket.remoteAddress||'shared');
      const networkWait=await takeOwnSiteLimit(db,'request-network:'+network,300,windowMs,now);
      if(networkWait)return limited(res,networkWait);
      const emailWait=await takeOwnSiteLimit(db,'request-email:'+email,6,windowMs,now);
      if(emailWait)return limited(res,emailWait);
      const resendWait=await takeOwnSiteLimit(db,'resend-email:'+email,1,SITE_CODE_RESEND_SECONDS*1000,now);
      if(resendWait)return limited(res,resendWait);
      const reserved=await reserveOwnSiteCode(db,email,now);
      const generic=()=>res.json({ok:true,message:'Se este e-mail estiver autorizado, o código será enviado. Confira também o spam.',retryAfter:SITE_CODE_RESEND_SECONDS,codeLength:SITE_CODE_LENGTH,codeValidFor:600});
      if(!reserved){console.info('[SiteCode] request='+requestId+' state=not-issued');return generic();}
      try {
        const outcome=await deps.delivery(email,reserved.code);
        await finishOwnSiteCodeDelivery(db,reserved.fingerprint,outcome);
        console.info('[SiteCode] request='+requestId+' state=accepted channel='+outcome.channel);
      }catch(error){
        await finishOwnSiteCodeDelivery(db,reserved.fingerprint,null).catch(()=>{});
        return failure(res,error,'delivery',requestId);
      }
      return generic();
    }catch(error){return failure(res,error,'request',requestId);}
  });

  app.post('/api/site-access/verify',async(req,res)=>{
    noStore(res);
    if(!isSameOriginSiteRequest(req))return res.status(403).json({error:'Origem não autorizada.'});
    const email=normalizeEmail(req.body?.email),code=normalizeSiteCode(req.body?.code);
    const wrong=()=>res.status(401).json({error:'Código inválido, expirado, já utilizado ou acesso não autorizado.'});
    if(!isSiteAccessEmail(email)||!validSiteCode(code))return wrong();
    const requestId=randomBytes(8).toString('hex');
    try {
      const db=await deps.db();if(!db)throw new Error('DATABASE_UNAVAILABLE');
      const now=deps.now(),network=String(req.ip||req.socket.remoteAddress||'shared');
      const waitNetwork=await takeOwnSiteLimit(db,'verify-network:'+network,300,15*60_000,now);
      if(waitNetwork)return limited(res,waitNetwork);
      const waitEmail=await takeOwnSiteLimit(db,'verify-email:'+email,10,15*60_000,now);
      if(waitEmail)return limited(res,waitEmail);
      const session=await consumeOwnSiteCode(db,email,code,now);
      if(!session)return wrong();
      res.cookie(COOKIE,session.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:session.expiresAt-now});
      return res.json({ok:true,expiresAt:session.expiresAt});
    }catch(error){return failure(res,error,'verify',requestId);}
  });

  app.get('/api/site-access/session',async(req,res)=>{
    noStore(res);
    try {
      if(process.env.H2_SITE_ACCESS_ENFORCE!=='true')return res.json({required:false,authorized:false});
      if(ownerSession(req))return res.json({required:false,authorized:false,ownerBypass:true});
      const db=await deps.db();if(!db)throw new Error('DATABASE_UNAVAILABLE');
      const result=await db.execute(sql`SELECT mode FROM siteAccessConfig WHERE id=1 LIMIT 1`);
      const mode=(result[0] as unknown as {mode:string}[])[0]?.mode||'public';
      if(mode==='public')return res.json({required:false,authorized:false});
      if(mode!=='restricted')return res.status(403).json({required:true,authorized:false});
      const session=await readOwnSiteSession(db,tokenFrom(req),deps.now());
      return res.json({required:true,authorized:!!session,expiresAt:session?.expiresAt??null});
    }catch(error){console.error('[SiteCode] session code='+ownSiteErrorCode(error));return res.status(503).json({required:true,authorized:false});}
  });
  app.post('/api/site-access/logout',async(req,res)=>{
    noStore(res);
    if(!isSameOriginSiteRequest(req))return res.status(403).json({error:'Origem não autorizada.'});
    try {
      const db=await deps.db();if(!db)throw new Error('DATABASE_UNAVAILABLE');
      await revokeOwnSiteSession(db,tokenFrom(req),deps.now());
      res.clearCookie(COOKIE,{path:'/',httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax'});
      return res.json({ok:true});
    }catch(error){return failure(res,error,'logout',randomBytes(8).toString('hex'));}
  });
}
