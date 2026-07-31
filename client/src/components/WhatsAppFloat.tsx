import { trpc } from "@/lib/trpc";

/**
 * Botão flutuante do WhatsApp fixo no canto inferior direito.
 * Usa o número configurado nas settings (whatsapp_number) e abre uma
 * conversa direta com uma mensagem inicial de ajuda.
 */
export default function WhatsAppFloat() {
  const { data: settings } = trpc.settings.getAll.useQuery();

  const rawNumber = settings?.whatsapp_number || "5511978307371";
  const number = rawNumber.replace(/[^\d]/g, "");
  if (!number) return null;

  const message = encodeURIComponent(
    "Olá! Vim pelo site da H2 COLOMBIANO e preciso de ajuda."
  );
  const href = `https://wa.me/${number}?text=${message}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="whatsapp-float group fixed bottom-28 right-3 sm:bottom-6 sm:right-6 z-[60] flex items-center gap-2"
    >
      {/* Tooltip / rótulo */}
      <span className="hidden sm:block max-w-0 overflow-hidden whitespace-nowrap rounded-full bg-[#1f2937] px-0 py-2 text-sm font-medium text-white opacity-0 shadow-lg transition-all duration-300 ease-out group-hover:max-w-[180px] group-hover:px-4 group-hover:opacity-100">
        Precisa de ajuda?
      </span>

      {/* Botão circular */}
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg shadow-black/30 transition-transform duration-150 ease-out group-active:scale-95">
        {/* Pulso */}
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-40" />
        <svg
          viewBox="0 0 32 32"
          className="relative h-7 w-7 fill-white"
          aria-hidden="true"
        >
          <path d="M16.004 2.667c-7.36 0-13.333 5.973-13.333 13.333 0 2.347.613 4.64 1.78 6.667L2.667 29.333l6.84-1.793a13.27 13.27 0 0 0 6.497 1.653h.005c7.36 0 13.333-5.973 13.333-13.333S23.36 2.667 16.004 2.667zm0 24.027h-.004a11.02 11.02 0 0 1-5.62-1.54l-.403-.24-4.06 1.064 1.083-3.957-.263-.406a10.98 10.98 0 0 1-1.683-5.84c0-6.12 4.98-11.1 11.107-11.1 2.967 0 5.753 1.157 7.85 3.257a11.02 11.02 0 0 1 3.25 7.85c0 6.12-4.98 11.1-11.107 11.1zm6.093-8.313c-.333-.167-1.973-.973-2.28-1.083-.307-.113-.53-.167-.753.167-.223.333-.863 1.083-1.057 1.307-.193.223-.39.25-.723.083-.333-.167-1.407-.518-2.68-1.653-.99-.883-1.66-1.973-1.853-2.307-.193-.333-.02-.513.147-.68.15-.148.333-.387.5-.58.167-.193.223-.333.333-.557.113-.223.057-.417-.027-.583-.083-.167-.753-1.813-1.03-2.483-.27-.65-.547-.563-.753-.573l-.64-.013c-.223 0-.583.083-.89.417-.307.333-1.167 1.14-1.167 2.78s1.197 3.227 1.363 3.45c.167.223 2.357 3.6 5.713 5.047.797.343 1.42.547 1.905.7.8.255 1.527.218 2.103.133.642-.097 1.973-.807 2.25-1.587.277-.78.277-1.447.193-1.587-.083-.14-.305-.223-.638-.39z" />
        </svg>
      </span>
    </a>
  );
}
