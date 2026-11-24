// One-click, dual-channel OTP UI QA against a synthetic local tRPC server.
// All WhatsApp URLs are intercepted; no real mail, API, device or OTP is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_BIN) {
  throw new Error('PLAYWRIGHT_MODULE and CHROME_BIN are required');
}
const output = path.resolve(process.env.CUSTOMER_OTP_DELIVERY_UI_OUTPUT_DIR || path.join(os.tmpdir(), 'h2-customer-otp-delivery-ui'));
await fs.mkdir(output, { recursive: true });
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--disable-dev-shm-usage'] });
const base = 'http://127.0.0.1:4177', phone = '11999990001';
const checks = [], errors = [];
async function setup(options = {}) {
  const context = await browser.newContext({ viewport: options.mobile ? { width:390, height:844 } : { width:1280, height:900 } });
  const urls = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base) || url.startsWith('data:') || url === 'about:blank') return route.continue();
    if (url.startsWith('https://api.whatsapp.com/')) {
      urls.push(url);
      return route.fulfill({ status:200, contentType:'text/html', body:'<html><body>WhatsApp simulado</body></html>' });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.request.post(base + '/test-control', { data: { reset:true, ...options.server } });
  await page.goto(base + '?initialPhone=' + phone, { waitUntil:'networkidle' });
  const request = page.getByRole('button', { name:'RECEBER CÓDIGO', exact:true });
  await request.waitFor();
  const state = async () => (await page.request.get(base + '/test-control')).json();
  return { context, page, request, state, urls, close: () => context.close() };
}
try {
  {
    const f = await setup({ mobile:true, server:{ whatsappAvailable:false } });
    assert.equal(await f.page.getByRole('button', { name:'RECEBER POR E-MAIL' }).count(), 0);
    assert.equal(await f.page.getByRole('button', { name:'RECEBER PELO WHATSAPP' }).count(), 0);
    assert.equal((await f.state()).requestCalls.length, 0);
    await f.request.click();
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.deepEqual((await f.state()).requestCalls, [{ phone, channel:'both' }]);
    assert.equal(f.urls.length, 0, 'WhatsApp indisponível não deve abrir segunda aba');
    assert.equal(await f.page.getByRole('button', { name:'Não recebi o código' }).getAttribute('aria-expanded'), 'false');
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await f.page.screenshot({ path:path.join(output,'mobile-email-fallback.png'), fullPage:true });
    await f.page.getByLabel('Código de 6 números').fill('246810');
    await f.page.getByRole('button', { name:'CONFIRMAR E ACESSAR' }).click();
    await f.page.getByTestId('authenticated-phone').waitFor();
    assert.deepEqual((await f.state()).verifyCalls, [{ phone, code:'246810' }]);
    checks.push('Sem H2 AUTO: um clique gera OTP pelo e-mail, sem popup; validação na aba original');
    await f.close();
  }
  {
    const f = await setup({ server:{ whatsappAvailable:true } });
    // Watch from the first click, because desktop may open WhatsApp on its own.
    const popupPromise = f.context.waitForEvent('page',{timeout:4500}).catch(()=>null);
    await f.request.click();
    await f.page.getByLabel('Código de 6 números').waitFor();
    assert.deepEqual((await f.state()).requestCalls, [{ phone, channel:'both' }]);
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForURL('https://api.whatsapp.com/**');
      assert.equal(new URL(f.urls[0]).searchParams.get('text'),'Preciso receber meu código');
      await popup.close();
    } else {
      await f.page.getByTestId('h2-otp-open-whatsapp').waitFor();
    }
    assert.equal(f.page.url().startsWith(base),true,'Tela de código não deve ser substituída');
    await f.page.getByRole('button',{name:'Não recebi o código'}).click();
    await f.page.getByRole('button',{name:/AGUARDE/}).waitFor();
    assert.deepEqual((await f.state()).requestCalls,[{phone,channel:'both'}],'Redirecionar não emite segundo OTP');
    await f.page.getByLabel('Código de 6 números').fill('246810');
    await f.page.getByRole('button',{name:'CONFIRMAR E ACESSAR'}).click();
    await f.page.getByTestId('authenticated-phone').waitFor();
    checks.push('H2 AUTO ativo: redirecionamento automático ou recuperação se navegador bloquear; código mantido');
    await f.close();
  }
  {
    const f = await setup({ server:{ requestMode:'blocked', retryAfterSeconds:3600, whatsappAvailable:false } });
    await f.request.click();
    await f.page.getByText('Limite temporário para teste.', { exact:true }).waitFor();
    assert.equal(await f.page.getByLabel('Código de 6 números').count(), 0);
    assert.equal((await f.state()).requestCalls.length, 1);
    assert.equal(f.urls.length, 0);
    checks.push('Limite global bloqueia nova solicitação, sem emitir segundo código');
    await f.close();
  }
  {
    const f = await setup({ server:{ checkMode:'blocked' } });
    await f.request.click();
    await f.page.getByText('Este cadastro está bloqueado. Entre em contato com o atendimento.', { exact:true }).waitFor();
    assert.equal((await f.state()).requestCalls.length, 0);
    checks.push('Cadastro bloqueado não recebe código por nenhum canal');
    await f.close();
  }
  {
    const f = await setup({ server:{ requestMode:'failure', whatsappAvailable:false } });
    await f.request.click();
    await f.page.getByText('Falha de entrega para teste.', { exact:true }).waitFor();
    await f.page.getByLabel('Código de 6 números').waitFor();
    await f.page.getByTestId('h2-otp-cpf-login').waitFor();
    assert.equal((await f.state()).requestCalls.length, 1);
    assert.equal(await f.page.getByTestId('authenticated-phone').count(),0);
    checks.push('Falha de entrega preserva a mensagem original e oferece CPF sem autenticar automaticamente');
    await f.close();
  }
  assert.deepEqual(errors, []);
  const result = { passed:checks.length, checks, errors };
  await fs.writeFile(path.join(output,'qa-results.json'), JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  await browser.close();
}
