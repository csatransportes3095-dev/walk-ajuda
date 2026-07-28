import { useEffect, useRef, useCallback, createContext, useContext, useState, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

// Context para compartilhar o estado do timer com o componente AdminSessionTimer
interface AdminIdleContextType {
  timeRemaining: string;
  bgColor: string;
  onContinue: () => void;
}

const AdminIdleContext = createContext<AdminIdleContextType | null>(null);

export function useAdminIdleContext() {
  const context = useContext(AdminIdleContext);
  if (!context) throw new Error("useAdminIdleContext deve ser usado dentro de AdminIdleProvider");
  return context;
}

interface AdminIdleProviderProps {
  children: ReactNode;
  isAdmin: boolean;
}

export function AdminIdleProvider({ children, isAdmin }: AdminIdleProviderProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>("30:00");
  const [bgColor, setBgColor] = useState<string>("bg-blue-600");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const logoutMutation = trpc.adminAuth.logout.useMutation({
    onSuccess: () => {
      utils.adminAuth.check.invalidate();
      navigate("/admin/login");
    },
  });

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef<number>(Math.floor(IDLE_TIMEOUT_MS / 1000));

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    idleTimerRef.current = null;
    countdownTimerRef.current = null;
  }, []);

  const onContinue = useCallback(() => {
    secondsRef.current = Math.floor(IDLE_TIMEOUT_MS / 1000);
    clearTimers();
    resetTimer();
  }, [clearTimers]);

  const resetTimer = useCallback(() => {
    clearTimers();
    secondsRef.current = Math.floor(IDLE_TIMEOUT_MS / 1000);

    const updateCountdown = () => {
      const minutes = Math.floor(secondsRef.current / 60);
      const seconds = secondsRef.current % 60;
      setTimeRemaining(`${minutes}:${String(seconds).padStart(2, '0')}`);

      if (secondsRef.current <= 60) {
        setBgColor("bg-red-600");
      } else if (secondsRef.current <= 300) {
        setBgColor("bg-orange-600");
      } else {
        setBgColor("bg-blue-600");
      }

      secondsRef.current--;
      if (secondsRef.current < 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      }
    };

    updateCountdown();
    countdownTimerRef.current = setInterval(updateCountdown, 1000);

    idleTimerRef.current = setTimeout(() => {
      logoutMutation.mutate();
    }, IDLE_TIMEOUT_MS);
  }, [clearTimers, logoutMutation]);

  useEffect(() => {
    if (!isAdmin) return;

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart", "pointerdown"];
    const handleActivity = () => resetTimer();

    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearTimers();
    };
  }, [isAdmin, resetTimer, clearTimers]);

  const providerValue: AdminIdleContextType = { timeRemaining, bgColor, onContinue };

  return (
    <AdminIdleContext.Provider value={providerValue}>
      {children}
    </AdminIdleContext.Provider>
  );
}

/**
 * Hook legado - mantido para compatibilidade
 */
export function useAdminIdleLogout(isAdmin: boolean) {
  // Usar o context se disponível, caso contrário não fazer nada (compatibilidade)
  try {
    useAdminIdleContext();
  } catch {
    // Context não disponível - noop
  }
}
