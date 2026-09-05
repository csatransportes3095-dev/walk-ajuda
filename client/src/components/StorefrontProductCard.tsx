import { Check, ChevronDown, ChevronUp, Crown, Flame, LockKeyhole, ShieldCheck, ShoppingCart, Tag, Timer, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

export type StorefrontPriceModel = {
  id: number;
  optionId: number;
  label: string;
  price: string;
  originalPrice: string | null;
  promoStartsAt?: number | null;
  promoEndsAt?: number | null;
  sortOrder: number;
  isActive: number;
  selectorLabel?: string | null;
};

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

const OPTION_PALETTES = [
  {
    border: "border-orange-500/90",
    bg: "from-orange-950/60 via-[#160b0c] to-[#050816]",
    text: "text-orange-300",
    badge: "bg-orange-400",
    ring: "ring-orange-300/35",
    shadow: "shadow-[0_0_26px_rgba(249,115,22,0.18)]",
  },
  {
    border: "border-cyan-400",
    bg: "from-cyan-950/80 via-[#06314d] to-[#050816]",
    text: "text-cyan-300",
    badge: "bg-cyan-400",
    ring: "ring-cyan-300/45",
    shadow: "shadow-[0_0_36px_rgba(34,211,238,0.30)]",
  },
  {
    border: "border-emerald-400/90",
    bg: "from-emerald-950/70 via-[#07332c] to-[#050816]",
    text: "text-emerald-300",
    badge: "bg-emerald-400",
    ring: "ring-emerald-300/35",
    shadow: "shadow-[0_0_26px_rgba(16,185,129,0.18)]",
  },
] as const;

function asMoney(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.toLowerCase().startsWith("r$") ? normalized : `R$ ${normalized}`;
}

function asNumber(value: string | null | undefined) {
  return Number(String(value || "0").replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function normalizeEpochMs(value: number | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

function discountPercent(price: string | null | undefined, originalPrice: string | null | undefined) {
  const original = asNumber(originalPrice);
  const current = asNumber(price);
  return original > current && current > 0 ? Math.round(((original - current) / original) * 100) : 0;
}

function formatCountdown(endAt: number | null, nowMs: number) {
  if (!endAt) return null;
  const remaining = Math.max(0, endAt - nowMs);
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function shortText(value: string | null | undefined, limit = 260) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
  if (!text) return "Informações do produto disponíveis durante a compra.";
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

function splitModelLabel(label: string) {
  const clean = label.trim().toUpperCase();
  const match = clean.match(/(?:GARANTIA\s+DE\s+)?(.+?CORRIDAS)(?:\s+OU\s+|\s*[-–—]\s*)(.+?DIAS?)$/i);
  if (match) return { title: match[1].trim(), subtitle: match[2].trim() };
  const pipe = clean.split(/\s*[|•]\s*/);
  if (pipe.length > 1) return { title: pipe[0], subtitle: pipe.slice(1).join(" • ") };
  return { title: clean, subtitle: "SELECIONAR" };
}

function productTagline(item: StorefrontCatalogItem) {
  const value = `${item.category} ${item.product.name}`.toLowerCase();
  if (value.includes("99")) return "Sua jornada com a 99, mais rápida e segura.";
  if (value.includes("tax")) return "Seu atendimento com mais rapidez, segurança e acompanhamento.";
  if (value.includes("doc")) return "Seu serviço organizado, rápido e acompanhado do início ao fim.";
  return "Sua jornada com a Uber, mais rápida e segura.";
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const tiers = item.option.warrantyTiers || [];
  const [tierId, setTierId] = useState<number | null>(tiers[0]?.id ?? null);
  const selectedTier = tiers.find((tier) => tier.id === tierId) || null;
  const priceModels = item.option.priceModels || [];
  const preferredModel = priceModels[Math.min(1, Math.max(0, priceModels.length - 1))] || null;
  const [priceModelId, setPriceModelId] = useState<number | null>(preferredModel?.id ?? null);
  const [manifestAcceptedKey, setManifestAcceptedKey] = useState<string | null>(null);

  const hasTimedPromotion = priceModels.some((model) => normalizeEpochMs(model.promoStartsAt) || normalizeEpochMs(model.promoEndsAt)) || Boolean(normalizeEpochMs(item.option.promoEndsAt));

  useEffect(() => {
    if (!hasTimedPromotion) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasTimedPromotion]);

  useEffect(() => {
    if (priceModels.length === 0) {
      if (priceModelId !== null) setPriceModelId(null);
      return;
    }
    if (!priceModels.some((model) => model.id === priceModelId)) {
      setPriceModelId(priceModels[Math.min(1, priceModels.length - 1)]?.id ?? null);
    }
  }, [priceModels, priceModelId]);

  const selectedPriceModel = priceModels.find((model) => model.id === priceModelId) || null;
  const requiresPriceModelSelection = priceModels.length > 0;
  const effectivePrice = requiresPriceModelSelection ? selectedPriceModel?.price : (selectedTier?.price || item.option.price);
  const effectiveOriginalPrice = requiresPriceModelSelection ? selectedPriceModel?.originalPrice : (selectedTier?.originalPrice || item.option.originalPrice);
  const discount = useMemo(() => discountPercent(effectivePrice, effectiveOriginalPrice), [effectiveOriginalPrice, effectivePrice]);

  const promotionByModel = new Map(
    priceModels.map((model) => {
      const startsAt = normalizeEpochMs(model.promoStartsAt);
      const endsAt = normalizeEpochMs(model.promoEndsAt);
      const modelDiscount = discountPercent(model.price, model.originalPrice);
      const active = modelDiscount > 0 && (!startsAt || nowMs >= startsAt) && (!endsAt || nowMs < endsAt);
      return [model.id, { active, discount: modelDiscount, endsAt }] as const;
    }),
  );
  const activeModelPromotions = Array.from(promotionByModel.values()).filter((promo) => promo.active);
  const activeTierDiscounts = priceModels.length === 0
    ? tiers.map((tier) => discountPercent(tier.price, tier.originalPrice)).filter((value) => value > 0)
    : [];
  const optionPromoEnd = normalizeEpochMs(item.option.promoEndsAt);
  const optionDiscount = priceModels.length === 0 && tiers.length === 0 ? discountPercent(item.option.price, item.option.originalPrice) : 0;
  const optionPromotionActive = optionDiscount > 0 && (!optionPromoEnd || nowMs < optionPromoEnd);
  const hasActivePromotion = activeModelPromotions.length > 0 || activeTierDiscounts.length > 0 || optionPromotionActive;
  const maxPromotionDiscount = Math.max(0, ...activeModelPromotions.map((promo) => promo.discount), ...activeTierDiscounts, optionPromotionActive ? optionDiscount : 0);
  const promotionEndCandidates = activeModelPromotions.map((promo) => promo.endsAt).filter((value): value is number => Boolean(value));
  if (optionPromotionActive && optionPromoEnd) promotionEndCandidates.push(optionPromoEnd);
  const activePromotionEndsAt = promotionEndCandidates.length > 0 ? Math.min(...promotionEndCandidates) : null;
  const promotionCountdown = formatCountdown(activePromotionEndsAt, nowMs);

  const warrantyLabel = selectedTier?.warrantyLabel || (selectedTier ? `${selectedTier.warrantyValue} ${selectedTier.warrantyType}` : item.option.warranty);
  const selectedParts = selectedPriceModel ? splitModelLabel(selectedPriceModel.label) : null;
  const detailsId = `product-details-${item.product.id}-${item.option.id}`;
  const categoryLabel = item.category.toUpperCase();
  const productPill = item.product.name.toUpperCase();

  const handlePriceModelSelect = (nextId: number) => {
    setPriceModelId(nextId);
    setManifestAcceptedKey(null);
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
      data-promo-active={hasActivePromotion ? "true" : "false"}
      className={`relative flex h-full flex-col overflow-hidden rounded-[34px] bg-[radial-gradient(circle_at_13%_0%,rgba(124,58,237,.30),transparent_30%),radial-gradient(circle_at_100%_10%,rgba(79,70,229,.20),transparent_28%),linear-gradient(180deg,#090b21_0%,#06091a_55%,#080a22_100%)] ${hasActivePromotion ? "border border-amber-300/95 shadow-[0_0_0_1px_rgba(250,204,21,.24),0_0_34px_rgba(245,158,11,.32),0_32px_90px_rgba(0,0,0,.66)]" : "border border-violet-500/85 shadow-[0_32px_90px_rgba(0,0,0,.66),0_0_42px_rgba(124,58,237,.25)]"}`}
    >
      {hasActivePromotion && (
        <div className="relative z-30 flex min-h-[38px] flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-amber-300/70 bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 px-3 py-2 text-[10px] font-black uppercase tracking-[0.06em] text-[#1b1000] shadow-[0_5px_22px_rgba(245,158,11,.28)] sm:text-[11px]">
          <span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5 fill-orange-700/35" /> Promoção{maxPromotionDiscount > 0 ? ` • ${maxPromotionDiscount}% OFF` : ""}</span>
          {promotionCountdown ? <span className="inline-flex items-center gap-1 rounded-full bg-black/16 px-2 py-0.5"><Timer className="h-3.5 w-3.5" /> termina em {promotionCountdown}</span> : <span className="rounded-full bg-black/16 px-2 py-0.5">oferta ativa</span>}
        </div>
      )}

      <div className={`pointer-events-none absolute inset-x-10 ${hasActivePromotion ? "top-[38px]" : "top-0"} h-px bg-gradient-to-r from-transparent via-violet-300 to-transparent shadow-[0_0_24px_rgba(167,139,250,.95)]`} />

      <div className="relative overflow-hidden rounded-b-[28px] border-b border-violet-400/35 bg-[radial-gradient(circle_at_90%_25%,rgba(99,102,241,.22),transparent_28%),linear-gradient(135deg,rgba(76,29,149,.30),rgba(15,23,42,.30)_55%,rgba(2,6,23,.05))] px-5 py-5 sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute right-5 top-3 text-[56px] font-black tracking-tighter text-violet-300/[0.06] sm:text-[74px]">{item.category}</div>
        <div className="relative flex items-start gap-4 pr-1">
          <div className="grid h-[74px] w-[74px] shrink-0 place-items-center overflow-hidden rounded-[22px] border border-violet-300/55 bg-black/50 shadow-[0_0_24px_rgba(139,92,246,.45),inset_0_0_18px_rgba(255,255,255,.08)]">
            {item.product.iconUrl ? <img src={item.product.iconUrl} alt="" loading="lazy" className="h-[58px] w-[58px] rounded-2xl object-contain" /> : <Tag className="h-7 w-7 text-violet-300" />}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full border border-violet-400/60 bg-violet-500/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-violet-200 shadow-[0_0_16px_rgba(139,92,246,.16)]">{productPill}</span>
            <h3 className="mt-2 text-[24px] font-black leading-[1.02] tracking-tight text-white sm:text-[30px]">{item.option.label.trim()}</h3>
            <span className="mt-3 inline-flex rounded-full border border-violet-300/40 bg-violet-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.13em] text-violet-200/90">TIPO DE CONTA</span>
          </div>
        </div>
        <div className="relative mt-5 flex items-end justify-between gap-3">
          <p className="max-w-[72%] text-[12px] font-semibold leading-5 text-violet-100/70 sm:text-sm">{productTagline(item)}</p>
          <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-violet-400/70 bg-violet-950/55 px-3 py-2 text-violet-200 shadow-[0_0_18px_rgba(139,92,246,.20)]">
            <Crown className="h-5 w-5" />
            <div className="text-[9px] font-black uppercase leading-3 tracking-wide"><span className="block">Qualidade</span><span className="text-violet-100">H2</span></div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {priceModels.length > 0 && (
          <div>
            <div className="flex items-start gap-3">
              <Crown className="mt-0.5 h-7 w-7 shrink-0 fill-violet-500/30 text-violet-400" />
              <div>
                <p className="text-[21px] font-black uppercase leading-none tracking-tight text-white sm:text-[26px]">Escolha sua garantia</p>
                <p className="mt-2 text-[11px] font-medium text-slate-400 sm:text-sm">Mais corridas, mais tempo, mais tranquilidade.</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
              {priceModels.map((model, index) => {
                const isSelected = model.id === priceModelId;
                const palette = OPTION_PALETTES[Math.min(index, OPTION_PALETTES.length - 1)];
                const parts = splitModelLabel(model.label);
                const modelPromotion = promotionByModel.get(model.id);
                return (
                  <button key={model.id} type="button" aria-pressed={isSelected} onClick={() => handlePriceModelSelect(model.id)} className={`relative min-h-[150px] overflow-visible rounded-[18px] border bg-gradient-to-b px-2 pb-3 pt-7 text-center transition-all ${palette.border} ${palette.bg} ${palette.shadow} ${isSelected ? `-translate-y-1 ring-2 ${palette.ring}` : "hover:-translate-y-0.5"} ${modelPromotion?.active ? "outline outline-1 outline-amber-300/60" : ""}`}>
                    {modelPromotion?.active ? (
                      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[1px] whitespace-nowrap rounded-b-xl bg-gradient-to-r from-yellow-300 to-orange-400 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wide text-[#1a0d00] shadow-[0_0_16px_rgba(250,204,21,.45)] sm:text-[9px]">Oferta -{modelPromotion.discount}%</span>
                    ) : index === 1 ? (
                      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[1px] whitespace-nowrap rounded-b-xl bg-cyan-400 px-3 py-1.5 text-[8px] font-black uppercase tracking-wide text-[#03111c] shadow-[0_0_16px_rgba(34,211,238,.38)] sm:text-[10px]">Mais escolhida</span>
                    ) : null}
                    <ShieldCheck className={`mx-auto h-6 w-6 ${palette.text}`} />
                    <span className="mt-3 block text-[12px] font-black leading-4 text-white sm:text-base">{parts.title}</span>
                    <span className={`mt-1.5 block text-[13px] font-black sm:text-base ${palette.text}`}>{parts.subtitle}</span>
                    {isSelected ? <span className={`mx-auto mt-4 grid h-8 w-8 place-items-center rounded-full ${palette.badge} text-slate-950`}><Check className="h-4 w-4 stroke-[3]" /></span> : <span className="mx-auto mt-4 block h-8 w-8 rounded-full border-[3px] border-slate-500/75 bg-slate-950/60" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tiers.length > 0 && priceModels.length === 0 && (
          <label className="mt-6 block rounded-2xl border border-violet-400/30 bg-violet-950/30 p-4">
            <span className="mb-2 block text-sm font-black uppercase text-violet-200">Escolha sua garantia</span>
            <select value={tierId ?? ""} onChange={(event) => setTierId(Number(event.target.value))} className="w-full rounded-xl border border-violet-300/30 bg-slate-950/70 px-3 py-3 text-sm font-semibold text-white outline-none focus:border-violet-300">
              {tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.warrantyLabel || `${tier.warrantyValue} ${tier.warrantyType}`} — {asMoney(tier.price)}</option>)}
            </select>
          </label>
        )}

        <div className="mt-6 rounded-[24px] border border-violet-400/45 bg-[linear-gradient(135deg,rgba(76,29,149,.30),rgba(9,12,35,.88)_48%,rgba(2,6,23,.92))] p-4 shadow-[0_0_28px_rgba(124,58,237,.13)] sm:p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600/25 text-violet-300"><Tag className="h-5 w-5" /></div>
            <p className="text-[12px] font-black uppercase tracking-[0.14em] text-violet-300 sm:text-sm">Sua escolha</p>
            <span className="ml-auto rounded-full border border-violet-300/35 bg-white/[0.04] px-3 py-1 text-[9px] font-black uppercase text-violet-100 sm:text-[10px]">CONTA {categoryLabel}</span>
          </div>
          <p className="mt-4 text-[13px] font-black uppercase leading-5 tracking-wide text-white sm:text-base">{selectedParts ? `${item.option.label} • ${selectedParts.title} • ${selectedParts.subtitle}` : `${item.option.label} • escolha uma garantia`}</p>
          <div className="mt-4 border-t border-white/15 pt-4">
            {effectiveOriginalPrice && <p className={`text-[11px] font-extrabold line-through ${discount > 0 ? "text-red-300 decoration-red-500 decoration-2" : "text-slate-500"}`}>{asMoney(effectiveOriginalPrice)}</p>}
            <p className={`break-words font-black leading-none tracking-tight ${effectivePrice ? "text-[30px] text-teal-300 drop-shadow-[0_0_18px_rgba(45,212,191,.35)] sm:text-[42px]" : "text-lg text-slate-400 sm:text-2xl"}`}>{effectivePrice ? asMoney(effectivePrice) : "Valor após a escolha"}</p>
            {discount > 0 && <p className="mt-2 inline-flex rounded-full border border-emerald-400/45 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,.16)]">Economize {discount}%</p>}
          </div>
        </div>
      </div>

      <div className="mt-auto px-4 pb-5 sm:px-5">
        <div className="grid grid-cols-[1.22fr_.9fr] gap-3">
          <button type="button" disabled={requiresPriceModelSelection && !selectedPriceModel} onClick={() => void runProtectedAction("buy")} className="inline-flex min-h-[58px] items-center justify-center gap-3 rounded-2xl border border-white bg-gradient-to-b from-white to-slate-200 px-4 text-[15px] font-black text-[#090b21] shadow-[0_12px_32px_rgba(255,255,255,.18)] transition-all hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 sm:text-lg"><ShoppingCart className="h-6 w-6" /> Comprar agora <span className="text-2xl leading-none">→</span></button>
          <button type="button" disabled={requiresPriceModelSelection && !selectedPriceModel} onClick={() => void runProtectedAction("cart")} className="inline-flex min-h-[58px] items-center justify-center gap-2 rounded-2xl border border-violet-400/90 bg-gradient-to-br from-violet-950/90 to-purple-950/75 px-3 text-[15px] font-black text-violet-200 shadow-[0_12px_32px_rgba(124,58,237,.22),inset_0_1px_0_rgba(255,255,255,.08)] transition-all hover:brightness-125 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 sm:text-lg"><ShoppingCart className="h-5 w-5" /> Carrinho</button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/15" />
          <button type="button" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen((open) => !open)} className="inline-flex items-center justify-center gap-2 text-xs font-bold text-white/90 transition-colors hover:text-white sm:text-sm">{detailsOpen ? "Ocultar detalhes" : "Ver detalhes"}{detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
          <div className="h-px flex-1 bg-white/15" />
        </div>

        {detailsOpen && (
          <div id={detailsId} className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4 text-xs leading-5 text-slate-300">
            <div className="grid gap-2">
              <p><strong className="text-white">Produto:</strong> {item.product.name}</p>
              <p><strong className="text-white">Opção:</strong> {item.option.label}</p>
              <p><strong className="text-white">Categoria:</strong> {item.category}</p>
              {item.product.deliveryDays && <p><strong className="text-white">Prazo:</strong> {item.product.deliveryDays}</p>}
              {(selectedPriceModel?.label || warrantyLabel) && <p><strong className="text-white">Garantia:</strong> {selectedPriceModel?.label || warrantyLabel}</p>}
              <p className="pt-1 text-slate-400">{shortText(item.option.description || item.product.description)}</p>
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 border-t border-white/10 pt-4 text-center text-[9px] font-medium text-slate-400 sm:text-[11px]">
          <span className="inline-flex items-center justify-center gap-1.5 border-r border-white/10"><LockKeyhole className="h-4 w-4 text-violet-300" />Compra segura</span>
          <span className="inline-flex items-center justify-center gap-1.5 border-r border-white/10"><ShieldCheck className="h-4 w-4 text-violet-300" />Suporte H2</span>
          <span className="inline-flex items-center justify-center gap-1.5"><Zap className="h-4 w-4 text-violet-300" />Entrega garantida</span>
        </div>
      </div>
    </article>
  );
}
