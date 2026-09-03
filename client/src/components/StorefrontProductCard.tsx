import { Check, ChevronDown, ChevronUp, ShieldCheck, ShoppingCart, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { requestProductManifest } from "@/lib/productManifest";

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

export type StorefrontPriceModel = { id: number; optionId: number; label: string; price: string; originalPrice: string | null; promoEndsAt?: number | null; sortOrder: number; isActive: number; selectorLabel?: string | null; };

export type StorefrontOption = {
  id: number;
  label: string;
  price: string;
  originalPrice: string | null;
  description?: string | null;
  warranty?: string | null;
  promoEndsAt?: number | null;
  priceModels?: StorefrontPriceModel[];
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

function priceModelDiscount(model: StorefrontPriceModel) {
  if (model.promoEndsAt && model.promoEndsAt <= Date.now()) return 0;
  const original = asNumber(model.originalPrice);
  const price = asNumber(model.price);
  return original > price && price > 0 ? Math.round(((original - price) / original) * 100) : 0;
}

function shortText(value: string | null | undefined, limit = 172) {
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
  onBuy: (tier: StorefrontWarrantyTier | null, priceModel: StorefrontPriceModel | null) => void;
  onAddToCart: (tier: StorefrontWarrantyTier | null, priceModel: StorefrontPriceModel | null) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tiers = item.option.warrantyTiers || [];
  const [tierId, setTierId] = useState<number | null>(tiers[0]?.id ?? null);
  const selectedTier = tiers.find((tier) => tier.id === tierId) || null;
  const priceModels = item.option.priceModels || [];
  const [priceModelId, setPriceModelId] = useState<number | null>(null);
  const [manifestAcceptedKey, setManifestAcceptedKey] = useState<string | null>(null);
  const selectedPriceModel = priceModels.find((model) => model.id === priceModelId) || null;
  const requiresPriceModelSelection = priceModels.length > 0;
  const selectorLabel = priceModels[0]?.selectorLabel?.trim() || "Modelo / categoria";
  const hasPriceModelPromotion = priceModels.some((model) => priceModelDiscount(model) > 0);
  const effectivePrice = requiresPriceModelSelection ? selectedPriceModel?.price : (selectedTier?.price || item.option.price);
  const effectiveOriginalPrice = requiresPriceModelSelection ? selectedPriceModel?.originalPrice : (selectedTier?.originalPrice || item.option.originalPrice);
  const discount = useMemo(() => {
    const original = asNumber(effectiveOriginalPrice);
    const price = asNumber(effectivePrice);
    return original > price && price > 0 ? Math.round(((original - price) / original) * 100) : 0;
  }, [effectiveOriginalPrice, effectivePrice]);
  const productColor = item.product.cardColor || "#7c3aed";
  const borderColor = item.option.cardBorderColor || productColor;
  const accentColor = item.option.cardAccentColor || borderColor;
  const cardBackground = item.option.cardBgColor || undefined;
  const textColor = item.option.cardTextColor || undefined;
  const cartButtonColor = item.option.cardButtonColor || productColor;
  const description = item.option.description || item.product.description;
  const warrantyLabel = selectedTier?.warrantyLabel || (selectedTier ? `${selectedTier.warrantyValue} ${selectedTier.warrantyType}` : item.option.warranty);
  const detailsId = `product-details-${item.product.id}-${item.option.id}`;
  const glassBackground = cardBackground
    ? `linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(15,23,42,0.60) 42%, rgba(2,6,23,0.90) 100%), ${cardBackground}`
    : "linear-gradient(145deg, rgba(30,41,59,0.72) 0%, rgba(8,15,32,0.88) 48%, rgba(2,6,23,0.96) 100%)";

  const handlePriceModelSelect = async (nextId: number) => {
    const nextModel = priceModels.find(model => model.id === nextId);
    const key = `price:${nextId}`;
    const accepted = await requestProductManifest([`price_model_manifest_${nextId}`, `option_manifest_${item.option.id}`], key, nextModel?.label || item.option.label);
    if (!accepted) return;
    setPriceModelId(nextId);
    setManifestAcceptedKey(key);
  };

  const runProtectedAction = async (action: "buy" | "cart") => {
    if (requiresPriceModelSelection && !selectedPriceModel) return;
    const key = selectedPriceModel ? `price:${selectedPriceModel.id}` : `base:${item.option.id}`;
    if (manifestAcceptedKey !== key) {
      const manifestKeys = selectedPriceModel
        ? [`price_model_manifest_${selectedPriceModel.id}`, `option_manifest_${item.option.id}`]
        : [`option_manifest_${item.option.id}`];
      const accepted = await requestProductManifest(manifestKeys, key, selectedPriceModel?.label || item.option.label);
      if (!accepted) return;
      setManifestAcceptedKey(key);
    }
    if (action === "buy") onBuy(selectedTier, selectedPriceModel);
    else onAddToCart(selectedTier, selectedPriceModel);
  };

  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border shadow-[0_20px_58px_rgba(0,0,0,0.46),0_0_30px_rgba(59,130,246,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_72px_rgba(0,0,0,0.54),0_0_34px_rgba(34,211,238,0.16)] backdrop-blur-xl"
      style={{ borderColor: `${borderColor}b8`, background: glassBackground, boxShadow: `0 20px 58px rgba(0,0,0,.46), 0 0 24px ${accentColor}2c, inset 0 1px 0 rgba(255,255,255,.16)` }}
    >
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px opacity-95" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`, boxShadow: `0 0 13px ${accentColor}` }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/[0.10] via-white/[0.025] to-transparent" />
      {discount > 0 && (
        <div className="absolute right-4 top-4 z-10 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black text-white shadow-lg">
          -{discount}% OFF
        </div>
      )}

      <div className="relative z-[1] p-5 pb-4">
        <div className="mb-4 flex items-start gap-3 pr-14">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,.20),0_0_18px_rgba(255,255,255,.08)] backdrop-blur-xl">
            {item.product.iconUrl ? (
              <img src={item.product.iconUrl} alt="" loading="lazy" className="h-9 w-9 object-contain" />
            ) : (
              <Tag className="h-5 w-5" style={{ color: accentColor }} />
            )}
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: accentColor }}>
              {item.category}
            </p>
            <h3 className="text-lg font-black leading-tight text-white" style={textColor ? { color: textColor } : undefined}>{item.option.label.trim()}</h3>
            <p className="mt-1 text-xs font-semibold text-white/55" style={textColor ? { color: `${textColor}bb` } : undefined}>{item.product.name}</p>
          </div>
        </div>

        <p className="min-h-[43px] whitespace-pre-wrap text-sm leading-relaxed text-white/75" style={textColor ? { color: `${textColor}cc` } : undefined}>{shortText(description)}</p>

        {priceModels.length > 0 && (
          <div className="mt-4">
            {hasPriceModelPromotion && !selectedPriceModel && (
              <div className="mb-3 overflow-hidden rounded-2xl border border-rose-400/45 bg-gradient-to-r from-rose-500/15 via-fuchsia-500/10 to-amber-400/10 p-3 shadow-[0_0_24px_rgba(244,63,94,0.18),inset_0_1px_0_rgba(255,255,255,0.10)]">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-400" />
                  </span>
                  <span className="text-xs font-black uppercase tracking-wide text-rose-200">🔥 Promoção disponível neste produto</span>
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-white/70">Escolha uma opção abaixo para revelar o valor promocional e a economia.</p>
              </div>
            )}
            <span className="mb-1.5 block text-xs font-bold text-cyan-200">{selectorLabel}</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {priceModels.map((model) => {
                const isSelected = model.id === priceModelId;
                const modelDiscount = priceModelDiscount(model);
                const hasPromotion = modelDiscount > 0;
                return (
                  <button
                    key={model.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => void handlePriceModelSelect(model.id)}
                    className={`relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm font-black text-white outline-none transition-all focus:border-cyan-300 ${isSelected ? "border-cyan-300 bg-slate-950/70 ring-2 ring-cyan-300/30" : hasPromotion ? "border-rose-400/55 bg-gradient-to-br from-rose-500/12 via-slate-950/65 to-amber-400/8 shadow-[0_0_18px_rgba(244,63,94,0.15)] hover:border-rose-300/80" : "border-cyan-300/30 bg-slate-950/55 hover:border-cyan-300/55"}`}
                  >
                    {!isSelected && hasPromotion && <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-300 to-transparent shadow-[0_0_10px_rgba(251,113,133,0.9)]" />}
                    <span className="flex items-center justify-between gap-2">
                      <span>{model.label}</span>
                      {isSelected ? <Check className="h-4 w-4 shrink-0" /> : hasPromotion ? <span className="shrink-0 rounded-full border border-rose-300/40 bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-200">🔥 Promo</span> : null}
                    </span>
                    {isSelected ? (
                      hasPromotion ? (
                        <span className="mt-2 block rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-2">
                          <span className="block text-[10px] font-semibold text-white/45 line-through">{asMoney(model.originalPrice)}</span>
                          <span className="mt-0.5 block text-base font-black text-emerald-300">{asMoney(model.price)}</span>
                          <span className="mt-0.5 block text-[10px] font-black uppercase tracking-wide text-emerald-200">Economize {modelDiscount}%</span>
                        </span>
                      ) : <span className="mt-1 block">{asMoney(model.price)}</span>
                    ) : (
                      <span className={`mt-1.5 block text-[10px] font-bold ${hasPromotion ? "text-rose-200" : "text-white/45"}`}>{hasPromotion ? "Toque para revelar a oferta" : "Toque para ver o valor"}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {!selectedPriceModel && <span className="mt-1.5 block text-[11px] font-semibold text-amber-300">Escolha uma opção para ver o valor e continuar.</span>}
          </div>
        )}

        {tiers.length > 0 && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-bold text-white/70">Garantia</span>
            <select
              value={tierId ?? ""}
              onChange={(event) => setTierId(Number(event.target.value))}
              className="w-full rounded-xl border border-white/20 bg-slate-950/45 px-3 py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.10)] outline-none backdrop-blur-xl focus:border-violet-300"
            >
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.warrantyLabel || `${tier.warrantyValue} ${tier.warrantyType}`} — {asMoney(tier.price)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            {requiresPriceModelSelection && !selectedPriceModel ? (
              <p className="text-sm font-bold text-white/50">Valor disponível após a escolha</p>
            ) : (
              <>
                {effectiveOriginalPrice && <p className="mb-0.5 text-xs font-semibold text-white/40 line-through">{asMoney(effectiveOriginalPrice)}</p>}
                <p className="text-2xl font-black text-white" style={textColor ? { color: textColor } : undefined}>{asMoney(effectivePrice)}</p>
                {discount > 0 && <p className="mt-0.5 text-xs font-bold text-emerald-300">Economize {discount}%</p>}
              </>
            )}
          </div>
          {item.product.deliveryDays && <span className="rounded-lg border border-white/20 bg-white/[0.08] px-2 py-1 text-right text-[11px] font-bold text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur-xl">Prazo: {item.product.deliveryDays}</span>}
        </div>

        {warrantyLabel && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-100"><ShieldCheck className="h-3.5 w-3.5" />Garantia</span>
          </div>
        )}
      </div>

      <div className="relative z-[1] mt-auto border-t border-white/15 bg-slate-950/35 p-4 backdrop-blur-xl">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={requiresPriceModelSelection && !selectedPriceModel}
            onClick={() => void runProtectedAction("buy")}
            className="min-h-12 rounded-xl border border-white/60 bg-white/95 px-3 py-3 text-sm font-black text-slate-950 shadow-[0_8px_24px_rgba(255,255,255,.14)] transition-all hover:bg-white hover:shadow-[0_8px_28px_rgba(255,255,255,.25)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Comprar agora
          </button>
          <button
            type="button"
            disabled={requiresPriceModelSelection && !selectedPriceModel}
            onClick={() => void runProtectedAction("cart")}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-black text-white shadow-[0_8px_24px_rgba(0,0,0,.18)] backdrop-blur-xl transition-all hover:brightness-125 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
            style={{ background: `linear-gradient(135deg, ${cartButtonColor}52, ${cartButtonColor}24)`, borderColor: `${cartButtonColor}cc`, boxShadow: `0 8px 24px ${cartButtonColor}24, inset 0 1px 0 rgba(255,255,255,.18)` }}
          >
            <ShoppingCart className="h-4 w-4" /> Carrinho
          </button>
        </div>
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((open) => !open)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 py-1 text-xs font-bold text-white/70 transition-colors hover:text-white"
        >
          {detailsOpen ? "Ocultar detalhes" : "Ver detalhes"}
          {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {detailsOpen && (
          <div id={detailsId} className="mt-2 rounded-xl border border-white/15 bg-slate-950/55 p-3 text-sm text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,.10)] backdrop-blur-xl">
            {warrantyLabel && <p className="mb-2 flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />{warrantyLabel}</p>}
            {item.option.documents.length > 0 && <p className="mb-2"><strong className="text-white">Documentos:</strong> {item.option.documents.map((document) => document.label).join(", ")}</p>}
            {item.option.questions.length > 0 && <p><strong className="text-white">Etapas:</strong> perguntas específicas desta opção serão apresentadas no fluxo de compra.</p>}
          </div>
        )}
      </div>
    </article>
  );
}