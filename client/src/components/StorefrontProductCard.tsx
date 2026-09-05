import { Check, ChevronDown, ChevronUp, ShieldCheck, ShoppingCart, Tag, UserRound, Zap } from "lucide-react";
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
    border: "border-amber-500/80",
    bg: "from-amber-950/55 via-slate-950/90 to-slate-950",
    text: "text-amber-300",
    glow: "shadow-[0_0_28px_rgba(245,158,11,0.16)]",
    ring: "ring-amber-300/35",
  },
  {
    border: "border-cyan-400/80",
    bg: "from-cyan-950/60 via-slate-950/90 to-slate-950",
    text: "text-cyan-300",
    glow: "shadow-[0_0_32px_rgba(34,211,238,0.22)]",
    ring: "ring-cyan-300/40",
  },
  {
    border: "border-emerald-400/80",
    bg: "from-emerald-950/55 via-slate-950/90 to-slate-950",
    text: "text-emerald-300",
    glow: "shadow-[0_0_28px_rgba(16,185,129,0.16)]",
    ring: "ring-emerald-300/35",
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

function priceModelDiscount(model: StorefrontPriceModel) {
  if (model.promoEndsAt && model.promoEndsAt <= Date.now()) return 0;
  const original = asNumber(model.originalPrice);
  const price = asNumber(model.price);
  return original > price && price > 0 ? Math.round(((original - price) / original) * 100) : 0;
}

function formatPromoDate(value: number | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
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

function splitModelLabel(label: string) {
  const clean = label.trim().toUpperCase();
  const match = clean.match(/(?:GARANTIA\s+DE\s+)?(.+?CORRIDAS)(?:\s+OU\s+|\s*[-–—]\s*)(.+?DIAS?)$/i);
  if (match) {
    return { title: match[1].trim(), subtitle: match[2].trim() };
  }
  const pipe = clean.split(/\s*[|•]\s*/);
  if (pipe.length > 1) return { title: pipe[0], subtitle: pipe.slice(1).join(" • ") };
  return { title: clean, subtitle: "SELECIONAR" };
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
  const [now, setNow] = useState(() => Date.now());
  const tiers = item.option.warrantyTiers || [];
  const [tierId, setTierId] = useState<number | null>(tiers[0]?.id ?? null);
  const selectedTier = tiers.find((tier) => tier.id === tierId) || null;
  const priceModels = item.option.priceModels || [];
  const [priceModelId, setPriceModelId] = useState<number | null>(null);
  const [manifestAcceptedKey, setManifestAcceptedKey] = useState<string | null>(null);
  const selectedPriceModel = priceModels.find((model) => model.id === priceModelId) || null;
  const requiresPriceModelSelection = priceModels.length > 0;
  const selectorLabel = priceModels[0]?.selectorLabel?.trim() || "Escolha sua opção";
  const promotionalModels = priceModels.filter((model) => priceModelDiscount(model) > 0);
  const promoEndsAt = promotionalModels.map(model => model.promoEndsAt || 0).filter(Boolean).sort((a, b) => a - b)[0] || null;
  const promoRemaining = promoEndsAt ? Math.max(0, promoEndsAt - now) : null;
  const effectivePrice = requiresPriceModelSelection ? selectedPriceModel?.price : (selectedTier?.price || item.option.price);
  const effectiveOriginalPrice = requiresPriceModelSelection ? selectedPriceModel?.originalPrice : (selectedTier?.originalPrice || item.option.originalPrice);
  const discount = useMemo(() => {
    const original = asNumber(effectiveOriginalPrice);
    const price = asNumber(effectivePrice);
    return original > price && price > 0 ? Math.round(((original - price) / original) * 100) : 0;
  }, [effectiveOriginalPrice, effectivePrice]);
  const productColor = item.product.cardColor || "#7c3aed";
  const cartButtonColor = item.option.cardButtonColor || productColor;
  const description = item.option.description || item.product.description;
  const warrantyLabel = selectedTier?.warrantyLabel || (selectedTier ? `${selectedTier.warrantyValue} ${selectedTier.warrantyType}` : item.option.warranty);
  const detailsId = `product-details-${item.product.id}-${item.option.id}`;
  const selectedLabel = selectedPriceModel?.label || warrantyLabel || item.option.label;

  useEffect(() => {
    if (!promoEndsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [promoEndsAt]);

  const handlePriceModelSelect = async (nextId: number) => {
    const nextModel = priceModels.find(model => model.id === nextId);
    const key = `price:${nextId}`;
    const accepted = await requestProductManifest(
      [`price_model_manifest_${nextId}`, `option_manifest_${item.option.id}`],
      key,
      nextModel?.label || item.option.label,
    );
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
    <article className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-violet-500/70 bg-[radial-gradient(circle_at_20%_0%,rgba(124,58,237,.20),transparent_28%),linear-gradient(180deg,rgba(9,15,32,.98),rgba(2,6,23,.99))] shadow-[0_28px_72px_rgba(0,0,0,.58),0_0_30px_rgba(124,58,237,.16)]">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-400 to-transparent shadow-[0_0_18px_rgba(167,139,250,.8)]" />

      <div className="relative border-b border-violet-400/25 bg-gradient-to-br from-violet-500/15 via-slate-900/30 to-transparent p-5">
        {discount > 0 && (
          <div className="absolute right-4 top-4 rounded-full border border-rose-300/35 bg-rose-500/20 px-2.5 py-1 text-[10px] font-black text-rose-100">
            -{discount}% OFF
          </div>
        )}
        <div className="flex items-start gap-3 pr-16">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-violet-300/45 bg-black/35 shadow-[0_0_22px_rgba(139,92,246,.28)]">
            {item.product.iconUrl ? (
              <img src={item.product.iconUrl} alt="" loading="lazy" className="h-11 w-11 object-contain" />
            ) : (
              <Tag className="h-6 w-6 text-violet-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full border border-violet-400/35 bg-violet-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-200">
              {item.category}
            </span>
            <h3 className="mt-2 text-xl font-black leading-tight text-white">{item.option.label.trim()}</h3>
            <span className="mt-2 inline-flex rounded-full border border-violet-300/20 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-100/80">
              {item.product.name}
            </span>
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold leading-5 text-slate-300/75">{shortText(description, 110)}</p>
      </div>

      <div className="p-5 pb-4">
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-950/15 p-3">
          <div className="min-w-0 text-center">
            <span className="mx-auto grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200"><UserRound className="h-4 w-4" /></span>
            <p className="mt-2 text-[10px] font-black text-white">{item.product.name}</p>
            <p className="mt-0.5 text-[9px] font-semibold leading-3 text-slate-400">Produto selecionado</p>
          </div>
          <div className="min-w-0 border-x border-white/10 px-2 text-center">
            <span className="mx-auto grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200"><Zap className="h-4 w-4" /></span>
            <p className="mt-2 text-[10px] font-black text-white">Prazo</p>
            <p className="mt-0.5 text-[9px] font-semibold leading-3 text-slate-400">{item.product.deliveryDays || "Consulte no pedido"}</p>
          </div>
          <div className="min-w-0 text-center">
            <span className="mx-auto grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200"><ShieldCheck className="h-4 w-4" /></span>
            <p className="mt-2 text-[10px] font-black text-white">Acompanhamento</p>
            <p className="mt-0.5 text-[9px] font-semibold leading-3 text-slate-400">Do início ao fim</p>
          </div>
        </div>

        {priceModels.length > 0 && (
          <div className="mt-5">
            <div className="mb-3">
              <p className="text-base font-black uppercase tracking-tight text-white">Escolha sua garantia</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{selectorLabel}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {priceModels.map((model, index) => {
                const isSelected = model.id === priceModelId;
                const palette = OPTION_PALETTES[Math.min(index, OPTION_PALETTES.length - 1)];
                const parts = splitModelLabel(model.label);
                const modelDiscount = priceModelDiscount(model);
                const modelEnd = formatPromoDate(model.promoEndsAt);
                const modelRemaining = model.promoEndsAt ? Math.max(0, model.promoEndsAt - now) : null;
                return (
                  <button
                    key={model.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => void handlePriceModelSelect(model.id)}
                    className={`relative min-h-[150px] overflow-hidden rounded-2xl border bg-gradient-to-b p-4 text-center transition-all ${palette.border} ${palette.bg} ${palette.glow} ${isSelected ? `-translate-y-1 ring-2 ${palette.ring}` : "hover:-translate-y-0.5"}`}
                  >
                    {index === 1 && <span className="absolute inset-x-0 top-0 mx-auto w-max rounded-b-xl bg-cyan-400 px-3 py-1 text-[9px] font-black uppercase text-slate-950">Mais escolhida</span>}
                    <ShieldCheck className={`mx-auto ${index === 1 ? "mt-4" : "mt-1"} h-6 w-6 ${palette.text}`} />
                    <span className="mt-3 block text-sm font-black leading-5 text-white">{parts.title}</span>
                    <span className={`mt-1 block text-sm font-black ${palette.text}`}>{parts.subtitle}</span>
                    {isSelected ? (
                      <span className={`mx-auto mt-4 grid h-8 w-8 place-items-center rounded-full ${index === 0 ? "bg-amber-400" : index === 1 ? "bg-cyan-400" : "bg-emerald-400"} text-slate-950`}><Check className="h-4 w-4" /></span>
                    ) : (
                      <span className="mx-auto mt-4 block h-7 w-7 rounded-full border-2 border-slate-500/70 bg-slate-950/60" />
                    )}
                    {isSelected && modelDiscount > 0 && (
                      <span className="mt-3 block text-[9px] font-black uppercase text-emerald-300">Economize {modelDiscount}%</span>
                    )}
                    {isSelected && modelEnd && (
                      <span className="mt-1 block text-[9px] font-semibold text-slate-400">Até {modelEnd}</span>
                    )}
                    {isSelected && modelRemaining !== null && (
                      <span className="mt-1 block text-[9px] font-bold text-amber-200">Restam {formatRemaining(modelRemaining)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tiers.length > 0 && priceModels.length === 0 && (
          <label className="mt-5 block">
            <span className="mb-1.5 block text-xs font-black uppercase text-violet-200">Escolha sua garantia</span>
            <select
              value={tierId ?? ""}
              onChange={(event) => setTierId(Number(event.target.value))}
              className="w-full rounded-xl border border-violet-300/30 bg-slate-950/70 px-3 py-3 text-sm font-semibold text-white outline-none focus:border-violet-300"
            >
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.warrantyLabel || `${tier.warrantyValue} ${tier.warrantyType}`} — {asMoney(tier.price)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-5 rounded-2xl border border-violet-400/35 bg-gradient-to-br from-violet-950/50 via-slate-950/80 to-slate-950 p-4 shadow-[0_0_26px_rgba(124,58,237,.12)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">Sua escolha</p>
              <p className="mt-1 text-xs font-black leading-5 text-white">{requiresPriceModelSelection && !selectedPriceModel ? `${item.option.label} • escolha uma garantia` : `${item.option.label} • ${selectedLabel}`}</p>
            </div>
            <span className="rounded-full border border-violet-300/25 bg-white/[0.04] px-2 py-1 text-[9px] font-black uppercase text-violet-100">{item.product.name}</span>
          </div>
          <div className="mt-3 border-t border-white/10 pt-3">
            {requiresPriceModelSelection && !selectedPriceModel ? (
              <>
                <p className="text-lg font-black text-slate-400">Valor após a escolha</p>
                <p className="mt-1 text-[10px] font-semibold text-slate-500">Selecione uma garantia para visualizar o valor.</p>
              </>
            ) : (
              <>
                {effectiveOriginalPrice && <p className="text-xs font-semibold text-slate-500 line-through">{asMoney(effectiveOriginalPrice)}</p>}
                <p className="mt-1 text-3xl font-black leading-none text-teal-300 drop-shadow-[0_0_16px_rgba(45,212,191,.28)]">{asMoney(effectivePrice)}</p>
                {discount > 0 && <p className="mt-1 text-[10px] font-black text-emerald-300">Economize {discount}%</p>}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-white/10 bg-slate-950/55 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={requiresPriceModelSelection && !selectedPriceModel}
            onClick={() => void runProtectedAction("buy")}
            className="min-h-12 rounded-xl border border-white/80 bg-white px-3 py-3 text-sm font-black text-slate-950 shadow-[0_10px_26px_rgba(255,255,255,.16)] transition-all hover:bg-slate-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Comprar agora
          </button>
          <button
            type="button"
            disabled={requiresPriceModelSelection && !selectedPriceModel}
            onClick={() => void runProtectedAction("cart")}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-violet-400/70 bg-violet-950/60 px-3 py-3 text-sm font-black text-violet-100 shadow-[0_10px_26px_rgba(124,58,237,.18)] transition-all hover:bg-violet-900/70 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
            style={{ boxShadow: `0 10px 26px ${cartButtonColor}24` }}
          >
            <ShoppingCart className="h-4 w-4" /> Carrinho
          </button>
        </div>

        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((open) => !open)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 border-t border-white/10 pt-3 text-xs font-bold text-white/75 transition-colors hover:text-white"
        >
          {detailsOpen ? "Ocultar detalhes" : "Ver detalhes"}
          {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {detailsOpen && (
          <div id={detailsId} className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-5 text-slate-300">
            <p className="mb-2">{shortText(description, 420)}</p>
            {warrantyLabel && <p className="mb-2 flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />{warrantyLabel}</p>}
            {item.option.documents.length > 0 && <p className="mb-2"><strong className="text-white">Documentos:</strong> {item.option.documents.map((document) => document.label).join(", ")}</p>}
            {item.option.questions.length > 0 && <p><strong className="text-white">Etapas:</strong> perguntas específicas desta opção serão apresentadas no fluxo de compra.</p>}
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center text-[9px] font-bold text-slate-500">
          <span>Compra segura</span>
          <span>Suporte H2</span>
          <span>Entrega acompanhada</span>
        </div>
      </div>
    </article>
  );
}
