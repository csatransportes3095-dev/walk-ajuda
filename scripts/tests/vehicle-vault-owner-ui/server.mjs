// UI fixture storage only. The production router/PDF extraction and SQL are
// tested separately; this server never imports them or accesses customer data.
import express from 'express';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { initTRPC, TRPCError } from '@trpc/server';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { z } from 'zod';
import superjson from 'superjson';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSyntheticOwnerPdf, syntheticVehicle, syntheticVehicleText } from '../vehicle-vault-owner-fixtures.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const fixtures = await Promise.all([
  ['person', 'TST1A23', 'ANA SINTÉTICA DO TESTE'],
  ['company', 'TST2B34', 'EMPRESA SINTÉTICA & FILHOS LTDA'],
  ['empty', 'TST3C45', ''],
].map(async ([key, plate, ownerName], index) => {
  const fields = { ...syntheticVehicle, plate, renavam: '0000000000' + (index + 1), chassis: '9BWZZZ377VT00425' + (index + 1) };
  const pdf = await makeSyntheticOwnerPdf({ ownerName, vehicle: fields });
  return { key, fields, ownerName, text: syntheticVehicleText(ownerName, fields), pdf, base64: pdf.toString('base64') };
}));
const legacy = () => ({ ...syntheticVehicle, id: 1, plate: 'LEG1A23', ownerName: null, sourceText: 'SYNTHETIC LEGACY DOCUMENT',
  approvalStatus: 'pending', inactive: false, createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z',
  links: [], history: [], pdfs: [], activeClients: 0, usageCount: 0, pdfCount: 0, chassisUsed: false });
const defaults = () => ({ records: [legacy()], previewTextCalls: [], previewPdfCalls: [], saveCalls: [], failNextSave: false });
let state = defaults();
const preview = fixture => ({ ...fixture.fields, ownerName: fixture.ownerName, text: fixture.text, missing: [] });
const t = initTRPC.create({ transformer: superjson });
const router = t.router({ vehicleVault: t.router({
  totalCount: t.procedure.query(() => ({ total: state.records.length })),
  search: t.procedure.input(z.any()).query(({ input }) => state.records.filter(row => !input.query || row.plate.includes(String(input.query).toUpperCase()))),
  details: t.procedure.input(z.object({ id: z.number() })).query(({ input }) => {
    const record = state.records.find(row => row.id === input.id);
    if (!record) throw new TRPCError({ code: 'NOT_FOUND' });
    return record;
  }),
  previewText: t.procedure.input(z.object({ text: z.string() })).mutation(({ input }) => {
    state.previewTextCalls.push(input.text);
    const fixture = fixtures.find(value => value.text === input.text);
    if (!fixture) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Use only a generated fixture text.' });
    return preview(fixture);
  }),
  previewPdf: t.procedure.input(z.object({ base64: z.string() })).mutation(({ input }) => {
    const fixture = fixtures.find(value => value.base64 === input.base64);
    if (!fixture) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Use only a generated fixture PDF.' });
    state.previewPdfCalls.push(fixture.key);
    return preview(fixture);
  }),
  save: t.procedure.input(z.any()).mutation(({ input }) => {
    const { pdfBase64, ...savedInput } = input;
    state.saveCalls.push({ ...savedInput, attachedPdf: Boolean(pdfBase64) });
    if (state.failNextSave) {
      state.failNextSave = false;
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha sintética ao guardar o proprietário.' });
    }
    const existing = input.id ? state.records.find(row => row.id === input.id) : null;
    const ownerName = input.ownerName == null ? null : String(input.ownerName).trim().replace(/\s+/g, ' ').toUpperCase() || null;
    const id = existing?.id || Math.max(0, ...state.records.map(row => row.id)) + 1;
    const record = { ...legacy(), ...(existing || {}), ...savedInput, id, ownerName,
      pdfs: pdfBase64 ? [{ id, filename: input.pdfFilename, createdAt: '2026-11-20T00:00:00Z' }] : existing?.pdfs || [],
      history: [{ id, event: existing ? 'edited' : 'created', happenedAt: '2026-11-20T00:00:00Z', customerName: null }] };
    record.pdfCount = record.pdfs.length;
    state.records = state.records.filter(row => row.id !== id).concat(record);
    return { saved: true, id };
  }),
}) });
const app = express();
app.use('/api/trpc', createExpressMiddleware({ router, maxBodySize: 16 * 1024 * 1024 }));
app.use(express.json());
app.get('/test-control', (_req, res) => res.json(state));
app.post('/test-control', (req, res) => {
  if (req.body.reset) state = defaults();
  if ('failNextSave' in req.body) state.failNextSave = Boolean(req.body.failNextSave);
  res.json(state);
});
app.get('/fixtures/:key.pdf', (req, res) => {
  const fixture = fixtures.find(value => value.key === req.params.key);
  if (!fixture) return res.sendStatus(404);
  res.type('application/pdf').send(fixture.pdf);
});
app.get('/fixtures/:key.json', (req, res) => {
  const fixture = fixtures.find(value => value.key === req.params.key);
  if (!fixture) return res.sendStatus(404);
  res.json(preview(fixture));
});
const vite = await createServer({ configFile: false, root, plugins: [react(), tailwind()],
  resolve: { alias: { '@': path.join(repo, 'client/src'), '@shared': path.join(repo, 'shared') } },
  server: { middlewareMode: true, fs: { allow: [root, repo] } }, appType: 'spa',
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query', '@trpc/client', '@trpc/react-query', 'superjson', 'lucide-react', 'sonner'] },
});
app.use(vite.middlewares);
app.listen(4179, '127.0.0.1', () => console.log('Vehicle owner QA listening on http://127.0.0.1:4179'));
