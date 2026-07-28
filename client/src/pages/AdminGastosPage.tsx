"use client";

import { useState } from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  AlertCircle, Loader2, Copy, Check, Users, Search, RefreshCw,
  Clock, ShieldCheck, ShieldAlert, ShieldX, Bell, CalendarClock, X, BarChart2
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function AdminGastosPage() {
  const [searchPhone, setSearchPhone] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expirationHours, setExpirationHours] = useState(24);
  const [isSearching, setIsSearching] = useState(false);
  const [passwordMode, setPasswordMode] = useState<'auto' | 'manual'>('auto');
  const [manualPassword, setManualPassword] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [listFilter, setListFilter] = useState('');

  // Modal de definir validade para senha pendente
  const [pendingModal, setPendingModal] = useState<{ clientId: number; clientName: string; mode?: 'pending' | 'edit' } | null>(null);
  const [pendingHours, setPendingHours] = useState(24);
  const [isSettingExpiry, setIsSettingExpiry] = useState(false);

  // Modal de confirmar deleção de senha
  const [deleteModal, setDeleteModal] = useState<{ clientId: number; clientName: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const generatePasswordMutation = trpc.spreadsheet.adminGenerateTemporaryPassword.useMutation();
  const setExpiryMutation = trpc.spreadsheet.adminSetExpiry.useMutation();
  const deletePasswordMutation = trpc.spreadsheet.adminDeletePassword.useMutation();
  const renewAccessMutation = trpc.spreadsheet.adminRenewAccess.useMutation();
  const updateClientMutation = trpc.spreadsheet.adminUpdateClient.useMutation();

  // Modal de confirmar renovação de acesso
  const [renewModal, setRenewModal] = useState<{ clientId: number; clientName: string } | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);

  // Modal de editar dados do cliente (nome, telefone, CPF)
  const [editClientModal, setEditClientModal] = useState<{ clientId: number; name: string; phone: string; cpf: string } | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [isSavingClient, setIsSavingClient] = useState(false);

  const clientsQuery = trpc.spreadsheet.adminListClientsWithStatus.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // Toggle global de modo de senha
  const passwordModeQuery = trpc.spreadsheet.getPasswordMode.useQuery();
  const setPasswordModeMutation = trpc.spreadsheet.setPasswordMode.useMutation({
    onSuccess: (data) => {
      passwordModeQuery.refetch();
      setSuccess(data.mode === 'auto'
        ? '✅ Modo AUTO ativado: clientes localizados podem criar a própria senha (30 dias automático).'
        : '✅ Modo MANUAL ativado: ADM precisa liberar a senha para cada cliente.');
    },
    onError: (err) => setError(err.message || 'Erro ao alterar modo'),
  });

  const currentMode = passwordModeQuery.data?.mode ?? 'manual';

  const handleToggleMode = () => {
    const newMode = currentMode === 'manual' ? 'auto' : 'manual';
    setPasswordModeMutation.mutate({ mode: newMode });
  };

  // Clientes com senha pendente de aprovação
  const pendingClients = clientsQuery.data?.filter((c: any) => c.passwordStatus === 'pending') || [];

  const handleSearchCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSelectedCustomer(null);
    setGeneratedPassword('');
    setGeneratedData(null);

    const normalizedPhone = searchPhone.replace(/\D/g, '');
    if (normalizedPhone.length < 10) {
      setError('Telefone deve ter pelo menos 10 dígitos');
      return;
    }

    setIsSearching(true);
    try {
      const result = await generatePasswordMutation.mutateAsync({
        phone: normalizedPhone,
        expirationHours,
        searchOnly: true,
      } as any).catch(() => null);

      if (!result) {
        setError('Cliente não encontrado');
        return;
      }

      setSelectedCustomer({
        phone: normalizedPhone,
        name: result.clientName,
        email: (result as any).email || '',
        alreadyHasAccess: false,
      });
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar cliente');
    } finally {
      setIsSearching(false);
    }
  };

  const handleGeneratePassword = async () => {
    setError('');
    setSuccess('');

    if (!selectedCustomer) {
      setError('Selecione um cliente primeiro');
      return;
    }

    if (passwordMode === 'manual' && !manualPassword.trim()) {
      setError('Digite uma senha para o modo manual');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generatePasswordMutation.mutateAsync({
        phone: selectedCustomer.phone,
        expirationHours,
        manualPassword: passwordMode === 'manual' ? manualPassword : undefined,
      } as any);

      setGeneratedPassword(result.password);
      setGeneratedData(result);
      setSuccess('✅ Senha gerada com sucesso!');
      setManualPassword('');
      clientsQuery.refetch();
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar senha');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Definir / editar validade
  const handleSetExpiry = async () => {
    if (!pendingModal) return;
    setIsSettingExpiry(true);
    try {
      const result = await setExpiryMutation.mutateAsync({
        clientId: pendingModal.clientId,
        expirationHours: pendingHours,
      });
      setPendingModal(null);
      const verb = pendingModal.mode === 'edit' ? 'Vencimento atualizado para' : 'Acesso liberado para';
      setSuccess(`✅ ${verb} ${result.clientName} até ${new Date(result.expiresAt).toLocaleString('pt-BR')}`);
      clientsQuery.refetch();
    } catch (err: any) {
      setError(err.message || 'Erro ao definir validade');
    } finally {
      setIsSettingExpiry(false);
    }
  };

  // Renovar acesso (reseta histórico para cliente criar nova senha)
  const handleRenewAccess = async () => {
    if (!renewModal) return;
    setIsRenewing(true);
    try {
      const result = await renewAccessMutation.mutateAsync({ clientId: renewModal.clientId });
      setRenewModal(null);
      setSuccess(`✅ Acesso renovado para ${result.clientName}. O cliente pode criar uma nova senha agora.`);
      clientsQuery.refetch();
    } catch (err: any) {
      setError(err.message || 'Erro ao renovar acesso');
    } finally {
      setIsRenewing(false);
    }
  };

  // Formatar CPF para exibição: 000.000.000-00
  const formatCpf = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  // Abrir modal de edição de cliente
  const openEditClient = (c: any) => {
    setEditName(c.name || '');
    setEditPhone(c.phone || '');
    setEditCpf(c.cpf ? formatCpf(c.cpf) : '');
    setEditClientModal({ clientId: c.id, name: c.name, phone: c.phone, cpf: c.cpf || '' });
  };

  // Salvar edição do cliente
  const handleSaveClient = async () => {
    if (!editClientModal) return;
    setIsSavingClient(true);
    try {
      await updateClientMutation.mutateAsync({
        clientId: editClientModal.clientId,
        name: editName.trim() || undefined,
        phone: editPhone.replace(/\D/g, '') || undefined,
        cpf: editCpf,
      });
      setEditClientModal(null);
      setSuccess('✅ Dados do cliente atualizados com sucesso.');
      clientsQuery.refetch();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar dados do cliente');
    } finally {
      setIsSavingClient(false);
    }
  };

  // Deletar senha do cliente
  const handleDeletePassword = async () => {
    if (!deleteModal) return;
    setIsDeleting(true);
    try {
      await deletePasswordMutation.mutateAsync({ clientId: deleteModal.clientId });
      setDeleteModal(null);
      setSuccess(`✅ Senha de ${deleteModal.clientName} removida com sucesso.`);
      clientsQuery.refetch();
    } catch (err: any) {
      setError(err.message || 'Erro ao deletar senha');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold text-white">🔐 Admin - Gastos</h1>
            <p className="text-slate-400 mt-2">Gerenciar acesso dos clientes ao Gestor de Gastos</p>
          </div>
          {/* Toggle global de modo de senha */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all cursor-pointer select-none ${
            currentMode === 'auto'
              ? 'border-green-500/60 bg-green-500/10'
              : 'border-amber-500/60 bg-amber-500/10'
          }`} onClick={handleToggleMode}>
            {currentMode === 'auto'
              ? <ToggleRight className="w-7 h-7 text-green-400" />
              : <ToggleLeft className="w-7 h-7 text-amber-400" />}
            <div>
              <p className={`text-sm font-bold ${currentMode === 'auto' ? 'text-green-300' : 'text-amber-300'}`}>
                Liberação {currentMode === 'auto' ? 'AUTOMÁTICA' : 'MANUAL'}
              </p>
              <p className="text-xs text-slate-400">
                {currentMode === 'auto'
                  ? 'Cliente cria a própria senha (30 dias)'
                  : 'ADM libera manualmente cada cliente'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-200">{error}</p>
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-200"><X className="w-4 h-4" /></button>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
            <p className="text-sm text-green-200">{success}</p>
            <button onClick={() => setSuccess('')} className="ml-auto text-green-400 hover:text-green-200"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ===== ALERTA: SENHAS PENDENTES ===== */}
        {pendingClients.length > 0 && (
          <Card className="bg-amber-500/10 border-2 border-amber-500/50 p-5 mb-6 animate-pulse-once">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-amber-300">
                  {pendingClients.length} senha{pendingClients.length > 1 ? 's' : ''} aguardando liberação
                </h2>
                <p className="text-xs text-amber-200/70">
                  {pendingClients.length > 1 ? 'Clientes criaram' : 'Cliente criou'} senha e aguarda você definir a validade
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {pendingClients.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <div>
                    <p className="text-white font-bold text-sm">{c.name}</p>
                    <p className="text-amber-200/70 text-xs">{c.phone}</p>
                    {c.clientCreatedAt && (
                      <p className="text-amber-200/50 text-xs mt-0.5">
                        Criou senha em: {new Date(c.clientCreatedAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => { setPendingModal({ clientId: c.id, clientName: c.name }); setPendingHours(24); }}
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

        {/* ===== BUSCAR CLIENTE / GERAR SENHA MANUAL ===== */}
        <Card className="p-6 mb-6 rounded-2xl" style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #070710 100%)', border: '1.5px solid rgba(139,92,246,0.4)' }}>
          <h2 className="text-xl font-bold text-white mb-1">+ Gerar Senha Manual</h2>
          <p className="text-slate-400 text-sm mb-4">Para clientes que não criaram senha própria</p>
          <form onSubmit={handleSearchCustomer} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300 mb-2">Telefone do Cliente</label>
              <Input
                type="text"
                placeholder="(11) 99999-9999"
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                className="bg-slate-600 border-slate-500 text-white"
              />
            </div>
            <Button type="submit" disabled={isSearching} className="w-full bg-purple-600 hover:bg-purple-700">
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Buscar Cliente
            </Button>
          </form>
        </Card>

        {selectedCustomer && (
          <Card className="p-6 mb-6 rounded-2xl" style={{ background: 'linear-gradient(135deg, #0a1a0a 0%, #051205 100%)', border: '1.5px solid rgba(34,197,94,0.4)' }}>
            <h2 className="text-xl font-bold text-white mb-4">Cliente Encontrado</h2>
            <div className="space-y-3 mb-6">
              <div className="bg-slate-600/50 p-3 rounded">
                <p className="text-slate-400 text-xs">Nome</p>
                <p className="text-white font-bold">{selectedCustomer.name}</p>
              </div>
              <div className="bg-slate-600/50 p-3 rounded">
                <p className="text-slate-400 text-xs">Telefone</p>
                <p className="text-white font-bold">{selectedCustomer.phone}</p>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm text-slate-300 mb-3">Modo de Geração</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPasswordMode('auto')}
                  className={`p-3 rounded border-2 transition ${passwordMode === 'auto' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-slate-500 bg-slate-600/50 text-slate-300 hover:border-slate-400'}`}
                >
                  🤖 Automático
                </button>
                <button
                  onClick={() => setPasswordMode('manual')}
                  className={`p-3 rounded border-2 transition ${passwordMode === 'manual' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-slate-500 bg-slate-600/50 text-slate-300 hover:border-slate-400'}`}
                >
                  ✏️ Manual
                </button>
              </div>
            </div>

            {passwordMode === 'manual' && (
              <div className="mb-5">
                <label className="block text-sm text-slate-300 mb-2">Digite a Senha</label>
                <Input
                  type="text"
                  placeholder="Ex: senha123"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  className="bg-slate-600 border-slate-500 text-white"
                />
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm text-slate-300 mb-2">Validade da Senha</label>
              <select
                value={expirationHours}
                onChange={(e) => setExpirationHours(Number(e.target.value))}
                className="w-full bg-slate-600 border border-slate-500 text-white rounded px-3 py-2"
              >
                <option value={1}>1 hora</option>
                <option value={2}>2 horas</option>
                <option value={4}>4 horas</option>
                <option value={8}>8 horas</option>
                <option value={12}>12 horas</option>
                <option value={24}>24 horas</option>
                <option value={48}>2 dias</option>
                <option value={72}>3 dias</option>
                <option value={168}>1 semana</option>
                <option value={336}>2 semanas</option>
                <option value={720}>30 dias</option>
              </select>
            </div>

            <Button onClick={handleGeneratePassword} disabled={isGenerating} className="w-full bg-green-600 hover:bg-green-700">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              ✅ Gerar Senha
            </Button>
          </Card>
        )}

        {generatedData && (
          <Card className="p-6 mb-6 rounded-2xl" style={{ background: 'linear-gradient(135deg, #052010 0%, #031508 100%)', border: '2px solid rgba(34,197,94,0.6)', boxShadow: '0 0 24px rgba(34,197,94,0.15)' }}>
            <h2 className="text-xl font-bold text-green-400 mb-4">✅ Senha Gerada!</h2>
            <div className="space-y-3">
              <div className="bg-slate-600/50 p-3 rounded">
                <p className="text-slate-400 text-xs">Cliente</p>
                <p className="text-white font-bold">{generatedData.clientName}</p>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 p-3 rounded">
                <p className="text-slate-400 text-xs mb-1">Senha</p>
                <div className="flex items-center gap-2">
                  <p className="text-white font-mono text-lg font-bold">{generatedPassword}</p>
                  <button onClick={handleCopyPassword} className="p-2 hover:bg-slate-600 rounded transition">
                    {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-slate-300" />}
                  </button>
                </div>
              </div>
              <div className="bg-slate-600/50 p-3 rounded">
                <p className="text-slate-400 text-xs">Expira em</p>
                <p className="text-white font-bold">{new Date(generatedData.expiresAt).toLocaleString('pt-BR')}</p>
              </div>
            </div>
            <Button
              onClick={() => { setSelectedCustomer(null); setSearchPhone(''); setGeneratedPassword(''); setGeneratedData(null); }}
              className="w-full mt-5 bg-slate-600 hover:bg-slate-700"
            >
              Gerar Nova Senha
            </Button>
          </Card>
        )}

        {/* ===== LISTA DE TODOS OS CLIENTES ===== */}
        <Card className="p-6 mt-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #070710 100%)', border: '1.5px solid rgba(139,92,246,0.3)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" />
              Clientes do Gestor de Gastos
              {clientsQuery.data && (
                <span className="text-sm font-normal text-slate-400">({clientsQuery.data.length})</span>
              )}
            </h2>
            <button
              onClick={() => clientsQuery.refetch()}
              disabled={clientsQuery.isFetching}
              className="p-2 rounded hover:bg-slate-600 transition text-slate-300"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${clientsQuery.isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="relative mb-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Filtrar por nome ou telefone..."
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value)}
              className="bg-slate-600 border-slate-500 text-white pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            <span className="flex items-center gap-1 text-amber-300"><Bell className="w-3.5 h-3.5" /> Aguardando liberação</span>
            <span className="flex items-center gap-1 text-green-300"><ShieldCheck className="w-3.5 h-3.5" /> Senha ativa</span>
            <span className="flex items-center gap-1 text-red-300"><ShieldAlert className="w-3.5 h-3.5" /> Senha expirada</span>
            <span className="flex items-center gap-1 text-slate-400"><ShieldX className="w-3.5 h-3.5" /> Sem senha</span>
          </div>

          {clientsQuery.isLoading && (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
            </div>
          )}

          {clientsQuery.isError && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-200">Erro ao carregar clientes.</p>
            </div>
          )}

          {clientsQuery.data && clientsQuery.data.length === 0 && (
            <p className="text-slate-400 text-center py-6">Nenhum cliente cadastrado ainda.</p>
          )}

          {clientsQuery.data && clientsQuery.data.length > 0 && (
            <div className="space-y-3">
              {clientsQuery.data
                .filter((c: any) => {
                  const f = listFilter.trim().toLowerCase();
                  if (!f) return true;
                  return (c.name || '').toLowerCase().includes(f) || (c.phone || '').includes(f.replace(/\D/g, ''));
                })
                .map((c: any) => {
                  const isPending = c.passwordStatus === 'pending';
                  const statusConfig: Record<string, { border: string; badge: string; label: string; icon: any; bg: string; shadow: string }> = {
                    pending: { border: '2px solid rgba(245,158,11,0.85)', badge: 'bg-amber-500/30 text-amber-200 border border-amber-500/50', label: 'Aguardando liberação', icon: Bell, bg: 'linear-gradient(135deg, #292100 0%, #181200 100%)', shadow: '0 4px 20px rgba(245,158,11,0.35)' },
                    active: { border: '2px solid rgba(34,197,94,0.8)', badge: 'bg-green-500/30 text-green-200 border border-green-500/50', label: 'Senha ativa', icon: ShieldCheck, bg: 'linear-gradient(135deg, #052e16 0%, #021a0c 100%)', shadow: '0 4px 20px rgba(34,197,94,0.3)' },
                    expired: { border: '2px solid rgba(239,68,68,0.8)', badge: 'bg-red-500/30 text-red-200 border border-red-500/50', label: 'Senha expirada', icon: ShieldAlert, bg: 'linear-gradient(135deg, #450a0a 0%, #1c0606 100%)', shadow: '0 4px 20px rgba(239,68,68,0.3)' },
                    none: { border: '2px solid rgba(100,116,139,0.5)', badge: 'bg-slate-500/30 text-slate-200 border border-slate-500/50', label: 'Sem senha', icon: ShieldX, bg: 'linear-gradient(135deg, #1e1b2e 0%, #0f0d1a 100%)', shadow: '0 4px 16px rgba(100,116,139,0.2)' },
                  };
                  const cfg = statusConfig[c.passwordStatus] || statusConfig.none;
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={c.id} className={`rounded-2xl p-4 transition-all hover:-translate-y-0.5 ${isPending ? 'ring-2 ring-amber-400' : ''}`} style={{ background: cfg.bg, border: cfg.border, boxShadow: cfg.shadow }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          {c.profilePhotoUrl ? (
                            <img src={c.profilePhotoUrl} alt={c.name} className="w-12 h-12 rounded-full object-cover border-2 border-slate-500/50 flex-shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-slate-300 text-lg font-bold">{(c.name || '?')[0].toUpperCase()}</span>
                            </div>
                          )}
                          <div>
                            <p className="text-white font-bold">{c.name}</p>
                            <p className="text-slate-400 text-sm">{c.phone}</p>
                            {c.cpf && (
                              <p className="text-slate-500 text-xs mt-0.5">
                                CPF: <span className="text-slate-400">{formatCpf(c.cpf)}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}>
                          <StatusIcon className="w-3.5 h-3.5" /> {cfg.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3 text-sm">
                        <div className="flex items-center gap-2 text-slate-300">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span>
                            {isPending
                              ? <span className="text-amber-300 font-medium">Sem validade — defina abaixo</span>
                              : c.expiresAt
                                ? <>Vence: <strong className="text-white">{new Date(c.expiresAt).toLocaleString('pt-BR')}</strong></>
                                : <span className="text-slate-500">Sem validade definida</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-300">
                          <Users className="w-4 h-4 text-slate-400" />
                          <span>
                            {c.lastAccess
                              ? <>Último acesso: <strong className="text-white">{new Date(c.lastAccess).toLocaleString('pt-BR')}</strong></>
                              : <span className="text-slate-500">Nunca acessou</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-300 col-span-full sm:col-span-1">
                          <BarChart2 className="w-4 h-4 text-slate-400" />
                          <span>
                            Acessos: <strong className="text-white">{c.totalAccess ?? 0}</strong>
                            <span className="text-slate-400 text-xs ml-1">(últimos 7 dias: {c.accessLast7Days ?? 0})</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {isPending && (
                          <Button
                            onClick={() => { setPendingModal({ clientId: c.id, clientName: c.name, mode: 'pending' }); setPendingHours(24); }}
                            className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs px-3 py-1.5 h-auto"
                          >
                            <CalendarClock className="w-3.5 h-3.5 mr-1" /> Liberar acesso
                          </Button>
                        )}
                        {(c.passwordStatus === 'active' || c.passwordStatus === 'expired') && (
                          <Button
                            onClick={() => { setPendingModal({ clientId: c.id, clientName: c.name, mode: 'edit' }); setPendingHours(720); }}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 h-auto"
                          >
                            <CalendarClock className="w-3.5 h-3.5 mr-1" /> Editar vencimento
                          </Button>
                        )}
                        {/* Botão de renovar acesso: para clientes que já criaram senha antes mas estão sem acesso */}
                        {c.hasEverCreatedPassword && c.passwordStatus === 'none' && (
                          <Button
                            onClick={() => setRenewModal({ clientId: c.id, clientName: c.name })}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 h-auto"
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Renovar acesso
                          </Button>
                        )}
                        {c.passwordStatus !== 'none' && (
                          <Button
                            onClick={() => setDeleteModal({ clientId: c.id, clientName: c.name })}
                            className="bg-red-600/80 hover:bg-red-600 text-white text-xs px-3 py-1.5 h-auto"
                          >
                            <ShieldX className="w-3.5 h-3.5 mr-1" /> Deletar senha
                          </Button>
                        )}
                        <button
                          onClick={() => openEditClient(c)}
                          className="text-sm text-cyan-300 hover:text-cyan-200 font-semibold"
                        >
                          ✏️ Editar dados
                        </button>
                        <button
                          onClick={() => {
                            setSearchPhone(c.phone);
                            setSelectedCustomer({ phone: c.phone, name: c.name, email: '', alreadyHasAccess: c.passwordStatus === 'active' });
                            setGeneratedPassword('');
                            setGeneratedData(null);
                            setError('');
                            setSuccess('');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="text-sm text-purple-300 hover:text-purple-200 font-semibold"
                        >
                          Gerar/renovar senha →
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      </div>

      {/* ===== MODAL: CONFIRMAR DELEÇÃO DE SENHA ===== */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-red-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldX className="w-5 h-5 text-red-400" />
                Deletar Senha
              </h3>
              <button onClick={() => setDeleteModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-700/50 p-3 rounded-lg mb-4">
              <p className="text-slate-400 text-xs">Cliente</p>
              <p className="text-white font-bold">{deleteModal.clientName}</p>
            </div>
            <p className="text-red-300 text-sm mb-5">
              A senha será removida e o cliente não conseguirá mais acessar o Gestor de Gastos até que uma nova senha seja criada.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => setDeleteModal(null)} className="flex-1 bg-slate-600 hover:bg-slate-700 text-white">
                Cancelar
              </Button>
              <Button
                onClick={handleDeletePassword}
                disabled={isDeleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: DEFINIR VALIDADE ===== */}
      {pendingModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-amber-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CalendarClock className={`w-5 h-5 ${pendingModal?.mode === 'edit' ? 'text-blue-400' : 'text-amber-400'}`} />
                {pendingModal?.mode === 'edit' ? 'Editar Vencimento' : 'Liberar Acesso'}
              </h3>
              <button onClick={() => setPendingModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-700/50 p-3 rounded-lg mb-4">
              <p className="text-slate-400 text-xs">Cliente</p>
              <p className="text-white font-bold">{pendingModal.clientName}</p>
            </div>

            <p className="text-slate-300 text-sm mb-3">
              {pendingModal?.mode === 'edit'
                ? 'Defina o novo prazo de vencimento a partir de agora:'
                : 'O cliente criou a senha. Defina por quanto tempo ele poderá acessar:'}
            </p>

            <div className="mb-5">
              <label className="block text-sm text-slate-300 mb-2">Validade do acesso</label>
              <select
                value={pendingHours}
                onChange={(e) => setPendingHours(Number(e.target.value))}
                className="w-full bg-slate-600 border border-slate-500 text-white rounded px-3 py-2"
              >
                <option value={1}>1 hora</option>
                <option value={2}>2 horas</option>
                <option value={4}>4 horas</option>
                <option value={8}>8 horas</option>
                <option value={12}>12 horas</option>
                <option value={24}>24 horas (1 dia)</option>
                <option value={48}>2 dias</option>
                <option value={72}>3 dias</option>
                <option value={168}>1 semana</option>
                <option value={336}>2 semanas</option>
                <option value={720}>30 dias</option>
                <option value={2160}>90 dias</option>
                <option value={4320}>6 meses</option>
                <option value={8760}>1 ano</option>
              </select>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setPendingModal(null)}
                className="flex-1 bg-slate-600 hover:bg-slate-700 text-white"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSetExpiry}
                disabled={isSettingExpiry}
                className={`flex-1 font-bold ${pendingModal?.mode === 'edit' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-black'}`}
              >
                {isSettingExpiry ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {pendingModal?.mode === 'edit' ? 'Salvar' : 'Liberar'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ===== MODAL: RENOVAR ACESSO ===== */}
      {renewModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-emerald-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-400" />
                Renovar Acesso
              </h3>
              <button onClick={() => setRenewModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-700/50 p-3 rounded-lg mb-4">
              <p className="text-slate-400 text-xs">Cliente</p>
              <p className="text-white font-bold">{renewModal.clientName}</p>
            </div>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg mb-4">
              <p className="text-emerald-300 text-sm font-medium mb-1">ℹ️ O que acontece ao renovar:</p>
              <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                <li>O histórico de senha do cliente é resetado</li>
                <li>O cliente poderá criar uma <strong>nova senha</strong> no próximo acesso</li>
                <li>Após criar a senha, você precisará liberar o acesso novamente</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setRenewModal(null)} className="flex-1 bg-slate-600 hover:bg-slate-700 text-white">
                Cancelar
              </Button>
              <Button
                onClick={handleRenewAccess}
                disabled={isRenewing}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {isRenewing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Renovar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: EDITAR DADOS DO CLIENTE ===== */}
      {editClientModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-cyan-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-cyan-400">✏️</span>
                Editar Dados do Cliente
              </h3>
              <button onClick={() => setEditClientModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Nome</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Telefone</label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Ex: 11999999999"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  CPF <span className="text-slate-500 text-xs">(opcional — permite login por CPF)</span>
                </label>
                <Input
                  value={editCpf}
                  onChange={(e) => setEditCpf(formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <Button
                onClick={() => setEditClientModal(null)}
                className="flex-1 bg-slate-600 hover:bg-slate-700 text-white"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveClient}
                disabled={isSavingClient}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold"
              >
                {isSavingClient ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
