// OTP navigation regression: no temporary browser tab, no automatic WhatsApp
// redirect. Synthetic APIs and no real personal data, OTP, SMTP or APK.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_BIN) throw new Error('PLAYWRIGHT_MODULE and CHROME_BIN required');
const output = path.resolve(process.env.CUSTOMER_OTP_DELIVERY_UI_OUTPUT_DIR || path.join(os.tmpdir(), 'h2-customer-otp-delivery-ui'));
await fs.mkdir(output, { recursive:true });
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ executablePath:process.env.CHROME_BIN, headless:true, args:['--disable-dev-shm-usage'] });
const base = 'http://127.0.0.1:4177', phone = '11999990001';
const profiles = {
  desktop:{ viewport:{ width:1280,height:900 } },
  iphone:{ viewport:{ width:390,height:844 }, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  android:{ viewport:{ width:390,height:844 }, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
};
const checks=[], errors=[];
async function fixture(profile='desktop', withWhatsapp=true) {
  const context = await browser.newContext(profiles[profile]);
  const urls=[];
  await context.route('**/*', route => {
    const url=route.request().url();
    if (url.startsWith(base) || url.startsWith('data:') || url === 'about:blank') return route.continue();
    if (url.startsWith('https://api.whatsapp.com/')) {
      urls.push(url);
      return route.fulfill({ status:200,contentType:'text/html',body:'<html><body>WhatsApp fictício</body></html>' });
    }
    return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror', e=>errors.push(String(e)));
  await page.request.post(base+'/test-control',{data:{reset:true,whatsappAvailable:withWhatsapp}});
  const url=base+'/?initialPhone='+phone;
  await page.goto(url,{waitUntil:'networkidle'});
  const request=page.getByRole('button',{name:'RECEBER CÓDIGO',exact:true});
  await request.waitFor();
  const state=async()=>(await page.request.get(base+'/test-control')).json();
  return {context,page,url,request,state,urls,close:()=>context.close()};
}
try {
  for (const profile of ['desktop','iphone','android']) {
    const f=await fixture(profile);
    await f.page.evaluate(()=>{window.__h2OriginalTabMarker='preserved'});
    await f.request.click();
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.equal(f.page.url(),f.url,'Solicitação deve manter URL do login');
    assert.equal(await f.page.evaluate(()=>window.__h2OriginalTabMarker),'preserved');
    assert.equal(f.context.pages().length,1,'Sem abas novas na solicitação');
    assert.equal(f.urls.length,0,'Sem navegação automática para WhatsApp');
    assert.deepEqual((await f.state()).requestCalls,[{phone,channel:'both'}]);
    const open=f.page.getByTestId('h2-otp-open-whatsapp');
    await open.waitFor();
    const href=await open.getAttribute('href');
    assert.equal(href?.includes('about:blank'),false);
    const target=await open.getAttribute('target');
    if(profile==='desktop'){
      assert.ok(href.startsWith('https://api.whatsapp.com/send?'),href);
      assert.equal(target,'_blank');
      const popupPromise=f.context.waitForEvent('page');
      await open.click();
      const popup=await popupPromise;
      await popup.waitForURL('https://api.whatsapp.com/**');
      assert.equal(f.page.url(),f.url);
      await popup.close();
    }else{
      // On Linux there is no installed iPhone/Android WhatsApp app. Validate
      // the native handoff URL, not a fake success from an unregistered scheme.
      assert.ok(href.startsWith('whatsapp://send?'),href);
      assert.equal(target,null,'Não deve criar uma segunda aba no iPhone/Android');
      const native=new URL(href);
      assert.equal(native.searchParams.get('phone'),'5511999990099');
      assert.equal(native.searchParams.get('text'),'Preciso receber meu código');
    }
    if(profile==='iphone') await f.page.screenshot({path:path.join(output,'navigation-iphone-code-entry.png'),fullPage:true});
    await f.page.reload({waitUntil:'networkidle'});
    await f.page.getByLabel('Código de 6 números').waitFor();
    await f.page.getByTestId('h2-otp-open-whatsapp').waitFor();
    assert.deepEqual((await f.state()).requestCalls,[{phone,channel:'both'}],'Voltar/recarregar não deve gerar outro código');
    assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    await f.page.getByLabel('Código de 6 números').fill('246810');
    await f.page.getByRole('button',{name:'CONFIRMAR E ACESSAR'}).click();
    await f.page.getByTestId('authenticated-phone').waitFor();
    assert.deepEqual((await f.state()).verifyCalls,[{phone,code:'246810'}]);
    checks.push(profile+': envio sem popup, link direto, código permanece na tela ao voltar e ao recarregar');
    await f.close();
  }
  {
    const f=await fixture('iphone',false);
    await f.request.click();
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.equal(await f.page.getByTestId('h2-otp-open-whatsapp').count(),0);
    assert.equal(f.context.pages().length,1);
    await f.page.reload({waitUntil:'networkidle'});
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.deepEqual((await f.state()).requestCalls,[{phone,channel:'both'}]);
    checks.push('WhatsApp indisponível: e-mail segue ativo e campo preservado, sem redirecionamento');
    await f.close();
  }
  assert.deepEqual(errors,[]);
  const result={passed:checks.length,checks,errors};
  await fs.writeFile(path.join(output,'navigation-qa-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  await browser.close();
}
