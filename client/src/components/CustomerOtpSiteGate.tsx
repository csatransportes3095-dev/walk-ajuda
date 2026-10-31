import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { CustomerOtpLogin, type CustomerOtpResult } from "./CustomerOtpLogin";

export function CustomerOtpSiteGate({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem("cp_token") || "");
  const [, navigate] = useLocation();
  const session = trpc.customerPassword.checkSession.useQuery(
    { token },
    { enabled: !!token, retry: 1, refetchOnWindowFocus: true, staleTime: 0 },
  );
  const route = trpc.spreadsheet.checkRouteAccess.useQuery(
    { token, route: "site" },
    { enabled: !!token && session.data?.valid === true, retry: 1 },
  );

  useEffect(() => {
    if (!session.data || session.data.valid !== false) return;
    localStorage.removeItem("cp_token");
    setToken("");
  }, [session.data]);

  useEffect(() => {
    if (!session.data?.valid || !session.data.profileUpdateRequired) return;
    localStorage.setItem("customer_update_token", token);
    localStorage.setItem("customer_update_phone_hint", session.data.phone);
    if (window.location.pathname !== "/atualizarcadastro") navigate("/atualizarcadastro");
  }, [session.data, token, navigate]);

  async function authenticated(value: CustomerOtpResult) {
    setToken(value.token);
    if (value.profileUpdateRequired) {
      localStorage.setItem("customer_update_token", value.token);
      localStorage.setItem("customer_update_phone_hint", value.phone);
      navigate("/atualizarcadastro");
    }
  }

  if (!token || session.data?.valid === false) {
    return <CustomerOtpLogin title="H2 COLOMBIANO 🇨🇴" onAuthenticated={authenticated}
      onRegister={() => navigate("/pre-cadastro")} />;
  }

  if (session.isError || route.isError) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-950 text-white p-6">
      <p>Não foi possível verificar seu acesso com segurança.</p>
      <button className="rounded-lg bg-cyan-500 px-5 py-3 font-bold text-black"
        onClick={() => { void session.refetch(); void route.refetch(); }}>Tentar novamente</button>
    </div>;
  }
  if (!session.data?.valid || route.isLoading || session.isLoading || (session.data.profileUpdateRequired)) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      Verificando sua autorização...
    </div>;
  }
  if (route.data?.allowed !== true) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-950 text-center text-white p-6">
      <p className="text-lg font-semibold">Sua conta não está autorizada para esta área.</p>
      <p>Confira suas permissões com o atendimento.</p>
      <button className="rounded-lg border border-cyan-400 p-3" onClick={() => navigate("/gastos")}>
        Consultar outras áreas
      </button>
    </div>;
  }
  return <>{children}</>;
}
