import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const CP_TOKEN_KEY = "cp_token";
const RETURN_TO_KEY = "h2_customer_return_to";
const LEGACY_KEYS = ["walk_access_granted", "walk_access_code", "walk_access_type", "walk_access_expires"] as const;

function normalizePath(pathname: string): string {
  const lowered = String(pathname || "/").toLowerCase();
  if (lowered === "/") return "/";
  return lowered.replace(/\/+$/, "") || "/";
}

function isUnifiedCustomerRoute(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    path === "/gastos" ||
    path === "/emprestimo" ||
    path === "/acompanhar" ||
    path === "/foto" ||
    path === "/cartoes" ||
    path.startsWith("/cartoes/")
  );
}

function currentRelativeUrl(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function clearLegacyAccess() {
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
}

function getSafeReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem(RETURN_TO_KEY);
  if (!stored || !stored.startsWith("/")) return null;
  try {
    const url = new URL(stored, window.location.origin);
    if (url.origin !== window.location.origin || !isUnifiedCustomerRoute(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function LoadingGate() {
  return (
    <div className="fixed inset-0 z-[99999] flex min-h-screen items-center justify-center bg-[#050611]">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-400" />
        <p className="text-sm font-semibold text-white/65">Verificando cadastro...</p>
      </div>
    </div>
  );
}

export default function UnifiedCustomerAccessGate({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const normalizedLocation = useMemo(() => normalizePath(location), [location]);
  const isProtectedRoute = isUnifiedCustomerRoute(normalizedLocation);
  const isCentralLogin = normalizedLocation === "/login";
  const [cpToken, setCpToken] = useState(() => localStorage.getItem(CP_TOKEN_KEY) || "");
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!isProtectedRoute && !isCentralLogin) return;
    const sync = () => {
      const nextToken = localStorage.getItem(CP_TOKEN_KEY) || "";
      setCpToken((current) => current === nextToken ? current : nextToken);
    };
    sync();
    const interval = window.setInterval(sync, 300);
    return () => window.clearInterval(interval);
  }, [isProtectedRoute, isCentralLogin]);

  const sessionQuery = trpc.customerPassword.checkSession.useQuery(
    { token: cpToken || "" },
    {
      enabled: !!cpToken && (isProtectedRoute || isCentralLogin),
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
  );

  // Todas as áreas privadas do cliente usam uma única sessão central.
  useEffect(() => {
    if (!isProtectedRoute || redirecting) return;

    if (!cpToken) {
      clearLegacyAccess();
      sessionStorage.setItem(RETURN_TO_KEY, currentRelativeUrl());
      setRedirecting(true);
      window.location.replace("/login");
      return;
    }

    if (sessionQuery.isLoading || sessionQuery.data === undefined) return;

    if (!sessionQuery.data.valid) {
      localStorage.removeItem(CP_TOKEN_KEY);
      clearLegacyAccess();
      sessionStorage.setItem(RETURN_TO_KEY, currentRelativeUrl());
      setCpToken("");
      setRedirecting(true);
      window.location.replace("/login");
      return;
    }

    if (sessionQuery.data.profileUpdateRequired) {
      sessionStorage.setItem(RETURN_TO_KEY, currentRelativeUrl());
      const phone = sessionQuery.data.phone || localStorage.getItem("walk_client_phone") || "";
      if (phone) localStorage.setItem("customer_update_phone_hint", phone);
      setRedirecting(true);
      window.location.replace("/atualizarcadastro");
    }
  }, [cpToken, isProtectedRoute, redirecting, sessionQuery.data, sessionQuery.isLoading]);

  useEffect(() => {
    if (!isCentralLogin || !cpToken || sessionQuery.isLoading || sessionQuery.data === undefined) return;
    if (sessionQuery.data.valid) return;
    localStorage.removeItem(CP_TOKEN_KEY);
    clearLegacyAccess();
    setCpToken("");
  }, [cpToken, isCentralLogin, sessionQuery.data, sessionQuery.isLoading]);

  useEffect(() => {
    if (!isCentralLogin || redirecting || !cpToken) return;
    const returnTo = getSafeReturnTo();
    if (!returnTo) return;
    if (sessionQuery.data?.valid !== true || sessionQuery.data?.profileUpdateRequired) return;
    sessionStorage.removeItem(RETURN_TO_KEY);
    setRedirecting(true);
    window.location.replace(returnTo);
  }, [cpToken, isCentralLogin, redirecting, sessionQuery.data]);

  if (isProtectedRoute) {
    if (redirecting || !cpToken) return <LoadingGate />;
    if (sessionQuery.isLoading || sessionQuery.data === undefined) return <LoadingGate />;
    if (sessionQuery.data?.valid !== true || sessionQuery.data?.profileUpdateRequired) return <LoadingGate />;
  }

  return <>{children}</>;
}
