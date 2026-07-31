import { useState, useEffect } from "react";

// Detectar plataforma
function getPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
  const isChrome = /chrome/.test(ua) && !/edg/.test(ua);
  const isEdge = /edg/.test(ua);
  const isWindows = /windows/.test(ua);
  const isMac = /macintosh/.test(ua);
  return { isIOS, isAndroid, isSafari, isChrome, isEdge, isWindows, isMac };
}

// Verificar se já está instalado como PWA
function isRunningAsPWA() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Se já está rodando como PWA, não mostrar
    if (isRunningAsPWA()) {
      setInstalled(true);
      return;
    }

    // Se já foi dispensado recentemente, não mostrar
    const dismissed = localStorage.getItem("pwa-dismissed");
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    const { isIOS, isSafari } = getPlatform();

    // iOS Safari: mostrar modal de instrução após 3s
    if (isIOS && isSafari) {
      setTimeout(() => setShowIOSModal(true), 3000);
      return;
    }

    // Android/Windows/Mac: capturar evento beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Detectar quando foi instalado
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIOSModal(false);
    localStorage.setItem("pwa-dismissed", String(Date.now()));
  };

  if (installed || (!showBanner && !showIOSModal)) return null;

  // Banner para Android/Windows/Mac
  if (showBanner) {
    return (
      <div style={{
        position: "fixed",
        bottom: 80,
        left: 16,
        right: 16,
        background: "linear-gradient(135deg, #1a0a2e, #0d0a1a)",
        border: "1px solid rgba(124,58,237,0.4)",
        borderRadius: 20,
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        zIndex: 9999,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.2)",
        backdropFilter: "blur(20px)",
      }}>
        <img src="/icon-72x72.png" alt="Meus Cartões" style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>Instalar Meus Cartões</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Acesso rápido na tela inicial</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={handleDismiss} style={{
            padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
            background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer",
          }}>Agora não</button>
          <button onClick={handleInstall} style={{
            padding: "8px 16px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
            color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(124,58,237,0.4)",
          }}>Instalar</button>
        </div>
      </div>
    );
  }

  // Modal para iPhone/iPad
  if (showIOSModal) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "flex-end", zIndex: 9999,
        backdropFilter: "blur(4px)",
      }} onClick={handleDismiss}>
        <div style={{
          background: "linear-gradient(180deg, #1a0a2e, #0d0a1a)",
          border: "1px solid rgba(124,58,237,0.3)",
          borderRadius: "24px 24px 0 0",
          padding: "24px 24px 40px",
          width: "100%",
        }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <img src="/icon-72x72.png" alt="" style={{ width: 56, height: 56, borderRadius: 14 }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Instalar Meus Cartões</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Adicionar à tela inicial</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { num: "1", text: "Toque no botão Compartilhar", icon: "⬆️" },
              { num: "2", text: "Selecione \"Adicionar à Tela de Início\"", icon: "➕" },
              { num: "3", text: "Toque em \"Adicionar\" para confirmar", icon: "✅" },
            ].map(step => (
              <div key={step.num} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "12px 16px",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0,
                }}>{step.num}</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{step.text} {step.icon}</div>
              </div>
            ))}
          </div>
          <button onClick={handleDismiss} style={{
            width: "100%", marginTop: 20, padding: "14px",
            borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)",
            fontSize: 14, cursor: "pointer",
          }}>Fechar</button>
        </div>
      </div>
    );
  }

  return null;
}
