import { useEffect } from "react";

const TOKEN = {
  check: "__H2_CHECK__",
  person: "__H2_PERSON__",
  money: "__H2_MONEY__",
  party: "__H2_PARTY__",
  phone: "__H2_PHONE__",
  card: "__H2_CARD__",
};

const TOKEN_PERCENT: Record<string, string> = {
  [TOKEN.check]: "%E2%9C%85",
  [TOKEN.person]: "%F0%9F%91%A4",
  [TOKEN.money]: "%F0%9F%92%B0",
  [TOKEN.party]: "%F0%9F%8E%89",
  [TOKEN.phone]: "%F0%9F%93%B1",
  [TOKEN.card]: "%F0%9F%92%B3",
};

const COMMISSION_MARKERS = [
  /COMISSÃO PAGA/i,
  /INDICAÇÃO CONFIRMADA/i,
  /DADOS PARA PAGAMENTO DA COMISSÃO/i,
];

function isWhatsappHost(hostname: string) {
  return hostname === "wa.me" || hostname === "api.whatsapp.com" || hostname.endsWith(".whatsapp.com");
}

function isCommissionWhatsappText(text: string) {
  return COMMISSION_MARKERS.some((marker) => marker.test(text));
}

function stripBrokenChars(value: string) {
  return value
    .replace(/\uFFFD/g, "")
    .replace(/\u00EF\u00BF\u00BD/g, "")
    .trim();
}

function cleanValue(value: string) {
  return stripBrokenChars(value).replace(/^[*\s:.-]+/, "").trim();
}

function valueAfterLabel(line: string, label: RegExp) {
  return cleanValue(stripBrokenChars(line).replace(label, ""));
}

function rebuildCommissionTextWithTokens(text: string) {
  return text
    .split("\n")
    .map((originalLine) => {
      const line = stripBrokenChars(originalLine);
      if (!line) return "";

      if (/COMISSÃO PAGA/i.test(line)) {
        return `${TOKEN.check} *COMISSÃO PAGA*`;
      }

      if (/INDICAÇÃO CONFIRMADA/i.test(line)) {
        return `${TOKEN.party} *INDICAÇÃO CONFIRMADA*`;
      }

      if (/DADOS PARA PAGAMENTO DA COMISSÃO/i.test(line)) {
        return `${TOKEN.card} *DADOS PARA PAGAMENTO DA COMISSÃO*`;
      }

      if (/Cliente indicado:/i.test(line)) {
        const value = valueAfterLabel(line, /^.*?Cliente indicado:\*?\s*/i);
        return `${TOKEN.person} *Cliente indicado:* ${value || "Cliente"}`;
      }

      if (/Telefone:/i.test(line)) {
        const value = valueAfterLabel(line, /^.*?Telefone:\*?\s*/i);
        return `${TOKEN.phone} *Telefone:* ${value}`.trim();
      }

      if (/Valor pago:/i.test(line)) {
        const value = valueAfterLabel(line, /^.*?Valor pago:\*?\s*/i);
        return `${TOKEN.money} *Valor pago:* ${value}`.trim();
      }

      if (/Valor da comissão:/i.test(line)) {
        const value = valueAfterLabel(line, /^.*?Valor da comissão:\*?\s*/i);
        return `${TOKEN.money} *Valor da comissão:* ${value}`.trim();
      }

      if (/Comissão:/i.test(line)) {
        const value = valueAfterLabel(line, /^.*?Comissão:\*?\s*/i);
        return `${TOKEN.money} *Comissão:* ${value}`.trim();
      }

      if (/Pagamento da comissão confirmado/i.test(line)) {
        return `${TOKEN.check} *Pagamento da comissão confirmado.*`;
      }

      if (/Obrigado pela indicação!/i.test(line)) {
        return `Obrigado pela indicação! ${TOKEN.party}`;
      }

      return line;
    })
    .join("\n");
}

function encodeCommissionText(text: string) {
  const rebuilt = rebuildCommissionTextWithTokens(text);
  let encoded = encodeURIComponent(rebuilt);

  for (const [token, percent] of Object.entries(TOKEN_PERCENT)) {
    const encodedToken = encodeURIComponent(token);
    encoded = encoded.split(encodedToken).join(percent);
  }

  return encoded;
}

function buildWhatsappUrlWithSafeText(url: URL, encodedText: string) {
  const parts: string[] = [];
  url.searchParams.forEach((value, key) => {
    if (key === "text") return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });
  parts.push(`text=${encodedText}`);
  return `${url.origin}${url.pathname}?${parts.join("&")}${url.hash || ""}`;
}

function repairCommissionWhatsappUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (!isWhatsappHost(url.hostname)) return rawUrl;

    const text = url.searchParams.get("text");
    if (!text || !isCommissionWhatsappText(text)) return rawUrl;

    // A mensagem final não carrega emoji como caractere Unicode dentro do JS.
    // Os emojis seguem no link como bytes UTF-8 percentuais, por exemplo:
    // cartão = %F0%9F%92%B3 e check = %E2%9C%85.
    // Isso evita que o navegador/redirect do WhatsApp transforme emoji em U+FFFD (�).
    return buildWhatsappUrlWithSafeText(url, encodeCommissionText(text));
  } catch {
    return rawUrl;
  }
}

function repairCommissionAnchor(anchor: HTMLAnchorElement) {
  const repaired = repairCommissionWhatsappUrl(anchor.href);
  if (repaired !== anchor.href) anchor.href = repaired;
}

export default function CommissionWhatsappEmojiFix() {
  useEffect(() => {
    const originalOpen = window.open;

    // Pagar > Confirmar usa window.open.
    window.open = function patchedWindowOpen(url?: string | URL, target?: string, features?: string) {
      const nextUrl = typeof url === "string" ? repairCommissionWhatsappUrl(url) : url;
      return originalOpen.call(window, nextUrl as string | URL | undefined, target, features);
    } as typeof window.open;

    // WhatsApp e Pedir PIX usam links <a>. Reescrevemos o href antes do clique.
    const repairAllAnchors = () => {
      document
        .querySelectorAll<HTMLAnchorElement>('a[href*="wa.me"], a[href*="api.whatsapp.com"]')
        .forEach(repairCommissionAnchor);
    };

    const repairAnchorFromEvent = (event: Event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
      if (anchor) repairCommissionAnchor(anchor);
    };

    document.addEventListener("pointerdown", repairAnchorFromEvent, true);
    document.addEventListener("mousedown", repairAnchorFromEvent, true);
    document.addEventListener("touchstart", repairAnchorFromEvent, true);
    document.addEventListener("click", repairAnchorFromEvent, true);

    repairAllAnchors();

    const observer = new MutationObserver(() => repairAllAnchors());
    const root = document.getElementById("root");
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });

    return () => {
      window.open = originalOpen;
      document.removeEventListener("pointerdown", repairAnchorFromEvent, true);
      document.removeEventListener("mousedown", repairAnchorFromEvent, true);
      document.removeEventListener("touchstart", repairAnchorFromEvent, true);
      document.removeEventListener("click", repairAnchorFromEvent, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
