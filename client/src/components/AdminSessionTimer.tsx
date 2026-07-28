import { useEffect, useState, useRef } from "react";
import { Clock } from "lucide-react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

interface AdminSessionTimerProps {
  isAdmin: boolean;
  onContinue?: () => void;
}

export function AdminSessionTimer({ isAdmin, onContinue }: AdminSessionTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>("30:00");
  const [bgColor, setBgColor] = useState<string>("bg-blue-600");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef<number>(Math.floor(IDLE_TIMEOUT_MS / 1000));

  useEffect(() => {
    if (!isAdmin) return;

    const updateTimer = () => {
      const minutes = Math.floor(secondsRef.current / 60);
      const seconds = secondsRef.current % 60;
      setTimeRemaining(`${minutes}:${String(seconds).padStart(2, '0')}`);

      // Mudar cor conforme se aproxima do logout
      if (secondsRef.current <= 60) {
        setBgColor("bg-red-600");
      } else if (secondsRef.current <= 300) {
        setBgColor("bg-orange-600");
      } else {
        setBgColor("bg-blue-600");
      }

      secondsRef.current--;
      if (secondsRef.current < 0) {
        secondsRef.current = 0;
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    // Listener para atividade
    const handleActivity = () => {
      secondsRef.current = Math.floor(IDLE_TIMEOUT_MS / 1000);
      updateTimer();
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart", "pointerdown"];

    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    updateTimer(); // primeira atualização
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <div className={`fixed bottom-4 right-4 ${bgColor} border border-white/20 rounded-lg px-4 py-3 flex items-center gap-2 shadow-lg z-50 transition-colors duration-300`}>
      <Clock className="w-5 h-5 text-white" />
      <div className="flex flex-col">
        <span className="text-xs text-white/70">Sessão expira em</span>
        <span className="text-lg font-bold text-white">{timeRemaining}</span>
      </div>
      <button
        onClick={onContinue}
        className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded transition-colors"
      >
        Continuar
      </button>
    </div>
  );
}
