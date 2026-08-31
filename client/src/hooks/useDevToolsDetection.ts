import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';

export type DevToolsProtectionTarget = 'desktop' | 'mobile' | 'both';
export type DevToolsDeviceClass = 'desktop' | 'mobile';

const VIEWPORT_THRESHOLD = 240;
const DESKTOP_SHELL_MIN_WIDTH = 700;

export function getDevToolsDeviceClass(): DevToolsDeviceClass {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'desktop';

  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk/i.test(ua);
  const finePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
    : true;
  const coarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: none) and (pointer: coarse)').matches
    : false;
  const touchPoints = navigator.maxTouchPoints || 0;
  const widthDiff = Math.max(0, window.outerWidth - window.innerWidth);

  // Chrome em desktop pode simular iPhone/Android dentro do DevTools. Nesse caso
  // o shell externo continua largo e a diferença de viewport denuncia que é PC.
  const desktopWithMobileEmulation =
    window.outerWidth >= DESKTOP_SHELL_MIN_WIDTH && widthDiff >= VIEWPORT_THRESHOLD;

  if (desktopWithMobileEmulation) return 'desktop';

  const touchMobileOrTablet = touchPoints > 1 && coarsePointer && !finePointer;
  return mobileUa || touchMobileOrTablet ? 'mobile' : 'desktop';
}

export function normalizeDevToolsProtectionTarget(value: string | undefined): DevToolsProtectionTarget {
  if (value === 'desktop' || value === 'mobile' || value === 'both') return value;
  return 'both';
}

export function devToolsTargetAllowsDevice(
  target: DevToolsProtectionTarget,
  deviceClass: DevToolsDeviceClass,
) {
  return target === 'both' || target === deviceClass;
}

/**
 * Proteção conservadora contra abertura de DevTools.
 *
 * Regras:
 * - Só executa quando o ADM deixa a proteção ativada.
 * - Respeita o alvo escolhido pelo ADM: computador, celular/tablet ou ambos.
 * - Não usa debugger timing nem serialização do console, que causavam falsos positivos.
 * - Detecta DevTools acoplado em desktop, inclusive quando o Chrome está em modo
 *   de emulação mobile (ex.: iPhone 12 Pro dentro do DevTools).
 * - Em celular/tablet real, a heurística de viewport não é usada.
 * - Atalhos explícitos continuam bloqueados quando a proteção está ativa.
 */
export function useDevToolsDetection(onDetected: () => void, enabled = true) {
  const targetSettingsQuery = trpc.settings.getAll.useQuery(undefined, {
    enabled,
    staleTime: 0,
    refetchInterval: enabled ? 2_000 : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const target = normalizeDevToolsProtectionTarget(
    targetSettingsQuery.data?.devtools_protection_target,
  );
  const [deviceClass, setDeviceClass] = useState<DevToolsDeviceClass>(() =>
    getDevToolsDeviceClass(),
  );
  const targetReady = targetSettingsQuery.data !== undefined || targetSettingsQuery.isError;
  const effectiveEnabled = enabled && targetReady && devToolsTargetAllowsDevice(target, deviceClass);

  const detectedRef = useRef(false);
  const alertSentRef = useRef(false);
  const callbackRef = useRef(onDetected);
  const enabledRef = useRef(effectiveEnabled);
  const consecutiveViewportHitsRef = useRef(0);

  callbackRef.current = onDetected;
  enabledRef.current = effectiveEnabled;

  useEffect(() => {
    if (!enabled) return;

    const refreshDeviceClass = () => {
      setDeviceClass(getDevToolsDeviceClass());
    };

    refreshDeviceClass();
    window.addEventListener('resize', refreshDeviceClass, { passive: true });
    window.addEventListener('orientationchange', refreshDeviceClass, { passive: true });

    return () => {
      window.removeEventListener('resize', refreshDeviceClass);
      window.removeEventListener('orientationchange', refreshDeviceClass);
    };
  }, [enabled]);

  useEffect(() => {
    if (!effectiveEnabled) {
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

    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk/i.test(navigator.userAgent);
    const finePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
      : true;

    const checkDesktopViewport = () => {
      if (!enabledRef.current) return;
      const widthDiff = Math.max(0, window.outerWidth - window.innerWidth);
      const heightDiff = Math.max(0, window.outerHeight - window.innerHeight);
      const normalDesktop = !mobileUa && finePointer;
      const desktopWithMobileEmulation =
        window.outerWidth >= DESKTOP_SHELL_MIN_WIDTH && widthDiff >= VIEWPORT_THRESHOLD;
      const canUseViewportSignal = normalDesktop || desktopWithMobileEmulation;
      const hasLargeGap = widthDiff >= VIEWPORT_THRESHOLD || heightDiff >= VIEWPORT_THRESHOLD;

      if (canUseViewportSignal && hasLargeGap) {
        consecutiveViewportHitsRef.current += 1;
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
        ((event.ctrlKey || event.metaKey) && event.shiftKey &&
          (key === 'i' || key === 'j' || key === 'c'));

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
  }, [effectiveEnabled]);

  return {
    detected: detectedRef.current,
    alertSent: alertSentRef.current,
    effectiveEnabled,
    target,
    deviceClass,
  };
}
