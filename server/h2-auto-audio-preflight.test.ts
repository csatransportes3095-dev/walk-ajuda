import {afterAll, beforeAll, beforeEach, expect, it, vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import {createHash} from 'node:crypto';
import {MySqlDialect} from 'drizzle-orm/mysql-core';
const state=vi.hoisted(()=>({stage:'customer_phone',bot:true,blocked:'',statements:[] as string[],personalization:{} as any}));
const token='a'.repeat(64), device='0123456789abcdef01234567', conversation='c'.repeat(64);
vi.mock('./db',()=>({getDb:async()=>{
 const execute=async(q:any)=>{
  const text=new MySqlDialect().sqlToQuery(q).sql;
  state.statements.push(text);
  if(text.includes('SELECT token_hash'))return [[{token_hash:createHash('sha256').update(token).digest('hex')}]];
  if(text.includes('AS confirmation_json'))return [[{bot_on:state.bot?'true':'false',identity_on:'true',session_hours:24,collection_on:'false',blocked_phones:state.blocked,personalization_json:state.personalization}]];
  if(text.includes('SELECT * FROM h2_auto_access_sessions'))return state.stage==='absent'?[[]]:[[{stage:state.stage,updated_at:Date.now(),expires_at:Date.now()+100000}]];
  return [[]];
 };
 return {execute,transaction:async(fn:any)=>fn({execute})};
}}));
import {registerH2AutoAccessRoutes} from './h2-auto-access';
let server:Server,base:string;
beforeAll(async()=>{const app=express();app.use(express.json());registerH2AutoAccessRoutes(app);server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));base='http://127.0.0.1:'+(server.address() as any).port;});
afterAll(()=>new Promise<void>(r=>server.close(()=>r())));
beforeEach(()=>{state.stage='customer_phone';state.bot=true;state.blocked='';state.statements=[];state.personalization={enabled:false};});
async function step(body:any,auth=true){const r=await fetch(base+'/api/h2-auto/access/step',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'x-h2-device-id':device,'x-h2-device-token':token}:{})},body:JSON.stringify({conversationId:conversation,...body})});return {status:r.status,body:await r.json()};}
it.each(['customer_phone','customer_code','referrals_code','choice','absent'])('audio preflight does not consume input or change session %s',async(stage)=>{
 state.stage=stage;const r=await step({input:'',inputKind:'audio_pending'});
 expect(r).toEqual({status:200,body:{state:'audio_pending'}});
 expect(state.statements.filter(x=>/^(INSERT|UPDATE|DELETE).*h2_auto_(access_sessions|phone_failures)/s.test(x))).toEqual([]);
});
it('rejects an unauthenticated device',async()=>{expect((await step({input:'',inputKind:'audio_pending'},false)).status).toBe(401);});
it('does not bypass disabled devices or validation blocks',async()=>{
 state.bot=false;expect((await step({input:'',inputKind:'audio_pending'})).body.state).toBe('disabled');
 state.bot=true;state.stage='blocked';expect((await step({input:'',inputKind:'audio_pending'})).body.state).toBe('blocked');
});
it('does not bypass a silenced contact',async()=>{state.blocked='11999999999';expect((await step({input:'',inputKind:'audio_pending',contactLabel:'11999999999'})).body.state).toBe('disabled');});
it('rejects a caption or transcript in the read-only probe',async()=>{expect((await step({input:'Mensagem de voz',inputKind:'audio_pending'})).status).toBe(400);});
it('recognized speech and typed questions use the same configured answer',async()=>{
 state.stage='absent';state.personalization={enabled:true,faq:[{id:'agendar_foto',question:'Qual prazo para agendar foto?',answer:'Confira o agendamento no seu pedido.',enabled:true}]};
 const typed=await step({input:'Qual prazo para agendar foto?'});
 const speech=await step({input:'qual prazo para agendar foto'});
 expect(typed.body.message).toContain('Confira o agendamento');expect(speech.body.message).toBe(typed.body.message);
});
