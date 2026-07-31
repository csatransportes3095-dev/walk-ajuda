import { usePWA, DeviceType } from "@/hooks/usePWA";
import { useState, useEffect } from "react";
import { Smartphone, Share, Chrome, AlertCircle, Download, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";

const APP_NAME = "Walk Ajuda";
const APP_SHORT_NAME = "Walk Ajuda";
const FALLBACK_LOGO = "/icon-192.png";

interface InstallStep {
  icon: React.ReactNode;
  text: string;
}

interface InstallInstructions {
  title: string;
  subtitle: string;
  steps: InstallStep[];
  warning?: string;
  actionLabel?: string;
  onAction?: () => void;
  accentColor: string;
  alreadyInstalled?: boolean;
}

function getInstructions(
  deviceType: DeviceType,
  isInstallable: boolean,
  promptInstall: () => Promise<void>,
  isAlreadyInstalled?: boolean
): InstallInstructions {
  switch (deviceType) {
    case "ios-chrome":
      return {
        title: "Instale pelo Safari",
        subtitle: "O Chrome no iPhone não suporta instalação de apps. Siga os passos:",
        accentColor: "#ff6b35",
        warning: "⚠️ Você está usando o Chrome no iPhone. Use o Safari para instalar.",
        steps: [
          { icon: <Chrome className="w-5 h-5 text-orange-400" />, text: "Copie o link desta página" },
          { icon: <Share className="w-5 h-5 text-blue-400" />, text: "Abra o Safari e cole o link" },
          { icon: <Share className="w-5 h-5 text-blue-400" />, text: 'Toque no ícone Compartilhar (□↑) na barra inferior' },
          { icon: <Smartphone className="w-5 h-5 text-green-400" />, text: `"Adicionar à Tela de Início" → "Adicionar"` },
        ],
      };

    case "ios-safari":
      if (isAlreadyInstalled) {
        return {
          title: "Abra pelo ícone do App",
          subtitle: "Este sistema só funciona quando aberto pelo ícone instalado.",
          accentColor: "#5b6af0",
          alreadyInstalled: true,
          steps: [
            { icon: <Smartphone className="w-5 h-5 text-indigo-400" />, text: `Feche o Safari e abra o app pelo ícone "${APP_SHORT_NAME}" na tela inicial` },
            { icon: <AlertCircle className="w-5 h-5 text-yellow-400" />, text: `Se não encontrar, procure por "${APP_SHORT_NAME}" na tela inicial` },
          ],
        };
      }
      return {
        title: "Instale o App no iPhone",
        subtitle: "Siga os passos para adicionar à tela inicial:",
        accentColor: "#5b6af0",
        steps: [
          { icon: <Share className="w-5 h-5 text-blue-400" />, text: 'Toque no ícone Compartilhar (□↑) na barra inferior do Safari' },
          { icon: <Smartphone className="w-5 h-5 text-green-400" />, text: 'Role para baixo e toque em "Adicionar à Tela de Início"' },
          { icon: <AlertCircle className="w-5 h-5 text-yellow-400" />, text: 'Toque em "Adicionar" no canto superior direito' },
          { icon: <ExternalLink className="w-5 h-5 text-indigo-400" />, text: `Abra o app pelo ícone "${APP_SHORT_NAME}" na tela inicial` },
        ],
      };

    case "ios-other":
      return {
        title: "Instale pelo Safari",
        subtitle: "Para instalar no iPhone/iPad, use o Safari:",
        accentColor: "#5b6af0",
        warning: "⚠️ Use o Safari para instalar este app no iPhone/iPad.",
        steps: [
          { icon: <Share className="w-5 h-5 text-blue-400" />, text: "Abra este link no Safari" },
          { icon: <Share className="w-5 h-5 text-blue-400" />, text: 'Toque no ícone Compartilhar (□↑)' },
          { icon: <Smartphone className="w-5 h-5 text-green-400" />, text: '"Adicionar à Tela de Início" → "Adicionar"' },
        ],
      };

    case "android":
      if (isInstallable) {
        return {
          title: "Instale o App",
          subtitle: "Instale o app para acessar o sistema:",
          accentColor: "#5b6af0",
          steps: [
            { icon: <Download className="w-5 h-5 text-indigo-400" />, text: 'Toque em "Instalar App" abaixo' },
            { icon: <Smartphone className="w-5 h-5 text-blue-400" />, text: 'Confirme a instalação na janela que aparecer' },
            { icon: <AlertCircle className="w-5 h-5 text-yellow-400" />, text: 'Abra o app pelo ícone na tela inicial' },
          ],
          actionLabel: "Instalar App",
          onAction: promptInstall,
        };
      }
      return {
        title: "Instale o App",
        subtitle: "Siga os passos para instalar:",
        accentColor: "#5b6af0",
        steps: [
          { icon: <Download className="w-5 h-5 text-indigo-400" />, text: 'Toque nos 3 pontinhos ⋮ no canto superior direito do Chrome' },
          { icon: <Smartphone className="w-5 h-5 text-blue-400" />, text: 'Toque em "Adicionar à tela inicial" ou "Instalar app"' },
          { icon: <AlertCircle className="w-5 h-5 text-yellow-400" />, text: 'Confirme e abra pelo ícone na tela inicial' },
        ],
        actionLabel: "Como instalar — ver passo a passo",
        onAction: () => {
          // Open Chrome menu instructions in a visual way
          alert('Para instalar:\n\n1. Toque nos 3 pontinhos ⋮ no Chrome\n2. Toque em "Adicionar à tela inicial"\n3. Confirme a instalação\n4. Abra pelo ícone na tela inicial');
        },
      };

    case "desktop":
    default:
      return {
        title: "Acesse pelo Celular",
        subtitle: "Este sistema é exclusivo para dispositivos móveis:",
        accentColor: "#5b6af0",
        warning: "⚠️ Este sistema foi desenvolvido para uso exclusivo em smartphones.",
        steps: [
          { icon: <Smartphone className="w-5 h-5 text-indigo-400" />, text: "Abra este link no seu celular (Android ou iPhone)" },
          { icon: <Download className="w-5 h-5 text-green-400" />, text: "Instale o app conforme as instruções na tela" },
          { icon: <AlertCircle className="w-5 h-5 text-yellow-400" />, text: "Acesse sempre pelo ícone instalado na tela inicial" },
        ],
      };
  }
}

export default function InstallWall() {
  const { deviceType, isInstallable, promptInstall } = usePWA();
  const [showOpenTip, setShowOpenTip] = useState(false);
  const { data: settings } = trpc.settings.getAll.useQuery();
  const APP_LOGO = (settings as any)?.login_image_url || FALLBACK_LOGO;

  const [iosConfirmedInstall, setIosConfirmedInstall] = useState<boolean>(() => {
    try { return localStorage.getItem("pwa_install_confirmed") === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (deviceType !== "android" && deviceType !== "ios-safari") return;
    const t = setTimeout(() => setShowOpenTip(true), 8000);
    return () => clearTimeout(t);
  }, [deviceType]);

  const iosAlreadyInstalled = deviceType === "ios-safari" && iosConfirmedInstall;
  const instructions = getInstructions(deviceType, isInstallable, promptInstall, iosAlreadyInstalled);

  function handleOpenApp() {
    // Tenta abrir via intent do Android (abre o app instalado diretamente)
    const appUrl = window.location.origin + "/";
    const intentUrl = `intent://${window.location.host}/#Intent;scheme=https;action=android.intent.action.VIEW;package=com.android.chrome;end`;
    try {
      window.location.href = intentUrl;
    } catch {
      // fallback
    }
    // Fallback: abre a URL normal após 1.5s (se o intent não funcionou)
    setTimeout(() => {
      window.location.href = appUrl;
    }, 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0a0d1a 0%, #0d1230 50%, #080c1e 100%)" }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(rgba(91,106,240,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(91,106,240,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Glow */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${instructions.accentColor}, transparent)` }}
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="w-28 h-28 mb-3 rounded-2xl flex items-center justify-center"
            style={{
              background: "rgba(13,18,48,0.8)",
              border: "1px solid rgba(91,106,240,0.3)",
              boxShadow: "0 0 30px rgba(91,106,240,0.15)",
            }}
          >
            <img
              src={APP_LOGO}
              alt={APP_NAME}
              className="w-20 h-20 object-contain rounded-xl"
            />
          </div>
          <p className="text-sm font-bold text-white tracking-widest uppercase">{APP_NAME}</p>
          <p className="text-xs text-slate-500 mt-0.5 tracking-wider">
            Controle seus ganhos e gastos
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(13, 18, 48, 0.92)",
            border: `1px solid ${instructions.accentColor}25`,
            backdropFilter: "blur(20px)",
            boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px ${instructions.accentColor}08`,
          }}
        >
          {/* Already installed banner */}
          {instructions.alreadyInstalled && (
            <div
              className="rounded-xl p-3 mb-4 flex items-center gap-3"
              style={{ background: "rgba(91,106,240,0.08)", border: "1px solid rgba(91,106,240,0.25)" }}
            >
              <ExternalLink className="w-5 h-5 text-indigo-400 flex-shrink-0" />
              <p className="text-indigo-300 text-xs leading-relaxed">
                Você está acessando pelo <strong>navegador</strong>. O app só funciona pelo ícone instalado.
              </p>
            </div>
          )}

          {/* Warning */}
          {instructions.warning && (
            <div
              className="rounded-xl p-3 mb-4 text-xs leading-relaxed"
              style={{ background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.25)", color: "#ffb38a" }}
            >
              {instructions.warning}
            </div>
          )}

          <h2 className="text-white font-bold text-lg mb-1">{instructions.title}</h2>
          <p className="text-slate-400 text-sm mb-5">{instructions.subtitle}</p>

          {/* Steps */}
          <div className="space-y-3">
            {instructions.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: `${instructions.accentColor}12`,
                    border: `1px solid ${instructions.accentColor}30`,
                    color: instructions.accentColor,
                  }}
                >
                  {i + 1}
                </div>
                <div className="flex items-start gap-2 flex-1 pt-0.5">
                  <span className="flex-shrink-0 mt-0.5">{step.icon}</span>
                  <p className="text-slate-300 text-sm leading-snug">{step.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Install button */}
          {instructions.actionLabel && (
            <button
              onClick={instructions.onAction}
              className="mt-5 w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${instructions.accentColor}, #7c3aed)`,
                color: "#ffffff",
                boxShadow: `0 4px 20px ${instructions.accentColor}35`,
              }}
            >
              {instructions.actionLabel}
            </button>
          )}

          {/* iOS Safari: "Já instalei" button */}
          {showOpenTip && deviceType === "ios-safari" && !iosAlreadyInstalled && (
            <button
              onClick={() => {
                try { localStorage.setItem("pwa_install_confirmed", "1"); } catch { /* ignore */ }
                setIosConfirmedInstall(true);
              }}
              className="mt-5 w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, #5b6af0, #7c3aed)",
                color: "#ffffff",
                boxShadow: "0 4px 20px rgba(91,106,240,0.35)",
              }}
            >
              <Smartphone className="w-4 h-4" />
              Já instalei — Ver como abrir
            </button>
          )}

          {/* Open App button */}
          {showOpenTip && !instructions.actionLabel && deviceType !== "ios-safari" && (
            <button
              onClick={handleOpenApp}
              className="mt-5 w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, #5b6af0, #7c3aed)",
                color: "#ffffff",
                boxShadow: "0 4px 20px rgba(91,106,240,0.35)",
              }}
            >
              <ExternalLink className="w-4 h-4" />
              Tentar Abrir App
            </button>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-4">
          Acesso exclusivo via app instalado
        </p>
      </div>
    </div>
  );
}
