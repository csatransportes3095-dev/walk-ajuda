import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const output = path.resolve(process.env.CUSTOMER_OTP_DELIVERY_UI_OUTPUT_DIR || path.join(os.tmpdir(), 'h2-customer-otp-delivery-ui'));
await fs.mkdir(output, { recursive: true });
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_BIN) throw new Error('Set PLAYWRIGHT_MODULE and CHROME_BIN to installed test tools.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
const base = 'http://127.0.0.1:4177';
const whatsappUrls = [];
// Intercept external navigation before any request can leave the isolated fixture.
await context.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(base) || url.startsWith('data:') || url === 'about:blank') return route.continue();
  if (url.startsWith('https://api.whatsapp.com/')) {
    whatsappUrls.push(url);
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html lang="pt-BR"><body>WhatsApp simulado, sem envio.</body></html>' });
  }
  return route.abort();
});
const page = await context.newPage();
const checks = [], browserErrors = [];
page.on('pageerror', error => browserErrors.push(String(error)));
const control = async data => (await page.request.post(base + '/test-control', { data })).json();
const state = async () => (await page.request.get(base + '/test-control')).json();
const shot = name => page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
const phoneInput = () => page.getByLabel('Telefone com DDD');
const codeInput = () => page.getByLabel('Código de 6 números');
const confirm = () => page.getByRole('button', { name: 'CONFIRMAR E ACESSAR' });
const emailResend = () => page.getByRole('button', { name: 'PEDIR OUTRO POR E-MAIL' });
const automaticWhatsapp = () => page.getByRole('button', { name: /NÃO RECEBI O CÓDIGO —/ });
const waitFor = async (condition, message) => {
  const end = Date.now() + 12_000;
  while (Date.now() < end) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error(message);
};
async function fresh(query = '') {
  await control({ reset: true });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(base + query, { waitUntil: 'networkidle' });
  await phoneInput().waitFor();
}
async function requestEmail() {
  await phoneInput().fill('11999990001');
  await page.getByRole('button', { name: 'RECEBER POR E-MAIL', exact: true }).click();
  await codeInput().waitFor();
}

try {
  await page.clock.install({ time: new Date('2026-11-19T22:00:00Z') });
  await page.goto(base, { waitUntil: 'networkidle' });
  await phoneInput().waitFor();
  await page.getByText('Ao abrir o WhatsApp, toque em', { exact: false }).waitFor();
  assert.equal((await state()).requestCalls.length, 0);
  checks.push('The initial page explains the required WhatsApp send action without issuing a code automatically');

  await phoneInput().focus();
  await page.keyboard.insertText('+55 (11) 99999-0001');
  assert.equal(await phoneInput().inputValue(), '11999990001');
  assert.equal(await phoneInput().getAttribute('maxlength'), null);
  await page.getByRole('button', { name: 'RECEBER POR E-MAIL', exact: true }).click();
  await codeInput().waitFor();
  assert.deepEqual((await state()).requestCalls, [{ phone: '11999990001', channel: 'email' }]);
  assert.deepEqual((await state()).checkCalls, [{ phone: '11999990001' }]);
  checks.push('A formatted international paste is normalized before browser length restrictions can corrupt the customer phone');
  assert.equal(await page.getByRole('button', { name: /^E-MAIL · AGUARDE/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'PEDIR OUTRO PELO WHATSAPP', exact: true }).isEnabled(), true);
  checks.push('The ordinary email cooldown leaves the independent WhatsApp channel available');
  await shot('desktop-email-code.png');

  await codeInput().fill('246810');
  await page.clock.fastForward(61_000);
  await waitFor(() => emailResend().isEnabled(), 'Email resend did not reopen after its 60-second cooldown');
  await control({ requestMode: 'failure' });
  await emailResend().click();
  await page.getByText('Falha de entrega para teste.', { exact: true }).waitFor();
  await waitFor(() => confirm().isEnabled(), 'Confirmation stayed disabled after a failed resend');
  assert.equal(await codeInput().inputValue(), '246810');
  await confirm().click();
  await page.getByTestId('authenticated-phone').waitFor();
  assert.deepEqual((await state()).verifyCalls, [{ phone: '11999990001', code: '246810' }]);
  checks.push('A failed email resend preserves the typed code and still permits authentication with that code');

  await fresh();
  await requestEmail();
  await codeInput().fill('246810');
  await page.clock.fastForward(61_000);
  await waitFor(() => emailResend().isEnabled(), 'Email resend did not reopen for the hourly-limit fixture');
  await control({ requestMode: 'blocked', retryAfterSeconds: 3600, cooldownScope: 'all' });
  await emailResend().click();
  await page.getByText('Limite temporário para teste.', { exact: true }).waitFor();
  await waitFor(() => confirm().isEnabled(), 'Confirmation stayed disabled after the shared hourly limit');
  assert.equal(await codeInput().inputValue(), '246810');
  assert.equal(await page.getByRole('button', { name: /^E-MAIL · AGUARDE/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: /^WHATSAPP · AGUARDE/ }).isDisabled(), true);
  assert.equal(await automaticWhatsapp().isDisabled(), true);
  assert.match(await page.getByRole('button', { name: /^E-MAIL · AGUARDE/ }).innerText(), /01:00:00|59:\d{2}/);
  const stored = await page.evaluate(() => ['email', 'whatsapp'].map(channel => Number(localStorage.getItem('h2_otp_cooldown_11999990001_' + channel)) - Date.now()));
  assert.ok(stored.every(duration => duration > 3_590_000 && duration <= 3_600_000));
  checks.push('A shared one-hour cooldown blocks both resends while preserving the already typed verification code');
  const callsBeforeReload = (await state()).requestCalls.length;
  await page.reload({ waitUntil: 'networkidle' });
  await codeInput().waitFor();
  assert.equal(await codeInput().inputValue(), '');
  assert.equal(await page.getByRole('button', { name: /^E-MAIL · AGUARDE/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: /^WHATSAPP · AGUARDE/ }).isDisabled(), true);
  assert.equal(await automaticWhatsapp().isDisabled(), true);
  assert.equal((await state()).requestCalls.length, callsBeforeReload);
  await codeInput().fill('246810');
  assert.equal(await confirm().isEnabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await shot('mobile-shared-cooldown.png');
  await confirm().click();
  await page.getByTestId('authenticated-phone').waitFor();
  assert.deepEqual((await state()).verifyCalls, [{ phone: '11999990001', code: '246810' }]);
  checks.push('Reload retains the long cooldown without storing the code or blocking verification on mobile');

  await fresh();
  await page.evaluate(() => sessionStorage.setItem('h2_customer_otp_login_draft', JSON.stringify({ phone: '11999990001', step: 'code', channel: 'whatsapp', expiresAt: Date.now() + 600_000 })));
  await page.goto(base + '?initialPhone=11999990002', { waitUntil: 'networkidle' });
  await phoneInput().waitFor();
  assert.equal(await phoneInput().inputValue(), '11999990002');
  assert.equal(await codeInput().count(), 0);
  assert.equal((await state()).requestCalls.length, 0);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('h2_customer_otp_login_draft')), null);
  checks.push('A draft from another customer cannot restore its channel or code step for the selected phone');
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot('desktop-phone-options.png');

  await fresh();
  await page.evaluate(() => sessionStorage.setItem('h2_customer_otp_login_draft', JSON.stringify({ phone: '11999990001', step: 'code', channel: 'whatsapp', expiresAt: Date.now() + 600_000 })));
  await page.goto(base + '?initialPhone=11999990001', { waitUntil: 'networkidle' });
  await codeInput().waitFor();
  await page.getByRole('link', { name: 'ABRIR WHATSAPP E ENVIAR MENSAGEM' }).waitFor();
  assert.equal((await state()).requestCalls.length, 0);
  assert.equal(await codeInput().inputValue(), '');
  checks.push('A matching draft resumes its requested channel without creating another request or persisting the secret');

  await fresh();
  await requestEmail();
  assert.equal(await page.getByRole('button', { name: /^E-MAIL · AGUARDE/ }).isDisabled(), true);
  assert.equal(await automaticWhatsapp().isEnabled(), true);
  assert.equal(await page.getByRole('link', { name: /PEDIR AJUDA NO WHATSAPP/ }).count(), 0);
  const automaticUrlsBefore = whatsappUrls.length;
  const automaticPopupPromise = context.waitForEvent('page');
  await automaticWhatsapp().click();
  const automaticPopup = await automaticPopupPromise;
  await page.getByRole('link', { name: 'ABRIR WHATSAPP E ENVIAR MENSAGEM' }).waitFor();
  await waitFor(() => Promise.resolve(whatsappUrls.length > automaticUrlsBefore), 'The automatic email fallback did not open the queued WhatsApp request');
  const automaticDestination = new URL(whatsappUrls.at(-1));
  assert.equal(automaticDestination.searchParams.get('phone'), '5511999990099');
  assert.equal(automaticDestination.searchParams.get('text'), 'Preciso receber meu código');
  assert.deepEqual((await state()).requestCalls, [
    { phone: '11999990001', channel: 'email' },
    { phone: '11999990001', channel: 'whatsapp' },
  ]);
  assert.equal(await page.getByRole('button', { name: /^E-MAIL · AGUARDE/ }).isDisabled(), true);
  await automaticPopup.close();
  await page.bringToFront();
  checks.push('The email code fallback requests an automatic WhatsApp code during the email cooldown and opens the prepared message without a manual-help link');

  await fresh();
  await phoneInput().fill('11999990001');
  const whatsappUrlsBefore = whatsappUrls.length;
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: 'RECEBER PELO WHATSAPP', exact: true }).click();
  const popup = await popupPromise;
  await codeInput().waitFor();
  await waitFor(() => Promise.resolve(whatsappUrls.length > whatsappUrlsBefore), 'WhatsApp redirect was not intercepted');
  const destination = new URL(whatsappUrls.at(-1));
  assert.equal(destination.searchParams.get('phone'), '5511999990099');
  assert.equal(destination.searchParams.get('text'), 'Preciso receber meu código');
  assert.deepEqual((await state()).requestCalls, [{ phone: '11999990001', channel: 'whatsapp' }]);
  await popup.close();
  await page.bringToFront();
  await page.getByText('Toque em Enviar na mensagem preenchida no WhatsApp.', { exact: false }).waitFor();
  assert.match(await page.getByRole('link', { name: 'ABRIR WHATSAPP E ENVIAR MENSAGEM' }).getAttribute('href'), /phone=5511999990099/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await shot('mobile-whatsapp-instructions.png');
  checks.push('The selected WhatsApp request opens the normalized support destination and clearly requires sending the prepared message');

  assert.deepEqual(browserErrors, []);
  await fs.writeFile(path.join(output, 'qa-results.json'), JSON.stringify({ passed: checks.length, checks, browserErrors, externalWhatsappRequestsIntercepted: whatsappUrls.length }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, browserErrors, externalWhatsappRequestsIntercepted: whatsappUrls.length }, null, 2));
} catch (error) {
  await shot('failure.png').catch(() => {});
  await fs.writeFile(path.join(output, 'qa-failure.json'), JSON.stringify({ passed: checks.length, checks, browserErrors, error: String(error) }, null, 2));
  throw error;
} finally {
  await context.close(); await browser.close();
}
