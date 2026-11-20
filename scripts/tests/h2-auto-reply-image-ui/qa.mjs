import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const output = path.resolve(process.env.H2_AUTO_REPLY_IMAGE_UI_OUTPUT_DIR || path.join(os.tmpdir(), 'h2-auto-reply-image-ui'));
await fs.mkdir(output, { recursive: true });
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_BIN) throw new Error('Set PLAYWRIGHT_MODULE and CHROME_BIN to installed test tools.');
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const base = 'http://127.0.0.1:4182';
await context.route('**/*', route => route.request().url().startsWith(base + '/') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
const page = await context.newPage();
const checks = [], browserErrors = [];
page.on('pageerror', error => browserErrors.push(String(error)));
const control = async data => (await page.request.post(base + '/test-control', { data })).json();
const state = async () => (await page.request.get(base + '/test-control')).json();
const first = () => page.locator('[data-faq-id="qa_first"]');
const second = () => page.locator('[data-faq-id="qa_second"]');
const answer = card => card.getByLabel('Texto da resposta', { exact: true });
const image = card => card.getByAltText('Imagem anexada à resposta', { exact: true });
const save = () => page.getByRole('button', { name: 'SALVAR PERSONALIZAÇÃO DESTE APARELHO', exact: true });
const shot = name => page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
const waitFor = async (condition, message) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(message);
};
const fixture = async key => ({ name: `synthetic-${key}.png`, mimeType: 'image/png', buffer: await (await page.request.get(base + `/fixtures/${key}.png`)).body() });
async function select(card, file) { await card.getByLabel('Selecionar imagem da resposta', { exact: true }).setInputFiles(file); }
async function loaded(card) { await waitFor(async () => await image(card).count() === 1 && await image(card).evaluate(element => element.complete && element.naturalWidth > 0), 'Image preview was not loaded'); }
async function saved(callback) {
  await save().click();
  await waitFor(async () => callback(await state()), 'Expected image/text association was not persisted');
  await waitFor(async () => !(await save().isEnabled()), 'The saved draft did not finish');
}
async function reload() { await page.reload({ waitUntil: 'networkidle' }); await first().waitFor(); }

try {
  await control({ reset: true });
  await page.goto(base + '/admin/h2-auto', { waitUntil: 'networkidle' });
  await first().waitFor();
  const initial = await state();
  const unrelated = structuredClone(initial.devices[0].config); delete unrelated.personalization;
  assert.equal(await image(first()).count(), 0);
  await answer(first()).fill('Resposta de texto mantida e editável.');
  await saved(s => s.devices[0].config.personalization.faq[0].answer === 'Resposta de texto mantida e editável.');
  assert.equal((await state()).devices[0].config.personalization.faq[0].image, undefined);
  checks.push('Existing text-only replies still save without any image or unrelated config changes');

  const firstFixture = await fixture('first'), secondFixture = await fixture('second');
  await control({ uploadDelayMs: 1200 });
  await select(first(), firstFixture);
  await first().getByRole('button', { name: 'CARREGANDO IMAGEM...', exact: true }).waitFor();
  assert.equal(await save().isEnabled(), false);
  await answer(first()).fill('Texto editado durante o carregamento da foto.');
  await answer(second()).fill('Outra pergunta editada durante o mesmo carregamento.');
  await loaded(first());
  assert.equal(await answer(first()).inputValue(), 'Texto editado durante o carregamento da foto.');
  assert.equal(await answer(second()).inputValue(), 'Outra pergunta editada durante o mesmo carregamento.');
  assert.equal(await image(second()).count(), 0);
  await control({ uploadDelayMs: 0 });
  await saved(s => Boolean(s.devices[0].config.personalization.faq[0].image));
  const firstSaved = (await state()).devices[0].config.personalization.faq[0];
  assert.equal(firstSaved.answer, 'Texto editado durante o carregamento da foto.');
  assert.equal((await state()).devices[0].config.personalization.faq[1].answer, 'Outra pergunta editada durante o mesmo carregamento.');
  assert.equal((await state()).saveCalls.at(-1).expectedRevision, 11);
  assert.ok(firstSaved.image.downloadPath.startsWith('/api/h2-auto/reply-images/0123456789abcdef01234567/'));
  await reload(); await loaded(first());
  assert.equal(await image(first()).getAttribute('src'), firstSaved.image.downloadPath);
  await first().scrollIntoViewIfNeeded();
  await shot('desktop-image-attached.png');
  checks.push('Uploading blocks save, keeps simultaneous edits on both questions, and persists the correct image after reload');

  await page.getByPlaceholder('Digite uma pergunta como o cliente escreveria...').fill(firstSaved.question);
  await page.getByRole('button', { name: 'VISUALIZAR RESPOSTA', exact: true }).click();
  const previewImage = page.getByAltText('Prévia da foto que acompanha a resposta', { exact: true });
  await previewImage.waitFor();
  assert.equal(await previewImage.getAttribute('src'), firstSaved.image.downloadPath);
  assert.equal(await page.locator('pre').filter({ hasText: 'Texto editado durante o carregamento da foto.' }).count(), 1);
  assert.equal(await page.locator('pre').filter({ hasText: '/api/h2-auto/reply-images/' }).count(), 0);
  checks.push('The real production reply selector previews the associated photo separately from text, with no image URL in the message');

  await answer(first()).fill('');
  await saved(s => s.devices[0].config.personalization.faq[0].answer === '' && Boolean(s.devices[0].config.personalization.faq[0].image));
  await reload(); await loaded(first());
  assert.equal(await answer(first()).inputValue(), '');
  await page.getByPlaceholder('Digite uma pergunta como o cliente escreveria...').fill(firstSaved.question);
  await page.getByRole('button', { name: 'VISUALIZAR RESPOSTA', exact: true }).click();
  await previewImage.waitFor();
  assert.equal(await previewImage.getAttribute('src'), firstSaved.image.downloadPath);
  assert.equal(await page.locator('pre').count(), 0);
  checks.push('An image-only reply saves and reopens with its text empty');

  await select(second(), secondFixture); await loaded(second());
  await saved(s => Boolean(s.devices[0].config.personalization.faq[1].image));
  const secondSaved = (await state()).devices[0].config.personalization.faq[1].image;
  assert.notEqual(firstSaved.image.id, secondSaved.id);
  assert.notEqual(firstSaved.image.sha256, secondSaved.sha256);
  await reload(); await loaded(first()); await loaded(second());
  assert.equal(await image(first()).getAttribute('src'), firstSaved.image.downloadPath);
  assert.equal(await image(second()).getAttribute('src'), secondSaved.downloadPath);
  checks.push('Different FAQ entries keep independent photo associations');

  await control({ failNextUpload: true });
  await select(first(), secondFixture);
  await first().getByRole('alert').filter({ hasText: 'Falha sintética ao anexar imagem.' }).waitFor();
  assert.equal(await image(first()).getAttribute('src'), firstSaved.image.downloadPath);
  assert.equal((await state()).devices[0].config.personalization.faq[0].image.id, firstSaved.image.id);
  const uploadsBeforeInvalid = (await state()).uploads.length;
  await select(first(), { name: 'invalid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await first().getByRole('alert').filter({ hasText: 'Escolha uma imagem JPG, PNG ou WebP.' }).waitFor();
  await select(first(), { name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await first().getByRole('alert').filter({ hasText: 'A imagem deve ter até 5 MB' }).waitFor();
  assert.equal((await state()).uploads.length, uploadsBeforeInvalid);
  assert.equal(await image(first()).getAttribute('src'), firstSaved.image.downloadPath);
  checks.push('Failed replacements, unsupported formats and oversized files preserve the previous image and do not submit invalid uploads');

  await select(first(), secondFixture); await loaded(first());
  await waitFor(async () => await image(first()).getAttribute('src') !== firstSaved.image.downloadPath, 'The replacement was not applied to the draft');
  const replacementPath = await image(first()).getAttribute('src');
  await control({ failNextSave: true });
  await save().click();
  await page.getByText('Falha sintética ao salvar resposta.', { exact: true }).waitFor();
  assert.equal(await image(first()).getAttribute('src'), replacementPath);
  assert.equal((await state()).devices[0].config.personalization.faq[0].image.id, firstSaved.image.id);
  await saved(s => s.devices[0].config.personalization.faq[0].image.downloadPath === replacementPath);
  await reload(); await loaded(first());
  assert.equal(await image(first()).getAttribute('src'), replacementPath);
  checks.push('A failed save preserves the replacement draft, and retry saves the new image durably');

  await first().getByRole('button', { name: 'REMOVER IMAGEM', exact: true }).click();
  assert.equal(await image(first()).count(), 0);
  assert.equal(await save().isEnabled(), false);
  await answer(first()).fill('Resposta somente em texto após remover a foto.');
  await saved(s => s.devices[0].config.personalization.faq[0].image === undefined && s.devices[0].config.personalization.faq[0].answer.startsWith('Resposta somente'));
  await reload();
  assert.equal(await image(first()).count(), 0);
  assert.equal(await image(second()).getAttribute('src'), secondSaved.downloadPath);
  checks.push('Removing the only content disables save until text is supplied, and removal does not affect another question');

  await control({ uploadDelayMs: 1200 });
  await select(first(), firstFixture);
  await first().getByRole('button', { name: 'CARREGANDO IMAGEM...', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Aparelho sintético secundário', exact: true }).click();
  await waitFor(async () => await answer(first()).inputValue() === 'Confira o cartaz sintético de atendimento.', 'Second device was not selected');
  await waitFor(async () => (await state()).uploads.length >= uploadsBeforeInvalid + 2, 'Upload request was not received');
  // The late upload must not alter the newly selected device or resurrect the old draft.
  await new Promise(resolve => setTimeout(resolve, 1600));
  assert.equal(await image(first()).count(), 0);
  assert.equal(await save().isEnabled(), false);
  assert.equal((await state()).devices[1].config.personalization.faq[0].image, undefined);
  await control({ uploadDelayMs: 0 });
  await page.getByRole('button', { name: 'Aparelho sintético principal', exact: true }).click();
  assert.equal(await image(first()).count(), 0);
  checks.push('Switching devices during upload never attaches a late response to another device');

  await answer(first()).fill('Texto local preservado em conflito de revisão.');
  await control({ advanceRevision: true });
  await save().click();
  await page.getByText('As configurações foram atualizadas. Recarregue antes de salvar.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'RECARREGAR PERGUNTAS SALVAS', exact: true }).waitFor();
  assert.equal(await answer(first()).inputValue(), 'Texto local preservado em conflito de revisão.');
  assert.equal(await save().isEnabled(), false);
  assert.notEqual((await state()).devices[0].config.personalization.faq[0].answer, 'Texto local preservado em conflito de revisão.');
  await reload();
  checks.push('A concurrent revision rejects overwrite and retains the image/text draft for review');

  await control({ imageReplyStatusCode: 'ACTION_ACCEPTED_UNVERIFIED' }); await reload();
  const photoStatus = page.getByRole('status', { name: 'Estado das fotos no APK', exact: true });
  await photoStatus.getByText('Ação aceita; saída da foto ainda não confirmada', { exact: true }).waitFor();
  assert.equal(await photoStatus.getByText('Saída da foto confirmada na conversa', { exact: true }).count(), 0);
  checks.push('APK action acceptance is displayed separately from confirmed photo output');

  await control({ apkVersionCode: 113 }); await reload(); await loaded(second());
  await page.getByText('Para enviar fotos anexadas, atualize o H2 Auto para a versão 2.14 ou superior e sincronize o aparelho.', { exact: false }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await second().scrollIntoViewIfNeeded();
  const group = second().getByRole('group', { name: 'Imagem da resposta', exact: true });
  const bounds = await group.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  for (const button of await group.getByRole('button').all()) {
    const box = await button.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.height >= 40);
  }
  await shot('mobile-image-attached.png');
  checks.push('Mobile image preview and actions fit the viewport, and an older APK receives the update instruction');

  const finalState = await state();
  const unchangedConfig = structuredClone(finalState.devices[0].config); delete unchangedConfig.personalization;
  assert.deepEqual(unchangedConfig, unrelated);
  assert.deepEqual(browserErrors, []);
  const result = { passed: checks.length, checks, browserErrors };
  await fs.writeFile(path.join(output, 'qa-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await shot('failure.png').catch(() => {});
  await fs.writeFile(path.join(output, 'qa-failure.json'), JSON.stringify({ error: String(error), checks, browserErrors }, null, 2));
  throw error;
} finally { await browser.close(); }
