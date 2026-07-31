import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronDown, MessageCircle, HelpCircle } from "lucide-react";

export default function Ajuda() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const { data: faqData, isLoading } = trpc.faq.getPublic.useQuery();

  const config = faqData?.config;
  const items = faqData?.items ?? [];

  const accentColor = config?.accentColor ?? "#8b5cf6";
  const buttonColor = config?.buttonColor ?? "#ef4444";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div
        className="py-8 px-4 text-center"
        style={{ background: `linear-gradient(135deg, ${buttonColor}22, ${accentColor}22)` }}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <HelpCircle className="w-7 h-7" style={{ color: accentColor }} />
          <h1 className="text-2xl font-black text-white">
            {config?.title ?? "Perguntas Frequentes"}
          </h1>
        </div>
        {config?.subtitle && (
          <p className="text-gray-400 text-sm mt-1">{config.subtitle}</p>
        )}
        <div
          className="mt-4 inline-block px-4 py-1.5 rounded-full text-xs font-bold"
          style={{ backgroundColor: accentColor + "33", color: accentColor, border: `1px solid ${accentColor}55` }}
        >
          H2 COLOMBIANO � h2colombiano.com
        </div>
      </div>

      {/* FAQ List */}
      <div className="max-w-2xl mx-auto px-4 pb-10 pt-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma pergunta cadastrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="rounded-xl overflow-hidden border"
                style={{ borderColor: openIndex === idx ? accentColor + "66" : "#ffffff15" }}
              >
                <button
                  className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left transition-colors"
                  style={{
                    backgroundColor: openIndex === idx ? accentColor + "18" : "#1f2937",
                  }}
                  onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                >
                  <span className="flex items-center gap-2 font-semibold text-sm text-white">
                    <span style={{ color: accentColor }}>�</span>
                    {item.question}
                  </span>
                  <ChevronDown
                    size={16}
                    className="shrink-0 text-gray-400 transition-transform duration-200"
                    style={{ transform: openIndex === idx ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>
                {openIndex === idx && (
                  <div className="px-5 pb-4 pt-2 bg-gray-900">
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{item.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 text-xs mb-4">Ainda tem dúvidas? Fale com a gente:</p>
          <div className="flex flex-col gap-3 justify-center max-w-sm mx-auto w-full">
            <a
              href="https://wa.me/5511978307371?text=Olá!%20Tenho%20uma%20dúvida%20e%20gostaria%20de%20falar%20com%20o%20suporte."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 active:scale-95 w-full"
              style={{ backgroundColor: '#25D366', boxShadow: '0 0 16px #25D36666' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Fale com Suporte
            </a>
            <a
              href="/foto"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 active:scale-95 w-full"
              style={{ backgroundColor: '#7c3aed', boxShadow: '0 0 16px #7c3aed66' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              Ver Foto Exclusiva
            </a>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 active:scale-95 w-full"
              style={{ backgroundColor: buttonColor, boxShadow: `0 0 16px ${buttonColor}66` }}
            >
              <MessageCircle size={16} />
              Fazer meu pedido
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
