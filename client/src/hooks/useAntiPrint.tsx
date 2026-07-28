import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";

/**
 * Hook de proteção anti-print/screenshot.
 * - Detecta PrintScreen, Ctrl+P, menu de impressão, visibilidade oculta
 * - 1ª tentativa: aviso amarelo
 * - 2ª tentativa: aviso laranja mais severo
 * - 3ª tentativa: aviso vermelho + bloqueia IP e número + tela de banimento permanente
 */
export function useAntiPrint(phone?: string) {
  const [attempts, setAttempts] = useState<number>(() => {
    try { return parseInt(sessionStorage.getItem('_print_attempts') || '0', 10); } catch { return 0; }
  });
  const [showWarning, setShowWarning] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const attemptsRef = useRef(attempts);
  attemptsRef.current = attempts;

  const reportMutation = trpc.security.reportPrintAttempt.useMutation();

  const triggerAttempt = useCallback(() => {
    const next = attemptsRef.current + 1;
    attemptsRef.current = next;
    setAttempts(next);
    try { sessionStorage.setItem('_print_attempts', String(next)); } catch { /* noop */ }
    setShowWarning(true);

    reportMutation.mutateAsync({ phone: phone || undefined, attempts: next })
      .then((res) => {
        if (res.blocked) setBlocked(true);
      })
      .catch(() => { /* silencioso */ });

    if (next >= 3) setBlocked(true);
  }, [phone, reportMutation]);

  useEffect(() => {
    // Detectar PrintScreen
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' ||
        e.code === 'PrintScreen' ||
        (e.ctrlKey && e.key === 'p') ||
        (e.metaKey && e.key === 'p') ||
        (e.ctrlKey && e.shiftKey && (e.key === 's' || e.key === 'S'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerAttempt();
      }
    };

    // Detectar menu de impressão do navegador
    const handleBeforePrint = () => {
      triggerAttempt();
    };

    // Detectar quando a página fica oculta (captura de tela em alguns dispositivos)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Apenas registrar, não bloquear — pode ser troca de aba normal
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('beforeprint', handleBeforePrint);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerAttempt]);

  // CSS de proteção de impressão
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'anti-print-style';
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        body::after {
          content: '🚫 Impressão não permitida neste site.';
          visibility: visible !important;
          display: block;
          text-align: center;
          font-size: 24px;
          padding: 40px;
        }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('anti-print-style')?.remove(); };
  }, []);

  const WarningOverlay = () => {
    if (!showWarning) return null;

    const isBlocked = blocked || attempts >= 3;
    const isSecondWarning = attempts === 2;

    if (isBlocked) {
      return createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.97)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '2rem', textAlign: 'center',
          }}
        >
          <style>{`
            @keyframes banPulse {
              0%, 100% { box-shadow: 0 0 20px #dc2626, 0 0 60px #dc2626; border-color: #dc2626; }
              50% { box-shadow: 0 0 40px #ef4444, 0 0 100px #ef4444; border-color: #ef4444; }
            }
            .ban-box {
              animation: banPulse 1.5s ease-in-out infinite;
              border: 2px solid #dc2626;
              border-radius: 1rem;
              padding: 2rem;
              max-width: 420px;
              background: rgba(127,0,0,0.3);
            }
          `}</style>
          <div className="ban-box">
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚫</div>
            <p style={{ color: '#ef4444', fontWeight: 900, fontSize: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
              ACESSO BLOQUEADO
            </p>
            <p style={{ color: 'white', fontWeight: 600, marginBottom: '0.5rem' }}>
              Você foi banido do site e do Grupo VIP.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem' }}>
              Múltiplas tentativas de captura de tela foram detectadas. Seu acesso foi permanentemente bloqueado pelo sistema de segurança.
            </p>
          </div>
        </div>,
        document.body
      );
    }

    return createPortal(
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '2rem', textAlign: 'center',
        }}
        onClick={() => setShowWarning(false)}
      >
        <div
          style={{
            border: `2px solid ${isSecondWarning ? '#f97316' : '#eab308'}`,
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '420px',
            background: isSecondWarning ? 'rgba(120,40,0,0.5)' : 'rgba(80,60,0,0.5)',
            boxShadow: isSecondWarning
              ? '0 0 30px #f97316, 0 0 80px #ea580c'
              : '0 0 30px #eab308, 0 0 80px #ca8a04',
          }}
        >
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>
            {isSecondWarning ? '⚠️' : '📸'}
          </div>
          <p style={{
            color: isSecondWarning ? '#fb923c' : '#facc15',
            fontWeight: 900,
            fontSize: '1.25rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.75rem',
          }}>
            {isSecondWarning ? '⚠️ ÚLTIMO AVISO!' : '⚠️ ATENÇÃO!'}
          </p>
          <p style={{ color: 'white', fontWeight: 600, marginBottom: '0.75rem' }}>
            {isSecondWarning
              ? 'Esta é sua ÚLTIMA CHANCE antes do banimento!'
              : 'Captura de tela detectada!'}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            {isSecondWarning
              ? 'Na próxima tentativa de captura de tela, você será permanentemente BLOQUEADO do site e REMOVIDO do Grupo VIP.'
              : 'Capturar telas deste site é proibido. Na 3ª tentativa, você será bloqueado do site e removido do Grupo VIP.'}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '1rem' }}>
            Tentativa {attempts} de 3 — Toque para fechar
          </p>
        </div>
      </div>,
      document.body
    );
  };

  return { attempts, blocked, WarningOverlay };
}
