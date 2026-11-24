import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const output = path.resolve(process.env.CUSTOMER_HISTORY_UI_OUTPUT_DIR || path.join(os.tmpdir(), 'h2-customer-history-ui'));
await fs.mkdir(output, { recursive: true });
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_BIN) throw new Error('Set PLAYWRIGHT_MODULE and CHROME_BIN to installed test tools.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const base = 'http://127.0.0.1:4176';
const checks = [], browserErrors = [];
page.on('pageerror', error => browserErrors.push(String(error)));
const control = async data => (await page.request.post(base + '/test-control', { data })).json();
const state = async () => (await page.request.get(base + '/test-control')).json();
const format = value => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const shot = name => page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
const section = page.getByRole('region', { name: 'Histórico de acessos do cliente' });
const update = section.getByRole('button', { name: 'Atualizar histórico de acessos' });

try {
  await page.clock.install({ time: new Date('2026-11-19T19:00:00Z') });
  await page.goto(base, { waitUntil: 'networkidle' });
  await section.getByText('Acesso 3', { exact: true }).waitFor();
  assert.match(await section.innerText(), /3\s+total/);
  checks.push('Initial server history is displayed as three real logins');

  const fresh = Date.parse('2026-11-19T19:01:02Z');
  const previous = await state();
  await control({ total: 4, recent: [fresh, ...previous.recent], delayMs: 0 });
  // Hold the actual next request until React commits its fetching state.
  // The old fixed 350ms delay could expire before the assertion ran on CI.
  let releaseRequest;
  const requestGate = new Promise(resolve => { releaseRequest = resolve; });
  await page.route('**/api/trpc/customerPassword.adminGetLoginHistory**', async route => {
    await requestGate;
    await route.continue();
  }, { times: 1 });
  try {
    await update.click();
    await section.locator('button[aria-label="Atualizar histórico de acessos"]:disabled').waitFor({ state: 'visible' });
    assert.equal(await update.isDisabled(), true);
    assert.equal(await section.getByText('Acesso 3', { exact: true }).count(), 1);
  } finally {
    releaseRequest();
  }
  await section.getByText(format(fresh), { exact: false }).waitFor();
  assert.equal((await state()).calls, previous.calls + 1);
  assert.match(await section.innerText(), /4\s+total/);
  checks.push('Manual update fetches new data while retaining the previous history during the request');

  await control({ fail: true, delayMs: 0 });
  await update.click();
  await section.getByRole('alert').waitFor();
  assert.match(await section.getByRole('alert').innerText(), /Exibindo o último histórico recebido/);
  assert.equal(await section.getByText(format(fresh), { exact: false }).count(), 1);
  assert.match(await section.innerText(), /4\s+total/);
  checks.push('A failed update retains the last confirmed history and explains the error');

  await page.reload({ waitUntil: 'networkidle' });
  await section.getByRole('alert').waitFor();
  assert.match(await section.getByRole('alert').innerText(), /Não foi possível carregar/);
  assert.doesNotMatch(await section.innerText(), /0\s+total|Nenhum acesso registrado/);
  checks.push('An initial backend failure is never presented as zero accesses');

  const loginAt = Date.parse('2026-11-16T13:00:00Z');
  const activityAt = Date.parse('2026-11-17T14:00:00Z');
  await control({ fail: false, total: 1, recent: [loginAt], lastActivity: { at: activityAt, source: 'loan_request' } });
  await update.click();
  await section.getByText('Pedido de empréstimo').waitFor();
  await section.getByText(format(activityAt), { exact: false }).waitFor();
  assert.equal(await section.getByText(format(loginAt), { exact: false }).count(), 1);
  assert.equal(await section.getByText('Acesso 2', { exact: true }).count(), 0);
  assert.match(await section.innerText(), /1\s+total/);
  checks.push('Confirmed later loan activity appears separately and does not invent an additional login');
  await shot('desktop-history-activity.png');

  const focusAt = Date.parse('2026-11-19T19:03:00Z');
  await control({ total: 2, recent: [focusAt, loginAt], lastActivity: { at: focusAt, source: 'login' } });
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await section.getByText('Acesso 2', { exact: true }).waitFor();
  assert.equal(await section.getByText(format(focusAt), { exact: false }).count(), 2);
  checks.push('Returning to a visible page refetches despite the disabled global focus default');

  const pollAt = Date.parse('2026-11-19T19:04:00Z');
  await control({ total: 3, recent: [pollAt, focusAt, loginAt], lastActivity: { at: pollAt, source: 'login' } });
  await page.clock.fastForward(30_100);
  await section.getByText('Acesso 3', { exact: true }).waitFor();
  assert.equal(await section.getByText(format(pollAt), { exact: false }).count(), 2);
  checks.push('The 30-second browser interval retrieves fresh server history');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await update.isVisible(), true);
  await shot('mobile-history-activity.png');
  checks.push('The history and update action fit a 390px mobile viewport');
  assert.deepEqual(browserErrors, []);
  await fs.writeFile(path.join(output, 'qa-results.json'), JSON.stringify({ passed: checks.length, checks, browserErrors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, browserErrors }, null, 2));
} catch (error) {
  await shot('failure.png').catch(() => {});
  await fs.writeFile(path.join(output, 'qa-failure.json'), JSON.stringify({ passed: checks.length, checks, browserErrors, error: String(error) }, null, 2));
  throw error;
} finally {
  await context.close(); await browser.close();
}
