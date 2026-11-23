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
const whatsappResend = () => page.getByRole('button', { name: 'PEDIR OUTRO PELO WHATSAPP', exact: true });
const help = () => page.getByRole('button', { name: 'Não recebi o código', exact: true });
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
async function assertSimpleCodeStep(withWhatsappLink = false) {
  await codeInput().waitFor();
  assert.equal(await help().getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#h2-otp-help').isVisible(), false);
  const form = page.locator('form').filter({ has: codeInput() });
  assert.equal(await form.getByRole('button').count(), 2, 'The normal code step must show only Confirm and the small help action');
  assert.equal(await form.locator('button[type="submit"]').count(), 1);
  assert.equal(await form.getByRole('link').count(), withWhatsappLink ? 1 : 0, 'Só o fallback de WhatsApp mostra um link externo; no fluxo normal ele não aparece');
  if (withWhatsappLink) assert.equal(await form.getByTestId('h2-otp-open-whatsapp').count(), 1);
}
async function openHelp() {
  const before = await state();
  const typedCode = await codeInput().inputValue();
  if (await help().getAttribute('aria-expanded') !== 'true') await help().click();
  await page.locator('#h2-otp-help').waitFor();
  assert.equal(await help().getAttribute('aria-expanded'), 'true');
  const after = await state();
  assert.equal(await codeInput().inputValue(), typedCode, 'Opening help must preserve the typed code');
  assert.deepEqual(after.checkCalls, before.checkCalls, 'Opening help must not repeat customer lookup');
  assert.deepEqual(after.requestCalls, before.requestCalls, 'Opening help must not issue an OTP');
  assert.deepEqual(after.verifyCalls, before.verifyCalls, 'Opening help must not verify a code');
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
  await assertSimpleCodeStep();
  await shot('desktop-email-code.png');
  await openHelp();
  assert.equal(await page.getByRole('button', { name: /^E-MAIL · AGUARDE/ }).isDisabled(), true);
  assert.equal(await whatsappResend().isEnabled(), true);
  checks.push('The normal code step shows only Confirm and small help; opening help sends nothing and exposes independent channel cooldowns');

  await codeInput().fill('246810');
  await page.clock.fastForward(61_000);
  await waitFor(() => emailResend().isEnabled(), 'Email resend did not reopen after its 60-second cooldown');
  await control({ requestMode: 'failure' });
  await emailResend().click();
  await page.getByText('Falha de entrega para teste.', { exact: true }).waitFor();
  await waitFor(() => confirm().isEnabled(), 'Confirmation stayed disabled after a failed resend');
  assert.equal(await codeInput().inputValue(), '246810');
  assert.equal(await help().getAttribute('aria-expanded'), 'true');
  await confirm().click();
  await page.getByTestId('authenticated-phone').waitFor();
  assert.deepEqual((await state()).verifyCalls, [{ phone: '11999990001', code: '246810' }]);
  checks.push('A failed email resend preserves the typed code and still permits authentication with that code');

  await fresh();
  await requestEmail();
  await assertSimpleCodeStep();
  await openHelp();
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
  assert.equal(await help().getAttribute('aria-expanded'), 'true');
  assert.match(await page.getByRole('button', { name: /^E-MAIL · AGUARDE/ }).innerText(), /01:00:00|59:\d{2}/);
  const stored = await page.evaluate(() => ['email', 'whatsapp'].map(channel => Number(localStorage.getItem('h2_otp_cooldown_11999990001_' + channel)) - Date.now()));
  assert.ok(stored.every(duration => duration > 3_590_000 && duration <= 3_600_000));
  checks.push('A shared one-hour cooldown blocks both resends while preserving the already typed verification code');
  const callsBeforeReload = (await state()).requestCalls.length;
  await page.reload({ waitUntil: 'networkidle' });
  await codeInput().waitFor();
  assert.equal(await codeInput().inputValue(), '');
  await assertSimpleCodeStep();
  await openHelp();
  assert.equal(await page.getByRole('button', { name: /^E-MAIL · AGUARDE/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: /^WHATSAPP · AGUARDE/ }).isDisabled(), true);
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
  await assertSimpleCodeStep(true);
  await openHelp();
  await page.getByRole('link', { name: 'ABRIR WHATSAPP (SE NÃO ABRIU)' }).waitFor();
  assert.equal((await state()).requestCalls.length, 0);
  assert.equal(await codeInput().inputValue(), '');
  checks.push('A matching draft resumes its requested channel without creating another request or persisting the secret');

  await fresh();
  await requestEmail();
  await assertSimpleCodeStep();
  await openHelp();
  assert.equal(await page.getByRole('button', { name: /^E-MAIL · AGUARDE/ }).isDisabled(), true);
  assert.equal(await whatsappResend().isEnabled(), true);
  assert.equal(await page.getByRole('link', { name: /PEDIR AJUDA NO WHATSAPP/ }).count(), 0);
  const automaticUrlsBefore = whatsappUrls.length;
  const automaticPopupPromise = context.waitForEvent('page');
  await whatsappResend().click();
  const automaticPopup = await automaticPopupPromise;
  await page.getByText('Toque em Enviar na mensagem preenchida no WhatsApp.', { exact: false }).waitFor();
  await assertSimpleCodeStep(false);
  await waitFor(() => Promise.resolve(whatsappUrls.length === automaticUrlsBefore + 1), 'Clique único do reenvio não abriu WhatsApp');
  await automaticPopup.waitForURL('https://api.whatsapp.com/**');
  const automaticDestination = new URL(whatsappUrls.at(-1));
  assert.equal(automaticDestination.searchParams.get('phone'), '5511999990099');
  assert.equal(automaticDestination.searchParams.get('text'), 'Preciso receber meu código');
  assert.deepEqual((await state()).requestCalls, [
    { phone: '11999990001', channel: 'email' },
    { phone: '11999990001', channel: 'whatsapp' },
  ]);
  assert.equal(await page.evaluate(() => Number(localStorage.getItem('h2_otp_cooldown_11999990001_email')) > Date.now()), true);
  await automaticPopup.close();
  await page.bringToFront();
  checks.push('Reenvio pelo WhatsApp abre segunda aba automaticamente; H2 preserva formulário e cota dos canais');

  await fresh();
  await phoneInput().fill('11999990001');
  const whatsappUrlsBefore = whatsappUrls.length;
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: 'RECEBER PELO WHATSAPP', exact: true }).click();
  const popup = await popupPromise;
  await codeInput().waitFor();
  await assertSimpleCodeStep(false);
  await waitFor(() => Promise.resolve(whatsappUrls.length === whatsappUrlsBefore + 1), 'Primeiro clique não redirecionou ao WhatsApp');
  await popup.waitForURL('https://api.whatsapp.com/**');
  const destination = new URL(whatsappUrls.at(-1));
  assert.equal(destination.searchParams.get('phone'), '5511999990099');
  assert.equal(destination.searchParams.get('text'), 'Preciso receber meu código');
  assert.deepEqual((await state()).requestCalls, [{ phone: '11999990001', channel: 'whatsapp' }]);
  await popup.close();
  await page.bringToFront();
  await page.getByText('Toque em Enviar na mensagem preenchida no WhatsApp.', { exact: false }).waitFor();
  await assertSimpleCodeStep(false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await shot('mobile-whatsapp-instructions.png');
  await openHelp();
  assert.equal(await page.getByTestId('h2-otp-open-whatsapp').count(), 0, 'O segundo botão não deve aparecer no fluxo normal');
  checks.push('Primeiro clique envia pedido OTP e abre WhatsApp em segunda aba; a tela do código continua fixa');

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
