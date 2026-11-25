import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const output = path.resolve(process.env.CUSTOMER_SESSION_POLICY_UI_OUTPUT_DIR || path.join(os.tmpdir(), 'h2-customer-session-policy-ui'));
await fs.mkdir(output, { recursive: true });
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_BIN) throw new Error('Set PLAYWRIGHT_MODULE and CHROME_BIN to installed test tools.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const base = 'http://127.0.0.1:4178';
await context.route('**/*', route => {
  const url = route.request().url();
  return url.startsWith(base + '/') || url.startsWith('data:') ? route.continue() : route.abort();
});
const page = await context.newPage();
const checks = [], browserErrors = [];
page.on('pageerror', error => browserErrors.push(String(error)));
const control = async data => (await page.request.post(base + '/test-control', { data })).json();
const state = async () => (await page.request.get(base + '/test-control')).json();
const section = page.getByRole('region', { name: 'Tempo conectado do cliente', exact: true });
const input = section.getByLabel('Tempo conectado do cliente (horas)', { exact: true });
const save = section.locator('button[type="submit"]');
const shot = name => page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
const waitFor = async (condition, message) => {
  const end = Date.now() + 12_000;
  while (Date.now() < end) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(message);
};
async function value(hours) {
  await waitFor(async () => await input.inputValue() === String(hours), 'The input did not display ' + hours + ' hours');
}
async function saved(hours) {
  await section.getByRole('status').filter({ hasText: `Salvo: ${hours} horas para os próximos logins.` }).waitFor();
  await value(hours);
  assert.equal((await state()).hours, hours);
  assert.equal(await save.isDisabled(), true);
}

try {
  await control({ reset: true });
  await page.goto(base, { waitUntil: 'networkidle' });
  await input.waitFor(); await value(720);
  assert.equal(await input.getAttribute('min'), '1');
  assert.equal(await input.getAttribute('max'), '2160');
  assert.equal(await save.isDisabled(), true);
  assert.match(await section.innerText(), /Aplica aos próximos logins\. Sessões já abertas mantêm seu vencimento\./);
  assert.match(await section.innerText(), /10 minutos.*uma única vez/);
  assert.equal((await state()).writeCalls.length, 0);
  checks.push('The real component loads 720 hours and explains that existing sessions and OTP lifetime are unchanged');

  await control({ writeDelayMs: 200 });
  await input.fill('48'); await save.click();
  assert.equal(await input.isDisabled(), true);
  await saved(48);
  assert.deepEqual((await state()).writeCalls, [{ hours: 48 }]);
  await page.reload({ waitUntil: 'networkidle' });
  await value(48);
  assert.match(await section.innerText(), /Duração atual:\s*48 horas\./);
  await shot('desktop-session-policy-48h.png');
  checks.push('Saving 48 hours persists on the fixture server and survives a full page reload');

  await control({ writeDelayMs: 0 });
  await input.fill('2160'); await save.click(); await saved(2160);
  await page.reload({ waitUntil: 'networkidle' }); await value(2160);
  checks.push('ADM can persist the 90-day maximum');
  await input.fill('12'); await save.click(); await saved(12);
  await page.reload({ waitUntil: 'networkidle' }); await value(12);
  checks.push('Reducing the policy to 12 hours is saved and read back without changing its new-logins meaning');

  const invalidWritesBefore = (await state()).writeCalls.length;
  for (const invalid of ['', '0', '-1', '1.5', '2161']) {
    await input.fill(invalid);
    await section.getByRole('alert').filter({ hasText: 'Informe um número inteiro entre 1 e 2160 horas.' }).waitFor();
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
    assert.equal(await save.isDisabled(), true);
  }
  assert.equal((await state()).writeCalls.length, invalidWritesBefore);
  checks.push('Empty, zero, negative, fractional and excessive values cannot be submitted');

  await input.fill('36'); await control({ writeFail: true }); await save.click();
  await section.getByRole('alert').filter({ hasText: 'Falha simulada ao salvar.' }).waitFor();
  await value(36);
  assert.match(await section.innerText(), /Duração atual:\s*12 horas\./);
  assert.equal((await state()).hours, 12);
  assert.equal(await section.getByRole('status').count(), 0);
  assert.equal(await save.isEnabled(), true);
  await control({ writeFail: false });
  await page.reload({ waitUntil: 'networkidle' }); await value(12);
  checks.push('A rejected save preserves the edit, shows an error and does not claim or persist the new duration');

  const beforeReadFailure = (await state()).writeCalls.length;
  await control({ readFail: true }); await page.reload({ waitUntil: 'networkidle' });
  await section.getByRole('alert').filter({ hasText: 'Não foi possível carregar o tempo conectado.' }).waitFor();
  assert.equal(await input.count(), 0);
  assert.doesNotMatch(await section.innerText(), /Duração atual:/);
  await control({ readFail: false });
  await section.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await value(12);
  assert.equal((await state()).writeCalls.length, beforeReadFailure);
  checks.push('An initial read error never invents a default value; retry retrieves the persisted policy without saving');

  await input.fill('72'); await control({ hours: 48 });
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await waitFor(async () => /Duração atual:\s*48 horas\./.test(await section.innerText()), 'Focus refresh did not read the latest server policy');
  await value(72);
  await save.click(); await saved(72);
  checks.push('A background policy refresh updates the current value without replacing an in-progress draft');

  await control({ hours: 48 }); await page.reload({ waitUntil: 'networkidle' }); await value(48);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await input.isVisible(), true); assert.equal(await save.isVisible(), true);
  await shot('mobile-session-policy-48h.png');
  checks.push('The real policy control fits the 390px mobile viewport');

  await page.setViewportSize({ width: 1280, height: 1000 });
  const deepLink = base + '/admin/settings?tab=login#tempo-login';
  await page.goto(deepLink, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Configurações do Site', exact: true }).waitFor();
  await value(48);
  await page.getByRole('heading', { name: 'Preview da Tela de Login', exact: true }).waitFor();
  assert.equal(page.url(), deepLink);
  const layout = await page.evaluate(() => {
    const control = document.getElementById('tempo-login');
    const preview = Array.from(document.querySelectorAll('h3')).find(node => node.textContent === 'Preview da Tela de Login');
    return {
      beforePreview: !!(control && preview && (control.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING)),
      top: control?.getBoundingClientRect().top,
    };
  });
  assert.equal(layout.beforePreview, true, 'The policy control must precede the existing login preview');
  assert.ok(layout.top >= 0 && layout.top < 200, 'The deep-link did not scroll to the policy control');
  assert.deepEqual(new Set((await state()).auxiliaryCalls), new Set(['settings.getAll', 'pix.list', 'trackingQuestions.list', 'appSettings.getPhotoMode']));
  await shot('admin-settings-login-policy-integration.png');
  checks.push('The real AdminSettings deep-link opens Tela de Login, scrolls to the policy and places it above the existing preview');

  assert.deepEqual(browserErrors, []);
  const result = { passed: checks.length, checks, browserErrors };
  await fs.writeFile(path.join(output, 'qa-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await shot('failure.png').catch(() => {});
  await fs.writeFile(path.join(output, 'qa-failure.json'), JSON.stringify({ passed: checks.length, checks, browserErrors, error: String(error) }, null, 2));
  throw error;
} finally { await context.close(); await browser.close(); }
