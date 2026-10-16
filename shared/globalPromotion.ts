import { formatBrazilMoney, parseBrazilMoney } from "./vipPricing";

export const GLOBAL_PROMOTION_KEY = "global_promotion_config_v1";

export type GlobalPromotionConfig = {
  active: boolean;
  type: "percentage" | "fixed";
  value: number;
  revision: string;
  updatedAt: string | null;
};

export const DEFAULT_GLOBAL_PROMOTION: GlobalPromotionConfig = {
  active: false,
  type: "percentage",
  value: 10,
  revision: "not-configured",
  updatedAt: null,
};

export function parseGlobalPromotionConfig(value: string | null | undefined): GlobalPromotionConfig {
  if (!value) return { ...DEFAULT_GLOBAL_PROMOTION };
  try {
    const raw = JSON.parse(value) as Partial<GlobalPromotionConfig>;
    const type = raw?.type === "fixed" ? "fixed" : "percentage";
    const amount = Number(raw?.value);
    const valid = Number.isFinite(amount) && amount > 0 && amount <= (type === "percentage" ? 100 : 100000);
    return {
      active: raw?.active === true && valid,
      type,
      value: valid ? amount : DEFAULT_GLOBAL_PROMOTION.value,
      revision: typeof raw?.revision === "string" && raw.revision ? raw.revision : "unversioned",
      updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : null,
    };
  } catch {
    return { ...DEFAULT_GLOBAL_PROMOTION };
  }
}

export function globalPromotionIsActive(config: GlobalPromotionConfig | null | undefined): boolean {
  return config?.active === true && Number.isFinite(config.value) && config.value > 0 &&
    config.value <= (config.type === "percentage" ? 100 : 100000);
}

type StandardPrice = { price: string | null | undefined; originalPrice?: string | null };

export function calculateGlobalPromotionPrice(
  standard: StandardPrice,
  config: GlobalPromotionConfig | null | undefined,
): { baseCents: number; finalCents: number; savingsCents: number; base: string; final: string; applied: boolean } {
  const listed = Math.max(0, Math.round(parseBrazilMoney(standard.price) * 100));
  const previous = Math.max(0, Math.round(parseBrazilMoney(standard.originalPrice) * 100));
  // The crossed-out amount is the full, pre-existing catalog reference price.
  // A malformed lower "original" must never increase a sale's base.
  const baseCents = Math.max(listed, previous);
  const applied = globalPromotionIsActive(config) && baseCents > 0;
  const amountCents = applied
    ? config!.type === "percentage"
      ? Math.round(baseCents * config!.value / 100)
      : Math.round(config!.value * 100)
    : 0;
  // Prevent negative prices. Keep one cent for the existing paid PIX checkout.
  const finalCents = applied ? Math.max(1, baseCents - amountCents) : listed;
  return {
    baseCents,
    finalCents,
    savingsCents: Math.max(0, baseCents - finalCents),
    base: formatBrazilMoney(baseCents / 100),
    final: formatBrazilMoney(finalCents / 100),
    applied: Boolean(applied),
  };
}

export function globalPromotionPrice(
  standard: StandardPrice,
  config: GlobalPromotionConfig | null | undefined,
): string {
  return globalPromotionIsActive(config)
    ? calculateGlobalPromotionPrice(standard, config).final
    : String(standard.price || "");
}

export function globalPromotionLabel(config: GlobalPromotionConfig | null | undefined): string {
  if (!globalPromotionIsActive(config)) return "";
  return config!.type === "fixed"
    ? `${formatBrazilMoney(config!.value)} OFF EM CADA ITEM`
    : `${config!.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% OFF EM TODO O SITE`;
}
