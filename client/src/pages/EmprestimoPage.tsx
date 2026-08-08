import { useState, useEffect } from 'react';
import { LoansTab } from './LoansTab';
import { GastosLoginPage } from './GastosLoginPage';
import { trpc } from '@/lib/trpc';

const TOKEN_KEY = 'gastos_token';
const CLIENT_ID_KEY = 'gastos_clientId';
const CLIENT_NAME_KEY = 'gastos_clientName';

// Tela de acesso negado
function AcessoNegado({ routeLabel, onLogout }: { routeLabel: string; onLogout: () => void }) {
  const { data: settings } = trpc.settings.getAll.useQuery();
  const rawNumber = settings?.whatsapp_number || '5511978307371';
  const adminNumber = rawNumber.replace(/\D/g, '');
  const msg = encodeURIComponent(`Olá! Gostaria de solicitar acesso à área de ${routeLabel}. Meu cadastro já está feito.`);
  const href = `https://wa.me/${adminNumber}?text=${msg}`;
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#070a16] via-[#0a0f22] to-[#070a16] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card/80 border border-red-500/30 rounded-2xl p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-red-500/15 border border-red-500/30 rounded-full flex items-center justify-center mx-auto">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold text-red-300">Acesso não permitido</h2>
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para acessar a área de <strong className="text-foreground">{routeLabel}</strong>.
          Solicite a liberação ao administrador.
        </p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full h-12 rounded-xl font-semibold text-white bg-[#25D366] hover:bg-[#1ebe5d] transition-colors"
        >
          💬 Solicitar liberação pelo WhatsApp
        </a>
        <button
          onClick={onLogout}
          className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
        >
          ← Sair
        </button>
      </div>
    </div>
  );
}

export function EmprestimoPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [savedToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || '');
  const [isLoading, setIsLoading] = useState<boolean>(() => !!localStorage.getItem(TOKEN_KEY));

  const logoutMutation = trpc.spreadsheet.logout.useMutation();

  const verifyQuery = trpc.spreadsheet.verifySession.useQuery(
    { token: savedToken },
    { enabled: !!savedToken && !isLoggedIn, retry: false, refetchOnWindowFocus: false },
  );

  // Verificar acesso à rota emprestimo
  const routeAccessQuery = trpc.spreadsheet.checkRouteAccess.useQuery(
    { token: token || '', route: 'emprestimo' },
    { enabled: !!token && isLoggedIn, retry: false, refetchOnWindowFocus: false },
  );

  useEffect(() => {
    if (!savedToken) { setIsLoading(false); return; }
    if (verifyQuery.isLoading) return;
    if (verifyQuery.data?.valid) {
      setToken(savedToken);
      const name = verifyQuery.data.clientName ?? localStorage.getItem(CLIENT_NAME_KEY);
      setClientName(name);
      if (verifyQuery.data.clientId != null) localStorage.setItem(CLIENT_ID_KEY, String(verifyQuery.data.clientId));
      if (verifyQuery.data.clientName) localStorage.setItem(CLIENT_NAME_KEY, verifyQuery.data.clientName);
      setIsLoggedIn(true);
      setIsLoading(false);
    } else if (verifyQuery.isError) {
      setToken(savedToken);
      setClientName(localStorage.getItem(CLIENT_NAME_KEY));
      setIsLoggedIn(true);
      setIsLoading(false);
    } else if (verifyQuery.isSuccess && !verifyQuery.data?.valid) {
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
    if (current) logoutMutation.mutate({ token: current });
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
    return <GastosLoginPage onLoginSuccess={handleLoginSuccess} sourceRoute="emprestimo" />;
  }

  // Verificar permissão de rota (null = ainda carregando, não bloquear)
  if (routeAccessQuery.data && !routeAccessQuery.data.allowed) {
    return <AcessoNegado routeLabel="Empréstimos" onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">💳 Empréstimos</h1>
            {clientName && <p className="text-sm text-muted-foreground">Olá, {clientName}</p>}
          </div>
          <button onClick={handleLogout} className="text-xs text-muted-foreground hover:text-foreground underline">
            Sair
          </button>
        </div>
        <LoansTab token={token || ''} />
      </div>
    </div>
  );
}
