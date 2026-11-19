import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { Toaster } from 'sonner';
import { trpc } from '@/lib/trpc';
import AdminCpfVault from '@/pages/AdminCpfVault';
import OrderCpfVault from '@/components/OrderCpfVault';
import '@/index.css';

const queryClient = new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false},mutations:{retry:false}}});
const client = trpc.createClient({links:[httpBatchLink({url:'/api/trpc',transformer:superjson})]});
function Harness(){
  const [toggles,setToggles]=useState(0);
  const [order,setOrder]=useState({registrationId:42,subOrderIndex:0,customerName:'Cliente de teste',orderNumber:800001 as number|null,orderRootId:800101});
  useEffect(()=>{
    const update=(event:Event)=>setOrder(previous=>({...previous,...(event as CustomEvent).detail}));
    window.addEventListener('cpf-qa:set-order',update);
    return ()=>window.removeEventListener('cpf-qa:set-order',update);
  },[]);
  return new URLSearchParams(location.search).get('mode')==='order'
    ? <div className="min-h-screen bg-[#04030a] p-8 text-white"><div role="button" tabIndex={0} data-testid="order-card" onClick={()=>setToggles(x=>x+1)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){setToggles(x=>x+1);}}} className="rounded-xl border border-white/20 p-6"><h1 className="mb-4 text-xl font-bold">Pedido de teste</h1><OrderCpfVault {...order}/><p data-testid="toggles">{toggles}</p><output data-testid="current-order" hidden>{JSON.stringify(order)}</output></div></div>
    : <AdminCpfVault/>;
}
createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}><Harness/><Toaster/></QueryClientProvider></trpc.Provider>);
