import { useState } from "react";
import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import AdminEmailGenerator from "@/components/AdminEmailGenerator";

const IAUDIT_IDENTITY_URL = "https://portaldeapelacao.iaudit.com.br/person/identity";

export default function AdminEmailGeneratorPage() {
  const [, navigate] = useLocation();
  const [portalKey, setPortalKey] = useState(0);

  const openPortalInNewTab = () => {
    window.open(IAUDIT_IDENTITY_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-[#06080d]">
      <AdminEmailGenerator onBack={() => navigate("/admin/codes")} />

      <section className="border-t border-white/10 bg-[radial-gradient(circle_at_top,#101b31_0,#070b12_46%,#06080d_100%)] px-4 pb-8 pt-6 sm:px-6 sm:pb-10">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-sky-400/20 bg-[#0b111d] shadow-2xl">
          <div className="flex flex-col gap-4 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-sky-300">
                <ShieldCheck className="h-4 w-4" /> Consulta externa no mesmo painel ADM
              </div>
              <h2 className="mt-1 text-xl font-black text-white">Portal de Apelação iAudit</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
                A página abaixo é carregada diretamente do domínio oficial informado, sem copiar formulários nem encaminhar os dados pelo servidor H2.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPortalKey(current => current + 1)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-black text-slate-100 transition hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" /> Recarregar
              </button>
              <button
                type="button"
                onClick={openPortalInNewTab}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-3 py-2.5 text-xs font-black text-slate-950 transition hover:brightness-105"
              >
                <ExternalLink className="h-4 w-4" /> Abrir em nova aba
              </button>
            </div>
          </div>

          <div className="border-b border-amber-400/15 bg-amber-400/[0.045] px-4 py-3 text-xs leading-5 text-amber-100/80 sm:px-5">
            Se o próprio iAudit bloquear exibição dentro de iframe por política de segurança, use “Abrir em nova aba”. O H2 não tenta contornar proteção de frame, sessão ou autenticação do site externo.
          </div>

          <div className="bg-white">
            <iframe
              key={portalKey}
              src={IAUDIT_IDENTITY_URL}
              title="Portal de Apelação iAudit - Consulta de Identidade"
              referrerPolicy="no-referrer"
              allow="camera; microphone; clipboard-read; clipboard-write"
              className="block h-[900px] w-full border-0 sm:h-[1000px]"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
