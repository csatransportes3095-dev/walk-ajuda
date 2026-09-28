import { encodeWhatsappMessage } from "./whatsappMessageText";

/**
 * WhatsApp Desktop/Web possui um histórico de quebrar emojis em links wa.me
 * com mensagem pré-preenchida. Para mensagens, usamos o endpoint longo oficial,
 * preservando UTF-8 percent-encoded de ponta a ponta.
 */
export function buildWhatsappMessageUrl(phone: string | null | undefined, message: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  const text = encodeWhatsappMessage(message);
  if (digits) {
    return `https://api.whatsapp.com/send?phone=${digits}&text=${text}&type=phone_number&app_absent=0`;
  }
  return `https://api.whatsapp.com/send?text=${text}`;
}

export function rewriteWhatsappPrefillUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  const host = url.hostname.toLowerCase();
  if (host !== "wa.me" || !url.searchParams.has("text")) return raw;

  const phone = url.pathname.replace(/\D/g, "");
  const message = url.searchParams.get("text") || "";
  return buildWhatsappMessageUrl(phone, message);
}
