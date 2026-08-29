import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

const CP_TOKEN_KEY = "cp_token";
const RETURN_TO_KEY = "h2_customer_return_to";
const HOME_ACCESS_GRANTED_KEY = "walk_home_access_granted";
const HOME_ACCESS_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

type ModuleTarget =
  | { kind: "spreadsheet"; route: "gastos" | "emprestimo" }
  | { kind: "cartoes" }
  | null;

function currentRelativeUrl(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function resolveTarget(pathname: string): ModuleTarget {
  const path = String(pathname || "/").toLowerCase().replace(/\/+$/, "") || "/";
  if (path === "/gastos") return { kind: "spreadsheet", route: "gastos" };
  if (path === "/emprestimo") return { kind: "spreadsheet", route: "emprestimo" };
  if (path === "/cartoes" || path.startsWith("/cartoes/")) return { kind: "cartoes" };
  return null;
}

function markHomeManifestAsRetired() {
  if (typeof window === "undefined") return;
  // A antiga tela separada "Quem indicou você?" foi aposentada. A indicação
  // agora é validada no topo do próprio cadastro central.
  sessionStorage.setItem(HOME_ACCESS_GRANTED_KEY, String(Date.now() + HOME_ACCESS_REFRESH_MS));
}

function Loading({ message = "Preparando seu acesso..." }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-[99998] flex min-h-screen items-center justify-center bg-[#050611] px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-400" />
        <p className="text-sm font-semibold text-white/65">{message}</p>
      </div>
    </div>
  );
}

export default function UnifiedCustomerModuleBootstrap({ children }: { children: ReactNode }) {
  markHomeManifestAsRetired();

  const [location] = useLocation();
  const target = useMemo(() => resolveTarget(location), [location]);
  const [ready, setReady] = useState(() => target === null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const cpToken = localStorage.getItem(CP_TOKEN_KEY) || "";

    if (!target || !cpToken) {
      setReady(true);
      setError("");
      return () => { cancelled = true; };
    }

    setReady(false);
    setError("");
    const controller = new AbortController();

    const prepare = async () => {
      const endpoint = target.kind === "cartoes"
        ? "/api/customer-session/cartoes"
        : `/api/customer-session/${target.route}`;
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${cpToken}` },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({} as any));
      if (cancelled) return;

      if (response.status === 401) {
        localStorage.removeItem(CP_TOKEN_KEY);
        localStorage.removeItem("walk_access_granted");
        sessionStorage.setItem(RETURN_TO_KEY, currentRelativeUrl());
        window.location.replace("/login");
        return;
      }

      if (response.status === 409 && data?.code === "PROFILE_INCOMPLETE") {
        sessionStorage.setItem(RETURN_TO_KEY, currentRelativeUrl());
        if (data?.phone) localStorage.setItem("customer_update_phone_hint", String(data.phone));
        window.location.replace("/atualizarcadastro");
        return;
      }

      if (!response.ok) {
        setError(String(data?.message || "Não foi possível preparar esta área."));
        return;
      }

      if (target.kind === "spreadsheet") {
        localStorage.setItem("gastos_token", String(data.token || ""));
        localStorage.setItem("gastos_clientId", String(data.clientId || ""));
        localStorage.setItem("gastos_clientName", String(data.clientName || ""));
      }

      setReady(true);
    };

    void prepare().catch((cause: any) => {
      if (cancelled || cause?.name === "AbortError") return;
      setError("Não foi possível preparar esta área. Tente novamente.");
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [target]);

  if (target && !ready && !error) return <Loading />;
  if (target && error) {
    return (
      <div className="fixed inset-0 z-[99998] flex min-h-screen items-center justify-center bg-[#050611] px-6 text-white">
        <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-red-950/20 p-6 text-center">
          <h2 className="text-lg font-black text-red-200">Acesso não liberado</h2>
          <p className="mt-2 text-sm text-white/65">{error}</p>
          <button
            type="button"
            onClick={() => window.location.replace("/")}
            className="mt-5 w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/15"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
