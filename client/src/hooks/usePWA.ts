import { useEffect, useState } from "react";

export type DeviceType = "ios-safari" | "ios-chrome" | "ios-other" | "android" | "desktop";

export interface PWAState {
  isInstalled: boolean;
  isChecking: boolean;
  isInstallable: boolean;
  deviceType: DeviceType;
  deferredPrompt: BeforeInstallPromptEvent | null;
  promptInstall: () => Promise<void>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function detectDevice(): DeviceType {
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Android includes both phones and tablets
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  // Detect touch-capable devices that might be tablets (Windows tablets, etc.)
  const isTouchDevice = navigator.maxTouchPoints > 0;

  if (isIOS) {
    if (/CriOS/.test(ua)) return "ios-chrome";
    if (isSafari) return "ios-safari";
    return "ios-other";
  }
  // Android phones AND tablets
  if (isAndroid) return "android";
  // Touch-capable non-iOS non-Android (e.g. Windows tablets) — treat as android for install flow
  if (isTouchDevice && typeof window !== "undefined" && window.innerWidth <= 1366) return "android";
  return "desktop";
}

/**
 * Checks if the app is running as an installed PWA (standalone mode).
 *
 * IMPORTANT: On iOS Safari, the ONLY reliable check is navigator.standalone === true.
 * display-mode: standalone can sometimes be true in Safari even without installation.
 * We use device-specific logic to avoid false positives.
 */
function checkIsStandalone(device: DeviceType): boolean {
  try {
    // iOS Safari: navigator.standalone is the ONLY reliable check
    // It is true ONLY when launched from home screen icon
    if (device === "ios-safari" || device === "ios-other" || device === "ios-chrome") {
      const iosStandalone = (window.navigator as { standalone?: boolean }).standalone;
      return iosStandalone === true;
    }

    // Android TWA (Trusted Web Activity)
    if (document.referrer.startsWith("android-app://")) {
      return true;
    }

    // Android / Desktop: use display-mode check
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function usePWA(): PWAState {
  const [deviceType] = useState<DeviceType>(detectDevice);

  // Synchronous initial check — avoids flash on standalone launch
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkIsStandalone(detectDevice()));
  // isChecking: on iOS we know immediately (navigator.standalone is sync), no need to wait
  const [isChecking, setIsChecking] = useState<boolean>(() => {
    const device = detectDevice();
    // iOS: navigator.standalone is synchronous — no need to wait
    if (device === "ios-safari" || device === "ios-other" || device === "ios-chrome") {
      return false;
    }
    // Android/Desktop: wait for beforeinstallprompt or timeout
    return !checkIsStandalone(device);
  });
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // iOS: already determined synchronously — no async needed
    if (deviceType === "ios-safari" || deviceType === "ios-other" || deviceType === "ios-chrome") {
      return;
    }

    // If already confirmed as standalone on init, no need to wait
    if (checkIsStandalone(deviceType)) {
      setIsInstalled(true);
      setIsChecking(false);
      return;
    }

    // For Android/Desktop: wait for beforeinstallprompt or a timeout.
    let resolved = false;

    const resolve = (installed: boolean) => {
      if (resolved) return;
      resolved = true;
      setIsInstalled(installed);
      setIsChecking(false);
    };

    // If beforeinstallprompt fires → definitely NOT installed (browser mode)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      resolve(false);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // After successful install via prompt
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    // Listen for display-mode changes (e.g. user adds to home screen mid-session)
    const mq = window.matchMedia("(display-mode: standalone)");
    const handleMQChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setIsChecking(false);
      }
    };
    mq.addEventListener("change", handleMQChange);

    // Fallback timeout: if no beforeinstallprompt fires within 800ms,
    // re-check display-mode. If still not standalone → block (browser mode).
    const timer = setTimeout(() => {
      const standalone = checkIsStandalone(deviceType);
      resolve(standalone);
    }, 800);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mq.removeEventListener("change", handleMQChange);
    };
  }, [deviceType]);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return {
    isInstalled,
    isChecking,
    isInstallable: !!deferredPrompt,
    deviceType,
    deferredPrompt,
    promptInstall,
  };
}
