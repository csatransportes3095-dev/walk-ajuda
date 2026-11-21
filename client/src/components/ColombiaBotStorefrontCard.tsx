import React from "react";
import { ChevronRight, FileText, ShieldCheck, Truck } from "lucide-react";

type Props = {
  productName: string;
  optionName: string;
  planName?: string | null;
  iconUrl?: string | null;
  description?: string | null;
  deliveryDays?: string | null;
  guarantee?: string | null;
  price?: string | null;
  originalPrice?: string | null;
  selectLabel: string;
  onSelect: () => void;
  disabled?: boolean;
  vipLabel?: string | null;
  guaranteeSelection?: boolean;
};

export function formatBotCatalogPrice(value: string | null | undefined): string {
  const text = String(value || "").trim();
  return text ? (/^R\$/i.test(text) ? text : "R$ " + text) : "";
}

export function ColombiaBotStorefrontCard({
  productName, optionName, planName, iconUrl, description, deliveryDays, guarantee,
  price, originalPrice, selectLabel, onSelect, disabled = false,
  vipLabel, guaranteeSelection = false,
}: Props) {
  const formattedPrice = formatBotCatalogPrice(price);
  const original = formatBotCatalogPrice(originalPrice);
  const details = String(description || "").trim();
  const warranty = String(guarantee || "").trim();
  const dualWarrantyLimit = /corridas?/i.test(warranty) && /dias?/i.test(warranty) && /\bou\b/i.test(warranty);
  const shipping = String(deliveryDays || "").trim();

  return (
    <article
      data-testid="colombia-bot-storefront-card"
      className="w-full min-w-0 overflow-hidden rounded-2xl border border-violet-400/60 bg-[linear-gradient(150deg,rgba(43,18,88,.95),rgba(10,19,43,.98)_55%,rgba(7,16,34,.99))] text-left text-white shadow-[0_14px_36px_rgba(0,0,0,.3),0_0_24px_rgba(124,58,237,.15)]"
    >
      <header className="flex items-center gap-3 border-b border-violet-300/20 bg-violet-500/10 px-3 py-3">
        {iconUrl ? (
          <img src={iconUrl} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl border border-violet-300/30 bg-black/40 object-contain" />
        ) : (
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-violet-300/30 bg-violet-500/20">
            <ShieldCheck className="h-6 w-6 text-violet-200" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-violet-200">{productName}</p>
          <h3 className="mt-1 break-words text-base font-black leading-tight text-white">{optionName}</h3>
          {planName && <p className="mt-1 break-words text-sm font-bold text-cyan-200">{planName}</p>}
          {vipLabel && <span className="mt-1 inline-block rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-200">{vipLabel}</span>}
        </div>
      </header>
      <div className="space-y-3 px-3 py-3">
        {warranty && (
          <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/[0.09] px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> Garantia do serviço
            </div>
            <p className="mt-2 break-words text-base font-extrabold text-white">{warranty}</p>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-emerald-100/90">
              {dualWarrantyLimit ? "A garantia termina quando o primeiro limite for atingido (corridas ou dias). " : "Estes são limites da garantia. "}
              Não representam a duração da conta.
            </p>
          </div>
        )}
        {formattedPrice ? (
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">Valor do serviço</p>
              {original && original !== formattedPrice && (
                <p className="text-xs text-slate-400 line-through">De {original}</p>
              )}
              <p className="text-2xl font-black leading-tight text-emerald-300">{formattedPrice}</p>
            </div>
            {shipping && <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-2 py-1.5 text-xs font-semibold text-sky-200"><Truck className="h-3.5 w-3.5 shrink-0" /> Entrega: {shipping}</span>}
          </div>
        ) : shipping ? (
          <p className="text-xs font-semibold text-sky-200"><Truck className="mr-1 inline h-4 w-4" /> Prazo de entrega: {shipping}</p>
        ) : null}
        {!guaranteeSelection && !warranty && !formattedPrice && (
          <p className="text-xs font-semibold text-violet-200">A garantia e o valor serão detalhados na próxima etapa.</p>
        )}
        <details className="group rounded-xl border border-slate-600/50 bg-black/20 px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-slate-200">
            <FileText className="h-4 w-4 shrink-0 text-cyan-300" />
            <span className="flex-1">Ver detalhes e condições</span>
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs leading-relaxed text-slate-200">
            {details && <p className="whitespace-pre-line">{details}</p>}
            <p><strong className="text-white">Serviço:</strong> {productName} — {optionName}</p>
            {warranty && <p><strong className="text-white">Garantia:</strong> {warranty}</p>}
            {shipping && <p><strong className="text-white">Prazo de entrega:</strong> {shipping}</p>}
            {!details && !warranty && !shipping && <p>Confira as informações do serviço antes de continuar o pedido.</p>}
          </div>
        </details>
        <button type="button" disabled={disabled} onClick={onSelect}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-3 text-sm font-black text-slate-950 shadow-[0_8px_20px_rgba(16,185,129,.18)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-600 disabled:text-slate-300">
          {disabled ? "Exclusivo para clientes VIP" : selectLabel}
          {!disabled && <ChevronRight className="h-4 w-4 shrink-0" />}
        </button>
      </div>
    </article>
  );
}
