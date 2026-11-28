import { createHash } from "node:crypto";
import { getOrCreateValidraCharge } from "./validraAttemptStorage";
import { persistPaidValidraOrder, type TrustedPaidOrderInput } from "./validraOrderPersistence";
import { ValidraPayClient, validraChargeIsPaid } from "./validraPay";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, canonical(v)]));
  }
  return value;
}

export function validraPurchaseDigest(purchase: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(purchase))).digest("hex");
}

/** Invoked by submitFiles only AFTER identity, official pricing and normal checkout validation. */
export async function runValidraCheckout(input: TrustedPaidOrderInput, allowNew: boolean, client = new ValidraPayClient()) {
  const result = await getOrCreateValidraCharge(input, client, allowNew);
  if (result.kind === "duplicate") return { kind: "duplicate" as const, registrationId: result.registrationId };
  const charge = result.charge;
  if (validraChargeIsPaid(charge, input)) {
    const persisted = await persistPaidValidraOrder(input, client, charge);
    return persisted.duplicate
      ? { kind: "duplicate" as const, registrationId: persisted.registrationId }
      : { kind: "persisted" as const, order: persisted };
  }
  if (charge.status !== "processing" && charge.status !== "active") throw new Error("validra_payment_needs_review");
  return { kind: "payment" as const, payment: {
    externalId: input.externalId,
    status: charge.status,
    amount: charge.amount,
    pixCopyPaste: charge.status === "active" ? charge.pix_copy_paste : null,
    qrCodePngBase64: charge.status === "active" ? charge.qr_code_png_base64 : null,
    expiresAt: charge.expires_at,
  }};
}
