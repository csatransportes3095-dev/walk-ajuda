import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  ShoppingBag, Plus, Edit2, Trash2, Copy, CheckCheck,
  DollarSign, ShoppingCart, Eye, EyeOff, Check, X
} from "lucide-react";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";
import { useAdminAuth } from "@/hooks/useAdminAuth";

function parsePrice(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
}

export default function AdminResellers() {
  const utils = trpc.useUtils();

  const { data: resellers = [], isLoading } = trpc.resellers.adminList.useQuery();
  const { data: products = [] } = trpc.products.listActive.useQuery();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPricesDialog, setShowPricesDialog] = useState(false);
  const [showOrdersDialog, setShowOrdersDialog] = useState(false);
  const [selectedReseller, setSelectedReseller] = useState<typeof resellers[0] | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form state
  const [form, setForm] = useState({ name: "", phone: "", email: "", username: "", password: "", slug: "" });
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", username: "", password: "", slug: "" });

  // Preços de custo por opção para o revendedor selecionado
  const { data: adminPrices = [] } = trpc.resellers.adminGetPrices.useQuery(
    { resellerId: selectedReseller?.id ?? 0 },
    { enabled: !!selectedReseller && showPricesDialog }
  );
  const { data: adminOrders = [] } = trpc.resellers.adminGetOrders.useQuery(
    { resellerId: selectedReseller?.id ?? 0 },
    { enabled: !!selectedReseller && showOrdersDialog }
  );

  const [editingCostPrice, setEditingCostPrice] = useState<number | null>(null);
  const [editCostValue, setEditCostValue] = useState("");

  const createMut = trpc.resellers.adminCreate.useMutation({
    onSuccess: () => {
      utils.resellers.adminList.invalidate();
      setShowCreateDialog(false);
      setForm({ name: "", phone: "", email: "", username: "", password: "", slug: "" });
      toast.success("Revendedor criado com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = trpc.resellers.adminUpdate.useMutation({
    onSuccess: () => {
      utils.resellers.adminList.invalidate();
      setShowEditDialog(false);
      toast.success("Revendedor atualizado!");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = trpc.resellers.adminDelete.useMutation({
    onSuccess: () => {
      utils.resellers.adminList.invalidate();
      toast.success("Revendedor removido!");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMut = trpc.resellers.adminToggle.useMutation({
    onSuccess: () => utils.resellers.adminList.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const setCostPriceMut = trpc.resellers.adminSetCostPrice.useMutation({
    onSuccess: () => {
      utils.resellers.adminGetPrices.invalidate();
      setEditingCostPrice(null);
      toast.success("Preço de custo salvo!");
    },
    onError: (err) => toast.error(err.message),
  });

  const markPaidMut = trpc.resellers.adminMarkCommissionPaid.useMutation({
    onSuccess: () => utils.resellers.adminGetOrders.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    if (!form.name || !form.username || !form.password || !form.slug) {
      toast.error("Preencha nome, usuário, senha e slug");
      return;
    }
    createMut.mutate(form);
  };

  const handleEdit = (r: typeof resellers[0]) => {
    setSelectedReseller(r);
    setEditForm({ name: r.name, phone: r.phone || "", email: r.email || "", username: r.username, password: "", slug: r.slug });
    setShowEditDialog(true);
  };

  const handleUpdate = () => {
    if (!selectedReseller) return;
    const { password, ...rest } = editForm;
    updateMut.mutate({ id: selectedReseller.id, ...rest, ...(password.trim() ? { password: password.trim() } : {}) });
  };

  const handleCopyLink = (slug: string, id: number) => {
    navigator.clipboard.writeText(`${window.location.origin}/r/${slug}`);
    setCopiedSlug(id);
    toast.success("Link copiado!");
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleOpenPrices = (r: typeof resellers[0]) => {
    setSelectedReseller(r);
    setShowPricesDialog(true);
  };

  const handleOpenOrders = (r: typeof resellers[0]) => {
    setSelectedReseller(r);
    setShowOrdersDialog(true);
  };

  const handleSaveCostPrice = (optionId: number) => {
    if (!selectedReseller) return;
    let formatted = editCostValue.trim();
    if (!formatted) { toast.error("Informe o preço"); return; }
    const num = parseFloat(formatted.replace(",", "."));
    if (isNaN(num)) { toast.error("Preço inválido"); return; }
    formatted = `R$ ${num.toFixed(2).replace(".", ",")}`;
    setCostPriceMut.mutate({ resellerId: selectedReseller.id, optionId, costPrice: formatted });
  };

  // Agrupar preços por produto
  const groupedPrices = adminPrices.reduce((acc: Record<string, typeof adminPrices>, p) => {
    const key = p.productName || "Outros";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  // Totais dos pedidos do revendedor selecionado
  const totalRevenue = adminOrders.reduce((s, o) => s + parsePrice(o.salePrice ?? ""), 0);
  const totalCost = adminOrders.reduce((s, o) => s + parsePrice(o.costPrice ?? ""), 0);
  const totalProfit = totalRevenue - totalCost;
  const unpaidProfit = adminOrders.filter(o => !o.commissionPaid).reduce((s, o) => s + (parsePrice(o.salePrice ?? "") - parsePrice(o.costPrice ?? "")), 0);

  useAdminAuth();

  return (
    <div className="min-h-screen bg-gray-900">
      <AdminHeader title="Revendedores" backTo="/admin/orders" />
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl font-bold text-white">Revendedores</h1>
            <Badge variant="outline" className="border-amber-500/40 text-amber-400">
              {resellers.length}
            </Badge>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Revendedor
          </Button>
        </div>

        {/* Lista de revendedores */}
        {isLoading ? (
          <div className="text-gray-400 text-center py-12">Carregando...</div>
        ) : resellers.length === 0 ? (
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="py-12 text-center">
              <ShoppingBag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Nenhum revendedor cadastrado</p>
              <p className="text-gray-500 text-sm mt-1">Clique em "Novo Revendedor" para começar</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {resellers.map((r) => {
              const profit = 0; // calculado ao abrir pedidos
              const unpaid = 0;
              return (
                <Card key={r.id} className={`bg-gray-800 border-gray-700 ${!r.isActive ? "opacity-60" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                        <span className="text-amber-400 font-bold text-sm">{r.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-white">{r.name}</p>
                          <Badge
                            variant="outline"
                            className={r.isActive ? "border-green-500/40 text-green-400 text-xs" : "border-red-500/40 text-red-400 text-xs"}
                          >
                            {r.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">@{r.username} · {r.phone || "sem telefone"}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <code className="text-xs text-gray-300 bg-gray-700 rounded px-2 py-0.5 truncate max-w-[180px]">
                            /r/{r.slug}
                          </code>
                          <button
                            onClick={() => handleCopyLink(r.slug, r.id)}
                            className="text-gray-400 hover:text-amber-400"
                          >
                            {copiedSlug === r.id ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {/* Resumo financeiro */}
                        <div className="flex gap-4 mt-2">
                          <span className="text-xs text-gray-400">
                            <span className="text-white font-medium">—</span> pedidos
                          </span>
                          <span className="text-xs text-gray-400">
                            Lucro: <span className="text-green-400 font-medium">R$ {profit.toFixed(2).replace(".", ",")}</span>
                          </span>
                          {unpaid > 0 && (
                            <span className="text-xs text-yellow-400 font-medium">
                              A pagar: R$ {unpaid.toFixed(2).replace(".", ",")}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Ações */}
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                          onClick={() => handleOpenPrices(r)}
                        >
                          <DollarSign className="w-3 h-3 mr-1" />
                          Preços
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                          onClick={() => handleOpenOrders(r)}
                        >
                          <ShoppingCart className="w-3 h-3 mr-1" />
                          Pedidos
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-gray-400 hover:text-white"
                          onClick={() => handleEdit(r)}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-gray-400 hover:text-yellow-400"
                          onClick={() => toggleMut.mutate({ id: r.id })}
                        >
                          {r.isActive ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                          {r.isActive ? "Desativar" : "Ativar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => {
                            if (confirm(`Remover revendedor "${r.name}"?`)) deleteMut.mutate({ id: r.id });
                          }}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Dialog: Criar revendedor */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Novo Revendedor</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-gray-300 text-sm">Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nome do revendedor" className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Usuário (login) *</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                  placeholder="ex: rafael" className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Senha *</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Senha de acesso"
                    className="bg-gray-700 border-gray-600 text-white mt-1 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white mt-0.5"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Slug (URL) *</Label>
                <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s/g, '-') }))}
                  placeholder="ex: rafael (aparece em /r/rafael)" className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Telefone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                  placeholder="11999999999" className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">E-mail</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com" className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => setShowCreateDialog(false)} className="text-gray-400">Cancelar</Button>
              <Button onClick={handleCreate} disabled={createMut.isPending} className="bg-amber-500 hover:bg-amber-600 text-black">
                {createMut.isPending ? "Criando..." : "Criar Revendedor"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Editar revendedor */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Editar Revendedor</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-gray-300 text-sm">Nome</Label>
                <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Usuário</Label>
                <Input value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                  className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Nova Senha (deixe em branco para manter)</Label>
                <Input type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Nova senha (opcional)" className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Slug</Label>
                <Input value={editForm.slug} onChange={e => setEditForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s/g, '-') }))}
                  className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Telefone</Label>
                <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                  className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">E-mail</Label>
                <Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="bg-gray-700 border-gray-600 text-white mt-1" />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => setShowEditDialog(false)} className="text-gray-400">Cancelar</Button>
              <Button onClick={handleUpdate} disabled={updateMut.isPending} className="bg-amber-500 hover:bg-amber-600 text-black">
                {updateMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Preços de custo */}
        <Dialog open={showPricesDialog} onOpenChange={(open) => { if (!open) { setEditingCostPrice(null); } setShowPricesDialog(open); }}>
          <DialogContent className="bg-gray-800 border-gray-700 text-white w-[96vw] max-w-xl flex flex-col" style={{maxHeight: '85vh'}}>
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-white">
                Preços — {selectedReseller?.name}
              </DialogTitle>
              <p className="text-xs text-gray-400">
                Defina o preço de custo (o que o revendedor paga a você). O revendedor define o preço de venda.
              </p>
            </DialogHeader>
            <div className="space-y-4 mt-2 overflow-y-auto flex-1 pr-1">
              {Object.keys(groupedPrices).length === 0 ? (
                <p className="text-gray-400 text-center py-4">Nenhum produto disponível</p>
              ) : (
                Object.entries(groupedPrices).map(([productName, opts]) => (
                  <div key={productName}>
                    <p className="text-sm font-semibold text-amber-400 mb-2">{productName}</p>
                    <div className="space-y-2">
                      {opts.map((opt) => (
                        <div key={opt.optionId} className="bg-gray-700/50 rounded-lg p-3">
                          <div className="mb-2">
                            <p className="text-sm text-white font-medium">{opt.optionLabel}</p>
                            <p className="text-xs text-gray-400">Preço padrão: {opt.defaultPrice}</p>
                          </div>
                          {editingCostPrice === opt.optionId ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editCostValue}
                                onChange={e => setEditCostValue(e.target.value)}
                                placeholder="Ex: 50,00"
                                className="flex-1 h-10 text-base bg-gray-600 border-gray-400 text-white placeholder-gray-400"
                                autoFocus
                                inputMode="decimal"
                                onKeyDown={e => {
                                  if (e.key === "Enter") handleSaveCostPrice(opt.optionId);
                                  if (e.key === "Escape") setEditingCostPrice(null);
                                }}
                              />
                              <Button size="icon" className="h-10 w-10 flex-shrink-0 bg-green-600 hover:bg-green-700"
                                onClick={() => handleSaveCostPrice(opt.optionId)} disabled={setCostPriceMut.isPending}>
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-10 w-10 flex-shrink-0 text-gray-400"
                                onClick={() => setEditingCostPrice(null)}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className={`text-sm font-semibold ${opt.costPrice ? "text-blue-400" : "text-gray-500"}`}>
                                {opt.costPrice || "Não definido"}
                              </span>
                              <Button size="sm" variant="ghost" className="h-8 text-gray-400 hover:text-amber-400 gap-1"
                                onClick={() => { setEditingCostPrice(opt.optionId); setEditCostValue(opt.costPrice ? opt.costPrice.replace('R$ ', '').replace('.', '') : ""); }}>
                                <Edit2 className="w-3 h-3" /> Editar
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: Pedidos do revendedor */}
        <Dialog open={showOrdersDialog} onOpenChange={setShowOrdersDialog}>
          <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">
                Pedidos — {selectedReseller?.name}
              </DialogTitle>
            </DialogHeader>
            {/* Resumo financeiro */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="bg-gray-700 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-white">{adminOrders.length}</p>
                <p className="text-xs text-gray-400">Pedidos</p>
              </div>
              <div className="bg-gray-700 rounded-lg p-3 text-center">
                <p className="text-sm font-bold text-green-400">R$ {totalProfit.toFixed(2).replace(".", ",")}</p>
                <p className="text-xs text-gray-400">Lucro total</p>
              </div>
              <div className="bg-gray-700 rounded-lg p-3 text-center">
                <p className="text-sm font-bold text-yellow-400">R$ {unpaidProfit.toFixed(2).replace(".", ",")}</p>
                <p className="text-xs text-gray-400">A pagar</p>
              </div>
            </div>
            <div className="space-y-2 mt-3">
              {adminOrders.length === 0 ? (
                <p className="text-gray-400 text-center py-4">Nenhum pedido ainda</p>
              ) : (
                adminOrders.map((order) => {
                  const profit = parsePrice(order.salePrice) - parsePrice(order.costPrice);
                  return (
                    <div key={order.id} className="flex items-center gap-3 bg-gray-700/50 rounded-lg p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300 font-mono">{order.customerPhone}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Venda: {order.salePrice} · Custo: {order.costPrice}
                          {profit > 0 && <span className="text-green-400"> · Lucro: R$ {profit.toFixed(2).replace(".", ",")}</span>}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={order.commissionPaid ? "outline" : "default"}
                        className={order.commissionPaid
                          ? "h-7 text-xs border-green-500/40 text-green-400"
                          : "h-7 text-xs bg-yellow-500 hover:bg-yellow-600 text-black"}
                        onClick={() => !order.commissionPaid && markPaidMut.mutate({ orderId: order.id })}
                        disabled={!!order.commissionPaid || markPaidMut.isPending}
                      >
                        {order.commissionPaid ? "✓ Pago" : "Marcar pago"}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
