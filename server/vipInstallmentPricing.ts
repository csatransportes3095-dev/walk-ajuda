import { sql } from "drizzle-orm";
import { applyCouponDiscountToCents, parseBrazilMoneyToCents } from "../shared/vipCheckoutPricing";
import { getDb, validateCoupon } from "./db";
import { checkOptionPriceModelCheckoutAccess } from "./routers/optionPriceModels";

export type VipCheckoutItemReference = {
  productId: number;
  optionId: number;
  priceModelId?: number | null;
  warrantyTierId?: number | null;
};

export type VipResolvedCheckoutItem = {
  productId: number;
  optionId: number;
  priceModelId: number | null;
  warrantyTierId: number | null;
  productName: string;
  optionName: string;
  priceLabel: string | null;
  priceSource: "option" | "warranty" | "price_model";
  amountCents: number;
};

export type VipResolvedCheckoutPricing = {
  pricingVersion: 1;
  items: VipResolvedCheckoutItem[];
  subtotalCents: number;
  couponCode: string | null;
  couponDiscountCents: number;
  totalCents: number;
};

function rowsOf<T>(result: any): T[] {
  if (Array.isArray(result?.[0])) return result[0] as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function positiveId(name: string, value: number | null | undefined) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${name} inválido.`);
  return Number(value);
}

async function resolveOneItem(item: VipCheckoutItemReference, isVipCustomer: boolean): Promise<VipResolvedCheckoutItem> {
  const productId = positiveId("Produto", item.productId);
  const optionId = positiveId("Opção", item.optionId);
  const db = (await getDb()) as any;
  if (!db) throw new Error("Banco de dados indisponível.");

  const optionResult = await db.execute(sql`
    SELECT p.id AS productId, p.name AS productName, p.isActive AS productActive,
           o.id AS optionId, o.label AS optionName, o.price AS optionPrice,
           o.originalPrice AS optionOriginalPrice, o.promoEndsAt AS optionPromoEndsAt,
           o.isActive AS optionActive
    FROM productOptions o
    INNER JOIN products p ON p.id=o.productId
    WHERE p.id=${productId} AND o.id=${optionId}
    LIMIT 1
  `);
  const option = rowsOf<any>(optionResult)[0];
  if (!option || Number(option.productActive) !== 1 || Number(option.optionActive) !== 1) {
    throw new Error("Produto ou opção indisponível.");
  }

  const tiersResult = await db.execute(sql`
    SELECT id, price, originalPrice, warrantyType, warrantyValue, warrantyLabel
    FROM warrantyTiers
    WHERE optionId=${optionId} AND isActive=1
    ORDER BY sortOrder ASC, id ASC
  `);
  const activeTiers = rowsOf<any>(tiersResult);
  let selectedTier: any | null = null;
  if (item.warrantyTierId != null) {
    const warrantyTierId = positiveId("Garantia", item.warrantyTierId);
    selectedTier = activeTiers.find((row) => Number(row.id) === warrantyTierId) || null;
    if (!selectedTier) throw new Error("Garantia selecionada não pertence a esta opção ou está indisponível.");
  } else if (activeTiers.length > 0) {
    throw new Error("Selecione a garantia antes de parcelar.");
  }

  let priceSource: VipResolvedCheckoutItem["priceSource"] = selectedTier ? "warranty" : "option";
  let rawPrice = selectedTier ? String(selectedTier.price || "") : String(option.optionPrice || "");
  let priceLabel: string | null = selectedTier
    ? `${selectedTier.warrantyValue || ""} ${selectedTier.warrantyType || ""} ${selectedTier.warrantyLabel || ""}`.trim()
    : null;

  if (!selectedTier && option.optionPromoEndsAt && Number(option.optionPromoEndsAt) <= Date.now() && String(option.optionOriginalPrice || "").trim()) {
    rawPrice = String(option.optionOriginalPrice);
  }

  let priceModelId: number | null = null;
  if (item.priceModelId != null) {
    priceModelId = positiveId("Modelo/categoria", item.priceModelId);
    const modelResult = await db.execute(sql`
      SELECT id, optionId, label, isActive
      FROM optionPriceModels
      WHERE id=${priceModelId} AND optionId=${optionId} AND isActive=1
      LIMIT 1
    `);
    const model = rowsOf<any>(modelResult)[0];
    if (!model) throw new Error("Modelo/categoria não pertence a esta opção ou está indisponível.");
    const modelAccess = await checkOptionPriceModelCheckoutAccess(priceModelId, isVipCustomer);
    if (!modelAccess.allowed || !modelAccess.effectivePrice) {
      throw new Error(modelAccess.reason || "Modelo/categoria indisponível.");
    }
    rawPrice = modelAccess.effectivePrice;
    priceSource = "price_model";
    priceLabel = String(model.label || "").trim() || null;
  }

  const amountCents = parseBrazilMoneyToCents(rawPrice);
  if (amountCents <= 0) throw new Error("Preço inválido para parcelamento.");

  return {
    productId,
    optionId,
    priceModelId,
    warrantyTierId: selectedTier ? Number(selectedTier.id) : null,
    productName: String(option.productName || "Produto"),
    optionName: String(option.optionName || "Opção"),
    priceLabel,
    priceSource,
    amountCents,
  };
}

export async function resolveVipInstallmentCheckoutPricing(input: {
  items: VipCheckoutItemReference[];
  isVipCustomer: boolean;
  couponCode?: string | null;
}): Promise<VipResolvedCheckoutPricing> {
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 20) {
    throw new Error("Carrinho inválido para parcelamento.");
  }
  if (!input.isVipCustomer) throw new Error("Parcelamento disponível somente para VIP ativo.");

  const items: VipResolvedCheckoutItem[] = [];
  for (const item of input.items) items.push(await resolveOneItem(item, true));

  const subtotalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents <= 0 || subtotalCents > 100_000_000_000) {
    throw new Error("Total do carrinho inválido.");
  }

  const couponCode = String(input.couponCode || "").trim().toUpperCase() || null;
  let couponDiscountCents = 0;
  let totalCents = subtotalCents;
  if (couponCode) {
    const validation = await validateCoupon(couponCode);
    if (!validation.valid || !validation.discountType || validation.discountValue == null) {
      throw new Error(validation.reason || "Cupom inválido ou indisponível.");
    }
    const discounted = applyCouponDiscountToCents(subtotalCents, {
      type: validation.discountType,
      value: Number(validation.discountValue),
    });
    couponDiscountCents = discounted.discountCents;
    totalCents = discounted.totalCents;
  }

  if (totalCents <= 0) throw new Error("O total precisa ser maior que zero para parcelamento.");

  return {
    pricingVersion: 1,
    items,
    subtotalCents,
    couponCode,
    couponDiscountCents,
    totalCents,
  };
}
