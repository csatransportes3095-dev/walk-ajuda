import { useEffect, useRef, useCallback } from 'react';

/**
 * Detecta quando o cliente abre o DevTools (F12, botão direito > Inspecionar, etc.)
 * Usa múltiplas técnicas para maior cobertura:
 * 1. Diferença de tamanho da janela (outerWidth/Height vs innerWidth/Height)
 * 2. Tempo de execução do debugger (técnica de performance)
 * 3. Evento de resize com diferença de dimensões
 */
export function useDevToolsDetection(onDetected: () => void, enabled = true) {
  const detectedRef = useRef(false);
  const alertSentRef = useRef(false);

  const trigger = useCallback(() => {
    if (detectedRef.current) return;
    detectedRef.current = true;
    onDetected();
  }, [onDetected]);

  useEffect(() => {
    if (!enabled) return;
    // Técnica 1: Diferença de tamanho (funciona bem em desktop)
    const THRESHOLD = 160;

    const checkSize = () => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > THRESHOLD || heightDiff > THRESHOLD) {
        trigger();
      }
    };

    // Técnica 2: debugger statement timing
    const checkDebugger = () => {
      const start = performance.now();
      // eslint-disable-next-line no-debugger
      debugger; // Quando DevTools está aberto, isso pausa e leva muito tempo
      const elapsed = performance.now() - start;
      if (elapsed > 100) {
        trigger();
      }
    };

    // Técnica 3: console.log com getter (detecta quando console é inspecionado)
    let devtoolsOpen = false;
    const element = new Image();
    Object.defineProperty(element, 'id', {
      get() {
        devtoolsOpen = true;
        trigger();
        return '';
      },
    });

    // Técnica 4 (mobile/remote): getter em toString de um objeto regex.
    // Inspetores remotos (Chrome Remote Debugging / WebView debug) acessam toString
    // ao serializar objetos no console, mesmo sem janela visível de DevTools.
    const remoteProbe: any = /./;
    remoteProbe.toString = function () {
      trigger();
      return '';
    };

    // Verificar periodicamente
    const interval = setInterval(() => {
      checkSize();
      // Só usa debugger check se não detectou ainda (evita spam)
      if (!detectedRef.current) {
        checkDebugger();
      }
      // Console check (desktop + mobile/remote)
      if (!devtoolsOpen) {
        console.log('%c', element); // eslint-disable-line no-console
        // dir() costuma disparar a serialização (toString) em inspetores remotos
        console.dir(remoteProbe); // eslint-disable-line no-console
      }
    }, 1000);

    // Verificar no resize
    window.addEventListener('resize', checkSize);

    // Bloquear F12 e atalhos de DevTools
    const blockKeys = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12') {
        e.preventDefault();
        trigger();
        return false;
      }
      // Ctrl+Shift+I / Cmd+Option+I
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
        trigger();
        return false;
      }
      // Ctrl+Shift+J / Cmd+Option+J (console)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault();
        trigger();
        return false;
      }
      // Ctrl+Shift+C (inspect element)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        trigger();
        return false;
      }
      // Ctrl+U (view source)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('keydown', blockKeys);

    // Bloquear botão direito
    const blockRightClick = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener('contextmenu', blockRightClick);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', checkSize);
      document.removeEventListener('keydown', blockKeys);
      document.removeEventListener('contextmenu', blockRightClick);
    };
  }, [trigger, enabled]);

  return { detected: detectedRef.current, alertSent: alertSentRef.current };
}
