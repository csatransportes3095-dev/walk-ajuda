export type CheckoutCouponDiscount = {
  type: "percentage" | "fixed";
  value: number;
};

const MAX_CHECKOUT_CENTS = 100_000_000_000;

function assertSafeCents(name: string, value: number, allowZero = false) {
  const min = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < min || value > MAX_CHECKOUT_CENTS) {
    throw new Error(`${name} inválido.`);
  }
}

export function parseBrazilMoneyToCents(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new Error("Valor monetário inválido.");
    const cents = Math.round(value * 100);
    assertSafeCents("Valor monetário", cents, true);
    return cents;
  }

  const raw = String(value ?? "")
    .trim()
    .replace(/R\$/gi, "")
    .replace(/\s/g, "");
  if (!raw) return 0;
  if (raw.startsWith("-")) throw new Error("Valor monetário inválido.");

  const cleaned = raw.replace(/[^0-9.,]/g, "");
  if (!cleaned) throw new Error("Valor monetário inválido.");

  let whole = cleaned;
  let fraction = "";
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);

  if (decimalIndex >= 0) {
    const after = cleaned.slice(decimalIndex + 1).replace(/\D/g, "");
    const before = cleaned.slice(0, decimalIndex).replace(/\D/g, "");
    const separatorLooksDecimal = after.length > 0 && after.length <= 2;
    if (separatorLooksDecimal) {
      whole = before || "0";
      fraction = after.padEnd(2, "0").slice(0, 2);
    } else {
      whole = cleaned.replace(/\D/g, "");
      fraction = "00";
    }
  } else {
    whole = cleaned.replace(/\D/g, "");
    fraction = "00";
  }

  const cents = Number(whole || "0") * 100 + Number(fraction || "0");
  assertSafeCents("Valor monetário", cents, true);
  return cents;
}

export function applyCouponDiscountToCents(
  subtotalCents: number,
  coupon: CheckoutCouponDiscount | null | undefined,
): { subtotalCents: number; discountCents: number; totalCents: number } {
  assertSafeCents("Subtotal", subtotalCents);
  if (!coupon) return { subtotalCents, discountCents: 0, totalCents: subtotalCents };

  if (!Number.isFinite(coupon.value) || coupon.value < 0) {
    throw new Error("Desconto inválido.");
  }

  let discountCents = 0;
  if (coupon.type === "percentage") {
    if (coupon.value > 100) throw new Error("Percentual de desconto inválido.");
    const discountBps = Math.round(coupon.value * 100);
    discountCents = Math.round((subtotalCents * discountBps) / 10_000);
  } else if (coupon.type === "fixed") {
    discountCents = Math.round(coupon.value * 100);
  } else {
    throw new Error("Tipo de desconto inválido.");
  }

  discountCents = Math.max(0, Math.min(subtotalCents, discountCents));
  return {
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}
