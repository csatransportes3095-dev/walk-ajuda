import React from "react";
import AdminHeader from "@/components/AdminHeader";
import { HomeButtonsManager } from "@/components/HomeButtonsManager";
import { LayoutGrid } from "lucide-react";
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
