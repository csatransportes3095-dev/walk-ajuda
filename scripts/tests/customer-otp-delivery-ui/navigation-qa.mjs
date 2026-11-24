// OTP navigation regression: no temporary browser tab, no automatic WhatsApp
// redirect. Synthetic APIs and no real personal data, OTP, SMTP or APK.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const browserEngine = process.env.PLAYWRIGHT_BROWSER === 'webkit' ? 'webkit' : 'chromium';
if (!process.env.PLAYWRIGHT_MODULE || (browserEngine === 'chromium' && !process.env.CHROME_BIN)) throw new Error('Playwright module and browser executable required');
const output = path.resolve(process.env.CUSTOMER_OTP_DELIVERY_UI_OUTPUT_DIR || path.join(os.tmpdir(), 'h2-customer-otp-delivery-ui'));
await fs.mkdir(output, { recursive:true });
const { chromium, webkit } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = browserEngine === 'webkit'
  ? await webkit.launch({ headless:true })
  : await chromium.launch({ executablePath:process.env.CHROME_BIN, headless:true, args:['--disable-dev-shm-usage'] });
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
  // Browser runners do not have the native WhatsApp app installed, so they
  // cannot prove its iOS handoff; validate that path statically in the unit
  // tests. Browser tests cover automatic desktop and iPhone code recovery.
  {
    const f=await fixture('desktop',true);
    const popupPromise=f.context.waitForEvent('page',{timeout:4500}).catch(()=>null);
    await f.request.click();
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.deepEqual((await f.state()).requestCalls,[{phone,channel:'both'}]);
    const popup=await popupPromise;
    if(popup){
      await popup.waitForURL('https://api.whatsapp.com/**');
      assert.equal(new URL(f.urls[0]).searchParams.get('phone'),'5511999990099');
      await popup.close();
    }else{
      // User-gesture restrictions can affect desktop too.
      await f.page.getByTestId('h2-otp-open-whatsapp').waitFor();
    }
    assert.equal(f.page.url(),f.url);
    assert.equal(f.context.pages().length,1);
    await f.page.reload({waitUntil:'networkidle'});
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.deepEqual((await f.state()).requestCalls,[{phone,channel:'both'}]);
    await f.page.getByLabel('Código de 6 números').fill('246810');
    await f.page.getByRole('button',{name:'CONFIRMAR E ACESSAR'}).click();
    await f.page.getByTestId('authenticated-phone').waitFor();
    checks.push('desktop: solicita um único código e abre WhatsApp automaticamente quando permitido');
    await f.close();
  }
  for(const profile of ['iphone','android']){
    // Offline native-app fixture: no WhatsApp app registered in CI.
    // The code input must still work in the safe email-only mode.
    const f=await fixture(profile,false);
    await f.request.click();
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.equal(f.context.pages().length,1);
    assert.equal(f.page.url(),f.url);
    assert.deepEqual((await f.state()).requestCalls,[{phone,channel:'both'}]);
    if(profile==='iphone') await f.page.screenshot({path:path.join(output,'navigation-iphone-code-entry.png'),fullPage:true});
    await f.page.reload({waitUntil:'networkidle'});
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.deepEqual((await f.state()).requestCalls,[{phone,channel:'both'}],'Recarregar não gera segundo OTP');
    await f.page.getByLabel('Código de 6 números').fill('246810');
    await f.page.getByRole('button',{name:'CONFIRMAR E ACESSAR'}).click();
    await f.page.getByTestId('authenticated-phone').waitFor();
    checks.push(profile+': campo OTP e recuperação após recarga sem aplicativo nativo');
    await f.close();
  }
  assert.deepEqual(errors,[]);
  const result={passed:checks.length,checks,errors};
  await fs.writeFile(path.join(output,'navigation-qa-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  await browser.close();
}
