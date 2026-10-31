import type { ReactNode } from "react";

/** Prévia somente visual. Não envia mensagens nem altera qualquer fluxo do bot. */
export default function H2AutoWhatsAppPreview({
  message, label,
}: { message: string; label?: ReactNode }) {
  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-bold text-emerald-200">{label}</p>}
      <div className="max-w-[340px] rounded-xl rounded-tl-sm border border-emerald-900/50 bg-[#202c26] p-3 shadow-lg">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-white">{message || "Sua mensagem aparecerá aqui."}</p>
      </div>
      <p className="text-[11px] text-slate-400">Prévia de apresentação no WhatsApp. Nenhuma mensagem é enviada.</p>
    </div>
  );
}
