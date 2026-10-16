export type ProductBadgeSize = "small" | "medium" | "large";
export type ProductBadgeAlign = "left" | "center" | "right";

export type ProductBadgeInput = {
  name: string;
  badgeBgColor?: string | null;
  badgeTextColor?: string | null;
  badgeBorderColor?: string | null;
  badgeSize?: string | null;
  badgeAlign?: string | null;
};

const BADGE_SIZE_CLASSES: Record<ProductBadgeSize, string> = {
  small: "min-h-[34px] px-3 py-1.5 text-[11px] sm:text-xs",
  medium: "min-h-[39px] px-4 py-2 text-[12px] sm:text-[13px]",
  large: "min-h-[44px] px-5 py-2.5 text-[13px] sm:text-[15px]",
};

const BADGE_ALIGN_CLASSES: Record<ProductBadgeAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

function validColor(input: string | null | undefined, fallback: string) {
  return typeof input === "string" && /^#[0-9a-f]{6}$/i.test(input) ? input : fallback;
}

/**
 * The named UBER CARRO VIAGENS product receives a readable, highlighted default.
 * Other products retain the former subtle pill until explicitly customized in ADM.
 * All settings are visual only: the actual product name, ID and checkout stay intact.
 */
export function resolveProductBadgeAppearance(input: ProductBadgeInput) {
  const normalized = input.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
  const featured = normalized.includes("UBER CARRO VIAGENS");
  const customized = [input.badgeBgColor, input.badgeTextColor, input.badgeBorderColor, input.badgeSize, input.badgeAlign]
    .some(value => typeof value === "string" && value.trim().length > 0);
  const size: ProductBadgeSize =
    input.badgeSize === "small" || input.badgeSize === "medium" || input.badgeSize === "large"
      ? input.badgeSize
      : featured ? "large" : "medium";
  const align: ProductBadgeAlign =
    input.badgeAlign === "center" || input.badgeAlign === "right" ? input.badgeAlign : "left";

  return {
    highlighted: featured || customized,
    background: validColor(input.badgeBgColor, "#1d4ed8"),
    text: validColor(input.badgeTextColor, "#ffffff"),
    border: validColor(input.badgeBorderColor, "#67e8f9"),
    size,
    align,
    sizeClass: BADGE_SIZE_CLASSES[size],
    alignClass: BADGE_ALIGN_CLASSES[align],
  };
}
