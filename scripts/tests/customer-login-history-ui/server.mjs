// No production data, cookies or APIs: this server owns synthetic history only.
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
const state = {
  total: 3,
  recent: ['2026-09-03T16:21:03Z', '2026-09-03T15:46:57Z', '2026-09-03T12:10:08Z'].map(Date.parse),
  lastActivity: null, fail: false, delayMs: 0, calls: 0,
};
const t = initTRPC.create({ transformer: superjson });
const router = t.router({ customerPassword: t.router({
  adminGetLoginHistory: t.procedure.input(z.object({ phone: z.string() })).query(async ({ input }) => {
    if (input.phone !== '11999990001') throw new Error('Unexpected fixture identity');
    state.calls++;
    if (state.delayMs) await new Promise(resolve => setTimeout(resolve, state.delayMs));
    if (state.fail) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Synthetic history unavailable' });
    return { total: state.total, recent: [...state.recent], lastActivity: state.lastActivity };
  }),
}) });
const app = express();
app.use('/api/trpc', createExpressMiddleware({ router }));
app.use(express.json());
app.get('/test-control', (_req, res) => res.json(state));
app.post('/test-control', (req, res) => {
  for (const key of ['total', 'recent', 'lastActivity', 'fail', 'delayMs']) if (key in req.body) state[key] = req.body[key];
  res.json(state);
});
const vite = await createServer({
  configFile: false, root, plugins: [react(), tailwind()],
  resolve: { alias: { '@': path.join(repo, 'client/src'), '@shared': path.join(repo, 'shared') } },
  server: { middlewareMode: true, fs: { allow: [root, repo] } }, appType: 'spa',
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query', '@trpc/client', '@trpc/react-query', 'superjson', 'lucide-react'] },
});
app.use(vite.middlewares);
app.listen(4176, '127.0.0.1', () => console.log('Customer history QA listening on http://127.0.0.1:4176'));
