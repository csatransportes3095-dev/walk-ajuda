import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type AdminOrder = {
  id: number;
  phone?: string | null;
  subOrderIndex?: number;
  orderNumber?: number | null;
  customerName?: string | null;
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
      toast.success(vars.registrationId === null ? "Vínculo do pedido removido." : "Pedido vinculado à instância.");
      await utils.h2Ads.listOrderLinks.invalidate();
    },
    onError: error => toast.error(error.message || "Não foi possível atualizar o vínculo do pedido."),
  });

  const links = linksQuery.data ?? [];
  const orders = (ordersQuery.data ?? []) as unknown as AdminOrder[];
  const current = links.find(link => link.instanceId === instanceId);
  const currentKey = current ? keyFor(current.registrationId, current.subOrderIndex) : "";
  const normalizedSearch = search.trim().toLowerCase();
  const ownerByOrder = useMemo(() => new Map(links.map(link => [keyFor(link.registrationId, link.subOrderIndex), link.instanceId])), [links]);
  const selectableOrders = useMemo(() => orders.filter(order => {
    const sub = order.subOrderIndex ?? 0;
    const key = keyFor(order.id, sub);
    const active = order.latestStatus !== "pedido_entregue" && order.latestStatus !== "cancelado";
    if (!active && key !== currentKey) return false;
    if (!normalizedSearch || key === currentKey) return true;
    const haystack = [order.orderNumber, order.id, order.customerName, order.phone, order.serviceName, order.serviceOption, order.latestStatus]
      .filter(value => value !== null && value !== undefined)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  }).sort((a, b) => (b.orderNumber ?? b.id) - (a.orderNumber ?? a.id)).slice(0, 80), [orders, currentKey, normalizedSearch]);

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
    <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar pedido, cliente, telefone ou produto" className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs font-bold text-slate-100 outline-none placeholder:text-slate-600" />
    <select value={currentKey} disabled={setLink.isPending || linksQuery.isLoading || ordersQuery.isLoading} onChange={event => { void update(event.target.value); }} className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs font-bold text-slate-100 disabled:opacity-50">
      <option value="">Sem pedido vinculado</option>
      {selectableOrders.map(order => {
        const subOrderIndex = order.subOrderIndex ?? 0;
        const key = keyFor(order.id, subOrderIndex);
        const owner = ownerByOrder.get(key);
        const unavailable = owner !== undefined && owner !== instanceId;
        const detail = [order.serviceName, order.serviceOption].filter(Boolean).join(" · ");
        return <option key={key} value={key} disabled={unavailable}>#{order.orderNumber ?? order.id} · {order.customerName || "Cliente"}{subOrderIndex > 0 ? ` · item ${subOrderIndex + 1}` : ""}{detail ? ` · ${detail}` : ""}{unavailable ? " · já vinculado" : ""}</option>;
      })}
    </select>
    <p className="mt-2 text-[10px] leading-4 text-slate-500">O H2ADS apenas lê os dados do pedido. Alterar o estado da instância não altera o status do pedido.</p>
  </div>;
}
