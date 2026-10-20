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
const deniedMessage='Você não está autorizado a acessar a comunidade H2.';
let state;
const reset=()=>{state={authorized:true,expiresAt:Date.now()+86400000,requestStatus:200,requestBody:undefined,requestWait:null,sessionStatus:200,logoutStatus:200,sent:0,verified:0,loggedOut:0};};reset();
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const json=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
  if(req.url==='/api/site-access/session')return json(state.sessionStatus,{required:true,authorized:state.authorized,expiresAt:state.expiresAt});
  if(req.url==='/api/site-access/request'){
    state.sent++;if(state.requestWait)await state.requestWait;
    const body=state.requestBody??(state.requestStatus===403
      ?{ok:false,code:'SITE_ACCESS_NOT_AUTHORIZED',error:deniedMessage}
      :state.requestStatus===200
        ?{ok:true,codeSent:true,message:'Código enviado. Confira a caixa de entrada e o spam.',retryAfter:60,codeLength:6}
        :{ok:false,retryAfter:60});
    return json(state.requestStatus,body);
  }
  if(req.url==='/api/site-access/verify'){
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);state.verified++;
    if(body.code!=='012345')return json(401,{});
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
async function codeForm(page){state.authorized=false;await page.goto(origin+'/site-access?next=/protected');await page.getByLabel('E-mail autorizado').fill('authorized@example.test');await page.getByRole('button',{name:'Enviar código',exact:true}).click();const input=page.getByLabel('Código de 6 números');await input.waitFor();return input;}
async function paste(input,text){await input.evaluate((element,value)=>{const clipboard=new DataTransfer();clipboard.setData('text/plain',value);element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));},text);}
async function advanceResendCountdown(page){
  const label=await page.getByRole('button',{name:/Reenviar em \d+s/}).textContent();
  const seconds=Number(label.match(/Reenviar em (\d+)s/)[1]);assert(seconds>0&&seconds<=60);
  // React schedules the next one-second timer after each render. Advance each
  // tick and wait for that render instead of sleeping or skipping the chain.
  for(let remaining=seconds;remaining>0;remaining--){
    await page.clock.fastForward(1000);
    await page.getByRole('button',{name:remaining===1?'Reenviar código':`Reenviar em ${remaining-1}s`,exact:true}).waitFor();
  }
}
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
    await context.addInitScript(()=>Object.defineProperty(AbortSignal,'timeout',{value:undefined,configurable:true,writable:true}));
    const input=await codeForm(page);await input.fill('012345');assert.equal(await input.inputValue(),'012345');await page.getByRole('button',{name:'Confirmar e entrar',exact:true}).click();await page.waitForURL('**/protected');await page.locator('#protected').waitFor();assert.equal(state.verified,1);
  });
  await test('numeric keyboard, six-digit limit and leading zeroes are preserved',async page=>{
    const input=await codeForm(page);assert.equal(await input.getAttribute('inputmode'),'numeric');assert.equal(await input.getAttribute('maxlength'),'6');assert.equal(await input.getAttribute('pattern'),'[0-9]{6}');
    await input.pressSequentially('0123456');assert.equal(await input.inputValue(),'012345');assert.equal(state.verified,0);
  });
  await test('letters cannot be entered or converted into digits',async page=>{
    const input=await codeForm(page);await input.pressSequentially('OILabc');assert.equal(await input.inputValue(),'');assert.equal(state.verified,0);
  });
  await test('pasted numeric code with separators keeps its leading zero and verifies',async page=>{
    const input=await codeForm(page);await paste(input,' 012-345 ');assert.equal(await input.inputValue(),'012345');await page.getByRole('button',{name:'Confirmar e entrar',exact:true}).click();await page.waitForURL('**/protected');assert.equal(state.verified,1);
  });
  await test('old alphanumeric and seven-digit pasted codes are rejected rather than truncated',async page=>{
    const input=await codeForm(page);for(const value of ['1234ABCDEFGH','0123456']){await paste(input,value);await page.getByText('Cole um código com 6 números, sem letras.',{exact:true}).waitFor();assert.equal(await input.inputValue(),'');assert.equal(state.verified,0);}
  });
  await test('unauthorized email shows an immediate alert without a code form or retry countdown',async(page,context)=>{
    state.authorized=false;state.requestStatus=403;await page.setViewportSize({width:320,height:850});await page.goto(origin+'/site-access');
    await page.getByLabel('E-mail autorizado').fill('unknown@example.test');
    for(let attempt=0;attempt<2;attempt++){
      const response=page.waitForResponse(value=>value.url()===origin+'/api/site-access/request');
      await page.getByRole('button',{name:'Enviar código',exact:true}).click();await response;
      await page.getByRole('alert').filter({hasText:deniedMessage}).waitFor();
      assert.equal(await page.getByRole('alert').textContent(),deniedMessage);
      assert.equal(await page.getByLabel('Código de 6 números').count(),0);
      assert.equal(await page.getByRole('button',{name:'Confirmar e entrar',exact:true}).count(),0);
      assert.equal(await page.getByRole('button',{name:/Reenviar|Aguarde \d+s/}).count(),0);
      assert(await page.getByRole('button',{name:'Enviar código',exact:true}).isEnabled());
    }
    assert.equal(state.sent,2);assert.equal(state.verified,0);assert.equal(state.authorized,false);
    assert(!(await context.cookies()).some(cookie=>cookie.name==='h2_site_auth'));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    // A corrected, authorized email can be submitted immediately after refusal.
    state.requestStatus=200;await page.getByLabel('E-mail autorizado').fill('authorized@example.test');
    await page.getByRole('button',{name:'Enviar código',exact:true}).click();await page.getByLabel('Código de 6 números').waitFor();
    await page.getByText('Código enviado. Confira a caixa de entrada e o spam.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('alert').count(),0);
  });
  await test('authorization lookup says Verificando without suggesting a code was sent',async page=>{
    state.authorized=false;state.requestStatus=403;
    let release;state.requestWait=new Promise(resolve=>{release=resolve;});
    try{
      await page.goto(origin+'/site-access');await page.getByLabel('E-mail autorizado').fill('unknown@example.test');
      await page.getByRole('button',{name:'Enviar código',exact:true}).click();
      const checking=page.getByRole('button',{name:'Verificando...',exact:true});await checking.waitFor();assert(await checking.isDisabled());
      assert.equal(await page.getByRole('button',{name:'Enviando...',exact:true}).count(),0);
      assert.equal(await page.getByLabel('Código de 6 números').count(),0);assert.equal(state.verified,0);
    }finally{release();}
    await page.getByRole('alert').filter({hasText:deniedMessage}).waitFor();
  });
  for(const body of [{ok:true},{ok:false,codeSent:true}])await test('HTTP 200 without explicit delivery confirmation keeps email form '+JSON.stringify(body),async page=>{
    state.authorized=false;state.requestBody=body;await page.goto(origin+'/site-access');
    await page.getByLabel('E-mail autorizado').fill('authorized@example.test');await page.getByRole('button',{name:'Enviar código',exact:true}).click();
    await page.getByText('Não foi possível enviar o código agora.',{exact:false}).waitFor();
    assert.equal(await page.getByLabel('Código de 6 números').count(),0);assert.equal(state.verified,0);
    assert.equal(await page.getByText('Código enviado. Confira a caixa de entrada e o spam.',{exact:true}).count(),0);
  });
  await test('foreign-origin 403 is not mislabeled as a refused email authorization',async page=>{
    state.authorized=false;state.requestStatus=403;state.requestBody={error:'Origem não autorizada.'};await page.goto(origin+'/site-access');
    await page.getByLabel('E-mail autorizado').fill('authorized@example.test');await page.getByRole('button',{name:'Enviar código',exact:true}).click();
    await page.getByText('Não foi possível enviar o código agora.',{exact:false}).waitFor();
    assert.equal(await page.getByRole('alert').count(),0);assert.equal(await page.getByText(deniedMessage,{exact:true}).count(),0);
    assert.equal(await page.getByLabel('Código de 6 números').count(),0);
  });
  await test('revoked authorization on resend clears the code and returns to the email form',async page=>{
    const start=new Date();await page.clock.install({time:start});await page.clock.pauseAt(new Date(start.getTime()+60000));
    const input=await codeForm(page);await input.fill('012345');state.requestStatus=403;
    await advanceResendCountdown(page);await page.getByRole('button',{name:'Reenviar código',exact:true}).click();
    await page.getByRole('alert').filter({hasText:deniedMessage}).waitFor();
    assert.equal(await page.getByLabel('Código de 6 números').count(),0);assert.equal(await page.getByRole('button',{name:/Reenviar|Aguarde \d+s/}).count(),0);
    assert.equal(await page.getByLabel('E-mail autorizado').inputValue(),'authorized@example.test');
    assert(await page.getByRole('button',{name:'Enviar código',exact:true}).isEnabled());assert.equal(state.verified,0);assert.equal(state.sent,2);
    state.requestStatus=200;await page.getByRole('button',{name:'Enviar código',exact:true}).click();await page.getByLabel('Código de 6 números').waitFor();
    assert.equal(await page.getByLabel('Código de 6 números').inputValue(),'');
  });
  await test('rate limiting shows an explicit countdown rather than a new-code form',async page=>{
    state.authorized=false;state.requestStatus=429;await page.goto(origin+'/site-access');await page.getByLabel('E-mail autorizado').fill('authorized@example.test');await page.getByRole('button',{name:'Enviar código',exact:true}).click();
    await page.getByText('Muitas solicitações ou reenvio recente.',{exact:false}).waitFor();assert.equal(await page.getByLabel('Código de 6 números').count(),0);assert(await page.getByRole('button',{name:/Aguarde \d+s/}).isDisabled());
  });
  await test('delivery failure is not presented as a delivered code',async page=>{
    state.authorized=false;state.requestStatus=503;await page.goto(origin+'/site-access');await page.getByLabel('E-mail autorizado').fill('authorized@example.test');await page.getByRole('button',{name:'Enviar código',exact:true}).click();await page.getByText('Não foi possível enviar o código agora.',{exact:false}).waitFor();assert.equal(await page.getByLabel('Código de 6 números').count(),0);
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
    state.authorized=false;await page.setViewportSize({width,height:850});await page.goto(origin+'/site-access');await page.getByLabel('E-mail autorizado').fill('authorized@example.test');await page.getByRole('button',{name:'Enviar código',exact:true}).click();await page.getByLabel('Código de 6 números').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  });
}finally {
  await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
