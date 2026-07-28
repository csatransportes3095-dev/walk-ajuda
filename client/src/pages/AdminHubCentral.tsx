import React from "react";
import AdminHeader from "@/components/AdminHeader";
import { HomeButtonsManager } from "@/components/HomeButtonsManager";
import { LayoutGrid } from "lucide-react";

export default function AdminHubCentral() {
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

        {/* Gerenciador de botões */}
        <HomeButtonsManager />
      </div>
    </div>
  );
}
