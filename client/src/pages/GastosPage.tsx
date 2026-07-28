import { useState, useEffect } from 'react';
import { SpreadsheetPage } from './SpreadsheetPage';
import { GastosLoginPage } from './GastosLoginPage';
import { trpc } from '@/lib/trpc';

export function GastosPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  // Token salvo lido uma unica vez do localStorage (referencia estavel)
  const [savedToken] = useState<string>(() => localStorage.getItem('gastos_token') || '');
  // Enquanto verificamos a sessao salva no backend, mostramos loading
  const [isLoading, setIsLoading] = useState<boolean>(() => !!localStorage.getItem('gastos_token'));

  const logoutMutation = trpc.spreadsheet.logout.useMutation();

  // Verifica a sessao salva no servidor (restauracao automatica e confiavel).
  // So dispara quando ha token salvo e ainda nao estamos logados.
  const verifyQuery = trpc.spreadsheet.verifySession.useQuery(
    { token: savedToken },
    { enabled: !!savedToken && !isLoggedIn, retry: false, refetchOnWindowFocus: false },
  );

  useEffect(() => {
    if (!savedToken) {
      setIsLoading(false);
      return;
    }
    if (verifyQuery.isLoading) return;

    if (verifyQuery.data?.valid) {
      setToken(savedToken);
      const name = verifyQuery.data.clientName ?? localStorage.getItem('gastos_clientName');
      setClientName(name);
      if (verifyQuery.data.clientId != null) {
        localStorage.setItem('gastos_clientId', String(verifyQuery.data.clientId));
      }
      if (verifyQuery.data.clientName) {
        localStorage.setItem('gastos_clientName', verifyQuery.data.clientName);
      }
      setIsLoggedIn(true);
      setIsLoading(false);
    } else if (verifyQuery.isError) {
      // Falha de rede: nao desloga. Mantem a sessao salva e assume logado.
      setToken(savedToken);
      setClientName(localStorage.getItem('gastos_clientName'));
      setIsLoggedIn(true);
      setIsLoading(false);
    } else if (verifyQuery.isSuccess && !verifyQuery.data?.valid) {
      // Token realmente invalido/expirado -> limpa (evita estado "logado mas quebrado")
      localStorage.removeItem('gastos_token');
      localStorage.removeItem('gastos_clientId');
      localStorage.removeItem('gastos_clientName');
      setIsLoggedIn(false);
      setIsLoading(false);
    }
  }, [savedToken, verifyQuery.isLoading, verifyQuery.isError, verifyQuery.isSuccess, verifyQuery.data]);

  const handleLoginSuccess = (newToken: string, newClientId: number, newClientName: string) => {
    // Persistir sessao
    localStorage.setItem('gastos_token', newToken);
    localStorage.setItem('gastos_clientId', String(newClientId));
    localStorage.setItem('gastos_clientName', newClientName);
    // Atualiza estado -> entra direto no painel, sem precisar de F5
    setToken(newToken);
    setClientName(newClientName);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    const current = localStorage.getItem('gastos_token');
    if (current) {
      // Invalida a sessao no servidor (best-effort)
      logoutMutation.mutate({ token: current });
    }
    localStorage.removeItem('gastos_token');
    localStorage.removeItem('gastos_clientId');
    localStorage.removeItem('gastos_clientName');
    setToken(null);
    setClientName(null);
    setIsLoggedIn(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#070a16] via-[#0a0f22] to-[#070a16] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <GastosLoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <SpreadsheetPage
      clientName={clientName || undefined}
      token={token || ''}
      onLogout={handleLogout}
    />
  );
}
