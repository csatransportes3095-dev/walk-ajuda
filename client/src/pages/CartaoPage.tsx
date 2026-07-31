import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import CartaoAuthPage from "./CartaoAuthPage";
import CartaoDashboardPage from "./CartaoDashboardPage";
import CartaoDetailPage from "./CartaoDetailPage";
import CartaoDespesasPage from "./CartaoDespesasPage";

function CartaoRoutes() {
  const [location] = useLocation();
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

  // Roteamento manual — evita conflito com o Switch do App.tsx
  if (location === "/cartoes/despesas") {
    return <CartaoDespesasPage />;
  }

  const cartaoMatch = location.match(/^\/cartoes\/cartao\/(\d+)$/);
  if (cartaoMatch) {
    return <CartaoDetailPage />;
  }

  return <CartaoDashboardPage />;
}

export default function CartaoPage() {
  return <CartaoRoutes />;
}
