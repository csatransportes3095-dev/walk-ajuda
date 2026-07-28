import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ToggleLeft, ToggleRight, Copy, Shield, Ticket, Percent, DollarSign, Gift } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";

const whiteInputStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  color: '#000000',
  fontSize: '16px',
  textAlign: 'center' as const,
  border: '2px solid #333',
  borderRadius: '8px',
  padding: '10px 12px',
  width: '100%',
  outline: 'none',
  fontWeight: 500,
};

const whiteSelectStyle: React.CSSProperties = {
  ...whiteInputStyle,
  appearance: 'auto' as const,
};

export default function AdminCoupons() {
  const [newCode, setNewCode] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [discountValue, setDiscountValue] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const couponsQuery = trpc.coupons.list.useQuery(undefined, {
  });

  const createMutation = trpc.coupons.create.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Cupom criado com sucesso!");
        setNewCode("");
        setDiscountValue("");
        setMaxUses("1");
        setExpiresAt("");
        couponsQuery.refetch();
      } else {
        toast.error(result.message || "Erro ao criar cupom");
      }
      setIsCreating(false);
    },
    onError: () => {
      toast.error("Erro ao criar cupom");
      setIsCreating(false);
    },
  });

  const toggleMutation = trpc.coupons.toggle.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      couponsQuery.refetch();
    },
  });

  const deleteMutation = trpc.coupons.delete.useMutation({
    onSuccess: () => {
      toast.success("Cupom excluído!");
      couponsQuery.refetch();
    },
  });

  const generateRandomCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "DESC-";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewCode(code);
  };

  const handleCreate = () => {
    if (!newCode.trim()) {
      toast.error("Digite um código para o cupom");
      return;
    }
    if (!discountValue || Number(discountValue) <= 0) {
      toast.error("Digite um valor de desconto válido");
      return;
    }
    if (discountType === "percentage" && Number(discountValue) > 100) {
      toast.error("Porcentagem não pode ser maior que 100%");
      return;
    }
    setIsCreating(true);
    createMutation.mutate({
      code: newCode,
      discountType,
      discountValue: Number(discountValue),
      maxUses: Number(maxUses) || 1,
      expiresAt: expiresAt || undefined,
    });
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  const formatDiscount = (type: string, value: number) => {
    if (type === "percentage") return `${value}%`;
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  const couponsList = couponsQuery.data || [];

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Cupons" icon={<Ticket className="w-5 h-5" />} />

      <div className="container py-6 px-4 space-y-6">
        {/* Criar Novo Cupom */}
        <div className="bg-black/40 backdrop-blur-md border border-primary/30 rounded-2xl p-4 md:p-6">
          <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Criar Novo Cupom
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-white/70 mb-1">Código do Cupom</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="Ex: DESC-50OFF"
                  style={whiteInputStyle}
                />
                <Button
                  onClick={generateRandomCode}
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap text-black border-primary/30 hover:bg-green-600 flex-shrink-0"
                  style={{ backgroundColor: '#03cc00' }}
                >
                  Gerar
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-white/70 mb-1">Tipo</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "fixed" | "percentage")}
                  style={whiteSelectStyle}
                >
                  <option value="fixed">Valor (R$)</option>
                  <option value="percentage">Porcentagem (%)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">
                  {discountType === "fixed" ? "Valor (R$)" : "Porcentagem (%)"}
                </label>
                <input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === "fixed" ? "Ex: 50" : "Ex: 10"}
                  min="1"
                  max={discountType === "percentage" ? "100" : undefined}
                  style={whiteInputStyle}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-white/70 mb-1">Limite de Usos</label>
                <input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="1"
                  min="1"
                  style={whiteInputStyle}
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Validade (opcional)</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  style={{
                    ...whiteInputStyle,
                    cursor: 'pointer',
                    colorScheme: 'light',
                  }}
                />
              </div>
            </div>
            <Button
              onClick={handleCreate}
              disabled={isCreating || !newCode.trim() || !discountValue}
              className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/80 hover:to-purple-600/80 text-white font-bold py-3"
            >
              {isCreating ? "Criando..." : "Criar Cupom"}
            </Button>
          </div>
        </div>

        {/* Lista de Cupons */}
        <div className="bg-black/40 backdrop-blur-md border border-primary/30 rounded-2xl p-4 md:p-6">
          <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" />
            Cupons ({couponsList.length})
          </h2>

          {couponsQuery.isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            </div>
          ) : couponsList.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              Nenhum cupom criado ainda
            </div>
          ) : (
            <>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-3">
                {couponsList.map((coupon) => (
                  <div key={coupon.id} className="bg-black/30 border border-white/10 rounded-xl p-4 space-y-3">
                    {/* Código + Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono font-bold text-lg">{coupon.code}</span>
                        <button
                          onClick={() => copyToClipboard(coupon.code)}
                          className="text-white/40 hover:text-primary transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${
                          coupon.status === "active"
                            ? "bg-green-500/20 text-green-400"
                            : coupon.status === "used"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {coupon.status === "active" ? "Ativo" : coupon.status === "used" ? "Usado" : "Desativado"}
                      </span>
                    </div>

                    {/* Desconto em destaque */}
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {coupon.discountType === "percentage" ? (
                          <Percent className="w-4 h-4 text-green-400" />
                        ) : (
                          <DollarSign className="w-4 h-4 text-green-400" />
                        )}
                        <span className="text-green-400 font-bold text-lg">
                          {formatDiscount(coupon.discountType, coupon.discountValue)}
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-white/50 text-xs">Usos</span>
                        <p className="text-white/80">{coupon.currentUses || 0}/{coupon.maxUses || 1}</p>
                      </div>
                      <div>
                        <span className="text-white/50 text-xs">Validade</span>
                        <p className="text-white/80">
                          {coupon.expiresAt
                            ? new Date(coupon.expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
                            : "Sem validade"}
                        </p>
                      </div>
                      {coupon.usedBy && (
                        <div className="col-span-2">
                          <span className="text-white/50 text-xs">Usado por</span>
                          <p className="text-white/80">{coupon.usedBy}</p>
                        </div>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex gap-2 pt-1 border-t border-white/5">
                      <button
                        onClick={() =>
                          toggleMutation.mutate({
                            id: coupon.id,
                            status: coupon.status === "active" ? "disabled" : "active",
                          })
                        }
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          coupon.status === "active"
                            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                            : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        }`}
                      >
                        {coupon.status === "active" ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Tem certeza que deseja excluir este cupom?")) {
                            deleteMutation.mutate({ id: coupon.id });
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-sm font-semibold"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Tabela */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Código</th>
                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Desconto</th>
                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Status</th>
                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Usos</th>
                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Validade</th>
                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Usado por</th>
                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {couponsList.map((coupon) => (
                      <tr key={coupon.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-mono font-bold">{coupon.code}</span>
                            <button
                              onClick={() => copyToClipboard(coupon.code)}
                              className="text-white/40 hover:text-primary transition-colors"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            {coupon.discountType === "percentage" ? (
                              <Percent className="w-4 h-4 text-green-400" />
                            ) : (
                              <DollarSign className="w-4 h-4 text-green-400" />
                            )}
                            <span className="text-green-400 font-bold">
                              {formatDiscount(coupon.discountType, coupon.discountValue)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold ${
                              coupon.status === "active"
                                ? "bg-green-500/20 text-green-400"
                                : coupon.status === "used"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {coupon.status === "active" ? "Ativo" : coupon.status === "used" ? "Usado" : "Desativado"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-white/70">
                          {coupon.currentUses || 0}/{coupon.maxUses || 1}
                        </td>
                        <td className="py-3 px-4 text-white/70 text-sm">
                          {coupon.expiresAt
                            ? new Date(coupon.expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
                            : "Sem validade"}
                        </td>
                        <td className="py-3 px-4 text-white/70 text-sm">
                          {coupon.usedBy || "-"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                toggleMutation.mutate({
                                  id: coupon.id,
                                  status: coupon.status === "active" ? "disabled" : "active",
                                })
                              }
                              className={`p-1.5 rounded-lg transition-colors ${
                                coupon.status === "active"
                                  ? "text-green-400 hover:bg-green-500/20"
                                  : "text-red-400 hover:bg-red-500/20"
                              }`}
                              title={coupon.status === "active" ? "Desativar" : "Ativar"}
                            >
                              {coupon.status === "active" ? (
                                <ToggleRight className="w-5 h-5" />
                              ) : (
                                <ToggleLeft className="w-5 h-5" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Tem certeza que deseja excluir este cupom?")) {
                                  deleteMutation.mutate({ id: coupon.id });
                                }
                              }}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div className="bg-black/20 border border-white/10 rounded-xl p-4 text-white/50 text-sm space-y-1">
          <p><strong className="text-white/70">Valor Fixo (R$):</strong> Desconto em reais aplicado diretamente no valor do serviço.</p>
          <p><strong className="text-white/70">Porcentagem (%):</strong> Desconto percentual sobre o valor do serviço.</p>
          <p><strong className="text-white/70">Limite de Usos:</strong> Quantas vezes o cupom pode ser utilizado.</p>
        </div>
      </div>
    </div>
  );
}
