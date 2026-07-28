import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Seta flutuante piscando que guia o cliente em sequência FIXA.
 * Começa no COPIAR PIX e só avança quando o cliente clica no elemento.
 */

type Step = 'copiar-pix' | 'comprovante' | 'finalizar' | 'indicador-sim' | 'indicador-pular' | 'whatsapp-confirmar';

const STEP_ORDER: Step[] = [
  'copiar-pix',
  'comprovante',
  'finalizar',
  'indicador-sim',
  'whatsapp-confirmar',
];

export default function PaymentTutorial() {
  const [stepIndex, setStepIndex] = useState(0);
  const [arrowPos, setArrowPos] = useState<{ top: number; left: number } | null>(null);
  const [hidden, setHidden] = useState(false);
  const clickListenerRef = useRef<(() => void) | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);

  const currentStep = STEP_ORDER[stepIndex];

  // Se o componente monta e o copiar-pix não existe mas indicador-sim existe,
  // significa que estamos no step success - pular para indicador
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const timer = setTimeout(() => {
      const pixBtn = document.querySelector('[data-tour="copiar-pix"]');
      if (!pixBtn) {
        // Estamos no step success, pular para indicador
        const indicadorIdx = STEP_ORDER.indexOf('indicador-sim');
        if (indicadorIdx >= 0) setStepIndex(indicadorIdx);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const getElement = useCallback((step: Step) => {
    return document.querySelector(`[data-tour="${step}"]`) as HTMLElement | null;
  }, []);

  const isElementVisible = (el: HTMLElement): boolean => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
  };

  // Posicionar a seta em cima do elemento atual
  const updatePosition = useCallback(() => {
    if (hidden) return;
    const el = getElement(currentStep);
    if (!el || !isElementVisible(el)) {
      setArrowPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setArrowPos({
      top: rect.top - 48,
      left: rect.left + rect.width / 2 - 20,
    });
  }, [currentStep, hidden, getElement]);

  // Avançar para o próximo step
  const advanceStep = useCallback(() => {
    setStepIndex(prev => {
      const next = prev + 1;
      if (next >= STEP_ORDER.length) {
        setHidden(true);
        return prev;
      }
      return next;
    });
  }, []);

  // Escutar clique no elemento atual para avançar
  useEffect(() => {
    if (hidden) return;

    const attachListener = () => {
      // Remover listener anterior
      if (clickListenerRef.current) {
        clickListenerRef.current();
        clickListenerRef.current = null;
      }

      const el = getElement(currentStep);
      if (!el) return;

      const handler = () => {
        advanceStep();
      };

      el.addEventListener('click', handler, { once: true });
      clickListenerRef.current = () => el.removeEventListener('click', handler);
    };

    // Tentar anexar o listener imediatamente e a cada 500ms (caso o elemento ainda não exista)
    attachListener();
    const checkInterval = setInterval(() => {
      const el = getElement(currentStep);
      if (el && !clickListenerRef.current) {
        attachListener();
      }
    }, 500);

    return () => {
      clearInterval(checkInterval);
      if (clickListenerRef.current) {
        clickListenerRef.current();
        clickListenerRef.current = null;
      }
    };
  }, [currentStep, hidden, getElement, advanceStep]);

  // Atualizar posição continuamente
  useEffect(() => {
    if (hidden) return;

    updatePosition();
    
    const handleScroll = () => updatePosition();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    intervalRef.current = setInterval(updatePosition, 300);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [updatePosition, hidden]);

  // Quando o step muda para um que ainda não existe no DOM (ex: indicador, whatsapp),
  // esperar ele aparecer
  useEffect(() => {
    if (hidden) return;
    const checkExistence = setInterval(() => {
      const el = getElement(currentStep);
      if (el && isElementVisible(el)) {
        updatePosition();
      } else {
        setArrowPos(null);
      }
    }, 400);
    return () => clearInterval(checkExistence);
  }, [currentStep, hidden, getElement, updatePosition]);

  if (hidden || !arrowPos) return null;

  return (
    <>
      <div
        className="fixed z-[9999] pointer-events-none"
        style={{
          top: `${arrowPos.top}px`,
          left: `${arrowPos.left}px`,
        }}
      >
        {/* Seta para baixo piscando */}
        <div style={{ animation: 'arrow-float-bounce 0.7s ease-in-out infinite' }}>
          <svg width="40" height="44" viewBox="0 0 40 44" fill="none">
            {/* Corpo da seta */}
            <rect x="15" y="0" width="10" height="22" rx="5" fill="#3b82f6" />
            {/* Ponta da seta */}
            <path d="M20 44L6 24h28L20 44z" fill="#3b82f6" />
            <path d="M20 40L9 24h22L20 40z" fill="#60a5fa" />
          </svg>
        </div>
        {/* Brilho pulsante */}
        <div
          className="absolute top-2 left-2 w-9 h-9 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(59,130,246,0.7) 0%, transparent 70%)',
            animation: 'arrow-pulse-glow 1.2s ease-in-out infinite',
          }}
        />
      </div>

      <style>{`
        @keyframes arrow-float-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(10px); }
        }
        @keyframes arrow-pulse-glow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(2); }
        }
      `}</style>
    </>
  );
}
