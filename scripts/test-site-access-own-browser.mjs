import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const root=process.cwd(),out='/tmp/site-own-browser-evidence';
const {chromium}=await import(pathToFileURL(path.join(process.env.SITE_UI_TOOLS,'node_modules/playwright/index.mjs')).href);
await fs.mkdir(out,{recursive:true});
const bundle=await build({stdin:{contents:`
import React from 'react';
import {createRoot} from 'react-dom/client';
import Boundary from './client/src/components/SiteAccessSessionBoundary';
import SiteAccess from './client/src/pages/SiteAccess';
const content=location.pathname==='/site-access'?<SiteAccess/>:<div><h1 id="protected">Conteudo privado de teste</h1><button id="account-logout" onClick={()=>localStorage.removeItem('cp_token')}>Sair da conta</button></div>;
createRoot(document.getElementById('root')).render(<Boundary onClear={()=>{window.cleared=(window.cleared||0)+1;}}>{content}</Boundary>);
`,resolveDir:root,sourcefile:'own-site-harness.tsx',loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:'tsconfig.json'});
const js=bundle.outputFiles[0].text;
const assets=await fs.readdir('dist/public/assets');
const cssFiles=assets.filter(name=>name.endsWith('.css'));
const css=(await Promise.all(cssFiles.map(name=>fs.readFile(path.join('dist/public/assets',name),'utf8')))).join('\n');
let state;
const reset=()=>{state={authorized:true,expiresAt:Date.now()+86400000,requestStatus:200,sessionStatus:200,logoutStatus:200,sent:0,verified:0,loggedOut:0};};reset();
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const json=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
  if(req.url==='/api/site-access/session')return json(state.sessionStatus,{required:true,authorized:state.authorized,expiresAt:state.expiresAt});
  if(req.url==='/api/site-access/request'){state.sent++;return json(state.requestStatus,{ok:state.requestStatus===200,retryAfter:60,codeLength:12});}
  if(req.url==='/api/site-access/verify'){
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);state.verified++;
    if(body.code!=='1234ABCDEFGH')return json(401,{});
    state.authorized=true;state.expiresAt=Date.now()+86400000;return json(200,{ok:true,expiresAt:state.expiresAt});
  }
  if(req.url==='/api/site-access/logout'){state.loggedOut++;if(state.logoutStatus===200)state.authorized=false;return json(state.logoutStatus,{ok:state.logoutStatus===200});}
  if(req.url==='/api/trpc/customerPassword.logout')return json(200,{result:{data:{json:{success:true}}}});
  if(req.url==='/test.js'){res.setHeader('Content-Type','application/javascript');return res.end(js);}
  if(req.url==='/test.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const results=[];
async function test(name,fn){reset();const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(7000);try{await fn(page,context);results.push({name,status:'passed'});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:String(error)});await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}finally{await context.close();}}
try {
  await test('anonymous viewer is challenged before private content is mounted',async page=>{
    state.authorized=false;await page.goto(origin+'/protected');await page.waitForURL('**/site-access?*');assert.equal(await page.locator('#protected').count(),0);await page.getByRole('button',{name:'Enviar código',exact:true}).waitFor();
  });
  await test('an authorized visitor without a customer account remains allowed',async page=>{
    await page.goto(origin+'/protected');await page.locator('#protected').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('cp_token')),null);await page.getByRole('button',{name:'Sair do site',exact:true}).waitFor();
  });
  await test('existing account logout closes the outer site authorization',async(page,context)=>{
    await context.addInitScript(()=>{localStorage.setItem('cp_token','test-customer-token');localStorage.setItem('saved_draft','keep');});
    await page.goto(origin+'/protected');await page.locator('#protected').waitFor();await page.waitForFunction(()=>sessionStorage.getItem('h2_site_had_customer_session')==='1');
    await page.locator('#account-logout').click();await page.waitForURL('**/site-access?*');assert(state.loggedOut>0);assert.equal(await page.evaluate(()=>localStorage.getItem('saved_draft')),'keep');
  });
  await test('site-only visitor can log out without creating a customer',async page=>{
    await page.goto(origin+'/protected');await page.getByRole('button',{name:'Sair do site',exact:true}).click();await page.waitForURL('**/site-access?*');assert.equal(state.authorized,false);
  });
  await test('logging out one tab closes the other tab',async(page,context)=>{
    await page.goto(origin+'/protected');await page.locator('#protected').waitFor();const second=await context.newPage();await second.goto(origin+'/protected');await second.locator('#protected').waitFor();
    await page.getByRole('button',{name:'Sair do site',exact:true}).click();await second.waitForURL('**/site-access?*');assert.equal(await second.locator('#protected').count(),0);
  });
  await test('absolute deadline closes the open page without waiting for a refresh',async page=>{
    state.expiresAt=Date.now()+1800;await page.goto(origin+'/protected');await page.locator('#protected').waitFor();await page.waitForURL('**/site-access?*');assert.equal(await page.locator('#protected').count(),0);
  });
  await test('mail verification works in browsers missing AbortSignal.timeout',async(page,context)=>{
    state.authorized=false;await context.addInitScript(()=>Object.defineProperty(AbortSignal,'timeout',{value:undefined,configurable:true,writable:true}));
    await page.goto(origin+'/site-access?next=/protected');await page.getByLabel('E-mail autorizado').fill('authorized@example.test');await page.getByRole('button',{name:'Enviar código',exact:true}).click();
    await page.getByLabel('Código de 12 caracteres').fill('1234-ABCD-EFGH');await page.getByRole('button',{name:'Confirmar e entrar',exact:true}).click();await page.waitForURL('**/protected');await page.locator('#protected').waitFor();assert.equal(state.verified,1);
  });
  await test('rate limiting shows an explicit countdown rather than a new-code form',async page=>{
    state.authorized=false;state.requestStatus=429;await page.goto(origin+'/site-access');await page.getByLabel('E-mail autorizado').fill('authorized@example.test');await page.getByRole('button',{name:'Enviar código',exact:true}).click();
    await page.getByText('Muitas solicitações ou reenvio recente.',{exact:false}).waitFor();assert.equal(await page.getByLabel('Código de 12 caracteres').count(),0);assert(await page.getByRole('button',{name:/Aguarde \d+s/}).isDisabled());
  });
  await test('delivery failure is not presented as a delivered code',async page=>{
    state.authorized=false;state.requestStatus=503;await page.goto(origin+'/site-access');await page.getByLabel('E-mail autorizado').fill('authorized@example.test');await page.getByRole('button',{name:'Enviar código',exact:true}).click();await page.getByText('Não foi possível enviar o código agora.',{exact:false}).waitFor();assert.equal(await page.getByLabel('Código de 12 caracteres').count(),0);
  });
  await test('session failure blocks content and offers a retry',async page=>{
    state.sessionStatus=503;await page.goto(origin+'/protected');await page.getByRole('button',{name:'Tentar novamente',exact:true}).waitFor();assert.equal(await page.locator('#protected').count(),0);
    state.sessionStatus=200;await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.locator('#protected').waitFor();
  });
  await test('failed server logout remains blocked and retries instead of claiming success',async page=>{
    await page.goto(origin+'/protected');await page.locator('#protected').waitFor();state.logoutStatus=503;await page.getByRole('button',{name:'Sair do site',exact:true}).click();await page.getByRole('button',{name:'Tentar novamente',exact:true}).waitFor();assert.equal(await page.locator('#protected').count(),0);assert(await page.evaluate(()=>!!localStorage.getItem('h2_site_logout_pending')));
    state.logoutStatus=200;await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.waitForURL('**/site-access?*');
  });
  for(const width of [320,375,390,768,1366])await test('code form stays inside viewport '+width,async page=>{
    state.authorized=false;await page.setViewportSize({width,height:850});await page.goto(origin+'/site-access');await page.getByLabel('E-mail autorizado').fill('authorized@example.test');await page.getByRole('button',{name:'Enviar código',exact:true}).click();await page.getByLabel('Código de 12 caracteres').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  });
}finally {
  await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
