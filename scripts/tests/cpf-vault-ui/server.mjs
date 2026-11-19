// Isolated UI harness: synthetic fixtures and mocked CPF routes only.
import express from 'express';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {initTRPC,TRPCError} from '@trpc/server';
import {createExpressMiddleware} from '@trpc/server/adapters/express';
import {z} from 'zod';
import superjson from 'superjson';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const normalize=v=>String(v).replace(/\D/g,'');
function cpfFor(base){let v=String(base);for(let digits=9;digits<11;digits++){let sum=0;for(let i=0;i<digits;i++)sum+=Number(v[i])*(digits+1-i);let c=(sum*10)%11;v+=String(c===10?0:c);}return v;}
const cpf=Array.from({length:14},(_,i)=>cpfFor(900000001+i));
const state={entries:[],calls:[],failCheck:false,failList:false,forceRace:false,delayMs:0,nextId:1};
function entry(v,input={}){return {id:state.nextId++,normalizedCpf:v,registrationId:input.registrationId??null,subOrderIndex:input.subOrderIndex??0,orderRootId:input.expectedOrderRootId??null,customerId:input.registrationId?9:null,customerName:input.registrationId?'Cliente de teste':null,customerNumber:input.registrationId?410:null,orderNumber:input.expectedOrderNumber??null,note:input.note??null,createdAt:'2026-11-19T06:00:00.000Z'};}
function reset(){state.entries=[entry(cpf[2])];state.calls=[];state.failCheck=false;state.failList=false;state.forceRace=false;state.delayMs=0;}
reset();
function batch(text){const tokens=text.split(/[\s,;]+/).filter(Boolean);const vals=tokens.map(normalize);const valid=vals.filter(v=>cpf.includes(v));return{cpfs:[...new Set(valid)],invalid:tokens.filter((v,i)=>!cpf.includes(vals[i])),duplicateCount:valid.length-new Set(valid).size};}
async function mark(name,input){state.calls.push({name,input});if(state.delayMs)await new Promise(r=>setTimeout(r,state.delayMs));}
const t=initTRPC.create({transformer:superjson});
const router=t.router({cpfVault:t.router({
  check:t.procedure.input(z.any()).query(async({input})=>{await mark('check',input);if(state.failCheck)throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'Cofre indisponível para teste.'});const normalizedCpf=normalize(input.cpf);return{exists:state.entries.some(v=>v.normalizedCpf===normalizedCpf),normalizedCpf,record:state.entries.find(v=>v.normalizedCpf===normalizedCpf)||null};}),
  save:t.procedure.input(z.any()).mutation(async({input})=>{await mark('save',input);const v=normalize(input.cpf);let record=state.entries.find(x=>x.normalizedCpf===v);let saved=!record&&!state.forceRace;if(!record){record=entry(v,state.forceRace?{registrationId:99,expectedOrderNumber:999999,expectedOrderRootId:999001}:input);state.entries.unshift(record);}return{saved,exists:true,normalizedCpf:v,record};}),
  checkBatch:t.procedure.input(z.any()).mutation(async({input})=>{await mark('checkBatch',input);if(state.failCheck)throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'Cofre indisponível para teste.'});const p=batch(input.text);return{total:p.cpfs.length,available:p.cpfs.filter(c=>!state.entries.some(x=>x.normalizedCpf===c)),used:p.cpfs.filter(c=>state.entries.some(x=>x.normalizedCpf===c)),invalid:p.invalid,duplicateCount:p.duplicateCount};}),
  saveBatch:t.procedure.input(z.any()).mutation(async({input})=>{await mark('saveBatch',input);const p=batch(input.text);let savedCount=0;for(const c of p.cpfs){if(!state.entries.some(x=>x.normalizedCpf===c)){state.entries.unshift(entry(c,input));savedCount++;}}return{total:p.cpfs.length,savedCount,alreadyUsedCount:p.cpfs.length-savedCount,invalid:p.invalid,duplicateCount:p.duplicateCount};}),
  list:t.procedure.input(z.any()).query(async({input})=>{await mark('list',input);if(state.failList)throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'Lista indisponível para teste.'});let items=state.entries.filter(x=>(!input.registrationId||(x.registrationId===input.registrationId&&(!input.expectedOrderRootId||x.orderRootId===input.expectedOrderRootId)&&(!input.expectedOrderNumber||x.orderNumber===input.expectedOrderNumber)))&&(!input.query||x.normalizedCpf.includes(normalize(input.query))));const total=items.length;items=items.filter(x=>!input.cursor||x.id<input.cursor);return{items:items.slice(0,input.limit??20),nextCursor:null,total};}),
}),adminAuth:t.router({logout:t.procedure.mutation(()=>({success:true})),check:t.procedure.query(()=>({isAdmin:true}))})});
const app=express();
app.use('/api/trpc',createExpressMiddleware({router}));
app.use(express.json());
app.get('/test-control',(req,res)=>res.json({cpf,...state}));
app.post('/test-control',(req,res)=>{if(req.body.reset)reset();for(const k of ['failCheck','failList','forceRace','delayMs'])if(k in req.body)state[k]=req.body[k];res.json({cpf,...state});});
const vite=await createServer({configFile:false,root,plugins:[react(),tailwind()],resolve:{alias:{'@':path.join(repo,'client/src'),'@shared':path.join(repo,'shared')}},server:{middlewareMode:true,fs:{allow:[root,repo]}},appType:'spa',optimizeDeps:{include:['react','react-dom/client','@tanstack/react-query','@trpc/client','@trpc/react-query','superjson','sonner','wouter','lucide-react','@radix-ui/react-dialog']}});
app.use(vite.middlewares);
app.listen(4175,'127.0.0.1',()=>console.log('CPF QA listening http://127.0.0.1:4175'));
