import React from "react";
import AdminHeader from "@/components/AdminHeader";
import { HomeButtonsManager } from "@/components/HomeButtonsManager";
import AdminEmailGenerator from "@/components/AdminEmailGenerator";
import { LayoutGrid, MailPlus } from "lucide-react";
import { useLocation, useSearch } from "wouter";

export default function AdminHubCentral() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const tool = new URLSearchParams(search).get("tool");

  if (tool === "email-generator") {
    return <AdminEmailGenerator onBack={() => navigate("/admin/hub-central")} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      <AdminHeader
        title="Hub Central"
        icon={<LayoutGrid className="w-5 h-5" />}
        backTo="/admin/codes"
      />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-wide">Hub Central de Acesso</h1>
            <p className="text-xs text-white/50 mt-0.5">
              Ferramentas internas e botões rápidos do sistema
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/admin/hub-central?tool=email-generator")}
          className="group w-full rounded-2xl border border-[#FFD400]/35 bg-gradient-to-r from-[#FFD400]/12 via-[#FFD400]/6 to-transparent p-4 text-left transition hover:border-[#FFD400]/70 hover:from-[#FFD400]/18"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FFD400]/35 bg-[#FFD400]/10">
              <MailPlus className="h-6 w-6 text-[#FFD400]" />
            </div>
            <div className="flex-1">
              <p className="font-black tracking-wide text-white">GERADOR DE E-MAILS H2</p>
              <p className="mt-0.5 text-xs text-slate-400">Catch-All, múltiplos domínios, histórico, busca e exportação</p>
            </div>
            <span className="text-[#FFD400] transition group-hover:translate-x-1">→</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate("/admin/locadora")}
          className="group w-full rounded-2xl border border-[#b98a2d]/35 bg-gradient-to-r from-[#b98a2d]/16 to-[#71603a]/10 p-4 text-left transition hover:border-[#d9b968]/70 hover:from-[#b98a2d]/25"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-[#b98a2d]/35 bg-[#14110c]"><img src="/locadora/assets/locacar-icon-192-v1.png" alt="LocaCar" className="h-full w-full object-cover" /></div>
            <div className="flex-1"><p className="font-black tracking-wide text-white">LOCADORA</p><p className="mt-0.5 text-xs text-sky-100/65">Clientes, veículos, contratos, cobranças e manutenção</p></div>
            <span className="text-[#f0d48b] transition group-hover:translate-x-1">→</span>
          </div>
        </button>

        <HomeButtonsManager />
      </div>
    </div>
  );
}
