import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Lock, User, Shield, KeyRound, AlertTriangle, MessageSquare, RefreshCw, Plus } from "lucide-react";
import H2AndroidAdminShell from "@/components/H2AndroidAdminShell";

type Screen = "login" | "blocked";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const androidLogin = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("returnTo") === "/adm/android";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [screen, setScreen] = useState<Screen>("login");
  const [counterPassword, setCounterPassword] = useState("");
  const [unlockMessage, setUnlockMessage] = useState("");
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const loginMutation = trpc.adminAuth.login.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        await utils.adminAuth.check.refetch();
        navigate(androidLogin ? "/adm/android" : "/admin/codes");
      } else if (data.error === "IP_BLOCKED") {
        setScreen("blocked");
      } else {
        // Extrair número de tentativas restantes da mensagem
        const match = data.message?.match(/(\d+) tentativa/);
        if (match) setRemainingAttempts(parseInt(match[1]));
        toast.error(data.message || "Usuário ou senha incorretos");
      }
    },
    onError: () => {
      toast.error("Erro ao fazer login. Tente novamente.");
    },
  });

  const unlockMutation = trpc.adminAuth.unlock.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("IP desbloqueado! Você pode tentar o login novamente.");
        setScreen("login");
        setCounterPassword("");
        setRemainingAttempts(null);
      } else {
        toast.error(data.error || "Contra-senha incorreta.");
      }
    },
    onError: () => toast.error("Erro ao desbloquear. Tente novamente."),
  });

  const requestUnlockMutation = trpc.adminAuth.requestUnlock.useMutation({
    onSuccess: () => {
      toast.success("Solicitação enviada! O administrador será notificado.");
    },
    onError: () => toast.error("Erro ao enviar solicitação."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    loginMutation.mutate({ username: username.trim(), password });
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterPassword.trim()) {
      toast.error("Digite a contra-senha");
      return;
    }
    unlockMutation.mutate({ counterPassword: counterPassword.trim() });
  };

  const handleRequestUnlock = () => {
    requestUnlockMutation.mutate({ message: unlockMessage || undefined });
  };

  // ─── Tela de IP Bloqueado ────────────────────────────────────────────────────
  if (screen === "blocked") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4">
          {/* Aviso de bloqueio */}
          <div className="text-center mb-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Acesso Bloqueado</h1>
            <p className="text-white/50 text-sm mt-1">3 tentativas incorretas detectadas</p>
          </div>

          {/* Opção 1: Contra-senha */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-4 h-4 text-yellow-400" />
              <h2 className="text-sm font-bold text-white">Desbloquear com Contra-Senha</h2>
            </div>
            <p className="text-xs text-white/40 mb-3">
              Use a contra-senha secreta que você guardou para desbloquear imediatamente.
            </p>
            <form onSubmit={handleUnlock} className="space-y-3" autoComplete="off">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="password"
                  value={counterPassword}
                  onChange={(e) => setCounterPassword(e.target.value)}
                  placeholder="Contra-senha secreta"
                  autoComplete="new-password"
                  name="counter-pwd"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 transition-all text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={unlockMutation.isPending}
                className="w-full py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm transition-colors disabled:opacity-50"
              >
                {unlockMutation.isPending ? "Desbloqueando..." : "Desbloquear"}
              </button>
            </form>
          </div>

          {/* Opção 2: Solicitar desbloqueio ao administrador */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-bold text-white">Solicitar Desbloqueio</h2>
            </div>
            <p className="text-xs text-white/40 mb-3">
              Envie uma solicitação ao administrador do sistema.
            </p>
            <div className="space-y-3">
              <textarea
                value={unlockMessage}
                onChange={(e) => setUnlockMessage(e.target.value)}
                placeholder="Mensagem opcional (ex: sou o dono do sistema)"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-all text-sm resize-none"
              />
              <button
                onClick={handleRequestUnlock}
                disabled={requestUnlockMutation.isPending}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors disabled:opacity-50"
              >
                {requestUnlockMutation.isPending ? "Enviando..." : "Solicitar Desbloqueio"}
              </button>
            </div>
          </div>

          <button
            onClick={() => setScreen("login")}
            className="w-full text-center text-xs text-white/30 hover:text-white/60 transition-colors py-2"
          >
            ← Voltar ao login
          </button>
        </div>
      </div>
    );
  }

  if (androidLogin) {
    return (
      <H2AndroidAdminShell activeSection="overview">
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-[1400px] flex-col px-4 py-8 sm:px-6 lg:px-7">
          <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-start">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8ce2bd]">H2 Android</p>
              <h1 className="text-3xl font-bold tracking-tight text-[#e9edf2] sm:text-[34px]">Seus Androids, em um só lugar.</h1>
              <p className="mt-2 text-sm text-[#92a0ad]">Controle os aparelhos e acompanhe cada operação.</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" disabled className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#2a3948] bg-[#14202c] px-3.5 text-xs font-semibold text-[#95a2af] opacity-70">
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </button>
              <button type="button" disabled className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#8ce2bd] px-3.5 text-xs font-bold text-[#123126] opacity-70">
                <Plus className="h-3.5 w-3.5" /> Novo Android
              </button>
            </div>
          </div>

          <div className="grid flex-1 place-items-center pb-8">
            <section className="w-full max-w-[420px] rounded-xl border border-[#2b3948] bg-[#121d29] p-5 shadow-[0_20px_60px_rgba(0,0,0,.18)] sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8ce2bd]">Área administrativa</p>
              <h2 className="mt-3 text-[23px] font-bold tracking-tight text-[#e7edf3]">Acesse seu painel</h2>
              <p className="mt-2 text-xs text-[#95a2af]">Entre com o usuário e a senha do ADM H2.</p>

              {remainingAttempts !== null && remainingAttempts > 0 && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2.5 text-xs text-red-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span><strong>{remainingAttempts} tentativa(s)</strong> antes do bloqueio.</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-3.5" autoComplete="off">
                <div>
                  <label htmlFor="android-admin-user" className="mb-1.5 block text-[11px] font-medium text-[#aab5c0]">Usuário</label>
                  <input
                    id="android-admin-user"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Usuário"
                    autoComplete="off"
                    name="admin-user"
                    className="h-10 w-full rounded-md border border-[#334151] bg-[#0c1520] px-3 text-sm text-[#e6ebf1] outline-none placeholder:text-[#637180] focus:border-[#8ce2bd]/70"
                  />
                </div>
                <div>
                  <label htmlFor="android-admin-password" className="mb-1.5 block text-[11px] font-medium text-[#aab5c0]">Senha</label>
                  <input
                    id="android-admin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    autoComplete="new-password"
                    name="admin-pwd"
                    className="h-10 w-full rounded-md border border-[#334151] bg-[#0c1520] px-3 text-sm text-[#e6ebf1] outline-none placeholder:text-[#637180] focus:border-[#8ce2bd]/70"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="mt-1 flex h-10 w-full items-center justify-center rounded-md bg-[#8ce2bd] px-4 text-xs font-bold text-[#122c24] transition hover:bg-[#9de9ca] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loginMutation.isPending ? "Entrando..." : "Entrar no ADM →"}
                </button>
              </form>
            </section>
          </div>
        </div>
      </H2AndroidAdminShell>
    );
  }

  // ─── Tela de Login Normal ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 mb-4">
            <Shield className="w-8 h-8 text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Painel Admin</h1>
          <p className="text-white/50 text-sm mt-1">WALK AJUDA</p>
        </div>

        {/* Aviso de tentativas restantes */}
        {remainingAttempts !== null && remainingAttempts > 0 && (
          <div className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-300">
              <strong>{remainingAttempts} tentativa(s) restante(s)</strong> antes do bloqueio.
            </p>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">
              Usuário
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Walkcontas"
                autoComplete="off"
                name="admin-user"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 focus:bg-white/8 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                name="admin-pwd"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 focus:bg-white/8 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loginMutation.isPending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
