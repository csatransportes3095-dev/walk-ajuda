import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

const ADMIN_PWA_DISMISSED_KEY = "walk_admin_pwa_dismissed";

function useAdminInstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(ADMIN_PWA_DISMISSED_KEY) === "true") {
      setDismissed(true);
    }
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode =
      "standalone" in window.navigator &&
      (window.navigator as any).standalone;
    setIsIOS(ios);
    if (ios && !isInStandaloneMode) {
      setIsInstallable(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(ADMIN_PWA_DISMISSED_KEY, "true");
  };

  return { isInstallable, isInstalled, dismissed, install, dismiss, deferredPrompt, isIOS };
}

export default function AdminPWABanner() {
  const { isInstallable, isInstalled, dismissed, install, dismiss, deferredPrompt, isIOS } =
    useAdminInstallPWA();

  if (!isInstallable || isInstalled || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-gradient-to-r from-violet-700 to-purple-700 rounded-xl p-3 shadow-2xl border border-violet-400/30 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
      <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
        <Download className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm leading-tight">
          Instale o painel como app
        </p>
        {isIOS ? (
          <p className="text-white/70 text-xs mt-0.5">
            Toque em Compartilhar → Adicionar à Tela de Início
          </p>
        ) : (
          <p className="text-white/70 text-xs mt-0.5">
            Acesse mais rápido direto da tela inicial
          </p>
        )}
      </div>
      {!isIOS && (
        <button
          onClick={install}
          disabled={!deferredPrompt}
          className="shrink-0 px-3 py-1.5 bg-white text-violet-700 font-bold text-xs rounded-lg hover:bg-white/90 transition-all disabled:opacity-50"
        >
          Instalar
        </button>
      )}
      <button
        onClick={dismiss}
        className="shrink-0 text-white/60 hover:text-white p-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
