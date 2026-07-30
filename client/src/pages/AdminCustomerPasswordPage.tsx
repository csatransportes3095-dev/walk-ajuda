import { useState } from 'react';
import { ToggleLeft, ToggleRight, KeyRound, Bell, CalendarClock, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Clock, X, Check, Loader2, Search, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export default function AdminCustomerPasswordPage() {
  const [searchPhone, setSearchPhone] = useState('');
  const [searchedPhone, setSearchedPhone] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [manualPassword, setManualPassword] = useState('');
  const [manualDays, setManualDays] = useState(30);
  const [showManualPwd, setShowManualPwd] = useState(false);

  // Modal de liberar senha pendente
  const [pendingModal, setPendingModal] = useState<{ id: number; name: string; phone: string } | null>(null);
  const [pendingDays, setPendingDays] = useState(30);
  const [isApproving, setIsApproving] = useState(false);

  // Modal de definir senha manual
  const [setPasswordModal, setSetPasswordModal] = useState<{ phone: string; name: string } | null>(null);
  const [setPwdValue, setSetPwdValue] = useState('');
  const [setPwdDays, setSetPwdDays] = useState(30);
  const [showSetPwd, setShowSetPwd] = useState(false);
  const [isSetting, setIsSetting] = useState(false);

  // â”€â”€â”€ queries / mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const modeQuery = trpc.customerPassword.getMode.useQuery();
  const setModeMutation = trpc.customerPassword.setMode.useMutation({
    onSuccess: (data) => {
      modeQuery.refetch();
      pendingQuery.refetch();
      toast.success(data.mode === 'auto'
        ? 'âœ… Modo AUTOMÃTICO ativado: cliente cria a prÃ³pria senha (30 dias).'
        : 'âœ… Modo MANUAL ativado: ADM precisa liberar cada senha.');
    },
    onError: (e) => toast.error(e.message || 'Erro ao alterar modo'),
  });

  const pendingQuery = trpc.customerPassword.adminListPending.useQuery(undefined, { refetchInterval: 30000 });

  const approveMutation = trpc.customerPassword.adminApprove.useMutation({
    onSuccess: () => { pendingQuery.refetch(); },
    onError: (e) => toast.error(e.message || 'Erro ao liberar senha'),
  });

  const resetMutation = trpc.customerPassword.adminReset.useMutation({
    onSuccess: () => {
      toast.success('Senha resetada! O cliente poderÃ¡ criar uma nova senha.');
      statusQuery.refetch();
    },
    onError: (e) => toast.error(e.message || 'Erro ao resetar senha'),
  });

  const setPasswordMutation = trpc.customerPassword.adminSetPassword.useMutation({
    onSuccess: () => {
      toast.success('Senha definida com sucesso!');
      setSetPasswordModal(null);
      setSetPwdValue('');
      statusQuery.refetch();
    },
    onError: (e) => toast.error(e.message || 'Erro ao definir senha'),
  });

  const statusQuery = trpc.customerPassword.adminGetStatus.useQuery(
    { phone: searchedPhone },
    { enabled: searchedPhone.length >= 10 }
  );

  const currentMode = modeQuery.data?.mode ?? 'manual';
  const pendingList = pendingQuery.data ?? [];

  // â”€â”€â”€ handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleToggleMode = () => {
    const newMode = currentMode === 'manual' ? 'auto' : 'manual';
    setModeMutation.mutate({ mode: newMode });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchPhone.replace(/\D/g, '');
    if (clean.length < 10) { toast.error('Informe um telefone vÃ¡lido (com DDD).'); return; }
    setIsSearching(true);
    setSearchedPhone(clean);
    setIsSearching(false);
  };

  const buildReleaseWaMsg = (nome: string, telefone: string) => {
    const msg = [
      `ðŸ” *Acesso Liberado â€” H2 COLOMBIANO*`,
      ``,
      `OlÃ¡, *${nome}*! Tudo certo por aqui. âœ…`,
      ``,
      `Sua senha de acesso ao sistema foi liberada com sucesso e jÃ¡ estÃ¡ ativa.`,
      ``,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      `ðŸŒ *Acesse agora:* https://h2colombiano.com/acompanhar`,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      ``,
      `ðŸ“± *Como acessar:*`,
      `1ï¸âƒ£ Abra o link acima`,
      `2ï¸âƒ£ Informe seu telefone`,
      `3ï¸âƒ£ Digite sua senha`,
      `4ï¸âƒ£ Seus dados estarÃ£o disponÃ­veis`,
      ``,
      `âš ï¸ *Importante:*`,
      `â€¢ NÃ£o compartilhe sua senha com ninguÃ©m`,
      `â€¢ Os dados de acesso *nÃ£o sÃ£o enviados por mensagem*`,
      `â€¢ Em caso de dÃºvidas, entre em contato conosco`,
      ``,
      `_Equipe H2 COLOMBIANO_ ðŸš€`,
    ].join('\n');
    return `https://wa.me/55${telefone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
  };

  const handleApprove = async () => {
    if (!pendingModal) return;
    // PRIMEIRO: abrir WhatsApp de forma sÃ­ncrona (antes de qualquer await/setState)
    // Isso Ã© necessÃ¡rio para evitar bloqueio de popup do navegador
    const nome = (pendingModal.name || '').split(' ')[0];
    const telefone = pendingModal.phone.replace(/\D/g, '');
    const waUrl = buildReleaseWaMsg(nome, telefone);
    const waWindow = window.open(waUrl, '_blank');
    setIsApproving(true);
    try {
      await approveMutation.mutateAsync({ passwordId: pendingModal.id, days: pendingDays });
      toast.success(`âœ… Senha de ${pendingModal.name} liberada por ${pendingDays} dias!`);
      setPendingModal(null);
    } catch (e: any) {
      // Se falhou, fechar a janela do WA aberta
      waWindow?.close();
      toast.error(e?.message || 'Erro ao liberar senha');
    } finally {
      setIsApproving(false);
    }
  };

  const handleSetPassword = async () => {
    if (!setPasswordModal) return;
    if (setPwdValue.length < 4) { toast.error('A senha deve ter pelo menos 4 caracteres.'); return; }
    setIsSetting(true);
    try {
      await setPasswordMutation.mutateAsync({ phone: setPasswordModal.phone, password: setPwdValue, days: setPwdDays });
    } finally {
      setIsSetting(false);
    }
  };

  const statusData = statusQuery.data;

  const statusBadge = () => {
    if (!searchedPhone) return null;
    if (statusQuery.isLoading) return <span className="text-slate-400 text-sm">Carregando...</span>;
    if (!statusData?.hasPassword) return (
      <span className="flex items-center gap-1 text-slate-400 text-sm"><ShieldX className="w-4 h-4" /> Sem senha cadastrada</span>
    );
    if (statusData.pending) return (
      <span className="flex items-center gap-1 text-amber-400 text-sm"><ShieldAlert className="w-4 h-4" /> Aguardando liberaÃ§Ã£o do ADM</span>
    );
    if (!statusData.expiresAt || statusData.expiresAt < Date.now()) return (
      <span className="flex items-center gap-1 text-red-400 text-sm"><ShieldX className="w-4 h-4" /> Senha expirada</span>
    );
    const daysLeft = Math.ceil((statusData.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
    return (
      <span className="flex items-center gap-1 text-green-400 text-sm">
        <ShieldCheck className="w-4 h-4" /> Ativa â€” vence em {daysLeft} dia{daysLeft !== 1 ? 's' : ''}
        <span className="text-slate-400 ml-1">({new Date(statusData.expiresAt).toLocaleDateString('pt-BR')})</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <KeyRound className="w-8 h-8 text-purple-400" />
              Senhas do Cadastro
            </h1>
            <p className="text-slate-400 mt-1 text-sm">Gerenciar acesso dos clientes ao acompanhamento de pedido</p>
          </div>

          {/* Toggle modo */}
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all cursor-pointer select-none ${
              currentMode === 'auto'
                ? 'border-green-500/60 bg-green-500/10'
                : 'border-amber-500/60 bg-amber-500/10'
            }`}
            onClick={handleToggleMode}
          >
            {currentMode === 'auto'
              ? <ToggleRight className="w-7 h-7 text-green-400" />
              : <ToggleLeft className="w-7 h-7 text-amber-400" />}
            <div>
              <p className={`text-sm font-bold ${currentMode === 'auto' ? 'text-green-300' : 'text-amber-300'}`}>
                LiberaÃ§Ã£o {currentMode === 'auto' ? 'AUTOMÃTICA' : 'MANUAL'}
              </p>
              <p className="text-xs text-slate-400">
                {currentMode === 'auto'
                  ? 'Cliente cria a prÃ³pria senha (30 dias)'
                  : 'ADM libera manualmente cada cliente'}
              </p>
            </div>
          </div>
        </div>

        {/* Pendentes */}
        {pendingList.length > 0 && (
          <Card className="bg-amber-500/10 border-2 border-amber-500/50 p-5">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-amber-300">
                  {pendingList.length} senha{pendingList.length > 1 ? 's' : ''} aguardando liberaÃ§Ã£o
                </h2>
                <p className="text-xs text-amber-200/70">
                  {pendingList.length > 1 ? 'Clientes criaram' : 'Cliente criou'} senha e aguarda vocÃª definir a validade
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {pendingList.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <div>
                    <p className="text-white font-bold text-sm">{c.name}</p>
                    <p className="text-amber-200/70 text-xs">{c.phone}</p>
                    {c.clientCreatedAt && (
                      <p className="text-amber-200/50 text-xs mt-0.5">
                        Criou em: {new Date(c.clientCreatedAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => { setPendingModal({ id: c.id, name: c.name, phone: c.phone }); setPendingDays(30); }}
                    className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm px-4 py-2 h-auto flex-shrink-0"
                  >
                    <CalendarClock className="w-4 h-4 mr-1.5" />
                    Liberar
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Buscar cliente */}
        <Card className="bg-slate-800/60 border-slate-700 p-6">
          <h2 className="text-lg font-bold text-white mb-1">Gerenciar senha de um cliente</h2>
          <p className="text-slate-400 text-sm mb-4">Busque pelo telefone para ver o status e gerenciar a senha</p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              placeholder="Telefone do cliente (com DDD)"
              className="bg-slate-700 border-slate-600 text-white"
            />
            <Button type="submit" disabled={isSearching} className="bg-purple-600 hover:bg-purple-700 text-white px-4">
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </form>

          {searchedPhone && (
            <div className="mt-4 p-4 bg-slate-700/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-slate-400 text-xs mb-1">Telefone: <span className="text-white">{searchedPhone}</span></p>
                  <div>{statusBadge()}</div>
                  {statusData?.clientCreatedAt && (
                    <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Criada pelo cliente em {new Date(statusData.clientCreatedAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={() => setSetPasswordModal({ phone: searchedPhone, name: searchedPhone })}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <KeyRound className="w-3.5 h-3.5 mr-1" />
                    Definir senha
                  </Button>
                  {statusData?.hasPassword && (
                    <Button
                      onClick={() => { if (confirm(`Resetar a senha de ${searchedPhone}? O cliente precisarÃ¡ criar uma nova senha.`)) resetMutation.mutate({ phone: searchedPhone }); }}
                      size="sm"
                      variant="outline"
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                      disabled={resetMutation.isPending}
                    >
                      {resetMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                      Resetar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>

      </div>

      {/* Modal: liberar senha pendente */}
      {pendingModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setPendingModal(null)}>
          <div className="bg-slate-800 border border-amber-500/40 rounded-xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Liberar senha</h3>
              <button onClick={() => setPendingModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-slate-300 text-sm">
              Definir validade para a senha de <span className="text-amber-300 font-bold">{pendingModal.name}</span>
            </p>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Validade (dias)</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {[7, 15, 30, 60, 90, 180, 365].map(d => (
                  <button key={d} onClick={() => setPendingDays(d)}
                    className={`px-3 py-1 rounded text-sm font-bold transition ${pendingDays === d ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    {d}d
                  </button>
                ))}
              </div>
              <Input
                type="number" min={1} max={3650}
                value={pendingDays}
                onChange={(e) => setPendingDays(Number(e.target.value))}
                className="bg-slate-700 border-slate-600 text-white"
              />
              <p className="text-slate-500 text-xs mt-1">
                Vence em: {new Date(Date.now() + pendingDays * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setPendingModal(null)} variant="outline" className="flex-1 border-slate-600 text-slate-300">Cancelar</Button>
              <Button onClick={handleApprove} disabled={isApproving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold">
                {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> Liberar</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: definir senha manual */}
      {setPasswordModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-purple-500/40 rounded-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Definir senha</h3>
              <button onClick={() => setSetPasswordModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-slate-300 text-sm">
              Definir senha para <span className="text-purple-300 font-bold">{setPasswordModal.phone}</span>
            </p>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Senha</label>
              <div className="relative">
                <Input
                  type={showSetPwd ? 'text' : 'password'}
                  value={setPwdValue}
                  onChange={(e) => setSetPwdValue(e.target.value)}
                  placeholder="MÃ­nimo 4 caracteres"
                  className="bg-slate-700 border-slate-600 text-white pr-10"
                />
                <button type="button" onClick={() => setShowSetPwd(!showSetPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                  {showSetPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">Validade (dias)</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {[7, 15, 30, 60, 90, 180, 365].map(d => (
                  <button key={d} onClick={() => setSetPwdDays(d)}
                    className={`px-3 py-1 rounded text-sm font-bold transition ${setPwdDays === d ? 'bg-purple-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    {d}d
                  </button>
                ))}
              </div>
              <Input
                type="number" min={1} max={3650}
                value={setPwdDays}
                onChange={(e) => setSetPwdDays(Number(e.target.value))}
                className="bg-slate-700 border-slate-600 text-white"
              />
              <p className="text-slate-500 text-xs mt-1">
                Vence em: {new Date(Date.now() + setPwdDays * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setSetPasswordModal(null)} variant="outline" className="flex-1 border-slate-600 text-slate-300">Cancelar</Button>
              <Button onClick={handleSetPassword} disabled={isSetting} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold">
                {isSetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><KeyRound className="w-4 h-4 mr-1" /> Salvar</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
