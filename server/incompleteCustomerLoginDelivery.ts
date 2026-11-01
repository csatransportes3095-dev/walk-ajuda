import { deliverOwnSiteCode } from "./siteAccessCodeDelivery";
import { validSiteCode } from "../shared/siteAccessCodePolicy";

/**
 * Only incomplete customer profiles use a second mail transport.
 * The OTP is always generated and checked by the existing login flow.
 * Restricted site access, password recovery and H2 AUTO remain untouched.
 */
export async function deliverIncompleteCustomerLoginCode(email: string, code: string, incomplete: boolean, preferSmtp = false) {
  // The first attempt uses Resend, while a retry can switch to Zoho/SMTP.
  // The shared, security-protected mail delivery module is not changed.
  if (!incomplete || !process.env.RESEND_API_KEY || preferSmtp) return deliverOwnSiteCode(email, code);
  if (!validSiteCode(code)) throw new Error("INVALID_GENERATED_CODE");
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "h2@h2colombiano.com";
  const subject = "H2 Colombiano - Código de acesso";
  const text = `Seu código para acessar o site H2 Colombiano: ${code}\n\nDigite os 6 números. Código de uso único, válido por 10 minutos.\nNão compartilhe este código.`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject, text }),
    });
    if (response.ok) {
      const result = await response.json() as { id?: unknown };
      if (typeof result.id === "string" && result.id) {
        console.info("[CustomerLogin] incomplete_profile delivery=resend accepted");
        return { channel: "resend" as const, messageId: result.id.slice(0, 255) };
      }
    }
    console.warn("[CustomerLogin] incomplete_profile resend unavailable");
  } catch {
    console.warn("[CustomerLogin] incomplete_profile resend failed");
  }
  return deliverOwnSiteCode(email, code);
}
