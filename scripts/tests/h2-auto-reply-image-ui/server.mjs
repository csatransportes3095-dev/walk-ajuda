// Browser QA uses the real ADM page, production FAQ schema and reply selector.
// Storage/device transport is local fixture state; no live accounts or WhatsApp sends.
import express from 'express';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { initTRPC, TRPCError } from '@trpc/server';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { z } from 'zod';
import superjson from 'superjson';
import sharp from 'sharp';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const { outputFiles } = await build({ entryPoints: [path.join(repo, 'shared/h2AutoPersonalization.ts')],
  bundle: true, platform: 'node', format: 'esm', target: 'node22', write: false });
const { h2AutoPersonalizationSchema, getH2AutoPersonalizedReply } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));

const deviceId = '0123456789abcdef01234567';
const secondDeviceId = 'fedcba9876543210fedcba98';
const makeDevice = (id, label) => ({ id, label, paired: true, revision: 10, appliedRevision: 10,
  lastSeen: Date.now(), diagnosticsReceivedAt: Date.now(), diagnostics: { apkVersionCode: 115,
    imageRepliesSupported: true, imageCacheReady: 0, imageCacheFailed: 0, imageReplyQueuePending: 0,
    imageReplyStatusCode: 'NOT_CHECKED', imageReplyDetailCode: 'NONE', imageReplyStage: 'NONE',
    imageReplyAccessibilityConnected: true },
  config: { enabled: true, whatsappMode: 'business', pauseMinutes: 60, scheduleOn: false,
    scheduleStart: '00:00', scheduleEnd: '23:59', identificationEnabled: true, ordersEnabled: true,
    questionCollectionEnabled: false, menu: Array(9).fill(''), rules: [], welcome: '',
    personalization: { enabled: true, tone: 'objetivo', verifiedName: true, faqPresetsLoaded: true,
      faq: [
        { id: 'qa_first', question: 'Mostre o cartaz sintético de atendimento', variations: 'Quero ver o cartaz de atendimento', answer: 'Confira o cartaz sintético de atendimento.', enabled: true },
        { id: 'qa_second', question: 'Mostre a imagem sintética de horários', variations: 'Quero a imagem dos horários', answer: 'Confira os horários sintéticos.', enabled: true },
      ] },
  } });
const defaults = () => ({ devices: [makeDevice(deviceId, 'Aparelho sintético principal'), makeDevice(secondDeviceId, 'Aparelho sintético secundário')],
  uploads: [], saveCalls: [], previewCalls: [], failNextUpload: false, failNextSave: false,
  uploadDelayMs: 0, saveDelayMs: 0 });
let state = defaults();
const files = new Map();
const fixture = async (color, label) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="${color}"/><text x="320" y="180" text-anchor="middle" font-size="34" fill="white">H2 AUTO</text><text x="320" y="230" text-anchor="middle" font-size="23" fill="white">${label}</text><text x="320" y="275" text-anchor="middle" font-size="18" fill="white">IMAGEM SINTÉTICA DE TESTE</text></svg>`)).png().toBuffer();
const fixtures = { first: await fixture('#134e4a', 'ATENDIMENTO'), second: await fixture('#4c1d95', 'HORÁRIOS') };
const getDevice = id => { const found = state.devices.find(value => value.id === id); if (!found) throw new TRPCError({ code: 'NOT_FOUND' }); return found; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const t = initTRPC.create({ transformer: superjson });
const router = t.router({
  apk: t.router({ getH2AutoRelease: t.procedure.query(() => ({ available: true, versionName: '2.15', versionCode: 115, uploadedAt: Date.now() })) }),
  h2AutoAdmin: t.router({
    list: t.procedure.query(() => structuredClone(state.devices)),
    learningQuestions: t.procedure.input(z.any()).query(() => ({ pending: 0, received: 0, questions: [] })),
    validationBlocks: t.procedure.input(z.any()).query(() => []),
    manualControls: t.procedure.input(z.any()).query(({ input }) => ({ contacts: [], revision: getDevice(input.id).revision, appliedRevision: 10 })),
    silencedContacts: t.procedure.input(z.any()).query(({ input }) => ({ phones: [], legacyNames: [], revision: getDevice(input.id).revision, appliedRevision: 10 })),
    uploadReplyImage: t.procedure.input(z.object({ id: z.string(), imageBase64: z.string(), mimeType: z.string() })).mutation(async ({ input }) => {
      getDevice(input.id);
      state.uploads.push({ id: input.id, mimeType: input.mimeType });
      await delay(state.uploadDelayMs);
      if (state.failNextUpload) { state.failNextUpload = false; throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha sintética ao anexar imagem.' }); }
      const buffer = await sharp(Buffer.from(input.imageBase64, 'base64')).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      const metadata = await sharp(buffer).metadata();
      const id = randomBytes(16).toString('hex');
      const image = { id, sha256: createHash('sha256').update(buffer).digest('hex'), mimeType: 'image/png', fileSize: buffer.length,
        width: metadata.width, height: metadata.height, downloadPath: `/api/h2-auto/reply-images/${input.id}/${id}` };
      files.set(image.downloadPath, buffer);
      return { image };
    }),
    savePersonalization: t.procedure.input(z.object({ id: z.string(), personalization: z.any(), expectedRevision: z.number().optional() })).mutation(async ({ input }) => {
      state.saveCalls.push(structuredClone(input));
      const parsed = h2AutoPersonalizationSchema.parse(input.personalization);
      await delay(state.saveDelayMs);
      if (state.failNextSave) { state.failNextSave = false; throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha sintética ao salvar resposta.' }); }
      const device = getDevice(input.id);
      if (input.expectedRevision !== undefined && input.expectedRevision !== device.revision)
        throw new TRPCError({ code: 'CONFLICT', message: 'As configurações foram atualizadas. Recarregue antes de salvar.' });
      device.config.personalization = parsed;
      device.revision += 1;
      return { success: true, revision: device.revision };
    }),
    previewPersonalization: t.procedure.input(z.object({ input: z.string(), personalization: z.any() })).mutation(({ input }) => {
      state.previewCalls.push(structuredClone(input));
      return { answer: getH2AutoPersonalizedReply(input.input, h2AutoPersonalizationSchema.parse(input.personalization)) };
    }),
  }),
});
const app = express();
app.use('/api/trpc', createExpressMiddleware({ router, maxBodySize: 10 * 1024 * 1024 }));
app.use(express.json());
app.get('/test-control', (_req, res) => res.json(state));
app.post('/test-control', (req, res) => {
  if (req.body.reset) { state = defaults(); files.clear(); }
  for (const field of ['failNextSave', 'failNextUpload']) if (field in req.body) state[field] = Boolean(req.body[field]);
  for (const field of ['uploadDelayMs', 'saveDelayMs']) if (field in req.body) state[field] = Math.min(2000, Math.max(0, Number(req.body[field]) || 0));
  if ('apkVersionCode' in req.body) state.devices[0].diagnostics.apkVersionCode = Number(req.body.apkVersionCode);
  if ('imageReplyStatusCode' in req.body) {
    state.devices[0].diagnostics.imageReplyStatusCode = String(req.body.imageReplyStatusCode);
    state.devices[0].diagnostics.imageReplyStatusAt = Date.now();
  }
  for (const field of ['imageReplyDetailCode', 'imageReplyStage', 'imageReplyAccessibilityConnected']) {
    if (!(field in req.body)) continue;
    if (req.body[field] === null) delete state.devices[0].diagnostics[field];
    else state.devices[0].diagnostics[field] = field === 'imageReplyAccessibilityConnected'
      ? Boolean(req.body[field]) : String(req.body[field]);
  }
  if (req.body.advanceRevision) state.devices[0].revision += 1;
  res.json(state);
});
app.get('/fixtures/:key.png', (req, res) => {
  const buffer = fixtures[req.params.key];
  buffer ? res.type('image/png').send(buffer) : res.sendStatus(404);
});
app.get('/api/h2-auto/reply-images/:device/:image', (req, res) => {
  const buffer = files.get(req.path);
  buffer ? res.type('image/png').send(buffer) : res.sendStatus(404);
});
const vite = await createServer({ configFile: false, root, plugins: [react(), tailwind()],
  resolve: { alias: { '@': path.join(repo, 'client/src'), '@shared': path.join(repo, 'shared') } },
  server: { middlewareMode: true, fs: { allow: [root, repo] } }, appType: 'spa',
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query', '@trpc/client', '@trpc/react-query', 'superjson', 'lucide-react', 'sonner', 'wouter'] },
});
app.use(vite.middlewares);
app.listen(4182, '127.0.0.1', () => console.log('H2 Auto reply-image QA listening on http://127.0.0.1:4182'));
