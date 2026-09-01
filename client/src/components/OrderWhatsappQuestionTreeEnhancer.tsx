import { useEffect } from "react";

const ORDER_HEADER = "NOVO PEDIDO";
const FORM_HEADER = "RESPOSTAS DO FORMULARIO:";
const FILES_HEADER = "ARQUIVOS:";

function compactOrderWhatsappMessage(message: string): string {
  if (!message.trimStart().startsWith(ORDER_HEADER)) return message;

  const formIndex = message.indexOf(FORM_HEADER);
  const filesIndex = message.indexOf(FILES_HEADER);
  const heavySectionIndexes = [formIndex, filesIndex].filter((index) => index >= 0);

  if (heavySectionIndexes.length === 0) return message;

  const cutIndex = Math.min(...heavySectionIndexes);
  const compact = message.slice(0, cutIndex).trimEnd();

  return `${compact}\n\nDados completos, respostas e arquivos ja registrados no sistema.`;
}

export default function OrderWhatsappQuestionTreeEnhancer() {
  const enabled = typeof window !== "undefined" && !window.location.pathname.toLowerCase().startsWith("/admin");

  useEffect(() => {
    if (!enabled) return;

    const originalOpen = window.open.bind(window);

    const enhancedOpen: typeof window.open = ((url?: string | URL, target?: string, features?: string) => {
      try {
        if (url) {
          const parsed = new URL(String(url), window.location.origin);
          const isWhatsapp = parsed.hostname === "wa.me" || parsed.hostname.endsWith("whatsapp.com");
          const text = parsed.searchParams.get("text");

          if (isWhatsapp && text?.trimStart().startsWith(ORDER_HEADER)) {
            const compact = compactOrderWhatsappMessage(text);
            if (compact !== text) {
              parsed.searchParams.set("text", compact);
              return originalOpen(parsed.toString(), target, features);
            }
          }
        }
      } catch (error) {
        console.warn("[OrderWhatsApp] Nao foi possivel compactar a mensagem; mantendo formato original.", error);
      }

      return originalOpen(url as string | URL | undefined, target, features);
    }) as typeof window.open;

    window.open = enhancedOpen;
    return () => {
      window.open = originalOpen as typeof window.open;
    };
  }, [enabled]);

  return null;
}
