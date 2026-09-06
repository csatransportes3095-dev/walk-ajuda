import { useEffect } from "react";

const CHECK = "\u2705";
const PERSON = "\uD83D\uDC64";
const MONEY = "\uD83D\uDCB0";
const PARTY = "\uD83C\uDF89";

function repairCommissionPaymentWhatsappUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.hostname !== "wa.me" && url.hostname !== "api.whatsapp.com") return rawUrl;

    const text = url.searchParams.get("text");
    if (!text || !/COMISSÃO PAGA/i.test(text)) return rawUrl;

    // Reconstrói as linhas conhecidas usando escapes Unicode em ASCII no código-fonte.
    // Assim os emojis não dependem da codificação do arquivo, do bundle ou de um texto
    // que já tenha chegado como caractere de substituição (�).
    const repaired = text
      .split("\n")
      .map((line) => {
        if (/COMISSÃO PAGA/i.test(line)) {
          return `${CHECK} *COMISSÃO PAGA*`;
        }

        if (/Cliente indicado/i.test(line)) {
          const value = line.replace(/^.*?Cliente indicado:\*?\s*/i, "").trim();
          return `${PERSON} *Cliente indicado:* ${value || "Cliente"}`;
        }

        if (/Valor pago/i.test(line)) {
          const value = line.replace(/^.*?Valor pago:\*?\s*/i, "").trim();
          return `${MONEY} *Valor pago:* ${value}`.trim();
        }

        if (/Obrigado pela indicação/i.test(line)) {
          return `Obrigado pela indicação! ${PARTY}`;
        }

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
    // Instala globalmente. O painel usa navegação SPA: se o ADM abrir outra rota e
    // depois entrar em /admin/commissions, um efeito condicionado ao pathname inicial
    // nunca seria instalado.
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
