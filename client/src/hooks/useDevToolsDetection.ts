import { useEffect, useRef } from 'react';

/**
 * Proteção conservadora contra abertura de DevTools.
 *
 * Regras:
 * - Só executa quando o ADM deixa a proteção ativada.
 * - Não usa debugger timing nem serialização do console, que causavam falsos positivos.
 * - Detecta DevTools acoplado em desktop, inclusive quando o Chrome está em modo
 *   de emulação mobile (ex.: iPhone 12 Pro dentro do DevTools).
 * - Em celular real, a heurística de viewport não é usada.
 * - Atalhos explícitos continuam bloqueados quando a proteção está ativa.
 */
export function useDevToolsDetection(onDetected: () => void, enabled = true) {
  const detectedRef = useRef(false);
  const alertSentRef = useRef(false);
  const callbackRef = useRef(onDetected);
  const enabledRef = useRef(enabled);
  const consecutiveViewportHitsRef = useRef(0);

  callbackRef.current = onDetected;
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) {
      detectedRef.current = false;
      alertSentRef.current = false;
      consecutiveViewportHitsRef.current = 0;
      return;
    }

    const trigger = () => {
      if (!enabledRef.current || detectedRef.current) return;
      detectedRef.current = true;
      alertSentRef.current = true;
      callbackRef.current();
    };

    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const finePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
      : true;

    // DevTools acoplado reduz significativamente innerWidth/innerHeight.
    // O shell externo largo identifica um desktop real mesmo quando o DevTools
    // sobrescreve o User-Agent/viewport para simular um iPhone.
    const VIEWPORT_THRESHOLD = 240;
    const DESKTOP_SHELL_MIN_WIDTH = 700;

    const checkDesktopViewport = () => {
      if (!enabledRef.current) return;
      const widthDiff = Math.max(0, window.outerWidth - window.innerWidth);
      const heightDiff = Math.max(0, window.outerHeight - window.innerHeight);
      const normalDesktop = !mobileUa && finePointer;
      const desktopWithMobileEmulation = window.outerWidth >= DESKTOP_SHELL_MIN_WIDTH && widthDiff >= VIEWPORT_THRESHOLD;
      const canUseViewportSignal = normalDesktop || desktopWithMobileEmulation;
      const hasLargeGap = widthDiff >= VIEWPORT_THRESHOLD || heightDiff >= VIEWPORT_THRESHOLD;

      if (canUseViewportSignal && hasLargeGap) {
        consecutiveViewportHitsRef.current += 1;
        // Exige duas leituras consecutivas para não confundir resize transitório.
        if (consecutiveViewportHitsRef.current >= 2) trigger();
      } else {
        consecutiveViewportHitsRef.current = 0;
      }
    };

    const blockKeys = (event: KeyboardEvent) => {
      if (!enabledRef.current) return;
      const key = event.key.toLowerCase();
      const devtoolsShortcut =
        event.key === 'F12' ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && (key === 'i' || key === 'j' || key === 'c'));

      if (devtoolsShortcut) {
        event.preventDefault();
        event.stopPropagation();
        trigger();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && key === 'u') {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const blockRightClick = (event: MouseEvent) => {
      if (!enabledRef.current) return;
      event.preventDefault();
    };

    const initialTimer = window.setTimeout(checkDesktopViewport, 500);
    const interval = window.setInterval(checkDesktopViewport, 900);
    window.addEventListener('resize', checkDesktopViewport, { passive: true });
    document.addEventListener('keydown', blockKeys, true);
    document.addEventListener('contextmenu', blockRightClick, true);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener('resize', checkDesktopViewport);
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('contextmenu', blockRightClick, true);
    };
  }, [enabled]);

  return { detected: detectedRef.current, alertSent: alertSentRef.current };
}
