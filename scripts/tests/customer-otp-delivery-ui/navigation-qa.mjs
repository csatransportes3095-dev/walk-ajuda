// Browser tab navigation for combined OTP. Local synthetic tRPC only.
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
async function fixture(profile='desktop', popupBlocked=false) {
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
  if (popupBlocked) await page.addInitScript(() => { window.open=()=>null; });
  await page.request.post(base+'/test-control',{data:{reset:true,whatsappAvailable:true}});
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
    const popupPromise=f.context.waitForEvent('page');
    await f.request.click();
    const popup=await popupPromise;
    await popup.waitForURL('https://api.whatsapp.com/**');
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.equal(f.page.url(),f.url);
    assert.equal(await f.page.evaluate(()=>window.__h2OriginalTabMarker),'preserved');
    assert.equal(await popup.evaluate(()=>window.opener===null),true);
    assert.deepEqual((await f.state()).requestCalls,[{phone,channel:'both'}]);
    assert.equal(f.urls.length,1);
    assert.match(await f.page.locator('form').innerText(),/e-mail/i);
    assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    if(profile==='iphone') await f.page.screenshot({path:path.join(output,'navigation-iphone-return.png'),fullPage:true});
    await popup.close();
    await f.page.bringToFront();
    await f.page.getByLabel('Código de 6 números').fill('246810');
    await f.page.getByRole('button',{name:'CONFIRMAR E ACESSAR'}).click();
    await f.page.getByTestId('authenticated-phone').waitFor();
    checks.push(profile+': nova aba para WhatsApp; aba H2 fixa e login com o mesmo OTP');
    await f.close();
  }
  {
    const f=await fixture('iphone',true);
    await f.request.click();
    await f.page.getByLabel('Código de 6 números').waitFor();
    const fallback=f.page.getByRole('link',{name:'ABRIR WHATSAPP (SE NÃO ABRIU)'});
    await fallback.waitFor();
    assert.equal(await fallback.getAttribute('target'),'_blank');
    assert.match(await fallback.getAttribute('rel'),/noopener/);
    const before=(await f.state()).requestCalls.length;
    await f.page.reload({waitUntil:'networkidle'});
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.equal((await f.state()).requestCalls.length,before,'Recarregar não deve gerar novo código');
    await f.page.getByRole('link',{name:'ABRIR WHATSAPP (SE NÃO ABRIU)'}).waitFor();
    assert.equal(f.urls.length,0,'Popup bloqueado não deve navegar sozinho');
    checks.push('Popup bloqueado e recarga: link seguro de recuperação sem novo código');
    await f.close();
  }
  assert.deepEqual(errors,[]);
  const result={passed:checks.length,checks,errors};
  await fs.writeFile(path.join(output,'navigation-qa-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  await browser.close();
}
