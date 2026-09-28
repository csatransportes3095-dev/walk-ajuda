import { encodeWhatsappMessage } from "./whatsappMessageText";

/**
 * Caminho único para abrir WhatsApp no H2.
 * O endpoint api.whatsapp.com/send se mostrou estável no WhatsApp Web/Desktop
 * para mensagens com emoji, ao contrário do redirecionamento curto wa.me.
 */
export function buildWhatsappMessageUrl(
  phone: string | null | undefined,
  message: string | null | undefined = "",
): string {
  const digits = String(phone || "").replace(/\D/g, "");
  const cleanMessage = String(message || "");
  const params: string[] = [];

  if (digits) params.push(`phone=${digits}`);
  if (cleanMessage) params.push(`text=${encodeWhatsappMessage(cleanMessage)}`);
  if (digits) {
    params.push("type=phone_number");
    params.push("app_absent=0");
  }

  return `https://api.whatsapp.com/send${params.length ? `?${params.join("&")}` : ""}`;
}

/**
 * Normaliza qualquer link conhecido do WhatsApp para o mesmo caminho usado
 * pelo Sorteio. Serve para links antigos salvos no banco e componentes legados.
 */
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
  const isShort = host === "wa.me" || host === "www.wa.me";
  const isApi = host === "api.whatsapp.com";
  const isWeb = host === "web.whatsapp.com";

  if (!isShort && !isApi && !isWeb) return raw;

  const phone = isShort
    ? url.pathname.replace(/\D/g, "")
    : String(url.searchParams.get("phone") || "").replace(/\D/g, "");
  const message = url.searchParams.get("text") || "";

  return buildWhatsappMessageUrl(phone, message);
}
