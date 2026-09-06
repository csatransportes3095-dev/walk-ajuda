import { useEffect } from "react";

const BROKEN_CHAR = "\uFFFD";
const BROKEN_MOJIBAKE = "\u00EF\u00BF\u00BD";

function replaceBrokenEmoji(line: string, emoji: string) {
  return line.split(BROKEN_CHAR).join(emoji).split(BROKEN_MOJIBAKE).join(emoji);
}

function repairCommissionPaymentWhatsappUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.hostname !== "wa.me" && url.hostname !== "api.whatsapp.com") return rawUrl;

    const text = url.searchParams.get("text");
    if (!text || !/COMISSÃO PAGA/i.test(text)) return rawUrl;
    if (!text.includes(BROKEN_CHAR) && !text.includes(BROKEN_MOJIBAKE)) return rawUrl;

    const repaired = text
      .split("\n")
      .map((line) => {
        if (/COMISSÃO PAGA/i.test(line)) return replaceBrokenEmoji(line, "\u2705");
        if (/Cliente indicado/i.test(line)) return replaceBrokenEmoji(line, "\uD83D\uDC64");
        if (/Valor pago/i.test(line)) return replaceBrokenEmoji(line, "\uD83D\uDCB0");
        if (/Obrigado pela indicação/i.test(line)) return replaceBrokenEmoji(line, "\uD83C\uDF89");
        return line;
      })
      .join("\n");

    url.searchParams.set("text", repaired);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export default function CommissionWhatsappEmojiFix() {
  useEffect(() => {
    if (!window.location.pathname.startsWith("/admin/commissions")) return;

    const originalOpen = window.open;
    window.open = function patchedWindowOpen(url?: string | URL, target?: string, features?: string) {
      const nextUrl = typeof url === "string" ? repairCommissionPaymentWhatsappUrl(url) : url;
      return originalOpen.call(window, nextUrl as string | URL | undefined, target, features);
    } as typeof window.open;

    return () => {
      window.open = originalOpen;
    };
  }, []);

  return null;
}
