import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const CP_TOKEN_KEY = "cp_token";
const LEGACY_ACCESS_KEY = "walk_access_granted";
const RETURN_TO_KEY = "h2_customer_return_to";

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
    path === "/cartoes" ||
    path.startsWith("/cartoes/")
  );
}

function currentRelativeUrl(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
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

export default function UnifiedCustomerAccessGate({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const normalizedLocation = useMemo(() => normalizePath(location), [location]);
  const isProtectedRoute = isUnifiedCustomerRoute(normalizedLocation);
  const isCentralLogin = normalizedLocation === "/login";

  const [cpToken, setCpToken] = useState(() => localStorage.getItem(CP_TOKEN_KEY) || "");
  const [legacyGranted, setLegacyGranted] = useState(() => localStorage.getItem(LEGACY_ACCESS_KEY) === "true");
  const [redirecting, setRedirecting] = useState(false);

  // PasswordGate grava a sessão no localStorage na mesma aba. O evento "storage"
  // não dispara na própria aba, por isso sincronizamos rapidamente enquanto o gate
  // ou a tela central de login estiverem ativos.
  useEffect(() => {
    if (!isProtectedRoute && !isCentralLogin) return;
    const sync = () => {
      const nextToken = localStorage.getItem(CP_TOKEN_KEY) || "";
      const nextLegacy = localStorage.getItem(LEGACY_ACCESS_KEY) === "true";
      setCpToken((current) => current === nextToken ? current : nextToken);
      setLegacyGranted((current) => current === nextLegacy ? current : nextLegacy);
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

  // Toda rota de cliente protegida entra primeiro pela autenticação/cadastro central.
  useEffect(() => {
    if (!isProtectedRoute || redirecting) return;

    if (!cpToken && !legacyGranted) {
      sessionStorage.setItem(RETURN_TO_KEY, currentRelativeUrl());
      setRedirecting(true);
      window.location.replace("/login");
      return;
    }

    if (!cpToken || sessionQuery.isLoading || sessionQuery.data === undefined) return;

    if (!sessionQuery.data.valid) {
      localStorage.removeItem(CP_TOKEN_KEY);
      localStorage.removeItem(LEGACY_ACCESS_KEY);
      sessionStorage.setItem(RETURN_TO_KEY, currentRelativeUrl());
      setCpToken("");
      setLegacyGranted(false);
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
  }, [
    cpToken,
    isProtectedRoute,
    legacyGranted,
    redirecting,
    sessionQuery.data,
    sessionQuery.isLoading,
  ]);

  // Depois que o PasswordGate concluir login/cadastro, retorna automaticamente
  // para a rota que o cliente tentou abrir inicialmente.
  useEffect(() => {
    if (!isCentralLogin || redirecting) return;
    const returnTo = getSafeReturnTo();
    if (!returnTo) return;

    const authenticated = cpToken
      ? sessionQuery.data?.valid === true && !sessionQuery.data?.profileUpdateRequired
      : legacyGranted;

    if (!authenticated) return;
    sessionStorage.removeItem(RETURN_TO_KEY);
    setRedirecting(true);
    window.location.replace(returnTo);
  }, [cpToken, isCentralLogin, legacyGranted, redirecting, sessionQuery.data]);

  if (isProtectedRoute) {
    if (redirecting) return <LoadingGate />;
    if (!cpToken && !legacyGranted) return <LoadingGate />;
    if (cpToken && (sessionQuery.isLoading || sessionQuery.data === undefined)) return <LoadingGate />;
    if (cpToken && sessionQuery.data?.valid !== true) return <LoadingGate />;
    if (cpToken && sessionQuery.data?.profileUpdateRequired) return <LoadingGate />;
  }

  return <>{children}</>;
}
