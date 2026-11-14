/**
 * Optional WhatsApp Business Platform authentication-template transport.
 *
 * This module does not create or verify OTPs. The site remains the sole issuer.
 * It does not touch H2 Auto's notification listener or reply engine.
 *
 * Required configuration (server-side only):
 * H2_WHATSAPP_OTP_ENABLED=true
 * H2_WHATSAPP_PHONE_NUMBER_ID=<Meta phone number ID>
 * H2_WHATSAPP_ACCESS_TOKEN=<Meta system-user token>
 * H2_WHATSAPP_AUTH_TEMPLATE=<approved authentication template name>
 * H2_WHATSAPP_AUTH_TEMPLATE_LANGUAGE=pt_BR (optional)
 *
 * Call only for a customer who has opted in and whose destination comes from
 * the existing verified customer record, never from an arbitrary request body.
 */
import { validSiteCode } from "../shared/siteAccessCodePolicy";

export type WhatsAppOtpResult =
  | { status: "disabled" }
  | { status: "accepted"; messageId: string }
  | { status: "failed"; reason: "CONFIG" | "DESTINATION" | "PROVIDER" | "NETWORK" };

function configured() {
  return process.env.H2_WHATSAPP_OTP_ENABLED === "true";
}

function destination(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (/^\d{11}$/.test(digits) && /^[1-9]{2}9\d{8}$/.test(digits)) return "55" + digits;
  if (/^55[1-9]{2}9\d{8}$/.test(digits)) return digits;
  return null;
}

/** Provider acceptance is NOT proof of delivery or identity. */
export async function deliverSiteOtpWhatsApp(
  registeredPhone: string,
  code: string,
  optedIn: boolean,
): Promise<WhatsAppOtpResult> {
  if (!configured() || !optedIn) return { status: "disabled" };
  if (!validSiteCode(code)) throw new Error("INVALID_GENERATED_CODE");
  const to = destination(registeredPhone);
  if (!to) return { status: "failed", reason: "DESTINATION" };
  const phoneNumberId = process.env.H2_WHATSAPP_PHONE_NUMBER_ID || "";
  const token = process.env.H2_WHATSAPP_ACCESS_TOKEN || "";
  const template = process.env.H2_WHATSAPP_AUTH_TEMPLATE || "";
  const language = process.env.H2_WHATSAPP_AUTH_TEMPLATE_LANGUAGE || "pt_BR";
  if (!/^\d{5,30}$/.test(phoneNumberId) || !token || !/^[a-z0-9_]{1,512}$/.test(template)
      || !/^[a-z]{2}_[A-Z]{2}$/.test(language)) {
    return { status: "failed", reason: "CONFIG" };
  }
  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: template,
            language: { code: language },
            components: [
              { type: "body", parameters: [{ type: "text", text: code }] },
              { type: "button", sub_type: "url", index: "0",
                parameters: [{ type: "text", text: code }] },
            ],
          },
        }),
      },
    );
    if (!response.ok) return { status: "failed", reason: "PROVIDER" };
    const data = await response.json() as { messages?: Array<{ id?: unknown }> };
    const id = data.messages?.[0]?.id;
    if (typeof id !== "string" || !id.startsWith("wamid.")) {
      return { status: "failed", reason: "PROVIDER" };
    }
    return { status: "accepted", messageId: id };
  } catch {
    return { status: "failed", reason: "NETWORK" };
  }
}
