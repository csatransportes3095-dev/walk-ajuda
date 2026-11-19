// Real production component and browser tabs; synthetic tRPC and intercepted
// external navigation only. No message, email or OTP leaves this fixture.
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
const base = 'http://127.0.0.1:4177';
const phone = '11999990001';
const profiles = {
  desktop: { viewport: { width: 1280, height: 900 } },
  iphone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  android: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
};
const checks = [], browserErrors = [];
let activePage, activeContext, intercepted = 0;
const waitFor = async (condition, message) => {
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(message);
};
async function fixture({ profile = 'desktop', popupMode = 'native', server = {} } = {}) {
  const context = await browser.newContext(profiles[profile]);
  activeContext = context;
  const destinations = [], popups = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base + '/') || url === base || url.startsWith('data:') || url === 'about:blank') return route.continue();
    if (url.startsWith('https://api.whatsapp.com/')) {
      destinations.push(url); intercepted++;
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html lang="pt-BR"><body>WhatsApp simulado. Nenhum envio.</body></html>' });
    }
    return route.abort();
  });
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror', error => browserErrors.push(String(error)));
  context.on('page', popup => popups.push(popup));
  await page.addInitScript(({ mode }) => {
    const nativeOpen = window.open.bind(window);
    window.__otpPopupFixture = { calls: [], closeCalls: 0, navigationAttempts: 0 };
    window.open = (...args) => {
      const state = window.__otpPopupFixture;
      state.calls.push({ url: String(args[0]), target: args[1] });
      if (mode === 'null') return null;
      if (mode === 'throws') throw new Error('Synthetic popup creation failure');
      const popup = nativeOpen(...args);
      if (!popup) throw new Error('The isolated browser unexpectedly refused a native popup');
      if (mode === 'closed') { popup.close(); state.closeCalls++; return popup; }
      if (mode === 'navigation-throws') return {
        get closed() { return popup.closed; },
        get opener() { return popup.opener; },
        set opener(value) { popup.opener = value; },
        location: { replace() { state.navigationAttempts++; throw new Error('Synthetic popup navigation failure'); } },
        close() { state.closeCalls++; popup.close(); },
      };
      return popup;
    };
  }, { mode: popupMode });
  await page.request.post(base + '/test-control', { data: { reset: true, ...server } });
  const initialUrl = base + '/?initialPhone=' + phone;
  await page.goto(initialUrl, { waitUntil: 'networkidle' });
  await page.getByLabel('Telefone com DDD').waitFor();
  await waitFor(() => page.getByRole('button', { name: 'RECEBER PELO WHATSAPP', exact: true }).isEnabled(), 'WhatsApp fixture did not become available');
  await page.evaluate(() => { window.__otpOriginalDocument = 'original-login-document'; });
  const state = async () => (await page.request.get(base + '/test-control')).json();
  const sameDocument = async () => {
    assert.equal(page.isClosed(), false, 'The original login tab was closed');
    assert.equal(page.url(), initialUrl, 'The original login URL was replaced');
    assert.equal(await page.evaluate(() => window.__otpOriginalDocument), 'original-login-document', 'The original login document was replaced');
  };
  const sameCodeStep = async () => {
    await page.getByLabel('Código de 6 números').waitFor();
    await sameDocument();
    assert.equal(await page.getByLabel('Código de 6 números').isVisible(), true);
    await page.getByText('Toque em Enviar na mensagem preenchida no WhatsApp.', { exact: false }).waitFor();
  };
  const directLink = async () => {
    const link = page.getByRole('link', { name: 'ABRIR WHATSAPP E ENVIAR MENSAGEM', exact: true });
    await link.waitFor();
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.match(await link.getAttribute('rel'), /noopener/);
    assert.match(await link.getAttribute('rel'), /noreferrer/);
    return link;
  };
  const simpleCodeStep = async () => {
    await sameCodeStep();
    assert.equal(await page.getByRole('button', { name: 'Não recebi o código', exact: true }).getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#h2-otp-help').isVisible(), false);
    const form = page.locator('form').filter({ has: page.getByLabel('Código de 6 números') });
    assert.equal(await form.getByRole('button').count(), 2);
    assert.equal(await form.locator('button[type="submit"]').count(), 1);
    assert.equal(await form.getByRole('link').count(), 0);
  };
  const request = () => page.getByRole('button', { name: 'RECEBER PELO WHATSAPP', exact: true }).click();
  const close = async () => { await context.close(); activeContext = undefined; activePage = undefined; };
  return { context, page, state, sameDocument, sameCodeStep, simpleCodeStep, directLink, request, destinations, popups, close };
}

try {
  for (const profile of ['desktop', 'iphone', 'android']) {
    const f = await fixture({ profile, server: { delayMs: 150 } });
    const popupPromise = f.context.waitForEvent('page');
    await f.request();
    const popup = await popupPromise;
    await f.simpleCodeStep();
    await waitFor(() => Promise.resolve(f.destinations.length === 1), profile + ' did not open the separate WhatsApp tab');
    await popup.waitForURL('https://api.whatsapp.com/**');
    assert.notEqual(popup, f.page);
    assert.equal(await popup.evaluate(() => window.opener === null), true);
    assert.deepEqual(await f.page.evaluate(() => window.__otpPopupFixture.calls), [{ url: 'about:blank', target: '_blank' }]);
    assert.deepEqual((await f.state()).requestCalls, [{ phone, channel: 'whatsapp' }]);
    await popup.close();
    await f.page.bringToFront();
    await f.simpleCodeStep();
    await f.page.getByLabel('Código de 6 números').fill('246810');
    assert.equal(await f.page.getByRole('button', { name: 'CONFIRMAR E ACESSAR', exact: true }).isEnabled(), true);
    if (profile === 'iphone') await f.page.screenshot({ path: path.join(output, 'navigation-iphone-return.png'), fullPage: true });
    await f.page.getByRole('button', { name: 'CONFIRMAR E ACESSAR', exact: true }).click();
    await f.page.getByTestId('authenticated-phone').waitFor();
    assert.deepEqual((await f.state()).verifyCalls, [{ phone, code: '246810' }]);
    checks.push(profile + ': WhatsApp opens separately; the original URL and code form survive returning and completing login');
    await f.close();
  }

  for (const popupMode of ['null', 'throws', 'closed', 'navigation-throws']) {
    const f = await fixture({ popupMode });
    await f.request();
    await f.sameCodeStep();
    await f.page.getByText('Para abrir o WhatsApp, toque em', { exact: false }).waitFor();
    assert.equal(await f.page.getByRole('button', { name: 'Não recebi o código', exact: true }).getAttribute('aria-expanded'), 'true');
    await f.directLink();
    assert.equal(f.destinations.length, 0, 'A failed popup must never redirect the original page');
    assert.deepEqual((await f.state()).requestCalls, [{ phone, channel: 'whatsapp' }]);
    if (popupMode === 'navigation-throws') {
      await waitFor(async () => (await f.page.evaluate(() => window.__otpPopupFixture.closeCalls)) === 1, 'Failed navigation did not close the reserved tab');
      assert.equal(await f.page.evaluate(() => window.__otpPopupFixture.navigationAttempts), 1);
    }
    if (popupMode === 'closed' || popupMode === 'navigation-throws') {
      await waitFor(() => Promise.resolve(f.popups.every(popup => popup.isClosed())), 'An unused blank tab was left open');
    }
    if (popupMode === 'null') {
      const before = await f.state();
      const popupPromise = f.context.waitForEvent('page');
      await f.page.getByRole('link', { name: 'ABRIR WHATSAPP E ENVIAR MENSAGEM', exact: true }).click();
      const popup = await popupPromise;
      await popup.waitForURL('https://api.whatsapp.com/**');
      await f.sameCodeStep();
      assert.deepEqual((await f.state()).requestCalls, before.requestCalls, 'The direct link issued another OTP');
      await popup.close();
      await f.page.bringToFront();
      await f.page.screenshot({ path: path.join(output, 'navigation-blocked-popup-return.png'), fullPage: true });
    }
    checks.push(popupMode + ': failed popup leaves the original code step and a direct new-tab link without issuing another OTP');
    await f.close();
  }

  const rejectedRequests = [
    { name: 'preflight failure', server: { checkMode: 'failure' }, requestCount: 0, message: 'Falha de consulta para teste.' },
    { name: 'blocked customer', server: { checkMode: 'blocked' }, requestCount: 0, message: 'Este cadastro está bloqueado. Entre em contato com o atendimento.' },
    { name: 'OTP request failure', server: { requestMode: 'failure' }, requestCount: 1, message: 'Falha de entrega para teste.' },
    { name: 'OTP resend limit', server: { requestMode: 'blocked', retryAfterSeconds: 3600, cooldownScope: 'all' }, requestCount: 1, message: 'Limite temporário para teste.' },
  ];
  for (const scenario of rejectedRequests) {
    const f = await fixture({ server: scenario.server });
    const popupPromise = f.context.waitForEvent('page');
    await f.request();
    const popup = await popupPromise;
    await f.page.getByText(scenario.message, { exact: true }).waitFor();
    await waitFor(() => Promise.resolve(popup.isClosed()), scenario.name + ' did not close the unused popup');
    await f.sameDocument();
    assert.equal(await f.page.getByLabel('Telefone com DDD').isVisible(), true);
    assert.equal(await f.page.getByLabel('Código de 6 números').count(), 0);
    assert.equal(f.destinations.length, 0);
    assert.equal((await f.state()).checkCalls.length, 1);
    assert.equal((await f.state()).requestCalls.length, scenario.requestCount);
    checks.push(scenario.name + ': closes the reserved tab and leaves the original login page without WhatsApp navigation');
    await f.close();
  }

  assert.deepEqual(browserErrors, []);
  const result = { passed: checks.length, checks, browserErrors, externalWhatsappRequestsIntercepted: intercepted };
  await fs.writeFile(path.join(output, 'navigation-qa-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await activePage?.screenshot({ path: path.join(output, 'navigation-failure.png'), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(output, 'navigation-qa-failure.json'), JSON.stringify({ passed: checks.length, checks, browserErrors, error: String(error) }, null, 2));
  throw error;
} finally {
  await activeContext?.close();
  await browser.close();
}
