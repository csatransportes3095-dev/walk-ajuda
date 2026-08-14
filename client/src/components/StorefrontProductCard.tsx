import { Check, ChevronDown, ChevronUp, ClipboardList, FileText, ShieldCheck, ShoppingCart, Tag } from "lucide-react";
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
  cardAccentColor: string | null;
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

const CATEGORY_DEFAULT_COLORS: Record<string, string> = {
  Uber: '#7c3aed',
  'Táxi': '#dc2626',
  Documentos: '#dc2626',
  '99': '#dc2626',
};

function shortText(value: string | null | undefined, limit = 172) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
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
  // Prioridade visual: produto personalizado → categoria → padrão geral.
  const categoryColor = CATEGORY_DEFAULT_COLORS[item.category] || '#7c3aed';
  const borderColor = item.product.cardColor || categoryColor;
  const accentColor = item.product.cardAccentColor || borderColor;
  const cardBackground = item.product.cardBgColor || 'rgba(2, 6, 23, 0.9)';
  const textColor = item.product.cardTextColor || '#ffffff';
  const textMutedColor = item.product.cardTextColor ? `${item.product.cardTextColor}cc` : 'rgba(255,255,255,0.75)';
  const cartButtonColor = item.product.cardBtnColor || accentColor;
  const description = item.option.description || item.product.description;
  const warrantyLabel = selectedTier?.warrantyLabel || (selectedTier ? `${selectedTier.warrantyValue} ${selectedTier.warrantyType}` : item.option.warranty);
  const detailsId = `product-details-${item.product.id}-${item.option.id}`;

  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-slate-950/90 shadow-[0_18px_55px_rgba(0,0,0,0.34)] transition-transform duration-200 hover:-translate-y-1"
      style={{ borderColor: `${borderColor}99`, background: cardBackground }}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />
      {discount > 0 && (
        <div className="absolute right-4 top-4 z-10 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black text-white shadow-lg">
          -{discount}% OFF
        </div>
      )}

      <div className="p-5 pb-4">
        <div className="mb-4 flex items-start gap-3 pr-14">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/5">
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
            <h3 className="text-lg font-black leading-tight" style={{ color: textColor }}>{item.option.label.trim()}</h3>
            <p className="mt-1 text-xs font-semibold" style={{ color: textMutedColor }}>{item.product.name}</p>
          </div>
        </div>

        <p className="min-h-[43px] text-sm leading-relaxed" style={{ color: textMutedColor }}>{shortText(description)}</p>

        {tiers.length > 0 && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-bold text-white/70">Garantia</span>
            <select
              value={tierId ?? ""}
              onChange={(event) => setTierId(Number(event.target.value))}
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-violet-400"
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
            {effectiveOriginalPrice && <p className="mb-0.5 text-xs font-semibold text-white/40 line-through">{asMoney(effectiveOriginalPrice)}</p>}
            <p className="text-2xl font-black" style={{ color: textColor }}>{asMoney(effectivePrice)}</p>
            {discount > 0 && <p className="mt-0.5 text-xs font-bold text-emerald-300">Economize {discount}%</p>}
          </div>
          {item.product.deliveryDays && <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-[11px] font-bold text-white/65">Prazo: {item.product.deliveryDays}</span>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {item.option.documents.length > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-100"><FileText className="h-3.5 w-3.5" />{item.option.documents.length} documento{item.option.documents.length > 1 ? "s" : ""}</span>}
          {item.option.questions.length > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 text-[11px] font-bold text-violet-100"><ClipboardList className="h-3.5 w-3.5" />{item.option.questions.length} pergunta{item.option.questions.length > 1 ? "s" : ""}</span>}
          {warrantyLabel && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-100"><ShieldCheck className="h-3.5 w-3.5" />Garantia</span>}
        </div>
      </div>

      <div className="mt-auto border-t border-white/10 bg-black/20 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onBuy(selectedTier)}
            className="min-h-12 rounded-xl bg-white px-3 py-3 text-sm font-black text-slate-950 transition-transform active:scale-[0.98]"
          >
            Comprar agora
          </button>
          <button
            type="button"
            onClick={() => onAddToCart(selectedTier)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-black text-white transition-transform active:scale-[0.98]"
            style={{ background: `${cartButtonColor}28`, borderColor: `${cartButtonColor}aa`, color: textColor, boxShadow: `0 4px 14px ${cartButtonColor}35` }}
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
          <div id={detailsId} className="mt-2 rounded-xl border border-white/10 bg-slate-900/80 p-3 text-sm text-white/75">
            {warrantyLabel && <p className="mb-2 flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />{warrantyLabel}</p>}
            {item.option.documents.length > 0 && <p className="mb-2"><strong className="text-white">Documentos:</strong> {item.option.documents.map((document) => document.label).join(", ")}</p>}
            {item.option.questions.length > 0 && <p><strong className="text-white">Etapas:</strong> perguntas específicas desta opção serão apresentadas no fluxo de compra.</p>}
          </div>
        )}
      </div>
    </article>
  );
}
