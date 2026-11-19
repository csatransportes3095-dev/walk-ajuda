import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { Toaster } from 'sonner';
import { trpc } from '@/lib/trpc';
import { CustomerOtpLogin, type CustomerOtpResult } from '@/components/CustomerOtpLogin';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
const client = trpc.createClient({ links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })] });
function Fixture() {
  const [authenticated, setAuthenticated] = useState<CustomerOtpResult | null>(null);
  const initialPhone = new URLSearchParams(window.location.search).get('initialPhone') || '';
  return <>
    <p className="bg-slate-950 px-4 py-2 text-center text-xs text-slate-400">Validação isolada · dados sintéticos · nenhum envio real</p>
    {authenticated
      ? <p role="status" data-testid="authenticated-phone" className="p-6 text-center text-emerald-300">Identidade confirmada para {authenticated.phone}</p>
      : <CustomerOtpLogin initialPhone={initialPhone} onAuthenticated={value => { setAuthenticated(value); }} />}
    <Toaster richColors />
  </>;
}
createRoot(document.getElementById('root')!).render(
  <trpc.Provider client={client} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}><Fixture /></QueryClientProvider>
  </trpc.Provider>
);
