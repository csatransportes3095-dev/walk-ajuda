import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';
import CustomerLoginHistory from '@/components/CustomerLoginHistory';
import './styles.css';

// Same global focus default as production; the actual component must override it.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const client = trpc.createClient({ links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })] });
const formatDate = (value: number) => new Date(value).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

createRoot(document.getElementById('root')!).render(
  <trpc.Provider client={client} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto min-h-screen max-w-4xl bg-slate-950 p-4 text-white">
        <h1 className="mb-4 text-lg font-bold">Histórico de acessos · teste isolado</h1>
        <CustomerLoginHistory phone="11999990001" formatDate={formatDate} />
      </main>
    </QueryClientProvider>
  </trpc.Provider>
);
