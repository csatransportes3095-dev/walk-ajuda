import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { calculateGlobalPromotionPrice, globalPromotionLabel } from "@shared/globalPromotion";
import AdminHeader from "@/components/AdminHeader";

export default function AdminGlobalPromotion() {
  const utils = trpc.useUtils();
  const query = trpc.globalPromotion.get.useQuery(undefined, { refetchOnWindowFocus: true });
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("10");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!query.data || ready) return;
    setType(query.data.type);
    setValue(String(query.data.value));
    setReady(true);
  }, [query.data, ready]);
  const save = trpc.globalPromotion.save.useMutation({
    onSuccess: () => { void utils.globalPromotion.get.invalidate(); toast.success("Configuração da promoção salva."); },
    onError: e => toast.error(e.message),
  });
  const amount = Number(value.replace(",", "."));
  const valid = Number.isFinite(amount) && amount > 0 && (type !== "percentage" || amount <= 100) && amount <= 100000;
  const current = query.data;
  const draft = { active: true, type, value: amount, revision: "preview", updatedAt: null };
  const preview = valid ? calculateGlobalPromotionPrice({ price: "400,00", originalPrice: "500,00" }, draft) : null;
  return <div className="min-h-screen bg-[#090b19] text-white">
    <AdminHeader title="Promoção Geral" />
    <main className="mx-auto max-w-3xl p-4 sm:p-8 space-y-5">
      <Link href="/admin/codes" className="text-sm text-violet-300">← Voltar ao ADM</Link>
      <h1 className="text-2xl font-black">🏷️ PROMOÇÃO GERAL DO SITE</h1>
      <p className="text-sm text-slate-300">Um clique ativa ou desativa o desconto em todos os preços dos produtos e suas opções. Os preços cadastrados continuam intactos.</p>
      <div className="rounded-xl border border-violet-400/30 bg-slate-900 p-5 space-y-4">
        <p className={current?.active ? "font-bold text-emerald-400" : "font-bold text-slate-300"}>Situação atual: {current?.active ? "ATIVA" : "DESATIVADA"}</p>
        {current?.active && <p className="text-amber-300 font-semibold">{globalPromotionLabel(current)}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">Tipo de desconto
            <select value={type} onChange={e => setType(e.target.value as "percentage" | "fixed")} className="mt-2 w-full rounded-lg bg-white p-3 text-black">
              <option value="percentage">Porcentagem (%)</option>
              <option value="fixed">Valor fixo em cada item (R$)</option>
            </select>
          </label>
          <label className="text-sm">Valor
            <input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" className="mt-2 w-full rounded-lg bg-white p-3 text-black" placeholder={type === "percentage" ? "Ex.: 20" : "Ex.: 50,00"} />
          </label>
        </div>
        <div className="rounded-lg bg-black/30 p-4 text-sm">
          <p className="font-bold">Exemplo demonstrativo</p>
          <p>Preço original: R$ 500,00 · preço promocional anterior: R$ 400,00</p>
          <p className="text-emerald-300 font-bold">Com a nova regra: {preview ? preview.final : "Informe um valor válido"}</p>
        </div>
        <p className="text-xs text-amber-200">Enquanto ativa, ignora descontos VIP, cupons, revendedor e promoções individuais no preço final. Restrições de acesso VIP continuam valendo. Desconto fixo é por item, não por carrinho. Pedidos já registrados não mudam.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" disabled={!valid || save.isPending || query.isLoading} onClick={() => { if (window.confirm("Ativar desconto geral em TODO o site? Os outros descontos não serão acumulados.")) save.mutate({ active: true, type, value: amount }); }} className="flex-1 rounded-lg bg-emerald-600 disabled:opacity-40 p-3 font-bold">🟢 ATIVAR / ATUALIZAR PROMOÇÃO</button>
          <button type="button" disabled={save.isPending || query.isLoading || !current?.active} onClick={() => { if (window.confirm("Desativar a promoção e restaurar todas as regras anteriores?")) save.mutate({ active: false, type: current?.type || type, value: current?.value || amount || 10 }); }} className="flex-1 rounded-lg bg-rose-700 disabled:opacity-40 p-3 font-bold">🔴 DESATIVAR PROMOÇÃO</button>
        </div>
        <p className="text-xs text-slate-400">Desligada por padrão. A ativação só acontece após confirmação do ADM.</p>
      </div>
    </main>
  </div>;
}
