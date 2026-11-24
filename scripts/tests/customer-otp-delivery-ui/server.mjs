// Isolated, synthetic tRPC responses only. No database, SMTP, APK or production APIs.
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
const defaults = () => ({
  checkMode: 'success',
  requestMode: 'success', retryAfterSeconds: 60, cooldownScope: 'channel',
  whatsappAvailable: true, supportNumber: '11999990099', delayMs: 0,
  checkCalls: [], requestCalls: [], verifyCalls: [], passkeyAvailable:false, passkeyPrepareFails:false, finishEnrollmentCalls:[],
});
let state = defaults();
const t = initTRPC.create({ transformer: superjson });
const router = t.router({
  settings: t.router({ getAll: t.procedure.query(() => ({ whatsapp_number: state.supportNumber })) }),
  customers: t.router({ checkByPhoneMutation: t.procedure.input(z.object({ phone: z.string() })).mutation(({ input }) => {
    state.checkCalls.push({ ...input });
    if (state.checkMode === 'failure') throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Falha de consulta para teste.' });
    if (state.checkMode === 'blocked') return { exists: true, customerBlocked: true, blocked: false, customer: { email: 'fixture@example.invalid' } };
    return { exists: true, customerBlocked: false, blocked: false, customer: { email: 'fixture@example.invalid' } };
  }) }),
  customerPassword: t.router({
    passkeyLoginAvailable: t.procedure.query(() => ({available:false})),
    passkeyEnrollmentAvailable: t.procedure.query(() => ({available:state.passkeyAvailable})),
    finishPasskeyEnrollment: t.procedure.input(z.object({token:z.string(),challengeId:z.string(),response:z.unknown()})).mutation(({input}) => { state.finishEnrollmentCalls.push({token:input.token,challengeId:input.challengeId}); return {enrolled:true}; }),
    h2AutoOtpAvailable: t.procedure.query(() => ({ available: state.whatsappAvailable })),
    requestCustomerCode: t.procedure.input(z.object({ phone: z.string(), channel: z.enum(['email', 'whatsapp', 'both']) })).mutation(async ({ input }) => {
      state.requestCalls.push({ ...input });
      const mode = state.requestMode;
      if (state.delayMs) await new Promise(resolve => setTimeout(resolve, state.delayMs));
      if (mode === 'failure') throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Falha de entrega para teste.' });
      return { success: true, message: mode === 'blocked' ? 'Limite temporário para teste.' : 'Solicitação recebida para teste.',
        resendBlocked: mode === 'blocked', retryAfterSeconds: state.retryAfterSeconds, cooldownScope: input.channel === 'both' ? 'all' : state.cooldownScope, whatsappPrepared: input.channel !== 'email' && state.whatsappAvailable };
    }),
    verifyCustomerCode: t.procedure.input(z.object({ phone: z.string(), code: z.string(), remember: z.boolean().optional(), enrollPasskey: z.boolean().optional() })).mutation(({ input }) => {
      state.verifyCalls.push({ ...input });
      return input.code === '246810'
        ? { success: true, token: 'synthetic_otp_session', profileUpdateRequired: false, profileUpdateFields: [], enrollment: input.enrollPasskey && state.passkeyAvailable && !state.passkeyPrepareFails ? {challengeId:'synthetic-challenge',options:{challenge:'c3ludGhldGlj',rp:{name:'Synthetic test',id:'127.0.0.1'},user:{id:'dGVzdA',name:'test',displayName:'Test'},pubKeyCredParams:[{type:'public-key',alg:-7}],timeout:1000,attestation:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'}}} : null }
        : { success: false, message: 'Código de teste inválido.' };
    }),
  }),
});
const app = express();
app.use('/api/trpc', createExpressMiddleware({ router }));
app.use(express.json());
app.get('/test-control', (_req, res) => res.json(state));
app.post('/test-control', (req, res) => {
  if (req.body.reset) state = defaults();
  for (const key of ['checkMode', 'requestMode', 'retryAfterSeconds', 'cooldownScope', 'whatsappAvailable', 'supportNumber', 'delayMs', 'passkeyAvailable', 'passkeyPrepareFails']) {
    if (key in req.body) state[key] = req.body[key];
  }
  res.json(state);
});
const vite = await createServer({
  configFile: false, root, plugins: [react(), tailwind()],
  resolve: { alias: { '@': path.join(repo, 'client/src'), '@shared': path.join(repo, 'shared') } },
  server: { middlewareMode: true, fs: { allow: [root, repo] } }, appType: 'spa',
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query', '@trpc/client', '@trpc/react-query', 'superjson', 'lucide-react', 'sonner'] },
});
app.use(vite.middlewares);
app.listen(4177, '127.0.0.1', () => console.log('OTP delivery QA listening on http://127.0.0.1:4177'));
