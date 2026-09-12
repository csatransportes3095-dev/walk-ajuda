import { useEffect, useMemo, useState } from "react";
import { CreditCard, Loader2, LockKeyhole, WalletCards } from "lucide-react";
import { trpc } from "@/lib/trpc";

export type VipInstallmentCheckoutSelection = {
  mode: "cash" | "vip_installment";
  installmentCount: number;
  frequency: "daily" | "weekly" | "monthly";
  quote: any | null;
};

function money(cents: number | null | undefined) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function VipInstallmentCheckoutBox(props: {
  cpToken: string;
  phone?: string;
  productId?: number | null;
  optionId?: number | null;
  priceModelId?: number | null;
  warrantyTierId?: number | null;
  couponCode?: string | null;
  disabledReason?: string | null;
  onSelectionChange: (selection: VipInstallmentCheckoutSelection) => void;
}) {
  const [mode, setMode] = useState<"cash" | "vip_installment">("cash");
  const [count, setCount] = useState(2);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("monthly");

  const sessionReady = props.cpToken.length >= 32;
  const itemReady = Number(props.productId || 0) > 0 && Number(props.optionId || 0) > 0;
  const eligibility = trpc.vipInstallments.eligibility.useQuery(
    { cpToken: props.cpToken, phone: props.phone },
    { enabled: sessionReady && !props.disabledReason, staleTime: 5_000, retry: false },
  );

  const quoteInput = useMemo(() => ({
    cpToken: props.cpToken,
    phone: props.phone,
    items: [{
      productId: Number(props.productId || 0),
      optionId: Number(props.optionId || 0),
      priceModelId: props.priceModelId || null,
      warrantyTierId: props.warrantyTierId || null,
    }],
    couponCode: props.couponCode || undefined,
    installmentCount: count,
    frequency,
  }), [props.cpToken, props.phone, props.productId, props.optionId, props.priceModelId, props.warrantyTierId, props.couponCode, count, frequency]);

  const quote = trpc.vipInstallments.quote.useQuery(quoteInput, {
    enabled: mode === "vip_installment" && sessionReady && itemReady && !props.disabledReason && eligibility.data?.eligible === true,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (mode === "vip_installment" && (props.disabledReason || eligibility.data?.eligible === false)) {
      setMode("cash");
    }
  }, [mode, props.disabledReason, eligibility.data?.eligible]);

  useEffect(() => {
    props.onSelectionChange({
      mode,
      installmentCount: count,
      frequency,
      quote: mode === "vip_installment" && quote.data ? quote.data : null,
    });
  }, [mode, count, frequency, quote.data, props.onSelectionChange]);

  const config = eligibility.data?.config;
  const permission = eligibility.data?.permission;
  const minCount = Number(config?.minInstallments || 2);
  const effectiveMax = Math.max(minCount, Math.min(Number(config?.maxInstallments || 2), Number(permission?.maxInstallments || config?.maxInstallments || 2)));

  useEffect(() => {
    if (count < minCount) setCount(minCount);
    if (count > effectiveMax) setCount(effectiveMax);
  }, [count, minCount, effectiveMax]);

  const frequencyOptions = [
    { value: "daily" as const, label: "Diário", allowed: (permission?.allowDaily ?? config?.allowDaily) !== false },
    { value: "weekly" as const, label: "Semanal", allowed: (permission?.allowWeekly ?? config?.allowWeekly) !== false },
    { value: "monthly" as const, label: "Mensal", allowed: (permission?.allowMonthly ?? config?.allowMonthly) !== false },
  ].filter((item) => item.allowed);

  useEffect(() => {
    if (frequencyOptions.length > 0 && !frequencyOptions.some((item) => item.value === frequency)) {
      setFrequency(frequencyOptions[0].value);
    }
  }, [frequency, frequencyOptions.map((item) => item.value).join("|")]);

  const blockReason = props.disabledReason
    || (!sessionReady ? "Entre no sistema para consultar o Parcelamento VIP." : null)
    || (eligibility.data?.eligible === false ? eligibility.data.reason : null);

  return (
    <div className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-violet-400/15 p-2.5"><WalletCards className="h-5 w-5 text-violet-300" /></div>
        <div className="min-w-0 flex-1"><p className="font-black text-white">Forma de pagamento</p><p className="mt-1 text-xs text-slate-400">Compra à vista continua normal. Parcelamento aparece somente quando todas as regras VIP forem atendidas.</p></div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setMode("cash")} className={`rounded-xl border px-3 py-3 text-sm font-black ${mode === "cash" ? "border-emerald-300 bg-emerald-400 text-emerald-950" : "border-white/10 bg-white/5 text-slate-300"}`}>À VISTA</button>
        <button type="button" disabled={!!blockReason || eligibility.isLoading} onClick={() => setMode("vip_installment")} className={`rounded-xl border px-3 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${mode === "vip_installment" ? "border-violet-300 bg-violet-400 text-violet-950" : "border-white/10 bg-white/5 text-slate-300"}`}>
          {eligibility.isLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "PARCELAMENTO VIP"}
        </button>
      </div>

      {blockReason && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs font-bold text-amber-200"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><span>{blockReason}{eligibility.data?.openPlan?.balanceCents ? ` Saldo pendente: ${money(eligibility.data.openPlan.balanceCents)}.` : ""}</span></div>}

      {mode === "vip_installment" && !blockReason && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] font-black uppercase text-slate-400">Parcelas<select value={count} onChange={(event) => setCount(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm font-black text-white">{Array.from({ length: Math.max(0, effectiveMax - minCount + 1) }, (_, index) => minCount + index).map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
            <label className="text-[10px] font-black uppercase text-slate-400">Periodicidade<select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm font-black text-white">{frequencyOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>

          {quote.isFetching && <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 p-4 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Calculando no servidor...</div>}
          {quote.error && <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-xs font-bold text-red-200">{quote.error.message}</div>}
          {quote.data && (
            <div className="rounded-xl border border-violet-300/25 bg-black/25 p-4">
              <div className="grid grid-cols-3 gap-2 text-center"><div><p className="text-[9px] font-black uppercase text-slate-500">Compra</p><p className="mt-1 text-sm font-black">{money(quote.data.pricing.totalCents)}</p></div><div><p className="text-[9px] font-black uppercase text-slate-500">Juros</p><p className="mt-1 text-sm font-black text-amber-300">{money(quote.data.quote.interestAmountCents)}</p></div><div><p className="text-[9px] font-black uppercase text-slate-500">Total</p><p className="mt-1 text-sm font-black text-violet-200">{money(quote.data.quote.totalAmountCents)}</p></div></div>
              <div className="mt-3 rounded-lg bg-violet-500/10 p-3 text-center"><p className="text-[10px] font-black uppercase text-violet-300">Primeira parcela agora</p><p className="mt-1 text-xl font-black text-white">{money(quote.data.quote.installments?.[0]?.amountCents)}</p><p className="mt-1 text-[11px] text-slate-400">Parcela 1 de {quote.data.quote.installmentCount}</p></div>
            </div>
          )}
          <div className="flex items-start gap-2 text-[11px] text-slate-400"><CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Após a compra, as próximas parcelas ficam disponíveis em <strong className="text-violet-200">Minhas Parcelas VIP</strong>.</span></div>
        </div>
      )}
    </div>
  );
}
