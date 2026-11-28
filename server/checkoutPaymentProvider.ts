export const CHECKOUT_PROVIDER_KEY = "checkout_payment_provider_v1";
export type CheckoutProvider = "manual" | "validrapay";
export function parseCheckoutProvider(value: string | null): CheckoutProvider {
  if (value === null || value === "manual") return "manual";
  if (value === "validrapay") return "validrapay";
  throw new Error("Invalid checkout payment configuration");
}
// Activation remains locked until durable checkout and reconciliation are connected.
export const VALIDRA_CHECKOUT_READY = false;
