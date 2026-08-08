import { useState, useEffect } from 'react';
import { LoansTab } from './LoansTab';
import { GastosLoginPage } from './GastosLoginPage';
import { trpc } from '@/lib/trpc';

// Chaves de localStorage — compartilhadas com GastosPage (mesmo sistema de autenticação)
const TOKEN_KEY = 'gastos_token';
const CLIENT_ID_KEY = 'gastos_clientId';
const CLIENT_NAME_KEY = 'gastos_clientName';

export function EmprestimoPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);

  // Token salvo lido uma única vez do localStorage (referência estável)
  const [savedToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || '');

  // Enquanto verificamos a sessão salva no backend, mostramos loading
  const [isLoading, setIsLoading] = useState<boolean>(() => !!localStorage.getItem(TOKEN_KEY));

  const logoutMutation = trpc.spreadsheet.logout.useMutation();

  // Verifica a sessão salva no servidor
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
      const name = verifyQuery.data.clientName ?? localStorage.getItem(CLIENT_NAME_KEY);
      setClientName(name);
      if (verifyQuery.data.clientId != null) {
        localStorage.setItem(CLIENT_ID_KEY, String(verifyQuery.data.clientId));
      }
      if (verifyQuery.data.clientName) {
        localStorage.setItem(CLIENT_NAME_KEY, verifyQuery.data.clientName);
      }
      setIsLoggedIn(true);
      setIsLoading(false);
    } else if (verifyQuery.isError) {
      // Falha de rede: não desloga, mantém sessão salva
      setToken(savedToken);
      setClientName(localStorage.getItem(CLIENT_NAME_KEY));
      setIsLoggedIn(true);
      setIsLoading(false);
    } else if (verifyQuery.isSuccess && !verifyQuery.data?.valid) {
      // Token inválido/expirado → limpa
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(CLIENT_ID_KEY);
      localStorage.removeItem(CLIENT_NAME_KEY);
      setIsLoggedIn(false);
      setIsLoading(false);
    }
  }, [savedToken, verifyQuery.isLoading, verifyQuery.isError, verifyQuery.isSuccess, verifyQuery.data]);

  const handleLoginSuccess = (newToken: string, newClientId: number, newClientName: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(CLIENT_ID_KEY, String(newClientId));
    localStorage.setItem(CLIENT_NAME_KEY, newClientName);
    setToken(newToken);
    setClientName(newClientName);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    const current = localStorage.getItem(TOKEN_KEY);
    if (current) {
      logoutMutation.mutate({ token: current });
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CLIENT_ID_KEY);
    localStorage.removeItem(CLIENT_NAME_KEY);
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
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">💳 Empréstimos</h1>
            {clientName && (
              <p className="text-sm text-muted-foreground">Olá, {clientName}</p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Sair
          </button>
        </div>

        {/* Conteúdo de empréstimos */}
        <LoansTab token={token || ''} />
      </div>
    </div>
  );
}
