import { Loader2 } from "lucide-react";
import { Switch, Route } from "wouter";
import { trpc } from "@/lib/trpc";
import CartaoAuthPage from "./CartaoAuthPage";
import CartaoDashboardPage from "./CartaoDashboardPage";
import CartaoDetailPage from "./CartaoDetailPage";
import CartaoDespesasPage from "./CartaoDespesasPage";

function CartaoRoutes() {
  const { data: user, isLoading } = trpc.cartoes.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#6750A4" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Loader2 style={{ width: 32, height: 32, color: "rgba(255,255,255,0.7)", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <CartaoAuthPage />;
  }

  return (
    <Switch>
      <Route path="/cartoes" component={CartaoDashboardPage} />
      <Route path="/cartoes/cartao/:id" component={CartaoDetailPage} />
      <Route path="/cartoes/despesas" component={CartaoDespesasPage} />
      <Route component={CartaoDashboardPage} />
    </Switch>
  );
}

export default function CartaoPage() {
  return <CartaoRoutes />;
}
