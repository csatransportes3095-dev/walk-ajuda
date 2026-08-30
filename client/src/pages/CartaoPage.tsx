import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import CartaoAuthPage from "./CartaoAuthPage";
import CartaoDashboardPage from "./CartaoDashboardPage";
import CartaoDetailPage from "./CartaoDetailPage";
import CartaoDespesasPage from "./CartaoDespesasPage";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

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
  return (
    <>
      <CartaoRoutes />
      <PWAInstallPrompt />
    </>
  );
}
