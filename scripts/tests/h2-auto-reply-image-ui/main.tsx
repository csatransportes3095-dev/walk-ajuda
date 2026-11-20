import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { Toaster } from 'sonner';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';
import AdminH2Auto from '@/pages/AdminH2Auto';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
const client = trpc.createClient({ links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })] });
createRoot(document.getElementById('root')!).render(
  <trpc.Provider client={client} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}><AdminH2Auto /><Toaster richColors /></QueryClientProvider>
  </trpc.Provider>
);
