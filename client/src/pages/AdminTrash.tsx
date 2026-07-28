import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Trash2, RotateCcw, User, ShoppingBag, AlertTriangle, RefreshCw, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Tab = "customers" | "orders";

export default function AdminTrash() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("customers");
  const [confirmDelete, setConfirmDelete] = useState<{ type: "customer" | "order"; id: number; registrationId?: number; name: string } | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<{ type: "customer" | "order"; count: number } | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [selectedCustomers, setSelectedCustomers] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Queries
  const deletedCustomers = trpc.customers.listDeleted.useQuery();
  const deletedOrders = trpc.orderStatus.listDeletedOrders.useQuery();

  const utils = trpc.useUtils();

  // Mutations - clientes
  const restoreCustomer = trpc.customers.restore.useMutation({
    onSuccess: () => {
      toast.success("Cliente restaurado com sucesso!");
      utils.customers.listDeleted.invalidate();
      utils.customers.list.invalidate();
    },
    onError: () => toast.error("Erro ao restaurar cliente"),
  });

  const permanentlyDeleteCustomer = trpc.customers.permanentlyDelete.useMutation({
    onSuccess: () => {
      toast.success("Cliente excluído permanentemente.");
      setConfirmDelete(null);
      utils.customers.listDeleted.invalidate();
    },
    onError: () => toast.error("Erro ao excluir permanentemente"),
  });

  // Mutations - pedidos
  const restoreOrder = trpc.orderStatus.restoreDeletedOrder.useMutation({
    onSuccess: () => {
      toast.success("Pedido restaurado com sucesso!");
      utils.orderStatus.listDeletedOrders.invalidate();
    },
    onError: () => toast.error("Erro ao restaurar pedido"),
  });

  const permanentlyDeleteOrder = trpc.orderStatus.permanentlyDeleteOrder.useMutation({
    onSuccess: () => {
      toast.success("Pedido excluído permanentemente.");
      setConfirmDelete(null);
      utils.orderStatus.listDeletedOrders.invalidate();
    },
    onError: () => toast.error("Erro ao excluir permanentemente"),
  });

  function formatDate(dateStr: string | Date | null) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("pt-BR");
  }

  const customerCount = deletedCustomers.data?.length ?? 0;
  const orderCount = deletedOrders.data?.length ?? 0;

  // Toggle seleção de cliente
  function toggleCustomer(id: number) {
    const s = new Set(selectedCustomers);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedCustomers(s);
  }

  // Toggle seleção de pedido
  function toggleOrder(id: number) {
    const s = new Set(selectedOrders);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedOrders(s);
  }

  // Excluir clientes selecionados em massa
  async function bulkDeleteCustomers() {
    setBulkDeleting(true);
    let success = 0;
    for (const id of Array.from(selectedCustomers)) {
      try {
        await permanentlyDeleteCustomer.mutateAsync({ id });
        success++;
      } catch { /* continua */ }
    }
    setSelectedCustomers(new Set());
    setConfirmBulkDelete(null);
    setBulkDeleting(false);
    toast.success(`${success} cliente(s) excluído(s) permanentemente.`);
    utils.customers.listDeleted.invalidate();
  }

  // Excluir pedidos selecionados em massa
  async function bulkDeleteOrders() {
    setBulkDeleting(true);
    let success = 0;
    for (const id of Array.from(selectedOrders)) {
      const order = deletedOrders.data?.find(o => o.id === id);
      if (order) {
        try {
          await permanentlyDeleteOrder.mutateAsync({ id: order.id, registrationId: order.registrationId });
          success++;
        } catch { /* continua */ }
      }
    }
    setSelectedOrders(new Set());
    setConfirmBulkDelete(null);
    setBulkDeleting(false);
    toast.success(`${success} pedido(s) excluído(s) permanentemente.`);
    utils.orderStatus.listDeletedOrders.invalidate();
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <button onClick={() => navigate("/admin/customers")} className="text-white/60 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <Trash2 size={20} className="text-red-400" />
        <h1 className="text-lg font-bold">Lixeira</h1>
        <span className="ml-auto text-xs text-white/40">Itens ficam 30 dias antes de serem removidos</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => { setActiveTab("customers"); setSelectedCustomers(new Set()); }}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${activeTab === "customers" ? "border-b-2 border-red-400 text-white" : "text-white/50 hover:text-white"}`}
        >
          <User size={14} />
          Clientes
          {customerCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{customerCount}</span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab("orders"); setSelectedOrders(new Set()); }}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${activeTab === "orders" ? "border-b-2 border-red-400 text-white" : "text-white/50 hover:text-white"}`}
        >
          <ShoppingBag size={14} />
          Pedidos
          {orderCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{orderCount}</span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-w-3xl mx-auto">

        {/* ── Clientes excluídos ── */}
        {activeTab === "customers" && (
          <div className="space-y-3">
            {/* Barra de ação em massa */}
            {customerCount > 0 && (
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-blue-400 border-blue-400/30 hover:bg-blue-400/10 gap-1.5"
                  onClick={() => {
                    if (selectedCustomers.size === customerCount) {
                      setSelectedCustomers(new Set());
                    } else {
                      setSelectedCustomers(new Set(deletedCustomers.data?.map(c => c.id) || []));
                    }
                  }}
                >
                  {selectedCustomers.size === customerCount && customerCount > 0
                    ? <><CheckSquare size={14} /> Desselecionar Tudo</>
                    : <><Square size={14} /> Selecionar Tudo</>
                  }
                </Button>
                {selectedCustomers.size > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-400 border-red-400/30 hover:bg-red-400/10 gap-1.5"
                    onClick={() => setConfirmBulkDelete({ type: "customer", count: selectedCustomers.size })}
                  >
                    <Trash2 size={14} /> Excluir {selectedCustomers.size} Selecionado(s)
                  </Button>
                )}
                {selectedCustomers.size > 0 && (
                  <span className="text-xs text-white/40 ml-1">{selectedCustomers.size} de {customerCount} selecionado(s)</span>
                )}
              </div>
            )}

            {deletedCustomers.isLoading && (
              <div className="flex items-center justify-center py-12 text-white/40">
                <RefreshCw size={20} className="animate-spin mr-2" /> Carregando...
              </div>
            )}
            {!deletedCustomers.isLoading && customerCount === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-white/30">
                <Trash2 size={40} className="mb-3 opacity-30" />
                <p className="text-sm">Nenhum cliente na lixeira</p>
              </div>
            )}
            {deletedCustomers.data?.map((customer) => {
              const isSelected = selectedCustomers.has(customer.id);
              return (
                <div
                  key={customer.id}
                  className={`bg-white/5 border rounded-xl p-4 flex items-start gap-4 cursor-pointer transition-colors ${
                    isSelected ? "border-blue-400/50 bg-blue-400/5" : "border-white/10 hover:border-white/20"
                  }`}
                  onClick={() => toggleCustomer(customer.id)}
                >
                  {/* Checkbox / Avatar */}
                  <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden flex-shrink-0 relative">
                    {isSelected ? (
                      <div className="w-full h-full flex items-center justify-center bg-blue-500/30">
                        <CheckSquare size={22} className="text-blue-400" />
                      </div>
                    ) : customer.profilePhotoUrl ? (
                      <img src={customer.profilePhotoUrl} alt={customer.name} className="w-full h-full object-cover opacity-60" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/30">
                        <User size={20} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white/80">{customer.name}</span>
                      {customer.customerNumber && (
                        <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-white/50">#{customer.customerNumber}</span>
                      )}
                    </div>
                    <div className="text-sm text-white/50 mt-0.5">{customer.phone}</div>
                    {customer.city && <div className="text-xs text-white/30">{customer.city}{customer.uf ? ` - ${customer.uf}` : ""}</div>}
                    <div className="text-xs text-red-400/70 mt-1">
                      Excluído em {formatDate(customer.deletedAt)}
                      {customer.deletedReason && ` · ${customer.deletedReason}`}
                    </div>
                  </div>

                  {/* Ações individuais */}
                  <div className="flex flex-col gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-400 border-green-400/30 hover:bg-green-400/10 text-xs gap-1"
                      onClick={() => restoreCustomer.mutate({ id: customer.id })}
                      disabled={restoreCustomer.isPending}
                    >
                      <RotateCcw size={12} /> Restaurar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-400 border-red-400/30 hover:bg-red-400/10 text-xs gap-1"
                      onClick={() => setConfirmDelete({ type: "customer", id: customer.id, name: customer.name })}
                    >
                      <Trash2 size={12} /> Excluir
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pedidos excluídos ── */}
        {activeTab === "orders" && (
          <div className="space-y-3">
            {/* Barra de ação em massa */}
            {orderCount > 0 && (
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-blue-400 border-blue-400/30 hover:bg-blue-400/10 gap-1.5"
                  onClick={() => {
                    if (selectedOrders.size === orderCount) {
                      setSelectedOrders(new Set());
                    } else {
                      setSelectedOrders(new Set(deletedOrders.data?.map(o => o.id) || []));
                    }
                  }}
                >
                  {selectedOrders.size === orderCount && orderCount > 0
                    ? <><CheckSquare size={14} /> Desselecionar Tudo</>
                    : <><Square size={14} /> Selecionar Tudo</>
                  }
                </Button>
                {selectedOrders.size > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-400 border-red-400/30 hover:bg-red-400/10 gap-1.5"
                    onClick={() => setConfirmBulkDelete({ type: "order", count: selectedOrders.size })}
                  >
                    <Trash2 size={14} /> Excluir {selectedOrders.size} Selecionado(s)
                  </Button>
                )}
                {selectedOrders.size > 0 && (
                  <span className="text-xs text-white/40 ml-1">{selectedOrders.size} de {orderCount} selecionado(s)</span>
                )}
              </div>
            )}

            {deletedOrders.isLoading && (
              <div className="flex items-center justify-center py-12 text-white/40">
                <RefreshCw size={20} className="animate-spin mr-2" /> Carregando...
              </div>
            )}
            {!deletedOrders.isLoading && orderCount === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-white/30">
                <Trash2 size={40} className="mb-3 opacity-30" />
                <p className="text-sm">Nenhum pedido na lixeira</p>
              </div>
            )}
            {deletedOrders.data?.map((order) => {
              const isSelected = selectedOrders.has(order.id);
              return (
                <div
                  key={order.id}
                  className={`bg-white/5 border rounded-xl p-4 flex items-start gap-4 cursor-pointer transition-colors ${
                    isSelected ? "border-blue-400/50 bg-blue-400/5" : "border-white/10 hover:border-white/20"
                  }`}
                  onClick={() => toggleOrder(order.id)}
                >
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    {isSelected ? (
                      <div className="w-full h-full rounded-full bg-blue-500/30 flex items-center justify-center">
                        <CheckSquare size={18} className="text-blue-400" />
                      </div>
                    ) : (
                      <ShoppingBag size={16} className="text-white/40" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white/80 text-sm">
                      {order.customerName || "Cliente desconhecido"}
                    </div>
                    <div className="text-xs text-white/50">{order.customerPhone || "—"}</div>
                    {order.serviceName && (
                      <div className="text-xs text-blue-400/70 mt-0.5">{order.serviceName}</div>
                    )}
                    <div className="text-xs text-white/30 mt-0.5">Pedido #{order.registrationId}</div>
                    <div className="text-xs text-red-400/70 mt-1">
                      Excluído em {formatDate(order.hiddenAt)}
                      {order.deletedReason && ` · ${order.deletedReason}`}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-400 border-green-400/30 hover:bg-green-400/10 text-xs gap-1"
                      onClick={() => restoreOrder.mutate({ id: order.id })}
                      disabled={restoreOrder.isPending}
                    >
                      <RotateCcw size={12} /> Restaurar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-400 border-red-400/30 hover:bg-red-400/10 text-xs gap-1"
                      onClick={() => setConfirmDelete({ type: "order", id: order.id, registrationId: order.registrationId, name: order.customerName || "Pedido" })}
                    >
                      <Trash2 size={12} /> Excluir
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal confirmação exclusão individual */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13131f] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Excluir permanentemente?</h3>
                <p className="text-xs text-white/50">Esta ação não pode ser desfeita</p>
              </div>
            </div>
            <p className="text-sm text-white/70 mb-6">
              <span className="font-semibold text-white">{confirmDelete.name}</span> será excluído permanentemente do sistema. Todos os dados serão perdidos para sempre.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-white/20 text-white/70"
                onClick={() => setConfirmDelete(null)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  if (confirmDelete.type === "customer") {
                    permanentlyDeleteCustomer.mutate({ id: confirmDelete.id });
                  } else {
                    permanentlyDeleteOrder.mutate({ id: confirmDelete.id, registrationId: confirmDelete.registrationId! });
                  }
                }}
                disabled={permanentlyDeleteCustomer.isPending || permanentlyDeleteOrder.isPending}
              >
                Excluir para sempre
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmação exclusão em massa */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13131f] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Excluir {confirmBulkDelete.count} {confirmBulkDelete.type === "customer" ? "cliente(s)" : "pedido(s)"}?</h3>
                <p className="text-xs text-white/50">Esta ação não pode ser desfeita</p>
              </div>
            </div>
            <p className="text-sm text-white/70 mb-6">
              Todos os <span className="font-semibold text-white">{confirmBulkDelete.count} {confirmBulkDelete.type === "customer" ? "clientes" : "pedidos"}</span> selecionados serão excluídos permanentemente do sistema. Esta ação é irreversível.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-white/20 text-white/70"
                onClick={() => setConfirmBulkDelete(null)}
                disabled={bulkDeleting}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2"
                onClick={() => {
                  if (confirmBulkDelete.type === "customer") {
                    bulkDeleteCustomers();
                  } else {
                    bulkDeleteOrders();
                  }
                }}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? <><RefreshCw size={14} className="animate-spin" /> Excluindo...</> : "Excluir tudo"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
