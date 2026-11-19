// Browser checks target only the local synthetic CPF UI harness.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';

const outputDir=path.resolve(process.env.CPF_UI_OUTPUT_DIR||path.join(os.tmpdir(),'h2-cpf-vault-ui'));
await fs.mkdir(outputDir,{recursive:true});
if(!process.env.PLAYWRIGHT_MODULE||!process.env.CHROME_BIN) throw new Error('Set PLAYWRIGHT_MODULE and CHROME_BIN to the installed tools; this suite does not download a browser.');
const {chromium}=await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);

const base='http://127.0.0.1:4175';
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--disable-dev-shm-usage']});
} catch(error) {
  await fs.writeFile(path.join(outputDir,'qa-failure.json'),JSON.stringify({passed:0,error:String(error),stage:'browser-launch'},null,2));
  throw error;
}
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();
const errors=[];const checks=[];
page.on('pageerror',e=>errors.push(String(e)));
const control=async data=>(await page.request.post(base+'/test-control',{data})).json();
const state=async()=>(await page.request.get(base+'/test-control')).json();
const setOrder=async order=>{
  await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('cpf-qa:set-order',{detail})),order);
  await page.waitForFunction(expected=>{
    const actual=JSON.parse(document.querySelector('[data-testid="current-order"]').textContent);
    return Object.entries(expected).every(([key,value])=>actual[key]===value);
  },order);
};
const fmt=v=>v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
const fixture=await control({reset:true});const cpf=fixture.cpf;
const shot=name=>page.screenshot({path:path.join(outputDir,name),fullPage:true});

try {
  await page.goto(base,{waitUntil:'networkidle'});
  const single=page.getByRole('region',{name:'Consultar e registrar CPF'});
  const input=single.getByLabel('CPF para consulta');
  const consult=single.getByRole('button',{name:'Consultar CPF',exact:true});
  await input.fill(fmt(cpf[0]));await consult.click();
  await single.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).waitFor();
  const before=(await state()).calls.filter(x=>x.name==='check').length;
  await consult.click();
  await single.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).waitFor();
  assert.equal((await state()).calls.filter(x=>x.name==='check').length,before+1,'repeated consultation must fetch');
  checks.push('Repeated identical lookup fetches fresh server state');
  await shot('desktop-available.png');
  await single.getByRole('button',{name:'Guardar como usado',exact:true}).click();
  await single.getByText('USADO — NÃO REUTILIZAR',{exact:true}).waitFor();
  assert.equal((await state()).entries.filter(x=>x.normalizedCpf===cpf[0]).length,1);
  checks.push('Individual available -> save -> red used');

  await input.fill('111.111.111-11');await consult.click();
  await single.getByRole('alert').waitFor();
  assert.match(await single.getByRole('alert').innerText(),/CPF inválido/);
  assert.equal(await single.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).count(),0);
  checks.push('Invalid CPF never appears available');

  await input.fill(cpf[1]);await consult.click();
  await single.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).waitFor();
  await control({failCheck:true});await consult.click();
  await single.getByRole('alert').waitFor();
  assert.equal(await single.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).count(),0);
  checks.push('Backend lookup failure suppresses prior cached green');
  await control({failCheck:false});

  const batch=page.getByRole('region',{name:'Consulta de CPFs em lote'});
  await batch.getByLabel('Lista de CPFs').fill([cpf[1],fmt(cpf[2]),cpf[3],fmt(cpf[1]),'11111111111'].join('\n'));
  await batch.getByRole('button',{name:'Consultar lote',exact:true}).click();
  await batch.getByRole('button',{name:'Copiar disponíveis'}).waitFor();
  assert.match(await batch.innerText(),/1 repetição/);
  assert.match(await batch.innerText(),/INVÁLIDOS/);
  await batch.getByRole('button',{name:'Copiar disponíveis'}).click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),[cpf[1],cpf[3]].join('\n'));
  checks.push('Mixed batch classifies available/used/invalid/deduplicated and copies only available');
  await shot('desktop-batch.png');
  await batch.getByRole('button',{name:/Guardar 2 disponível/}).click();
  await batch.getByText('2 CPF(s) registrado(s) como usados.',{exact:true}).waitFor();
  assert.equal(await batch.getByRole('button',{name:'Copiar disponíveis'}).count(),0);
  await batch.getByRole('button',{name:'Consultar lote',exact:true}).click();
  await batch.getByRole('heading',{name:'USADOS — NÃO REUTILIZAR',exact:true}).waitFor();
  assert.equal(await batch.getByRole('button',{name:'Copiar disponíveis'}).count(),0);
  checks.push('Batch save clears available list and repeated check returns all valid CPFs used');

  await input.fill(cpf[4]);await consult.click();
  await single.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).waitFor();
  await control({forceRace:true});await single.getByRole('button',{name:'Guardar como usado',exact:true}).click();
  await single.getByText('USADO — NÃO REUTILIZAR',{exact:true}).waitFor();
  assert.match(await single.innerText(),/#999999/);
  checks.push('Racing duplicate save becomes red and displays original owner');
  await control({forceRace:false});

  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no mobile overflow');
  await shot('mobile-vault.png');
  checks.push('390px mobile layout has no horizontal overflow');

  await control({reset:true});
  await page.goto(base+'/?mode=order',{waitUntil:'networkidle'});
  assert.equal((await state()).calls.filter(x=>x.name==='list').length,0,'collapsed order must not query');
  const opener=page.getByRole('button',{name:'Cofre de CPF',exact:true});
  await opener.click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  assert.equal(await page.getByTestId('toggles').innerText(),'0');
  await dialog.getByLabel('CPF para consulta').fill(cpf[5]);
  await dialog.getByLabel('CPF para consulta').press('Enter');
  await dialog.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).waitFor();
  assert.equal(await page.getByTestId('toggles').innerText(),'0');
  await dialog.getByRole('button',{name:'Registrar neste pedido como usado',exact:true}).click();
  await dialog.getByText('Este CPF já está registrado neste pedido.',{exact:true}).waitFor();
  const call=(await state()).calls.find(x=>x.name==='save');
  assert.equal(call.input.registrationId,42);assert.equal(call.input.subOrderIndex,0);assert.equal(call.input.expectedOrderNumber,800001);assert.equal(call.input.expectedOrderRootId,800101);
  assert.equal((await state()).entries.find(x=>x.normalizedCpf===cpf[5]).orderRootId,800101);
  await shot('mobile-order-dialog.png');
  await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  await opener.focus();await opener.press('Enter');await dialog.waitFor();
  assert.equal(await page.getByTestId('toggles').innerText(),'0');
  await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  checks.push('Order dialog lazy loads, saves exact order, click/Enter do not toggle card, Escape closes');

  await page.setViewportSize({width:1440,height:1000});
  await opener.click();await dialog.waitFor();
  await dialog.getByLabel('CPF para consulta').fill(cpf[6]);
  await dialog.getByRole('button',{name:'Consultar CPF',exact:true}).click();
  await dialog.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).waitFor();
  const beforeChangedOrder=(await state()).calls.filter(x=>x.name==='save').length;
  await setOrder({orderNumber:800002,orderRootId:800201});
  await dialog.getByRole('alert').filter({hasText:'O pedido deste card mudou.'}).waitFor();
  assert.match(await dialog.innerText(),/Pedido #800001/,'open dialog retains the original target');
  const disabledSave=dialog.getByRole('button',{name:'Registrar neste pedido como usado',exact:true});
  assert.equal(await disabledSave.isDisabled(),true,'changed order disables registration');
  await disabledSave.evaluate(button=>button.click());
  assert.equal((await state()).calls.filter(x=>x.name==='save').length,beforeChangedOrder,'changed card cannot send a write');
  await shot('desktop-order-changed.png');
  await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  await opener.click();await dialog.waitFor();
  assert.match(await dialog.innerText(),/Pedido #800002/,'reopen captures the new target');
  await dialog.getByLabel('CPF para consulta').fill(cpf[6]);
  await dialog.getByRole('button',{name:'Consultar CPF',exact:true}).click();
  await dialog.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Registrar neste pedido como usado',exact:true}).click();
  await dialog.getByText('Este CPF já está registrado neste pedido.',{exact:true}).waitFor();
  const changedCall=(await state()).calls.filter(x=>x.name==='save').at(-1);
  assert.equal(changedCall.input.expectedOrderNumber,800002);assert.equal(changedCall.input.expectedOrderRootId,800201);
  assert.equal((await state()).entries.find(x=>x.normalizedCpf===cpf[5]).orderRootId,800101,'the old record remains with the old order');
  await shot('desktop-order-dialog.png');
  await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  checks.push('Same mounted order component blocks a changed card while open; reopen writes only to the new order root');

  await setOrder({registrationId:44,orderNumber:null,orderRootId:810101});
  await opener.click();await dialog.waitFor();
  await dialog.getByLabel('CPF para consulta').fill(cpf[7]);
  await dialog.getByRole('button',{name:'Consultar CPF',exact:true}).click();
  await dialog.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Registrar neste pedido como usado',exact:true}).click();
  await dialog.getByText('Este CPF já está registrado neste pedido.',{exact:true}).waitFor();
  const numberlessCall=(await state()).calls.filter(x=>x.name==='save').at(-1);
  assert.equal(numberlessCall.input.registrationId,44);assert.equal(numberlessCall.input.expectedOrderRootId,810101);
  assert.equal(numberlessCall.input.expectedOrderNumber,undefined,'numberless order relies on stable root');
  await dialog.getByLabel('CPF para consulta').fill(cpf[8]);
  await dialog.getByRole('button',{name:'Consultar CPF',exact:true}).click();
  await dialog.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).waitFor();
  const beforeNumberlessChange=(await state()).calls.filter(x=>x.name==='save').length;
  await setOrder({orderRootId:810201});
  await dialog.getByRole('alert').filter({hasText:'O pedido deste card mudou.'}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Registrar neste pedido como usado',exact:true}).isDisabled(),true);
  await dialog.getByRole('button',{name:'Registrar neste pedido como usado',exact:true}).evaluate(button=>button.click());
  assert.equal((await state()).calls.filter(x=>x.name==='save').length,beforeNumberlessChange);
  await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  await opener.click();await dialog.waitFor();
  await dialog.getByLabel('CPF para consulta').fill(cpf[7]);
  await dialog.getByRole('button',{name:'Consultar CPF',exact:true}).click();
  await dialog.getByText('USADO — NÃO REUTILIZAR',{exact:true}).waitFor();
  assert.equal(await dialog.getByText('Este CPF já está registrado neste pedido.',{exact:true}).count(),0,'same registration/index but different root is another order');
  await dialog.getByLabel('CPF para consulta').fill(cpf[8]);
  await dialog.getByRole('button',{name:'Consultar CPF',exact:true}).click();
  await dialog.getByText('NÃO USADO — DISPONÍVEL',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Registrar neste pedido como usado',exact:true}).click();
  await dialog.getByText('Este CPF já está registrado neste pedido.',{exact:true}).waitFor();
  assert.equal((await state()).calls.filter(x=>x.name==='save').at(-1).input.expectedOrderRootId,810201);
  const numberlessEntries=(await state()).entries;
  assert.equal(numberlessEntries.find(x=>x.normalizedCpf===cpf[7]).orderRootId,810101);
  assert.equal(numberlessEntries.find(x=>x.normalizedCpf===cpf[8]).orderRootId,810201);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await shot('mobile-numberless-order-dialog.png');
  await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  checks.push('Numberless orders send stable roots; root-only changes block writes and preserve ownership between orders');

  await setOrder({orderRootId:null});
  const beforeMissingIdentity=(await state()).calls.length;
  await opener.click();await dialog.waitFor();
  await dialog.getByRole('alert').filter({hasText:'Não foi possível confirmar a identificação deste pedido.'}).waitFor();
  assert.equal(await dialog.getByLabel('CPF para consulta').isDisabled(),true);
  assert.equal(await dialog.getByRole('button',{name:'Consultar CPF',exact:true}).isDisabled(),true);
  assert.equal((await state()).calls.length,beforeMissingIdentity,'missing identity must not query an inferred order');
  await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  checks.push('Cards without a stable order root block consultation and registration without backend requests');

  assert.deepEqual(errors,[],'No browser runtime errors');
  await fs.writeFile(path.join(outputDir,'qa-results.json'),JSON.stringify({passed:checks.length,checks,browserErrors:errors,cpfFixtureCount:cpf.length},null,2));
  console.log(JSON.stringify({passed:checks.length,checks,browserErrors:errors},null,2));
} catch(error) {
  await shot('qa-failure.png');
  await fs.writeFile(path.join(outputDir,'qa-failure.json'),JSON.stringify({passed:checks.length,checks,error:String(error),stack:error.stack,browserErrors:errors},null,2));
  throw error;
} finally {await browser.close();}
