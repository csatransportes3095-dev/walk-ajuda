import { Check, ChevronDown, ChevronUp, ShieldCheck, ShoppingCart, Tag } from "lucide-react";
import { useMemo, useState } from "react";

export type StorefrontQuestion = {
  id: number;
  question: string;
  fieldType: string;
  isRequired: number;
};

export type StorefrontDocument = {
  id: number;
  label: string;
};

export type StorefrontWarrantyTier = {
  id: number;
  warrantyLabel: string | null;
  warrantyType: string;
  warrantyValue: number;
  price: string;
  originalPrice: string | null;
};

export type StorefrontOption = {
  id: number;
  label: string;
  price: string;
  originalPrice: string | null;
  description?: string | null;
  warranty?: string | null;
  promoEndsAt?: number | null;
  questions: StorefrontQuestion[];
  documents: StorefrontDocument[];
  warrantyTiers?: StorefrontWarrantyTier[];
  cardBorderColor?: string | null;
  cardBgColor?: string | null;
  cardTextColor?: string | null;
  cardButtonColor?: string | null;
  cardAccentColor?: string | null;
};

export type StorefrontProduct = {
  id: number;
  name: string;
  description: string | null;
  iconUrl: string | null;
  cardColor: string | null;
  cardBgColor: string | null;
  cardTextColor: string | null;
  cardBtnColor: string | null;
  deliveryDays?: string | null;
};

export type StorefrontCatalogItem = {
  product: StorefrontProduct;
  option: StorefrontOption;
  category: string;
};

function asMoney(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.toLowerCase().startsWith("r$") ? normalized : `R$ ${normalized}`;
}

function asNumber(value: string | null | undefined) {
  return Number(String(value || "0").replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function shortText(value: string | null | undefined, limit = 142) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
  if (!text) return "Detalhes e requisitos confirmados durante o pedido.";
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

export function StorefrontProductCard({
  item,
  onBuy,
  onAddToCart,
}: {
  item: StorefrontCatalogItem;
  onBuy: (tier: StorefrontWarrantyTier | null) => void;
  onAddToCart: (tier: StorefrontWarrantyTier | null) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tiers = item.option.warrantyTiers || [];
  const [tierId, setTierId] = useState<number | null>(tiers[0]?.id ?? null);
  const selectedTier = tiers.find((tier) => tier.id === tierId) || null;
  const effectivePrice = selectedTier?.price || item.option.price;
  const effectiveOriginalPrice = selectedTier?.originalPrice || item.option.originalPrice;
  const discount = useMemo(() => {
    const original = asNumber(effectiveOriginalPrice);
    const price = asNumber(effectivePrice);
    return original > price && price > 0 ? Math.round(((original - price) / original) * 100) : 0;
  }, [effectiveOriginalPrice, effectivePrice]);

  const productColor = item.product.cardColor || "#7c3aed";
  const borderColor = item.option.cardBorderColor || productColor;
  const accentColor = item.option.cardAccentColor || borderColor;
  const cardBackground = item.option.cardBgColor || item.product.cardBgColor || productColor;
  const textColor = item.option.cardTextColor || item.product.cardTextColor || undefined;
  const actionColor = item.option.cardButtonColor || item.product.cardBtnColor || productColor;
  const description = item.option.description || item.product.description;
  const warrantyLabel = selectedTier?.warrantyLabel || (selectedTier ? `${selectedTier.warrantyValue} ${selectedTier.warrantyType}` : item.option.warranty);
  const detailsId = `product-details-${item.product.id}-${item.option.id}`;

  // O fundo preserva a cor configurada pelo ADM e aplica apenas profundidade/transparência.
  // Antes o gradiente escuro chegava a 90% e fazia um serviço ativo parecer desabilitado.
  const activeBackground = `radial-gradient(circle at 88% 4%, ${accentColor}42 0%, transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.16) 0%, rgba(15,23,42,0.28) 42%, rgba(2,6,23,0.56) 100%), ${cardBackground}`;

  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 active:scale-[0.995] sm:rounded-3xl"
      style={{
        borderColor: `${borderColor}e6`,
        background: activeBackground,
        boxShadow: `0 16px 44px rgba(0,0,0,.38), 0 0 26px ${accentColor}36, inset 0 1px 0 rgba(255,255,255,.22)`,
      }}
    >
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px opacity-100" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`, boxShadow: `0 0 16px ${accentColor}` }} />
      <div className="pointer-events-none absolute inset-y-5 left-0 w-1 rounded-r-full" style={{ background: accentColor, boxShadow: `0 0 16px ${accentColor}` }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.14] via-white/[0.035] to-transparent" />

      <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/45 bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100 shadow-[0_0_16px_rgba(52,211,153,.18)] backdrop-blur-xl">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.9)]" />
          Disponível
        </span>
        {discount > 0 && (
          <span className="rounded-full border border-rose-300/30 bg-rose-600/95 px-2.5 py-1 text-[10px] font-black text-white shadow-lg">
            -{discount}% OFF
          </span>
        )}
      </div>

      <div className="relative z-[1] p-4 pb-3 sm:p-5 sm:pb-4">
        <div className="mb-3.5 flex items-start gap-3 pr-24">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-white/[0.13] backdrop-blur-xl sm:h-12 sm:w-12"
            style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,.24), 0 0 20px ${accentColor}36` }}
          >
            {item.product.iconUrl ? (
              <img src={item.product.iconUrl} alt="" loading="lazy" className="h-8 w-8 object-contain sm:h-9 sm:w-9" />
            ) : (
              <Tag className="h-5 w-5" style={{ color: accentColor }} />
            )}
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[9px] font-black uppercase tracking-[0.20em] sm:text-[10px]" style={{ color: accentColor }}>
              {item.category}
            </p>
            <h3 className="text-base font-black leading-tight text-white sm:text-lg" style={textColor ? { color: textColor } : undefined}>
              {item.option.label.trim()}
            </h3>
            <p className="mt-1 truncate text-[11px] font-bold text-white/65 sm:text-xs" style={textColor ? { color: `${textColor}c7` } : undefined}>
              {item.product.name}
            </p>
          </div>
        </div>

        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/82 sm:text-sm" style={textColor ? { color: `${textColor}df` } : undefined}>
          {shortText(description)}
        </p>

        {tiers.length > 0 && (
          <label className="mt-3.5 block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.10em] text-white/70">Escolha a garantia</span>
            <select
              value={tierId ?? ""}
              onChange={(event) => setTierId(Number(event.target.value))}
              className="w-full rounded-xl border border-white/25 bg-slate-950/50 px-3 py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.10)] outline-none backdrop-blur-xl transition-colors focus:border-white/60"
            >
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.warrantyLabel || `${tier.warrantyValue} ${tier.warrantyType}`} — {asMoney(tier.price)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-4 rounded-2xl border border-white/14 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-lg">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Valor do serviço</p>
              {effectiveOriginalPrice && <p className="mb-0.5 text-xs font-semibold text-white/45 line-through">{asMoney(effectiveOriginalPrice)}</p>}
              <p className="text-2xl font-black leading-none text-white sm:text-[26px]" style={textColor ? { color: textColor } : undefined}>{asMoney(effectivePrice)}</p>
              {discount > 0 && <p className="mt-1 text-[11px] font-bold text-emerald-200">Você economiza {discount}%</p>}
            </div>
            <div className="flex max-w-[48%] flex-col items-end gap-1.5">
              {item.product.deliveryDays && (
                <span className="rounded-lg border border-white/20 bg-white/[0.10] px-2 py-1 text-right text-[10px] font-bold leading-tight text-white/85 backdrop-blur-xl sm:text-[11px]">
                  Prazo: {item.product.deliveryDays}
                </span>
              )}
              {warrantyLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/12 px-2 py-1 text-[10px] font-bold text-emerald-100">
                  <ShieldCheck className="h-3.5 w-3.5" /> Garantia
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-[1] mt-auto border-t border-white/15 bg-black/25 p-3.5 backdrop-blur-xl sm:p-4">
        <div className="grid grid-cols-[1.25fr_.75fr] gap-2">
          <button
            type="button"
            onClick={() => onBuy(selectedTier)}
            className="min-h-12 rounded-xl border px-3 py-3 text-sm font-black text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${actionColor}, ${accentColor})`,
              borderColor: `${accentColor}e6`,
              boxShadow: `0 10px 26px ${actionColor}38, inset 0 1px 0 rgba(255,255,255,.26)`,
            }}
          >
            Comprar agora
          </button>
          <button
            type="button"
            onClick={() => onAddToCart(selectedTier)}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/[0.10] px-2.5 py-3 text-xs font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,.14)] backdrop-blur-xl transition-all hover:bg-white/[0.16] active:scale-[0.98] sm:text-sm"
          >
            <ShoppingCart className="h-4 w-4" /> Carrinho
          </button>
        </div>

        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((open) => !open)}
          className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold text-white/72 transition-colors hover:text-white sm:text-xs"
        >
          {detailsOpen ? "Ocultar detalhes" : "Ver detalhes"}
          {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {detailsOpen && (
          <div id={detailsId} className="mt-2 rounded-xl border border-white/15 bg-slate-950/60 p-3 text-sm text-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,.10)] backdrop-blur-xl">
            {warrantyLabel && <p className="mb-2 flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />{warrantyLabel}</p>}
            {item.option.documents.length > 0 && <p className="mb-2"><strong className="text-white">Documentos:</strong> {item.option.documents.map((document) => document.label).join(", ")}</p>}
            {item.option.questions.length > 0 && <p><strong className="text-white">Etapas:</strong> perguntas específicas desta opção serão apresentadas no fluxo de compra.</p>}
          </div>
        )}
      </div>
    </article>
  );
}
