import { Check, ChevronDown, ChevronUp, CircleAlert, Crown, Flame, ShieldCheck, ShoppingCart, Tag, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./StorefrontProductCard.css";
import { requestProductManifest } from "@/lib/productManifest";
import { useVipMembership } from "@/hooks/useVipMembership";
import { type GlobalPromotionConfig, globalPromotionIsActive, globalPromotionPrice, calculateGlobalPromotionPrice, globalPromotionLabel } from "@shared/globalPromotion";
import { applyVipBenefitToPrice, formatBrazilMoney, hasVipBenefit, isVipHighlighted, isVipOnlyLocked, normalizeVipAccessMode, parseBrazilMoney, vipBenefitText } from "@shared/vipPricing";

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
  vipAccessMode?: 'all' | 'benefit' | 'vip_only';
  vipDiscountType?: 'percentage' | 'fixed';
  vipDiscountValue?: number;
  vipHighlight?: number;
  vipHighlightText?: string | null;
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
    bg: "from-orange-950/45 via-[#160b0c]/75 to-[#050816]/85",
    text: "text-orange-300",
    badge: "bg-orange-400",
    ring: "ring-orange-300/35",
    shadow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.04),0_0_26px_rgba(249,115,22,0.22)]",
  },
  {
    border: "border-cyan-400",
    bg: "from-cyan-950/55 via-[#06314d]/72 to-[#050816]/85",
    text: "text-cyan-300",
    badge: "bg-cyan-400",
    ring: "ring-cyan-300/45",
    shadow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.20),inset_0_-1px_0_rgba(255,255,255,0.04),0_0_36px_rgba(34,211,238,0.32)]",
  },
  {
    border: "border-emerald-400/90",
    bg: "from-emerald-950/50 via-[#07332c]/72 to-[#050816]/85",
    text: "text-emerald-300",
    badge: "bg-emerald-400",
    ring: "ring-emerald-300/35",
    shadow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.04),0_0_26px_rgba(16,185,129,0.22)]",
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
  globalPromotion,
}: {
  item: StorefrontCatalogItem;
  onBuy: (tier: StorefrontWarrantyTier | null, priceModel: StorefrontPriceModel | null) => void;
  onAddToCart: (tier: StorefrontWarrantyTier | null, priceModel: StorefrontPriceModel | null) => void;
  globalPromotion?: GlobalPromotionConfig;
}) {
  const sitePromoActive = globalPromotionIsActive(globalPromotion);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const tiers = item.option.warrantyTiers || [];
  const [tierId, setTierId] = useState<number | null>(tiers[0]?.id ?? null);
  const selectedTier = tiers.find((tier) => tier.id === tierId) || null;
  const priceModels = item.option.priceModels || [];
  const { isVipCustomer } = useVipMembership();
  const selectablePriceModels = priceModels.filter(model => !isVipOnlyLocked(model, isVipCustomer));
  // A seleção automática sempre começa pela opção de menor valor, exibida à esquerda.
  // Se ela for exclusiva VIP para o cliente atual, usa a primeira opção liberada.
  const preferredModel = selectablePriceModels[0] || null;
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
    if (!selectablePriceModels.some((model) => model.id === priceModelId)) {
      const nextDefault = selectablePriceModels[0] || null;
      setPriceModelId(nextDefault?.id ?? null);
    }
  }, [priceModels, priceModelId, isVipCustomer]);

  const selectedPriceModel = priceModels.find((model) => model.id === priceModelId) || null;
  const requiresPriceModelSelection = priceModels.length > 0;
  const vipAdjustedModelPrice = selectedPriceModel ? applyVipBenefitToPrice(selectedPriceModel.price, selectedPriceModel, isVipCustomer) : null;
  const modelHasVipPrice = !sitePromoActive && Boolean(selectedPriceModel && vipAdjustedModelPrice && vipAdjustedModelPrice !== selectedPriceModel.price);
  // Regra visual: o seletor e o valor principal de "Sua escolha" sempre exibem o valor normal.
  // O benefício VIP aparece separado, sem substituir a referência de preço do produto.
  const standardSelection = requiresPriceModelSelection ? selectedPriceModel : (selectedTier || item.option);
  const effectivePrice = sitePromoActive && standardSelection ? globalPromotionPrice(standardSelection, globalPromotion) : requiresPriceModelSelection ? selectedPriceModel?.price : (selectedTier?.price || item.option.price);
  const effectiveOriginalPrice = sitePromoActive && standardSelection ? calculateGlobalPromotionPrice(standardSelection, globalPromotion).base : requiresPriceModelSelection ? selectedPriceModel?.originalPrice : (selectedTier?.originalPrice || item.option.originalPrice);
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
  // Primeiro mostra a página VIP; quando o plano estiver indisponível, o contato com o ADM aparece lá.
  const vipHref = typeof window !== "undefined"
    ? `/vip?${new URLSearchParams({
        returnTo: window.location.pathname + window.location.search,
        product: item.product.name,
        option: selectedPriceModel?.label || item.option.label,
      }).toString()}`
    : "/vip";

  const handlePriceModelSelect = (nextId: number) => {
    setPriceModelId(nextId);
    setManifestAcceptedKey(null);
  };

  const runProtectedAction = async (action: "buy" | "cart") => {
    if (requiresPriceModelSelection && !selectedPriceModel) return;
    if (selectedPriceModel && isVipOnlyLocked(selectedPriceModel, isVipCustomer)) return;
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
      className={`storefront-product-card relative min-w-0 flex h-full flex-col overflow-hidden rounded-[34px] bg-[radial-gradient(circle_at_50%_0%,rgba(68,104,214,.24),transparent_34%),radial-gradient(circle_at_16%_30%,rgba(124,58,237,.18),transparent_34%),linear-gradient(180deg,rgba(7,16,34,.90)_0%,rgba(5,9,22,.91)_48%,rgba(8,11,29,.94)_100%)] font-semibold backdrop-blur-2xl ring-1 ring-white/[0.06] ${hasActivePromotion ? "border border-amber-300/95 shadow-[0_0_0_1px_rgba(250,204,21,.28),0_0_36px_rgba(245,158,11,.34),0_32px_90px_rgba(0,0,0,.66)]" : "border border-violet-500/85 shadow-[0_32px_90px_rgba(0,0,0,.66),0_0_42px_rgba(124,58,237,.25)]"}`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-[1px] z-20 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-80" />
      {hasActivePromotion && (
        <div className="relative z-30 flex min-h-[38px] flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-amber-300/70 bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 px-3 py-2 text-[10px] font-black uppercase tracking-[0.06em] text-[#1b1000] shadow-[0_5px_22px_rgba(245,158,11,.28)] sm:text-[11px]">
          <span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5 fill-orange-700/35" /> Promoção{maxPromotionDiscount > 0 ? ` • ${maxPromotionDiscount}% OFF` : ""}</span>
          {promotionCountdown ? <span className="inline-flex items-center gap-1 rounded-full bg-black/16 px-2 py-0.5"><Timer className="h-3.5 w-3.5" /> termina em {promotionCountdown}</span> : <span className="rounded-full bg-black/16 px-2 py-0.5">oferta ativa</span>}
        </div>
      )}

      <div className={`pointer-events-none absolute inset-x-10 ${hasActivePromotion ? "top-[38px]" : "top-0"} h-px bg-gradient-to-r from-transparent via-violet-300 to-transparent shadow-[0_0_24px_rgba(167,139,250,.95)]`} />

      <div className="storefront-product-card__header relative overflow-hidden rounded-b-[28px] border-b border-violet-300/40 bg-[radial-gradient(circle_at_90%_25%,rgba(129,140,248,.24),transparent_28%),linear-gradient(135deg,rgba(76,29,149,.28),rgba(15,23,42,.24)_55%,rgba(255,255,255,.025))] px-4 py-4 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,.18),inset_0_-1px_0_rgba(255,255,255,.04)] sm:px-5 sm:py-4">
        <div className="pointer-events-none absolute right-5 top-3 text-[56px] font-black tracking-tighter text-violet-300/[0.06] sm:text-[74px]">{item.category}</div>
        <div className="relative flex min-w-0 items-start gap-[clamp(8px,1vw,16px)] pr-1">
          <div className="storefront-product-card__icon grid h-[clamp(54px,5vw,74px)] w-[clamp(54px,5vw,74px)] shrink-0 place-items-center overflow-hidden rounded-[22px] border border-violet-300/55 bg-black/50 shadow-[0_0_24px_rgba(139,92,246,.45),inset_0_0_18px_rgba(255,255,255,.08)]">
            {item.product.iconUrl ? <img src={item.product.iconUrl} alt="" loading="lazy" className="h-[clamp(42px,4vw,58px)] w-[clamp(42px,4vw,58px)] rounded-2xl object-contain" /> : <Tag className="h-7 w-7 text-violet-300" />}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-violet-400/60 bg-violet-500/20 px-[clamp(7px,0.8vw,12px)] py-1 text-[clamp(8px,0.75vw,11px)] font-black uppercase tracking-[0.10em] text-violet-200 shadow-[0_0_16px_rgba(139,92,246,.16)]">{productPill}</span>
            <h3 className="storefront-product-card__heading mt-1.5 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(16px,1.7vw,30px)] font-black leading-[1.02] tracking-tight text-white">{item.option.label.trim()}</h3>
            <span className="mt-2 inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-violet-300/40 bg-violet-500/10 px-[clamp(7px,0.8vw,12px)] py-1 text-[clamp(8px,0.7vw,10px)] font-black uppercase tracking-[0.13em] text-violet-200/90">TIPO DE CONTA</span>
          </div>
        </div>
        <div className="storefront-product-card__tag-row relative mt-3 flex items-end justify-between gap-2">
          <p className="storefront-product-card__tagline min-w-0 max-w-[68%] text-[clamp(9px,0.8vw,14px)] font-bold leading-[1.35] text-violet-100/75">{productTagline(item)}</p>
          <div className="storefront-product-card__quality flex shrink-0 items-center gap-[clamp(4px,0.5vw,8px)] rounded-2xl border border-violet-400/70 bg-violet-950/55 px-[clamp(7px,0.8vw,12px)] py-[clamp(5px,0.55vw,8px)] text-violet-200 shadow-[0_0_18px_rgba(139,92,246,.20)]">
            <Crown className="h-5 w-5" />
            <div className="text-[9px] font-black uppercase leading-3 tracking-wide"><span className="block">Qualidade</span><span className="text-violet-100">H2</span></div>
          </div>
        </div>
      </div>

      <div className="storefront-product-card__body p-4 sm:p-4">
        {priceModels.length > 0 && (
          <div>
            <div className="flex items-start gap-3">
              <Crown className="mt-0.5 h-7 w-7 shrink-0 fill-violet-500/30 text-violet-400" />
              <div>
                <p className="text-[clamp(15px,1.45vw,24px)] font-black uppercase leading-none tracking-[-0.02em] text-white drop-shadow-[0_1px_0_rgba(255,255,255,.08)]">Escolha sua garantia</p>
                <p className="mt-1 text-[clamp(9px,0.8vw,14px)] font-semibold text-slate-300/80">Mais corridas, mais tempo, mais tranquilidade.</p>
              </div>
            </div>
            <div data-model-count={priceModels.length} className={`storefront-product-card__model-grid mt-3 grid w-full gap-2 sm:gap-2 ${priceModels.length === 1 ? "grid-cols-1" : priceModels.length === 2 ? "grid-cols-2" : priceModels.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
              {priceModels.map((model, index) => {
                const isSelected = model.id === priceModelId;
                const palette = OPTION_PALETTES[Math.min(index, OPTION_PALETTES.length - 1)];
                const parts = splitModelLabel(model.label);
                const modelPromotion = promotionByModel.get(model.id);
                const modelDiscount = discountPercent(model.price, model.originalPrice);
                const modelHasDiscount = sitePromoActive ? calculateGlobalPromotionPrice(model, globalPromotion).savingsCents > 0 : modelDiscount > 0;
                const modelLocked = isVipOnlyLocked(model, isVipCustomer);
                const modelVipMode = normalizeVipAccessMode(model.vipAccessMode);
                const modelVipHighlighted = !sitePromoActive && isVipHighlighted(model);
                const modelHasVipBenefit = !sitePromoActive && hasVipBenefit(model);
                const vipPreviewPrice = sitePromoActive ? globalPromotionPrice(model, globalPromotion) : applyVipBenefitToPrice(model.price, model, true);
                const vipSavings = Math.max(0, parseBrazilMoney(model.price) - parseBrazilMoney(vipPreviewPrice));
                return (
                  <button key={model.id} type="button" aria-pressed={isSelected} disabled={modelLocked} onClick={() => { if (!modelLocked) handlePriceModelSelect(model.id); }} style={priceModels.length === 1 ? { gridColumn: "1 / -1", width: "100%", maxWidth: "none" } : undefined} className={`relative min-w-0 w-full min-h-[182px] overflow-hidden rounded-[18px] border bg-gradient-to-b px-2 pb-2 pt-5 text-center backdrop-blur-xl transition-all ${palette.border} ${palette.bg} ${palette.shadow} ${isSelected ? `-translate-y-1 ring-2 ${palette.ring}` : "hover:-translate-y-0.5"} ${modelPromotion?.active ? "outline outline-1 outline-amber-300/60" : ""} ${modelVipHighlighted ? "ring-1 ring-amber-300/70" : ""} ${modelLocked ? "cursor-not-allowed opacity-80 saturate-75" : ""}`}>
                    <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-[1px] h-px bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-90" />
                    {!sitePromoActive && modelVipMode !== 'all' && <span className={`absolute right-1 top-1 z-20 max-w-[46%] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-[clamp(4px,0.45vw,8px)] py-1 text-[clamp(6px,0.5vw,8px)] font-black uppercase shadow-lg ${modelLocked ? 'border-rose-300/70 bg-rose-950 text-rose-200' : 'border-amber-300/70 bg-amber-400 text-amber-950'}`}>{modelLocked ? '🔒 SOMENTE VIP' : `👑 ${model.vipHighlightText || 'VIP'}`}</span>}
                    {index === 0 && modelHasDiscount ? (
                      <span className="absolute left-1 top-1 max-w-[52%] overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 px-[clamp(4px,0.45vw,10px)] py-1 text-[clamp(6px,0.5vw,8px)] font-black uppercase tracking-wide text-white shadow-[0_0_16px_rgba(249,115,22,.52)] sm:text-[9px]">Oferta -{modelDiscount}%</span>
                    ) : index === 1 ? (
                      <span className="absolute left-1 top-1 max-w-[52%] overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-cyan-400 px-[clamp(4px,0.45vw,12px)] py-1 text-[clamp(6px,0.5vw,8px)] font-black uppercase tracking-wide text-[#03111c] shadow-[0_0_16px_rgba(34,211,238,.38)] sm:text-[10px]">Mais escolhida</span>
                    ) : null}
                    <ShieldCheck className={`mx-auto h-6 w-6 ${palette.text}`} />
                    <span className="mt-1.5 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(9px,0.82vw,14px)] font-black leading-4 tracking-[-0.02em] text-white">{parts.title}</span>
                    <span className={`mt-1 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(10px,0.92vw,16px)] font-black leading-none ${palette.text}`}>{parts.subtitle}</span>
                    <div className="mt-2 min-h-[60px] border-t border-white/20 pt-1.5">
                      {sitePromoActive ? (<div className="flex flex-col items-center"><span className="text-xs text-slate-300 line-through">{calculateGlobalPromotionPrice(model, globalPromotion).base}</span><strong className="text-lg text-emerald-300">{globalPromotionPrice(model, globalPromotion)}</strong></div>) : modelVipMode === 'all' ? (
                        modelHasDiscount && model.originalPrice ? (
                          <div className="flex flex-col items-center">
                            <div className="flex items-baseline justify-center gap-1 whitespace-nowrap">
                              <span className="text-[8px] font-black uppercase tracking-wide text-white/75 sm:text-[9px]">DE</span>
                              <span className="relative inline-block text-[13px] font-black text-white drop-shadow-[0_0_5px_rgba(255,255,255,.16)] sm:text-[14px] lg:text-[13px]">
                                {asMoney(model.originalPrice)}
                              </span>
                            </div>
                            <span className={`mt-0.5 block text-[9px] font-black uppercase tracking-[0.08em] ${palette.text} sm:text-[10px]`}>POR</span>
                            <span className={`mt-0.5 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(15px,1.3vw,23px)] font-black leading-none tracking-[-0.03em] text-emerald-300 drop-shadow-[0_0_14px_rgba(74,222,128,.58)] sm:text-[23px] lg:text-[22px]`}>{asMoney(model.price)}</span>
                            <span className="mt-1.5 inline-flex whitespace-nowrap rounded-full border border-emerald-300/70 bg-emerald-500/12 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.04em] text-emerald-200 shadow-[0_0_14px_rgba(16,185,129,.24)] sm:text-[9px] lg:text-[8px]">Economize {modelDiscount}%</span>
                          </div>
                        ) : (
                          <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(11px,1vw,16px)] font-black text-white">{asMoney(model.price)}</span>
                        )
                      ) : (
                        <>
                          <span className="block text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">Valor normal</span>
                          <span className="mt-1 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(12px,1.05vw,18px)] font-black leading-none text-white">{asMoney(model.price)}</span>
                        </>
                      )}
                    </div>
                    {isSelected ? <span className={`mx-auto mt-1.5 grid h-7 w-7 place-items-center rounded-full ${palette.badge} text-slate-950`}><Check className="h-4 w-4 stroke-[3]" /></span> : <span className="mx-auto mt-1.5 block h-7 w-7 rounded-full border-[3px] border-slate-500/75 bg-slate-950/60" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tiers.length > 0 && priceModels.length === 0 && (
          <label className="mt-4 block rounded-2xl border border-violet-300/40 bg-violet-950/25 p-3 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_0_22px_rgba(124,58,237,.10)]">
            <span className="mb-2 block text-sm font-black uppercase text-violet-200">Escolha sua garantia</span>
            <select value={tierId ?? ""} onChange={(event) => setTierId(Number(event.target.value))} className="w-full rounded-xl border border-violet-300/30 bg-slate-950/70 px-3 py-3 text-sm font-semibold text-white outline-none focus:border-violet-300">
              {tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.warrantyLabel || `${tier.warrantyValue} ${tier.warrantyType}`} — {asMoney(tier.price)}</option>)}
            </select>
          </label>
        )}

        <div className="storefront-product-card__selection relative mt-3 overflow-hidden rounded-[22px] border border-violet-300/75 bg-[radial-gradient(circle_at_18%_12%,rgba(124,58,237,.32),transparent_36%),radial-gradient(circle_at_86%_12%,rgba(59,130,246,.16),transparent_34%),linear-gradient(135deg,rgba(18,14,58,.82),rgba(6,10,31,.86)_58%,rgba(3,7,22,.91))] p-3.5 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,.20),inset_0_-1px_0_rgba(255,255,255,.04),0_0_0_1px_rgba(139,92,246,.10),0_0_34px_rgba(124,58,237,.20)] sm:p-4 lg:p-3.5">
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-[1px] h-px bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-90" />
          <div className="storefront-product-card__selection-head relative flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600/25 text-violet-300"><Tag className="h-5 w-5" /></div>
            <p className="text-[14px] font-black uppercase tracking-[0.12em] text-violet-300 sm:text-base">Sua escolha</p>
            <span className="storefront-product-card__account-badge ml-auto rounded-full border border-violet-300/35 bg-white/[0.04] px-3 py-1 text-[9px] font-black uppercase text-violet-100 sm:text-[10px]">CONTA {categoryLabel}</span>
          </div>
          <p className="storefront-product-card__selection-name relative mt-3 text-[14px] font-black uppercase leading-5 tracking-[0.02em] text-white sm:text-[17px]">{selectedParts ? `${item.option.label} • ${selectedParts.title} • ${selectedParts.subtitle}` : `${item.option.label} • escolha uma garantia`}</p>
          <div className="relative mt-3 border-t border-white/20 pt-3">
            {discount > 0 && !(selectedPriceModel && modelHasVipPrice) ? (
              <div className="storefront-product-card__price-grid grid grid-cols-[minmax(0,1fr)_108px] items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_116px] sm:gap-3 lg:grid-cols-[minmax(0,1fr)_108px] lg:gap-2.5 xl:grid-cols-[minmax(0,1fr)_116px] xl:gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 whitespace-nowrap">
                    <span className="text-[13px] font-black uppercase tracking-[0.08em] text-white/80 sm:text-sm">DE</span>
                    <span className="storefront-product-card__original-price relative inline-block text-[24px] font-black leading-none text-white drop-shadow-[0_0_10px_rgba(255,255,255,.18)] sm:text-[28px] lg:text-[24px] xl:text-[28px]">
                      {asMoney(effectiveOriginalPrice)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="block text-[16px] font-black uppercase tracking-[0.08em] text-emerald-300 sm:text-lg">POR</span>
                    <p className="storefront-product-card__sale-price mt-1 whitespace-nowrap text-[36px] font-black leading-[0.88] tracking-[-0.045em] text-emerald-300 drop-shadow-[0_0_26px_rgba(74,222,128,.62)] sm:text-[42px] lg:text-[36px] xl:text-[40px]">{effectivePrice ? asMoney(effectivePrice) : "Valor após a escolha"}</p>
                  </div>
                </div>
                <div className="storefront-product-card__saving flex min-h-[112px] flex-col items-center justify-center rounded-[22px] border-[3px] border-red-500 bg-[radial-gradient(circle_at_50%_18%,rgba(249,115,22,.25),transparent_30%),linear-gradient(180deg,rgba(72,8,18,.98),rgba(24,3,9,.99))] px-2 text-center shadow-[0_0_8px_rgba(239,68,68,.75),0_0_26px_rgba(239,68,68,.48)]">
                  <Flame className="h-10 w-10 fill-orange-500 text-orange-500 drop-shadow-[0_0_12px_rgba(249,115,22,.95)] sm:h-10 sm:w-10 lg:h-9 lg:w-9 xl:h-10 xl:w-10" />
                  <span className="mt-1 text-[11px] font-black uppercase tracking-[0.04em] text-yellow-200 sm:text-[12px] lg:text-[10px] xl:text-[11px]">Economize</span>
                  <span className="mt-0.5 text-[34px] font-black leading-none tracking-[-0.03em] text-yellow-300 drop-shadow-[0_0_12px_rgba(250,204,21,.35)] sm:text-[36px] lg:text-[32px] xl:text-[34px]">{discount}%</span>
                </div>
              </div>
            ) : (
              <>
                {effectiveOriginalPrice && <p className="text-[11px] font-extrabold text-slate-500">{asMoney(effectiveOriginalPrice)}</p>}
                <p className={`break-words font-black leading-none tracking-tight ${effectivePrice ? "text-[clamp(28px,3vw,42px)] text-teal-300 drop-shadow-[0_0_18px_rgba(45,212,191,.35)]" : "text-lg text-slate-400 sm:text-2xl"}`}>{effectivePrice ? asMoney(effectivePrice) : "Valor após a escolha"}</p>
              </>
            )}
            {!sitePromoActive && selectedPriceModel && hasVipBenefit(selectedPriceModel) && (() => {
              const normalPrice = selectedPriceModel.price;
              const vipPrice = applyVipBenefitToPrice(normalPrice, selectedPriceModel, true);
              const saving = Math.max(0, parseBrazilMoney(normalPrice) - parseBrazilMoney(vipPrice));
              return (
                <div className="relative mt-3 overflow-hidden rounded-[20px] border border-amber-300/60 bg-[radial-gradient(circle_at_85%_0%,rgba(251,191,36,.20),transparent_44%),linear-gradient(155deg,rgba(40,19,74,.93),rgba(9,14,35,.97)_57%,rgba(29,16,45,.96))] shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_0_28px_rgba(251,191,36,.17)]">
                  <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-yellow-200/95 to-transparent" />
                  <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-amber-300/25 px-3 py-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-200">
                      <Crown aria-hidden="true" className="h-4 w-4 shrink-0 text-yellow-300" />
                      Benefício H2 VIP
                    </span>
                    <span className="rounded-full border border-yellow-300/40 bg-yellow-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-yellow-200">
                      Pague menos
                    </span>
                  </div>
                  <div className="storefront-product-card__vip-prices grid grid-cols-1 divide-y divide-amber-100/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                    <div className="bg-slate-950/35 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-300">
                        {isVipCustomer ? 'VALOR NORMAL' : '👤 VOCÊ NÃO É VIP • PAGA'}
                      </p>
                      <p className="storefront-product-card__vip-price mt-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(21px,2.1vw,30px)] font-black tabular-nums text-white">
                        {asMoney(normalPrice)}
                      </p>
                    </div>
                    <div className="relative bg-[linear-gradient(125deg,rgba(251,191,36,.17),rgba(139,92,246,.10))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.07)]">
                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-yellow-100">
                        {isVipCustomer ? '👑 VOCÊ É VIP • PAGA' : '👑 COM VIP • VOCÊ PAGA'}
                      </p>
                      <p className="storefront-product-card__vip-price mt-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(22px,2.1vw,31px)] font-black tabular-nums text-yellow-300 drop-shadow-[0_0_14px_rgba(250,204,21,.28)]">
                        {asMoney(vipPrice)}
                      </p>
                      {saving > 0 && (
                        <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-emerald-300">
                          {isVipCustomer ? 'Você economizou' : 'Você economiza'} {formatBrazilMoney(saving)}
                        </p>
                      )}
                    </div>
                  </div>
                  {!isVipCustomer && (
                    <div className="border-t border-amber-300/25 bg-violet-950/20 p-2.5">
                      <a
                        href={vipHref}
                        aria-label="Quero ser VIP"
                        className="group/vip inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-yellow-100/65 bg-gradient-to-r from-[#fde68a] via-[#facc15] to-[#f59e0b] px-3 py-2.5 text-[12px] font-black uppercase tracking-[0.05em] text-[#291700] shadow-[inset_0_1px_0_rgba(255,255,255,.68),0_10px_26px_rgba(250,204,21,.30)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_14px_30px_rgba(250,204,21,.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-100 focus-visible:ring-offset-2 focus-visible:ring-offset-[#180f2c] active:translate-y-0 active:scale-[0.99]"
                      >
                        <Crown aria-hidden="true" className="h-5 w-5 shrink-0" />
                        <span>Quero ser VIP</span>
                        <span aria-hidden="true" className="text-lg leading-none transition-transform group-hover/vip:translate-x-1">→</span>
                      </a>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="mt-auto px-4 pb-4 sm:px-4">
        <div className="storefront-product-card__actions grid grid-cols-[1.22fr_.9fr] gap-2">
          <button type="button" disabled={requiresPriceModelSelection && !selectedPriceModel} onClick={() => void runProtectedAction("buy")} className="storefront-product-card__action inline-flex min-h-[50px] items-center justify-center gap-3 rounded-[20px] border border-white bg-gradient-to-b from-white to-slate-200 px-3 text-[16px] font-black text-[#090b21] lg:text-[14px] xl:text-[15px] shadow-[0_12px_32px_rgba(255,255,255,.18)] transition-all hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 sm:text-lg"><ShoppingCart className="h-6 w-6" /> Comprar agora <span className="text-2xl leading-none">→</span></button>
          <button type="button" disabled={requiresPriceModelSelection && !selectedPriceModel} onClick={() => void runProtectedAction("cart")} className="storefront-product-card__action inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[20px] border border-violet-400/90 bg-gradient-to-br from-violet-900/95 to-purple-950/85 px-3 text-[16px] font-black text-violet-100 lg:text-[14px] xl:text-[15px] shadow-[0_12px_32px_rgba(124,58,237,.22),inset_0_1px_0_rgba(255,255,255,.08)] transition-all hover:brightness-125 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 sm:text-lg"><ShoppingCart className="h-5 w-5" /> Carrinho</button>
        </div>

        <div className="mt-3">
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            aria-label={detailsOpen ? "Ocultar detalhes do produto" : "Ver detalhes do produto"}
            onClick={() => setDetailsOpen((open) => !open)}
            className={[
              "storefront-product-card__details group/details relative isolate flex min-h-[56px] w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border-2 px-3.5 py-2.5 text-left backdrop-blur-xl transition-all duration-200 hover:brightness-110 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090c20] motion-reduce:transition-none",
              detailsOpen
                ? "border-violet-300/75 bg-gradient-to-r from-violet-700/45 via-indigo-950/65 to-violet-900/50 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_8px_24px_rgba(124,58,237,.18)] focus-visible:ring-violet-300"
                : "border-[#FF5267] bg-[linear-gradient(110deg,#380C1B,#160E2A)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_0_18px_rgba(244,63,94,.24)] focus-visible:ring-rose-300",
            ].join(" ")}
          >
            {!detailsOpen && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[14px] border-2 border-[#FF5267] shadow-[inset_0_0_16px_rgba(244,63,94,.20),0_0_18px_rgba(244,63,94,.58)] animate-pulse motion-reduce:animate-none"
              />
            )}
            <span className="relative z-10 flex min-w-0 items-center gap-2.5">
              <CircleAlert aria-hidden="true" className={detailsOpen ? "h-6 w-6 shrink-0 text-violet-300" : "h-6 w-6 shrink-0 text-[#FF5267]"} />
              <span className="flex min-w-0 flex-col gap-0.5">
                {!detailsOpen && (
                  <span className="text-[10px] font-black uppercase leading-tight tracking-[0.05em] text-[#FF5267]">
                    INFORMAÇÕES IMPORTANTES
                  </span>
                )}
                <span className="text-[12px] font-black uppercase leading-tight tracking-[0.01em] text-white sm:text-sm">
                  {detailsOpen ? "OCULTAR DETALHES" : "VER DETALHES DO PRODUTO"}
                </span>
                {!detailsOpen && (
                  <span className="text-[10px] font-semibold leading-[1.2] text-rose-200/90 sm:text-[11px]">
                    Toque para consultar garantia, prazo e informações.
                  </span>
                )}
              </span>
            </span>
            <span className={detailsOpen ? "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-violet-300/40 bg-violet-300/10 text-violet-200" : "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-rose-400/55 bg-rose-400/10 text-[#FF5267]"}>
              {detailsOpen ? <ChevronUp aria-hidden="true" className="h-5 w-5" /> : <ChevronDown aria-hidden="true" className="h-5 w-5" />}
            </span>
          </button>
        </div>

        {detailsOpen && (
          <div id={detailsId} className="mt-3 rounded-xl border border-white/15 bg-white/[0.035] p-3 text-xs font-semibold leading-5 text-slate-300 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
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

      </div>
    </article>
  );
}
