import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { Toaster } from 'sonner';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';
import { AdminCustomerSessionSettings } from '@/components/AdminCustomerSessionSettings';
import AdminSettings from '@/pages/AdminSettings';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
const client = trpc.createClient({ links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })] });
createRoot(document.getElementById('root')!).render(
  <trpc.Provider client={client} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      {window.location.pathname === '/admin/settings'
        ? <AdminSettings />
        : <main className="mx-auto min-h-screen max-w-3xl bg-slate-950 p-4 text-white">
          <p className="mb-4 text-xs text-slate-400">Validação isolada · configurações sintéticas</p>
          <AdminCustomerSessionSettings />
        </main>}
      <Toaster richColors />
    </QueryClientProvider>
  </trpc.Provider>
);
