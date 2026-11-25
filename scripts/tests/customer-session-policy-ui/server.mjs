// Synthetic policy storage and read-only supporting data. No production router,
// credentials, database, customer, email or external delivery is used.
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

const root = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const defaults = () => ({ hours: 720, readFail: false, writeFail: false, readDelayMs: 0, writeDelayMs: 0, readCalls: 0, writeCalls: [], auxiliaryCalls: [] });
let state = defaults();
const policy = hours => ({ hours, minHours: 1, maxHours: 2160, appliesTo: 'new_logins' });
const t = initTRPC.create({ transformer: superjson });
const auxiliary = (name, value) => t.procedure.query(() => { state.auxiliaryCalls.push(name); return value; });
const router = t.router({
  customerPassword: t.router({
    getSessionPolicy: t.procedure.query(async () => {
      state.readCalls++;
      const hours = state.hours, fail = state.readFail;
      if (state.readDelayMs) await new Promise(resolve => setTimeout(resolve, state.readDelayMs));
      if (fail) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Falha simulada ao consultar.' });
      return policy(hours);
    }),
    updateSessionPolicy: t.procedure.input(z.object({ hours: z.number().int().min(1).max(2160) })).mutation(async ({ input }) => {
      state.writeCalls.push({ ...input });
      if (state.writeDelayMs) await new Promise(resolve => setTimeout(resolve, state.writeDelayMs));
      if (state.writeFail) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Falha simulada ao salvar.' });
      state.hours = input.hours;
      return policy(state.hours);
    }),
  }),
  // AdminSettings mounts these reads irrespective of its selected tab. Only
  // synthetic empty results exist; unrelated mutations are deliberately absent.
  settings: t.router({ getAll: auxiliary('settings.getAll', {}) }),
  pix: t.router({ list: auxiliary('pix.list', []) }),
  trackingQuestions: t.router({ list: auxiliary('trackingQuestions.list', []) }),
  appSettings: t.router({ getPhotoMode: auxiliary('appSettings.getPhotoMode', { mode: 'both' }) }),
});
const app = express();
app.use('/api/trpc', createExpressMiddleware({ router }));
app.use(express.json());
app.get('/test-control', (_req, res) => res.json(state));
app.post('/test-control', (req, res) => {
  if (req.body.reset) state = defaults();
  for (const key of ['hours', 'readFail', 'writeFail', 'readDelayMs', 'writeDelayMs']) if (key in req.body) state[key] = req.body[key];
  res.json(state);
});
const vite = await createServer({
  configFile: false, root, plugins: [react(), tailwind()],
  resolve: { alias: { '@': path.join(repo, 'client/src'), '@shared': path.join(repo, 'shared') } },
  server: { middlewareMode: true, fs: { allow: [root, repo] } }, appType: 'spa',
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query', '@trpc/client', '@trpc/react-query', 'superjson', 'lucide-react', 'sonner', 'wouter'] },
});
app.use(vite.middlewares);
app.listen(4178, '127.0.0.1', () => console.log('Session policy QA listening on http://127.0.0.1:4178'));
