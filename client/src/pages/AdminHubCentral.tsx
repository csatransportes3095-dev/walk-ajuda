import React, { useEffect } from "react";
import AdminHeader from "@/components/AdminHeader";
import { HomeButtonsManager } from "@/components/HomeButtonsManager";
import { LayoutGrid } from "lucide-react";
import { useLocation } from "wouter";

export default function AdminHubCentral() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const root = document.getElementById("hub-central-buttons");
    if (!root) return;

    const enhanceEditButtons = () => {
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
      for (const button of buttons) {
        if (button.textContent?.trim() === "✏️") {
          button.classList.add("hub-central-edit-button");
          button.setAttribute("aria-label", "Editar botão");
          button.setAttribute("title", "Editar botão");
        }
      }
    };

    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const editButton = target?.closest<HTMLButtonElement>(".hub-central-edit-button");
      if (!editButton) return;

      window.setTimeout(() => {
        const headings = Array.from(root.querySelectorAll<HTMLElement>("h4"));
        const heading = headings.find((node) => node.textContent?.includes("Editar Botão"));
        const form = heading?.parentElement as HTMLElement | null;
        if (!form) return;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        form.classList.add("hub-central-edit-focus");
        window.setTimeout(() => form.classList.remove("hub-central-edit-focus"), 1000);
      }, 80);
    };

    enhanceEditButtons();
    const observer = new MutationObserver(enhanceEditButtons);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("click", handleClick, true);

    return () => {
      observer.disconnect();
      root.removeEventListener("click", handleClick, true);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      <style>{`
        #hub-central-buttons .hub-central-edit-button {
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          padding: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 12px !important;
          border: 1px solid rgba(96, 165, 250, .55) !important;
          background: rgba(37, 99, 235, .18) !important;
          color: #93c5fd !important;
          font-size: 20px !important;
          line-height: 1 !important;
          box-shadow: 0 0 14px rgba(59, 130, 246, .12) !important;
          touch-action: manipulation;
        }

        #hub-central-buttons .hub-central-edit-button:active {
          transform: scale(.94);
          background: rgba(37, 99, 235, .32) !important;
        }

        #hub-central-buttons .hub-central-edit-focus {
          border-color: rgba(96, 165, 250, .9) !important;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, .18), 0 0 24px rgba(59, 130, 246, .18) !important;
          transition: border-color .2s ease, box-shadow .2s ease;
        }

        @media (max-width: 640px) {
          #hub-central-buttons .hub-central-edit-button {
            width: 46px !important;
            height: 46px !important;
            min-width: 46px !important;
            font-size: 21px !important;
          }
        }
      `}</style>

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

        <div id="hub-central-buttons">
          <HomeButtonsManager />
        </div>
      </div>
    </div>
  );
}
