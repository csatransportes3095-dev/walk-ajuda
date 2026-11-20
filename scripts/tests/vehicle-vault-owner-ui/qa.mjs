import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const output = path.resolve(process.env.VEHICLE_VAULT_OWNER_UI_OUTPUT_DIR || path.join(os.tmpdir(), 'h2-vehicle-vault-owner-ui'));
await fs.mkdir(output, { recursive: true });
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_BIN) throw new Error('Set PLAYWRIGHT_MODULE and CHROME_BIN to installed test tools.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const base = 'http://127.0.0.1:4179';
await context.route('**/*', route => route.request().url().startsWith(base + '/') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
const page = await context.newPage();
const checks = [], browserErrors = [];
page.on('pageerror', error => browserErrors.push(String(error)));
const control = async data => (await page.request.post(base + '/test-control', { data })).json();
const state = async () => (await page.request.get(base + '/test-control')).json();
const fixture = async key => (await page.request.get(base + `/fixtures/${key}.json`)).json();
const pdf = async key => ({ name: `synthetic-${key}.pdf`, mimeType: 'application/pdf', buffer: await (await page.request.get(base + `/fixtures/${key}.pdf`)).body() });
const dialog = page.getByRole('dialog');
const owner = () => dialog.getByLabel('NOME DO PROPRIETÁRIO', { exact: true });
const year = () => dialog.getByLabel('ANO DO MODELO', { exact: true });
const save = () => dialog.getByRole('button', { name: /^(GUARDAR E ADICIONAR OUTRO|SALVAR E CONTINUAR)$/ });
const shot = name => page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
const waitFor = async (condition, message) => {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(message);
};
async function ownerIs(value) { await waitFor(async () => await owner().inputValue() === value, 'Owner field did not display ' + value); }
async function newDocument() { await page.getByRole('button', { name: 'NOVO DOCUMENTO', exact: true }).click(); await owner().waitFor(); }
async function closeEditor() { await dialog.getByRole('button', { name: 'Fechar janela' }).click(); await dialog.waitFor({ state: 'hidden' }); }
async function openSaved(plate) {
  const search = page.getByPlaceholder('Ex.: HB20 cinza, placa, Renavam, chassi...');
  await search.fill(plate); await search.press('Enter');
  await page.getByRole('button').filter({ hasText: 'Placa ' + plate + ' · Renavam' }).click();
  await page.getByRole('button', { name: 'EDITAR DADOS / ANEXAR PDF', exact: true }).waitFor();
}
async function editSaved() { await page.getByRole('button', { name: 'EDITAR DADOS / ANEXAR PDF', exact: true }).click(); await owner().waitFor(); }
async function assertBelowYear() {
  const [a, b] = await Promise.all([year().boundingBox(), owner().boundingBox()]);
  assert.ok(a && b && b.y >= a.y + a.height && Math.abs(a.x - b.x) < 2, 'Owner must be directly below the model year in the same column');
}

try {
  const person = await fixture('person'), company = await fixture('company'), empty = await fixture('empty');
  await control({ reset: true });
  await page.goto(base + '/adm/placa', { waitUntil: 'networkidle' });
  await newDocument();
  await dialog.getByLabel('OU COLE O TEXTO · PREENCHIMENTO AUTOMÁTICO').fill(person.text);
  await ownerIs(person.ownerName);
  await dialog.getByText('Preenchido automaticamente', { exact: true }).waitFor();
  assert.equal(await owner().getAttribute('maxlength'), '200');
  assert.equal(await owner().isEditable(), true);
  await assertBelowYear();
  assert.equal((await state()).saveCalls.length, 0);
  await shot('desktop-owner-extraction.png');
  checks.push('Real text extraction UI fills an editable owner directly below the model year without saving automatically');

  const corrected = 'Ana Sintética Corrigida';
  await owner().fill(corrected); await save().click();
  await waitFor(async () => (await state()).records.some(row => row.plate === person.plate && row.ownerName === corrected.toUpperCase()), 'Corrected owner was not saved');
  await ownerIs('');
  assert.equal(await dialog.isVisible(), true);
  assert.equal((await state()).saveCalls.at(-1).ownerName, corrected);
  await closeEditor();
  await page.reload({ waitUntil: 'networkidle' });
  await openSaved(person.plate);
  await page.getByText(corrected.toUpperCase(), { exact: true }).waitFor();
  await editSaved(); await ownerIs(corrected.toUpperCase());
  checks.push('Manual correction survives save, a clean new draft, full reload and reopening the saved document');

  await owner().fill('Nome Sintético Não Salvo'); await control({ failNextSave: true }); await save().click();
  await page.getByText('Falha sintética ao guardar o proprietário.', { exact: true }).waitFor();
  await ownerIs('Nome Sintético Não Salvo');
  assert.equal(await dialog.isVisible(), true);
  assert.equal((await state()).records.find(row => row.plate === person.plate).ownerName, corrected.toUpperCase());
  await closeEditor();
  checks.push('A failed save leaves the edit visible and does not overwrite the persisted owner');

  await openSaved('LEG1A23'); await editSaved(); await ownerIs('');
  await save().click(); await ownerIs('');
  await waitFor(async () => (await state()).saveCalls.at(-1)?.plate === 'LEG1A23', 'Legacy save was not sent');
  assert.equal((await state()).saveCalls.at(-1).ownerName, null);
  assert.equal((await state()).records.find(row => row.plate === 'LEG1A23').ownerName, null);
  await closeEditor();
  checks.push('A legacy document reopens with an empty optional owner and can still be saved');

  await newDocument();
  await dialog.locator('input[type="file"]').setInputFiles(await pdf('person'));
  await ownerIs(person.ownerName);
  await dialog.locator('input[type="file"]').setInputFiles(await pdf('empty'));
  await ownerIs('');
  await waitFor(async () => await dialog.getByLabel('PLACA', { exact: true }).inputValue() === empty.plate, 'New PDF did not replace the previous vehicle');
  await save().click();
  await waitFor(async () => (await state()).records.some(row => row.plate === empty.plate), 'Owner-less PDF could not be saved');
  assert.equal((await state()).records.find(row => row.plate === empty.plate).ownerName, null);
  assert.deepEqual((await state()).previewPdfCalls.slice(-2), ['person', 'empty']);
  await closeEditor();
  checks.push('Selecting the next PDF clears the previous owner and an owner-less document remains savable');

  await control({ reset: true }); await page.reload({ waitUntil: 'networkidle' }); await newDocument();
  await dialog.getByRole('tab', { name: 'PDFs EM LOTE', exact: true }).click();
  const batch = dialog.getByRole('region', { name: 'Extrator PDF em lote' });
  await batch.locator('input[type="file"]').setInputFiles([await pdf('person'), await pdf('company')]);
  const first = batch.locator('article').nth(0), second = batch.locator('article').nth(1);
  await waitFor(async () => await first.getByLabel('NOME DO PROPRIETÁRIO', { exact: true }).count() === 1
    && await second.getByLabel('NOME DO PROPRIETÁRIO', { exact: true }).count() === 1, 'Both batch documents did not finish extraction');
  assert.equal(await first.getByLabel('NOME DO PROPRIETÁRIO', { exact: true }).inputValue(), person.ownerName);
  assert.equal(await second.getByLabel('NOME DO PROPRIETÁRIO', { exact: true }).inputValue(), company.ownerName);
  await first.getByLabel('NOME DO PROPRIETÁRIO', { exact: true }).fill('PESSOA SINTÉTICA DO LOTE');
  assert.equal(await second.getByLabel('NOME DO PROPRIETÁRIO', { exact: true }).inputValue(), company.ownerName);
  await shot('desktop-owner-batch.png');
  await batch.getByRole('button', { name: /^CONFERIR E GUARDAR LOTE \(2\)$/ }).click();
  await waitFor(async () => (await state()).records.length === 3, 'Both batch documents were not saved');
  const savedRows = (await state()).records;
  assert.equal(savedRows.find(row => row.plate === person.plate).ownerName, 'PESSOA SINTÉTICA DO LOTE');
  assert.equal(savedRows.find(row => row.plate === company.plate).ownerName, company.ownerName);
  assert.equal((await state()).saveCalls.every(call => call.attachedPdf), true);
  await closeEditor();
  checks.push('Two real batch editors keep different owners and save a correction only to its matching document');

  await openSaved(person.plate); await editSaved(); await ownerIs('PESSOA SINTÉTICA DO LOTE');
  await owner().fill(''); await save().click();
  await waitFor(async () => (await state()).records.find(row => row.plate === person.plate)?.ownerName === null, 'Explicit empty owner did not clear the saved value');
  assert.equal((await state()).saveCalls.at(-1).ownerName, null);
  await closeEditor();
  await page.reload({ waitUntil: 'networkidle' }); await openSaved(person.plate); await editSaved(); await ownerIs('');
  await closeEditor();
  checks.push('Clearing the owner sends null and remains empty after a full reload');

  await page.setViewportSize({ width: 390, height: 844 });
  await newDocument(); await dialog.getByLabel('OU COLE O TEXTO · PREENCHIMENTO AUTOMÁTICO').fill(company.text);
  await ownerIs(company.ownerName); await year().scrollIntoViewIfNeeded();
  await assertBelowYear();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const ownerBox = await owner().boundingBox();
  assert.ok(ownerBox && ownerBox.x >= 0 && ownerBox.x + ownerBox.width <= 390);
  await shot('mobile-owner-extraction.png');
  checks.push('The owner remains below the model year and fits the mobile viewport');

  assert.deepEqual(browserErrors, []);
  const result = { passed: checks.length, checks, browserErrors };
  await fs.writeFile(path.join(output, 'qa-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await shot('failure.png').catch(() => {});
  await fs.writeFile(path.join(output, 'qa-failure.json'), JSON.stringify({ error: String(error), checks, browserErrors }, null, 2));
  throw error;
} finally { await browser.close(); }
