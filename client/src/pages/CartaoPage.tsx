import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import CartaoAuthPage from "./CartaoAuthPage";
import CartaoDashboardPage from "./CartaoDashboardPage";
import CartaoDetailPage from "./CartaoDetailPage";
import CartaoDespesasPage from "./CartaoDespesasPage";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { useState } from "react";
import { CustomerOtpLogin, type CustomerOtpResult } from "@/components/CustomerOtpLogin";

function CartaoRoutes() {
  const [location, navigate] = useLocation();
  // wouter retorna path relativo quando montado via Route /cartoes/:rest*
  // Usar window.location.pathname para obter o path absoluto real
  const fullPath = typeof window !== 'undefined' ? window.location.pathname : location;
  const { data: user, isLoading } = trpc.cartoes.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#6750A4" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <CartaoAuthPage />;
  }

  let page = <CartaoDashboardPage />;

  // Roteamento manual usando path absoluto
  if (fullPath === "/cartoes/despesas") {
    page = <CartaoDespesasPage />;
  } else {
    const cartaoMatch = fullPath.match(/^\/cartoes\/cartao\/(\d+)$/);
    if (cartaoMatch) {
      page = <CartaoDetailPage />;
    }
  }

  return (
    <>
      {page}
      <button
        type="button"
        onClick={() => navigate("/gastos")}
        aria-label="Voltar para Planilha de Gastos"
        style={{
          position: "fixed",
          top: 16,
          right: 72,
          zIndex: 9999,
          height: 40,
          padding: "0 13px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(25,20,44,0.98)",
          color: "#ffffff",
          fontSize: 12,
          fontWeight: 800,
          lineHeight: 1,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        ← Planilha
      </button>
    </>
  );
}

export default function CartaoPage() {
  const mode = trpc.customerPassword.authMode.useQuery(undefined, { retry: 1 });
  const utils = trpc.useUtils();
  const [token, setToken] = useState(() => localStorage.getItem("cp_token") || "");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const session = trpc.customerPassword.checkSession.useQuery({ token }, {
    enabled: mode.data?.passwordless === true && !!token, retry: 1,
  });
  const prepareCards = async (value: CustomerOtpResult | { token: string }) => {
    const response = await fetch("/api/customer-session/cartoes", {
      method: "POST", credentials: "include",
      headers: { Authorization: "Bearer " + value.token },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || "Não foi possível acessar seus cartões.");
    localStorage.setItem("cp_token", value.token);
    await utils.cartoes.auth.me.invalidate();
    setReady(true);
  };
  if (mode.isPending || (mode.data?.passwordless && token && session.isPending)) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Verificando autenticação...</div>;
  }
  if (mode.isError || (mode.data?.passwordless && session.isError)) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Não foi possível verificar o acesso.</div>;
  }
  if (mode.data?.passwordless) {
    if (!token || session.data?.valid !== true) {
      return <CustomerOtpLogin title="MEUS CARTÕES · H2 COLOMBIANO"
        onAuthenticated={async (value: CustomerOtpResult) => {
          await prepareCards(value);
          setToken(value.token);
        }} />;
    }
    if (!ready) return <div className="min-h-screen bg-slate-950 text-white flex flex-col gap-4 items-center justify-center">
      {error ? <p>{error}</p> : <p>Preparando cartões...</p>}
      <button className="rounded-xl bg-cyan-500 px-5 py-3 text-black font-bold" onClick={() => {
        setError("");
        void prepareCards({ token }).catch(e => setError(e.message || "Falha no acesso."));
      }}>Acessar meus cartões</button>
    </div>;
  }
  return <><CartaoRoutes /><PWAInstallPrompt /></>;
}
