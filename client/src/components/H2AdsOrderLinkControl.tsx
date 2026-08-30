import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getExactH2AdsCustomerNumberSearch, matchesH2AdsOrderSearch, normalizeH2AdsOrderSearch } from "@shared/h2adsOrderSearch";

type AdminOrder = {
  id: number;
  phone?: string | null;
  subOrderIndex?: number;
  orderNumber?: number | null;
  customerNumber?: number | null;
  customerName?: string | null;
  customerProfilePhotoUrl?: string | null;
  serviceName?: string | null;
  serviceOption?: string | null;
  latestStatus?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  recebido: "Recebido",
  pedido_recebido: "Pedido recebido",
  pagamento_recebido: "Pagamento recebido",
  em_andamento: "Em andamento",
  em_montagem: "Em montagem",
  documentos_aprovados: "Documentos aprovados",
  conta_ativa: "Conta ativa",
  aguardando_ativa: "Aguardando ficar ativa",
  pedido_entregue: "Pedido entregue",
  cancelado: "Cancelado",
};

const keyFor = (registrationId: number, subOrderIndex: number) => `${registrationId}:${subOrderIndex}`;
const statusLabel = (status?: string | null) => status ? (STATUS_LABELS[status] || status.replace(/_/g, " ")) : "Sem status";
const customerInitial = (name?: string | null) => (name || "C").trim().charAt(0).toUpperCase() || "C";

export default function H2AdsOrderLinkControl({ instanceId }: { instanceId: number }) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const linksQuery = trpc.h2Ads.listOrderLinks.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const ordersQuery = trpc.orderStatus.listOrders.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const setLink = trpc.h2Ads.setOrderLink.useMutation({
    onSuccess: async (_, vars) => {
      toast.success(vars.registrationId === null ? "Vínculo do pedido removido." : "Cliente vinculado à instância.");
      await utils.h2Ads.listOrderLinks.invalidate();
    },
    onError: error => toast.error(error.message || "Não foi possível atualizar o vínculo do pedido."),
  });

  const links = linksQuery.data ?? [];
  const orders = (ordersQuery.data ?? []) as unknown as AdminOrder[];
  const current = links.find(link => link.instanceId === instanceId);
  const currentKey = current ? keyFor(current.registrationId, current.subOrderIndex) : "";
  const normalizedSearch = normalizeH2AdsOrderSearch(search);
  const exactCustomerNumber = getExactH2AdsCustomerNumberSearch(search);
  const ownerByOrder = useMemo(() => new Map(links.map(link => [keyFor(link.registrationId, link.subOrderIndex), link.instanceId])), [links]);
  const selectableOrders = useMemo(() => orders.filter(order => {
    const sub = order.subOrderIndex ?? 0;
    const key = keyFor(order.id, sub);
    const active = order.latestStatus !== "pedido_entregue" && order.latestStatus !== "cancelado";
    if (!active && key !== currentKey) return false;
    if (!normalizedSearch || key === currentKey) return true;
    return matchesH2AdsOrderSearch(order, search);
  }).sort((a, b) => (b.orderNumber ?? b.customerNumber ?? b.id) - (a.orderNumber ?? a.customerNumber ?? a.id)), [orders, currentKey, normalizedSearch, search]);

  const searchResults = useMemo(() => {
    if (!normalizedSearch) return [] as AdminOrder[];
    const available = selectableOrders.filter(order => keyFor(order.id, order.subOrderIndex ?? 0) !== currentKey);
    if (exactCustomerNumber !== null) {
      const exact = available.find(order => Number(order.customerNumber) === exactCustomerNumber);
      return exact ? [exact] : [];
    }
    return available.slice(0, 8);
  }, [selectableOrders, currentKey, exactCustomerNumber, normalizedSearch]);

  const update = async (value: string) => {
    if (!value) {
      await setLink.mutateAsync({ instanceId, registrationId: null, subOrderIndex: 0 });
      return;
    }
    const [registrationRaw, subRaw] = value.split(":");
    const registrationId = Number(registrationRaw);
    const subOrderIndex = Number(subRaw);
    if (!Number.isInteger(registrationId) || registrationId < 1 || !Number.isInteger(subOrderIndex) || subOrderIndex < 0) return;
    await setLink.mutateAsync({ instanceId, registrationId, subOrderIndex });
  };

  const currentOrder = current ? orders.find(order => order.id === current.registrationId && (order.subOrderIndex ?? 0) === current.subOrderIndex) : undefined;

  return <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.04] p-3">
    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-200">Pedido vinculado</p><span className="text-[10px] font-bold text-slate-500">Sincronização automática</span></div>
    {current && <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-white/8 bg-black/20 p-2 text-[10px]">
      <div><p className="font-semibold text-slate-500">Pedido</p><p className="mt-0.5 font-black text-white">#{currentOrder?.orderNumber ?? current.registrationId}{current.subOrderIndex > 0 ? ` · item ${current.subOrderIndex + 1}` : ""}</p></div>
      <div><p className="font-semibold text-slate-500">Status do pedido</p><p className="mt-0.5 font-black text-emerald-200">{statusLabel(currentOrder?.latestStatus)}</p></div>
      <div><p className="font-semibold text-slate-500">Produto</p><p className="mt-0.5 truncate font-bold text-slate-200" title={currentOrder?.serviceName || ""}>{currentOrder?.serviceName || "Não informado"}</p></div>
      <div><p className="font-semibold text-slate-500">Opção</p><p className="mt-0.5 truncate font-bold text-slate-200" title={currentOrder?.serviceOption || ""}>{currentOrder?.serviceOption || "Não informada"}</p></div>
    </div>}

    <input
      value={search}
      onChange={event => setSearch(event.target.value)}
      placeholder="Buscar nome, telefone, pedido ou cadastro. Ex.: *451"
      className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs font-bold text-slate-100 outline-none placeholder:text-slate-600"
    />

    {normalizedSearch && <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black/25">
      {searchResults.length === 0 ? <p className="px-3 py-3 text-[11px] font-semibold text-slate-500">Nenhum cliente encontrado para “{search}”.</p> : searchResults.map(order => {
        const subOrderIndex = order.subOrderIndex ?? 0;
        const key = keyFor(order.id, subOrderIndex);
        const owner = ownerByOrder.get(key);
        const unavailable = owner !== undefined && owner !== instanceId;
        const isExactCustomerSearch = exactCustomerNumber !== null;
        if (isExactCustomerSearch) {
          return <button
            key={key}
            type="button"
            disabled={setLink.isPending || unavailable}
            onClick={() => { void update(key); }}
            className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-violet-300/25 bg-violet-400/10">
              {order.customerProfilePhotoUrl ? <img src={order.customerProfilePhotoUrl} alt={order.customerName || "Foto do cliente"} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-sm font-black text-violet-100">{customerInitial(order.customerName)}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black text-violet-200">*{order.customerNumber}</p>
              <p className="mt-0.5 break-words text-xs font-black leading-4 text-white">{order.customerName || "Cliente sem nome"}</p>
            </div>
            {unavailable && <span className="shrink-0 text-[9px] font-black uppercase text-amber-300">já vinculado</span>}
          </button>;
        }
        const displayNumber = order.orderNumber ?? order.customerNumber ?? order.id;
        return <button
          key={key}
          type="button"
          disabled={setLink.isPending || unavailable}
          onClick={() => { void update(key); }}
          className="block w-full border-b border-white/8 px-3 py-2.5 text-left last:border-b-0 hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-black text-white">#{displayNumber} · {order.customerName || "Cliente"}</p>
              <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{[order.phone, order.serviceName, order.serviceOption].filter(Boolean).join(" · ") || "Sem detalhes"}</p>
            </div>
            <span className={`shrink-0 text-[9px] font-black uppercase ${unavailable ? "text-amber-300" : "text-emerald-300"}`}>{unavailable ? "já vinculado" : statusLabel(order.latestStatus)}</span>
          </div>
        </button>;
      })}
    </div>}

    <select value={currentKey} disabled={setLink.isPending || linksQuery.isLoading || ordersQuery.isLoading} onChange={event => { void update(event.target.value); }} className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs font-bold text-slate-100 disabled:opacity-50">
      <option value="">Sem pedido vinculado</option>
      {selectableOrders.map(order => {
        const subOrderIndex = order.subOrderIndex ?? 0;
        const key = keyFor(order.id, subOrderIndex);
        const owner = ownerByOrder.get(key);
        const unavailable = owner !== undefined && owner !== instanceId;
        const detail = [order.serviceName, order.serviceOption].filter(Boolean).join(" · ");
        const displayNumber = order.orderNumber ?? order.customerNumber ?? order.id;
        return <option key={key} value={key} disabled={unavailable}>#{displayNumber} · {order.customerName || "Cliente"}{subOrderIndex > 0 ? ` · item ${subOrderIndex + 1}` : ""}{detail ? ` · ${detail}` : ""}{unavailable ? " · já vinculado" : ""}</option>;
      })}
    </select>
    <p className="mt-2 text-[10px] leading-4 text-slate-500">Código com * é exclusivo: *451 busca somente o cadastro 451. Nas outras buscas, aceita nome, telefone, número do pedido e cadastro. O H2ADS apenas lê os dados do pedido.</p>
  </div>;
}
