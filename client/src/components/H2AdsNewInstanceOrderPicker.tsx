import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { canShowH2AdsOrderForLink, getExactH2AdsCustomerNumberSearch, matchesH2AdsOrderSearch, normalizeH2AdsOrderSearch } from "@shared/h2adsOrderSearch";

export type H2AdsPendingOrderLink = {
  registrationId: number;
  subOrderIndex: number;
  customerNumber: number | null;
  customerName: string | null;
  orderNumber: number | null;
  serviceName: string | null;
  serviceOption: string | null;
  latestStatus: string | null;
  customerProfilePhotoUrl: string | null;
};

type AdminOrder = H2AdsPendingOrderLink & {
  id: number;
  phone?: string | null;
};

const keyFor = (registrationId: number, subOrderIndex: number) => `${registrationId}:${subOrderIndex}`;
const customerInitial = (name?: string | null) => (name || "C").trim().charAt(0).toUpperCase() || "C";
const statusLabel = (status?: string | null) => status ? status.replace(/_/g, " ") : "Sem status";

export function suggestedH2AdsInstanceName(order: H2AdsPendingOrderLink): string {
  const prefix = order.customerNumber ? String(order.customerNumber) : String(order.orderNumber || order.registrationId);
  const name = (order.customerName || "CLIENTE").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
  return `${prefix} ${name}`.slice(0, 128);
}

export default function H2AdsNewInstanceOrderPicker({ value, onChange }: { value: H2AdsPendingOrderLink | null; onChange: (value: H2AdsPendingOrderLink | null) => void }) {
  const [search, setSearch] = useState("");
  const linksQuery = trpc.h2Ads.listOrderLinks.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const ordersQuery = trpc.orderStatus.listOrders.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const orders = (ordersQuery.data ?? []) as unknown as AdminOrder[];
  const links = linksQuery.data ?? [];
  const normalizedSearch = normalizeH2AdsOrderSearch(search);
  const exactCustomerNumber = getExactH2AdsCustomerNumberSearch(search);
  const linkedKeys = useMemo(() => new Set(links.map(link => keyFor(link.registrationId, link.subOrderIndex))), [links]);

  const results = useMemo(() => {
    if (!normalizedSearch) return [] as AdminOrder[];
    const filtered = orders.filter(order => {
      const subOrderIndex = order.subOrderIndex ?? 0;
      if (linkedKeys.has(keyFor(order.id, subOrderIndex))) return false;
      if (!canShowH2AdsOrderForLink(order.latestStatus, false, true)) return false;
      return matchesH2AdsOrderSearch(order, search);
    });
    if (exactCustomerNumber !== null) {
      const exact = filtered.find(order => Number(order.customerNumber) === exactCustomerNumber);
      return exact ? [exact] : [];
    }
    return filtered.slice(0, 8);
  }, [orders, linkedKeys, normalizedSearch, exactCustomerNumber, search]);

  const select = (order: AdminOrder) => {
    onChange({
      registrationId: order.id,
      subOrderIndex: order.subOrderIndex ?? 0,
      customerNumber: order.customerNumber ?? null,
      customerName: order.customerName ?? null,
      orderNumber: order.orderNumber ?? null,
      serviceName: order.serviceName ?? null,
      serviceOption: order.serviceOption ?? null,
      latestStatus: order.latestStatus ?? null,
      customerProfilePhotoUrl: order.customerProfilePhotoUrl ?? null,
    });
    setSearch("");
  };

  return <div className="rounded-2xl border border-violet-400/25 bg-violet-400/[0.05] p-3">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-violet-200">Vincular cliente ao criar</p><p className="mt-1 text-[11px] leading-4 text-slate-500">Opcional. A instância já nasce sincronizada ao pedido escolhido.</p></div>{value && <button type="button" onClick={() => onChange(null)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-black text-slate-300 hover:bg-white/5">Trocar</button>}</div>
    {value ? <div className="mt-3 flex items-center gap-3 rounded-xl border border-violet-300/20 bg-black/20 p-3">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-violet-300/25 bg-violet-400/10">{value.customerProfilePhotoUrl ? <img src={value.customerProfilePhotoUrl} alt={value.customerName || "Foto do cliente"} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-sm font-black text-violet-100">{customerInitial(value.customerName)}</div>}</div>
      <div className="min-w-0 flex-1"><p className="text-[11px] font-black text-violet-200">{value.customerNumber ? `*${value.customerNumber}` : `#${value.orderNumber || value.registrationId}`}</p><p className="truncate text-sm font-black text-white">{value.customerName || "Cliente"}</p><p className="mt-1 truncate text-[10px] font-semibold text-slate-400">Pedido #{value.orderNumber || value.registrationId} · {[value.serviceName, value.serviceOption].filter(Boolean).join(" · ") || "Pedido"}</p></div>
      <span className="shrink-0 rounded-lg bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase text-emerald-300">{statusLabel(value.latestStatus)}</span>
    </div> : <>
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar *cadastro, nome, telefone ou #pedido" className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-xs font-bold text-white outline-none placeholder:text-slate-600 focus:border-violet-300/50" />
      {normalizedSearch && <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/25">{results.length === 0 ? <p className="px-3 py-3 text-[11px] font-semibold text-slate-500">Nenhum cliente disponível para “{search}”.</p> : results.map(order => <button key={keyFor(order.id, order.subOrderIndex ?? 0)} type="button" onClick={() => select(order)} className="flex w-full items-center gap-3 border-b border-white/8 px-3 py-2.5 text-left last:border-b-0 hover:bg-violet-400/10"><div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-violet-300/20 bg-violet-400/10">{order.customerProfilePhotoUrl ? <img src={order.customerProfilePhotoUrl} alt={order.customerName || "Foto do cliente"} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-xs font-black text-violet-100">{customerInitial(order.customerName)}</div>}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-white">{order.customerNumber ? `*${order.customerNumber}` : `#${order.orderNumber || order.id}`} · {order.customerName || "Cliente"}</p><p className="mt-0.5 truncate text-[10px] text-slate-400">#{order.orderNumber || order.id} · {[order.serviceName, order.serviceOption].filter(Boolean).join(" · ") || "Pedido"}</p></div><span className="shrink-0 text-[9px] font-black uppercase text-emerald-300">{statusLabel(order.latestStatus)}</span></button>)}</div>}
    </>}
  </div>;
}
