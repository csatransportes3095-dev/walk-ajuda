import React from "react";
import AdminHeader from "@/components/AdminHeader";
import { HomeButtonsManager } from "@/components/HomeButtonsManager";
import { Building2, LayoutGrid } from "lucide-react";
import { useLocation } from "wouter";

export default function AdminHubCentral() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      <AdminHeader
        title="Hub Central"
        icon={<LayoutGrid className="w-5 h-5" />}
        backTo="/admin/codes"
      />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Cabeçalho da página */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-wide">Hub Central de Acesso</h1>
            <p className="text-xs text-white/50 mt-0.5">
              Gerencie os botões rápidos exibidos na tela inicial do app
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/admin/locadora")}
          className="group w-full rounded-2xl border border-sky-400/25 bg-gradient-to-r from-sky-500/15 to-blue-500/10 p-4 text-left transition hover:border-sky-300/60 hover:from-sky-500/25"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-400/15 text-sky-200"><Building2 className="h-6 w-6" /></div>
            <div className="flex-1"><p className="font-black tracking-wide text-white">LOCADORA</p><p className="mt-0.5 text-xs text-sky-100/65">Clientes, veículos, contratos, cobranças e manutenção</p></div>
            <span className="text-sky-200 transition group-hover:translate-x-1">→</span>
          </div>
        </button>

        {/* Gerenciador de botões */}
        <HomeButtonsManager />
      </div>
    </div>
  );
}
