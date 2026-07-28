import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShoppingBag, LogOut, DollarSign, ShoppingCart, Link2,
  TrendingUp, Edit2, Check, X, Copy, CheckCheck, Shield,
  AlertCircle, Package, Layers
} from "lucide-react";
import { toast } from "sonner";

// Helper para parsear preço "R$ 1.200,00" → número
function parsePrice(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
}

function formatPrice(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

// Formata garantia: "25 corridas", "7 dias", "1 mês", etc.
function formatWarranty(type: string, value: number, label: string | null): string {
  if (type === "livre" && label) return label;
  const typeLabel: Record<string, string> = {
    corridas: value === 1 ? "corrida" : "corridas",
    dias: value === 1 ? "dia" : "dias",
    semanas: value === 1 ? "semana" : "semanas",
    meses: value === 1 ? "mês" : "meses",
    anos: value === 1 ? "ano" : "anos",
    livre: "livre",
  };
  const suffix = label ? ` ${label}` : "";
  return `${value} ${typeLabel[type] ?? type}${suffix}`;
}

type PriceItem = {
  optionId: number;
  optionLabel: string;
  optionDescription: string | null;
  productId: number;
  productName: string;
  costPrice: string | null;
  salePrice: string | null;
  warrantyTiers: { warrantyType: string; warrantyValue: number; warrantyLabel: string | null }[];
};

export default function ResellerDashboard() {
  const [, navigate] = useLocation();
  const [editingOption, setEditingOption] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const utils = trpc.useUtils();

  const { data: me, isLoading: meLoading, error: meError } = trpc.resellers.me.useQuery(undefined, {
    retry: 1,
    retryDelay: 500,
  });

  const { data: rawPrices = [], isLoading: pricesLoading } = trpc.resellers.myPrices.useQuery(
    undefined, { enabled: !!me }
  );
  const prices = rawPrices as PriceItem[];

  const { data: orders = [], isLoading: ordersLoading } = trpc.resellers.myOrders.useQuery(
    undefined, { enabled: !!me }
  );

  useEffect(() => {
    if (!meLoading && meError) {
      navigate("/revendedor");
    }
  }, [meLoading, meError, navigate]);

  const logoutMut = trpc.resellers.logout.useMutation({
    onSuccess: () => {
      utils.resellers.check.invalidate();
      navigate("/revendedor");
    },
  });

  const updatePriceMut = trpc.resellers.updatePrice.useMutation({
    onSuccess: () => {
      utils.resellers.myPrices.invalidate();
      setEditingOption(null);
      toast.success("Preço atualizado!");
    },
    onError: (err) => toast.error(err.message),
  });

  if (meLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Carregando...</div>
      </div>
    );
  }

  if (!me) {
    navigate("/revendedor");
    return null;
  }

  const resellerLink = `${window.location.origin}/r/${me.slug}`;

  // Calcular totais de pedidos
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + parsePrice(o.salePrice), 0);
  const totalCost = orders.reduce((sum, o) => sum + parsePrice(o.costPrice), 0);
  const totalProfit = totalRevenue - totalCost;

  // Resumo de preços definidos
  const totalOptions = prices.length;
  const definedPrices = prices.filter(p => p.salePrice && p.salePrice.trim() !== "").length;

  // Agrupar por produto (usando productId para garantir agrupamento correto)
  const groupedMap = new Map<string, PriceItem[]>();
  for (const p of prices) {
    const key = p.productName || "Outros Serviços";
    if (!groupedMap.has(key)) groupedMap.set(key, []);
    groupedMap.get(key)!.push(p);
  }
  const grouped = Array.from(groupedMap.entries());

  const handleCopyLink = () => {
    navigator.clipboard.writeText(resellerLink);
    setCopiedLink(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleStartEdit = (optionId: number, currentPrice: string | null) => {
    setEditingOption(optionId);
    setEditPrice(currentPrice || "");
  };

  const handleSavePrice = (optionId: number) => {
    if (!editPrice.trim()) {
      toast.error("Informe o preço de venda");
      return;
    }
    let formatted = editPrice.trim();
    if (!formatted.startsWith("R$")) {
      const num = parseFloat(formatted.replace(",", "."));
      if (isNaN(num)) { toast.error("Preço inválido"); return; }
      formatted = `R$ ${num.toFixed(2).replace(".", ",")}`;
    }
    updatePriceMut.mutate({ optionId, salePrice: formatted });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">{me.name}</p>
            <p className="text-xs text-gray-400">Painel do Revendedor</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logoutMut.mutate()}
          className="text-gray-400 hover:text-red-400"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Link do revendedor */}
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 font-semibold text-sm">Seu link de vendas</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm text-gray-200 truncate">
                {resellerLink}
              </code>
              <Button
                size="sm"
                onClick={handleCopyLink}
                className="bg-amber-500 hover:bg-amber-600 text-black shrink-0"
              >
                {copiedLink ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Compartilhe este link com seus clientes. Os preços que você definir aparecerão automaticamente.
            </p>
          </CardContent>
        </Card>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 text-center">
              <ShoppingCart className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{totalOrders}</p>
              <p className="text-xs text-gray-400">Pedidos</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 text-center">
              <DollarSign className="w-5 h-5 text-green-400 mx-auto mb-1" />
              <p className="text-base font-bold text-white">
                {formatPrice(totalRevenue)}
              </p>
              <p className="text-xs text-gray-400">Faturado</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <p className="text-base font-bold text-amber-400">
                {formatPrice(totalProfit)}
              </p>
              <p className="text-xs text-gray-400">Lucro Total</p>
            </CardContent>
          </Card>
          <Card className={`border ${definedPrices < totalOptions ? "bg-red-500/10 border-red-500/30" : "bg-green-500/10 border-green-500/30"}`}>
            <CardContent className="p-4 text-center">
              <Layers className={`w-5 h-5 mx-auto mb-1 ${definedPrices < totalOptions ? "text-red-400" : "text-green-400"}`} />
              <p className={`text-2xl font-bold ${definedPrices < totalOptions ? "text-red-400" : "text-green-400"}`}>
                {definedPrices}/{totalOptions}
              </p>
              <p className="text-xs text-gray-400">Preços Definidos</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="prices">
          <TabsList className="bg-gray-800 border border-gray-700 w-full">
            <TabsTrigger value="prices" className="flex-1 data-[state=active]:bg-amber-500 data-[state=active]:text-black">
              Meus Preços
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex-1 data-[state=active]:bg-amber-500 data-[state=active]:text-black">
              Meus Pedidos
            </TabsTrigger>
          </TabsList>

          {/* Aba de Preços */}
          <TabsContent value="prices" className="space-y-4 mt-4">
            {definedPrices < totalOptions && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-300">
                  Você tem <strong>{totalOptions - definedPrices} opção(ões)</strong> sem preço definido. Seus clientes não verão o preço até você configurar.
                </p>
              </div>
            )}

            {pricesLoading ? (
              <div className="text-gray-400 text-center py-8">Carregando...</div>
            ) : grouped.length === 0 ? (
              <div className="text-gray-400 text-center py-8">Nenhum produto disponível</div>
            ) : (
              grouped.map(([productName, opts]) => (
                <Card key={productName} className="bg-gray-800 border-gray-700 overflow-hidden">
                  <CardHeader className="pb-2 pt-4 px-4 bg-gray-750 border-b border-gray-700">
                    <CardTitle className="text-base text-white flex items-center gap-2">
                      <Package className="w-4 h-4 text-amber-400" />
                      {productName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-3 space-y-3">
                    {opts.map((opt) => {
                      const cost = parsePrice(opt.costPrice);
                      const sale = parsePrice(opt.salePrice);
                      const profit = sale - cost;
                      const hasPrice = !!(opt.salePrice && opt.salePrice.trim() !== "");
                      const isEditing = editingOption === opt.optionId;

                      return (
                        <div
                          key={opt.optionId}
                          className={`rounded-lg border transition-colors ${
                            isEditing
                              ? "bg-amber-500/10 border-amber-500/40"
                              : hasPrice
                              ? "bg-gray-700/40 border-gray-600/50"
                              : "bg-red-500/5 border-red-500/30"
                          }`}
                        >
                          {/* Linha principal */}
                          <div className="flex items-center gap-3 p-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm text-white font-medium">{opt.optionLabel}</p>
                                {!hasPrice && (
                                  <Badge className="bg-red-500/20 text-red-400 border-red-500/40 text-xs px-1.5 py-0">
                                    Definir preço
                                  </Badge>
                                )}
                              </div>
                              {opt.optionDescription && (
                                <p className="text-xs text-gray-400 mt-0.5 truncate">{opt.optionDescription}</p>
                              )}
                            </div>

                            {/* Área de edição / exibição de preço */}
                            {isEditing ? (
                              <div className="flex items-center gap-2 shrink-0">
                                <Input
                                  value={editPrice}
                                  onChange={e => setEditPrice(e.target.value)}
                                  placeholder="Ex: 80,00"
                                  className="w-28 h-8 text-sm bg-gray-600 border-gray-500 text-white"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleSavePrice(opt.optionId);
                                    if (e.key === "Escape") setEditingOption(null);
                                  }}
                                />
                                <Button
                                  size="icon"
                                  className="h-8 w-8 bg-green-600 hover:bg-green-700 shrink-0"
                                  onClick={() => handleSavePrice(opt.optionId)}
                                  disabled={updatePriceMut.isPending}
                                >
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-gray-400 shrink-0"
                                  onClick={() => setEditingOption(null)}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-sm font-semibold ${hasPrice ? "text-green-400" : "text-gray-500"}`}>
                                  {opt.salePrice || "—"}
                                </span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-gray-400 hover:text-amber-400"
                                  onClick={() => handleStartEdit(opt.optionId, opt.salePrice)}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Linha de detalhes: custo + garantia + lucro */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-3 border-t border-gray-700/50 pt-2">
                            {/* Custo */}
                            {opt.costPrice && (
                              <span className="text-xs text-gray-400">
                                Custo: <span className="text-gray-300">{opt.costPrice}</span>
                              </span>
                            )}

                            {/* Garantia */}
                            {opt.warrantyTiers.length > 0 && (
                              <span className="flex items-center gap-1 text-xs text-blue-300">
                                <Shield className="w-3 h-3 text-blue-400" />
                                {opt.warrantyTiers.map((t, i) => (
                                  <span key={i}>
                                    {i > 0 && <span className="text-gray-500"> ou </span>}
                                    {formatWarranty(t.warrantyType, t.warrantyValue, t.warrantyLabel)}
                                  </span>
                                ))}
                              </span>
                            )}

                            {/* Lucro estimado */}
                            {hasPrice && cost > 0 && (
                              <span className={`text-xs font-semibold ml-auto ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {profit >= 0 ? "+" : ""}{formatPrice(profit)} lucro
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Aba de Pedidos */}
          <TabsContent value="orders" className="mt-4">
            {ordersLoading ? (
              <div className="text-gray-400 text-center py-8">Carregando...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingCart className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Nenhum pedido ainda</p>
                <p className="text-gray-500 text-sm mt-1">Compartilhe seu link para começar a vender</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => {
                  const profit = parsePrice(order.salePrice) - parsePrice(order.costPrice);
                  return (
                    <Card key={order.id} className="bg-gray-800 border-gray-700">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-300 font-mono">{order.customerPhone}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(order.createdAt).toLocaleDateString("pt-BR", {
                                day: "2-digit", month: "2-digit", year: "numeric",
                                hour: "2-digit", minute: "2-digit"
                              })}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-white">{order.salePrice}</p>
                            {profit > 0 && (
                              <p className="text-xs text-green-400">+{formatPrice(profit)} lucro</p>
                            )}
                            <Badge
                              variant="outline"
                              className={order.commissionPaid
                                ? "border-green-500/40 text-green-400 text-xs mt-1"
                                : "border-yellow-500/40 text-yellow-400 text-xs mt-1"}
                            >
                              {order.commissionPaid ? "✓ Pago" : "⏳ Pendente"}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
