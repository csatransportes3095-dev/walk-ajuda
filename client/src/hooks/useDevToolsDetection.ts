import { useEffect, useRef } from 'react';

/**
 * Proteção conservadora contra abertura de DevTools.
 *
 * Regras de segurança:
 * - Só executa quando a configuração do ADM estiver ativada.
 * - Atalhos explícitos de DevTools continuam bloqueados.
 * - Detecção por diferença de viewport é usada somente em desktop real.
 * - Não usa debugger timing nem serialização de console, pois essas técnicas
 *   geram falsos positivos em Safari/iPhone, WebViews e aparelhos mais lentos.
 */
export function useDevToolsDetection(onDetected: () => void, enabled = true) {
  const detectedRef = useRef(false);
  const alertSentRef = useRef(false);
  const callbackRef = useRef(onDetected);
  const enabledRef = useRef(enabled);

  callbackRef.current = onDetected;
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) {
      // A configuração do ADM sempre prevalece. Ao desativar, limpa qualquer
      // detecção anterior para permitir uma futura ativação sem estado preso.
      detectedRef.current = false;
      alertSentRef.current = false;
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
    const desktopViewportDetection = !mobileUa && finePointer;

    // Em desktop, DevTools acoplado normalmente reduz uma dimensão em centenas
    // de pixels. O limite alto evita confundir barras do navegador, zoom ou SO.
    const VIEWPORT_THRESHOLD = 240;
    const checkDesktopViewport = () => {
      if (!desktopViewportDetection || !enabledRef.current) return;
      const widthDiff = Math.max(0, window.outerWidth - window.innerWidth);
      const heightDiff = Math.max(0, window.outerHeight - window.innerHeight);
      if (widthDiff >= VIEWPORT_THRESHOLD || heightDiff >= VIEWPORT_THRESHOLD) {
        trigger();
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

      // Visualizar código-fonte continua bloqueado quando a proteção está ativa,
      // mas não é tratado como prova de que o inspetor foi aberto.
      if ((event.ctrlKey || event.metaKey) && key === 'u') {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const blockRightClick = (event: MouseEvent) => {
      if (!enabledRef.current) return;
      event.preventDefault();
    };

    const initialTimer = window.setTimeout(checkDesktopViewport, 700);
    const interval = window.setInterval(checkDesktopViewport, 1500);
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
