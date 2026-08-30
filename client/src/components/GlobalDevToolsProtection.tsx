import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useDevToolsDetection } from "@/hooks/useDevToolsDetection";
import { isH2AdsPath } from "@shared/h2adsRoute";

export default function GlobalDevToolsProtection() {
  const [location] = useLocation();
  const excluded = location.startsWith("/admin") || isH2AdsPath(location) || location === "/acompanhar";
  const settingsQuery = trpc.settings.getAll.useQuery(undefined, {
    enabled: !excluded,
    staleTime: 0,
    refetchInterval: !excluded ? 2_000 : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const enabled = !excluded && settingsQuery.data?.devtools_protection === "1";
  const [blocked, setBlocked] = useState(false);
  const securityAlertMut = trpc.system.securityAlert.useMutation();

  useEffect(() => {
    if (!enabled) setBlocked(false);
  }, [enabled]);

  useDevToolsDetection(() => {
    if (!enabled) return;
    setBlocked(true);
    let phone: string | undefined;
    try {
      phone = localStorage.getItem("walk_client_phone") || undefined;
    } catch {
      phone = undefined;
    }
    securityAlertMut.mutate({
      type: "DevTools / Inspetor aberto",
      phone,
      page: window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 200),
    });
  }, enabled);

  if (!enabled || !blocked) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black p-6 text-white">
      <div className="mb-4 text-6xl">🔒</div>
      <h2 className="mb-2 text-center text-xl font-bold text-red-400">Acesso Bloqueado</h2>
      <p className="max-w-xs text-center text-sm text-white/60">
        Ferramentas de desenvolvedor foram detectadas. Por segurança, o acesso foi bloqueado e o administrador foi notificado.
      </p>
    </div>
  );
}
