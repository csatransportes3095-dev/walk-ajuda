import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { ToggleLeft, ToggleRight, KeyRound, Bell, CalendarClock, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Clock, X, Check, Loader2, Search, Eye, EyeOff, Ban, UserX, Plus, Trash2, Ticket, Package, Globe, Send, TrendingUp, ShoppingBag, Lock, HelpCircle, Layers, MapPin, Upload, Mail, LayoutGrid, Users, Gift, Shield, Phone, FileSearch, MessageCircle } from "lucide-react";
import { TIMEZONE_OPTIONS, DEFAULT_TIMEZONE } from "@/hooks/useTimezone";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

const whiteInputStyle: React.CSSProperties = {
  backgroundColor: '#ffffff', color: '#000000', fontSize: '16px',
  textAlign: 'center' as const, border: '2px solid #333', borderRadius: '8px',
  padding: '10px 12px', width: '100%', outline: 'none', fontWeight: 500,
};

export default function AdminCodes() {
  const search = useSearch();
  const urlPhone = new URLSearchParams(search).get('phone') ?? '';

  // ─── Timezone ─────────────────────────────────────────────────────────────
  const [selectedTz, setSelectedTz] = useState(DEFAULT_TIMEZONE);
  const configQuery = trpc.config.get.useQuery();
  const setConfigMutation = trpc.config.set.useMutation({
    onSuccess: () => toast.success('Fuso horário salvo!'),
    onError: () => toast.error('Erro ao salvar fuso horário'),
  });
  const trpcUtils = trpc.useUtils();

  useEffect(() => {
    if (configQuery.data?.['timezone']) {
      setSelectedTz(configQuery.data['timezone']);
    }
  }, [configQuery.data]);

  const handleSaveTz = () => {
    setConfigMutation.mutate({ key: 'timezone', value: selectedTz }, {
      onSuccess: () => trpcUtils.config.get.invalidate(),
    });
  };

  // ─── Blocklist ────────────────────────────────────────────────────────────
  const [blockType, setBlockType] = useState<'name' | 'phone' | 'both'>('phone');
  const [blockName, setBlockName] = useState('');
  const [blockPhone, setBlockPhone] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [isAddingBlock, setIsAddingBlock] = useState(false);

  const blocklistQuery = trpc.blocklist.list.useQuery();
  const addBlockMutation = trpc.blocklist.add.useMutation({
    onSuccess: () => {
      toast.success('Bloqueio adicionado!');
      setBlockName(''); setBlockPhone(''); setBlockReason(''); setBlockType('phone'); setIsAddingBlock(false);
      blocklistQuery.refetch();
    },
    onError: (e) => toast.error(e.message || 'Erro ao adicionar bloqueio'),
  });
  const removeBlockMutation = trpc.blocklist.remove.useMutation({
    onSuccess: () => { toast.success('Bloqueio removido!'); blocklistQuery.refetch(); },
    onError: () => toast.error('Erro ao remover bloqueio'),
  });

  // ─── Customer Password ────────────────────────────────────────────────────
  const [searchPhone, setSearchPhone] = useState(urlPhone);
  const [searchedPhone, setSearchedPhone] = useState(urlPhone);
  const [isSearching, setIsSearching] = useState(false);

  // Modal de foto expandida
  const [expandedPhoto, setExpandedPhoto] = useState<{ url: string; name: string } | null>(null);

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

  const modeQuery = trpc.customerPassword.getMode.useQuery();
  const setModeMutation = trpc.customerPassword.setMode.useMutation({
    onSuccess: (data) => {
      modeQuery.refetch();
      pendingQuery.refetch();
      toast.success(data.mode === 'auto'
        ? '✅ Modo AUTOMÁTICO ativado: cliente cria a própria senha (30 dias).'
        : '✅ Modo MANUAL ativado: ADM precisa liberar cada senha.');
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
      toast.success('Senha resetada! O cliente poderá criar uma nova senha.');
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

  const handleToggleMode = () => {
    const newMode = currentMode === 'manual' ? 'auto' : 'manual';
    setModeMutation.mutate({ mode: newMode });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchPhone.replace(/\D/g, '');
    if (clean.length < 10) { toast.error('Informe um telefone válido (com DDD).'); return; }
    setIsSearching(true);
    setSearchedPhone(clean);
    setIsSearching(false);
  };

  const handleApprove = async () => {
    if (!pendingModal) return;
    setIsApproving(true);
    try {
      await approveMutation.mutateAsync({ passwordId: pendingModal.id, days: pendingDays });
      toast.success(`Senha de ${pendingModal.name} liberada por ${pendingDays} dias!`);
      setPendingModal(null);
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
      <span className="flex items-center gap-1 text-amber-400 text-sm"><ShieldAlert className="w-4 h-4" /> Aguardando liberação do ADM</span>
    );
    if (!statusData.expiresAt || statusData.expiresAt < Date.now()) return (
      <span className="flex items-center gap-1 text-red-400 text-sm"><ShieldX className="w-4 h-4" /> Senha expirada</span>
    );
    const daysLeft = Math.ceil((statusData.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
    return (
      <span className="flex items-center gap-1 text-green-400 text-sm">
        <ShieldCheck className="w-4 h-4" /> Ativa — vence em {daysLeft} dia{daysLeft !== 1 ? 's' : ''}
        <span className="text-slate-400 ml-1">({new Date(statusData.expiresAt).toLocaleDateString('pt-BR')})</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      {/* Header */}
      <AdminHeader title="Painel Admin" icon={<KeyRound className="w-5 h-5" />} backTo="/" />

      <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">

        {/* Navigation Links — ordem alfabética */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {/* A */}
          <a href="/admin/schedule" className="bg-fuchsia-600/20 border border-fuchsia-500/30 rounded-xl p-3 text-center hover:bg-fuchsia-600/30 transition-all">
            <CalendarClock className="w-5 h-5 text-fuchsia-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Agendamentos</span>
          </a>
          {/* B */}
          <a href="/admin/banners" className="bg-teal-600/20 border border-teal-500/30 rounded-xl p-3 text-center hover:bg-teal-600/30 transition-all">
            <Bell className="w-5 h-5 text-teal-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Banners</span>
          </a>
          <a href="/admin/ip-block" className="bg-red-600/20 border border-red-500/30 rounded-xl p-3 text-center hover:bg-red-600/30 transition-all">
            <Shield className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Bloquear IP</span>
          </a>
          <a href="/admin/referrer-bypass" className="bg-indigo-600/20 border border-indigo-500/30 rounded-xl p-3 text-center hover:bg-indigo-600/30 transition-all">
            <KeyRound className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Bypass Indicador</span>
          </a>
          {/* C */}
          <a href="/admin/products" className="bg-blue-600/20 border border-blue-500/30 rounded-xl p-3 text-center hover:bg-blue-600/30 transition-all">
            <Package className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Cards</span>
          </a>
          <a href="/admin/feature-cards" className="bg-indigo-600/20 border border-indigo-500/30 rounded-xl p-3 text-center hover:bg-indigo-600/30 transition-all">
            <Layers className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Cards Início</span>
          </a>
          <a href="/admin/customers" className="bg-cyan-600/20 border border-cyan-500/30 rounded-xl p-3 text-center hover:bg-cyan-600/30 transition-all">
            <Users className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Clientes</span>
          </a>
          <a href="/admin/commissions" className="bg-emerald-600/20 border border-emerald-500/30 rounded-xl p-3 text-center hover:bg-emerald-600/30 transition-all">
            <TrendingUp className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Comissões</span>
          </a>
          <a href="/admin/settings" className="bg-orange-600/20 border border-orange-500/30 rounded-xl p-3 text-center hover:bg-orange-600/30 transition-all">
            <Globe className="w-5 h-5 text-orange-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Configurações</span>
          </a>
          <a href="/admin/cep" className="bg-emerald-600/20 border border-emerald-500/30 rounded-xl p-3 text-center hover:bg-emerald-600/30 transition-all">
            <MapPin className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Consulta CEP</span>
          </a>
          <a href="/admin/consultas" className="bg-orange-600/20 border border-orange-500/30 rounded-xl p-3 text-center hover:bg-orange-600/30 transition-all">
            <FileSearch className="w-5 h-5 text-orange-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Consultas</span>
          </a>
          <a href="/admin/coupons" className="bg-green-600/20 border border-green-500/30 rounded-xl p-3 text-center hover:bg-green-600/30 transition-all">
            <Ticket className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Cupons</span>
          </a>
          {/* E */}
          <a href="/admin/email" className="bg-blue-600/20 border border-blue-500/30 rounded-xl p-3 text-center hover:bg-blue-600/30 transition-all">
            <Mail className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Emails</span>
          </a>
          <a href="/admin/loans" className="bg-violet-600/20 border border-violet-500/30 rounded-xl p-3 text-center hover:bg-violet-600/30 transition-all">
            <span className="text-xl block mb-1">💳</span>
            <span className="text-xs font-bold text-white">Empréstimos</span>
          </a>
          <a href="/admin/broadcast" className="bg-blue-600/20 border border-blue-500/30 rounded-xl p-3 text-center hover:bg-blue-600/30 transition-all">
            <Send className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Envio em Massa</span>
          </a>
          {/* F */}
          <a href="/admin/faq" className="bg-violet-600/20 border border-violet-500/30 rounded-xl p-3 text-center hover:bg-violet-600/30 transition-all">
            <HelpCircle className="w-5 h-5 text-violet-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">FAQ/Ajuda</span>
          </a>
          <a href="/admin/financeiro" className="bg-green-600/20 border border-green-500/30 rounded-xl p-3 text-center hover:bg-green-600/30 transition-all">
            <TrendingUp className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Financeiro</span>
          </a>
          <a href="/admin/access-filters" className="bg-cyan-600/20 border border-cyan-500/30 rounded-xl p-3 text-center hover:bg-cyan-600/30 transition-all">
            <Users className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Filtros Acesso</span>
          </a>
          <a href="/admin/flow-config" className="bg-sky-600/20 border border-sky-500/30 rounded-xl p-3 text-center hover:bg-sky-600/30 transition-all">
            <Layers className="w-5 h-5 text-sky-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Fluxo</span>
          </a>
          <a href="/admin/protected-photo" className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-3 text-center hover:bg-purple-900/50 transition-all">
            <Lock className="w-5 h-5 text-purple-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Foto Prot.</span>
          </a>
          {/* G */}
          <a href="/admin/gastos" className="bg-purple-600/20 border border-purple-500/30 rounded-xl p-3 text-center hover:bg-purple-600/30 transition-all">
            <TrendingUp className="w-5 h-5 text-purple-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Gastos</span>
          </a>
          <a href="/admin/telefone" className="bg-green-600/20 border border-green-500/30 rounded-xl p-3 text-center hover:bg-green-600/30 transition-all">
            <Phone className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Gerar Tel.</span>
          </a>
          {/* H */}
          <a href="/admin/hub-central" className="bg-sky-600/20 border border-sky-500/30 rounded-xl p-3 text-center hover:bg-sky-600/30 transition-all">
            <LayoutGrid className="w-5 h-5 text-sky-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Hub Central</span>
          </a>
          {/* P */}
          <a href="/admin/orders" className="bg-pink-600/20 border border-pink-500/30 rounded-xl p-3 text-center hover:bg-pink-600/30 transition-all">
            <Package className="w-5 h-5 text-pink-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Pedidos</span>
          </a>
          <a href="/admin/pre-cadastros" className="bg-purple-600/20 border border-purple-500/30 rounded-xl p-3 text-center hover:bg-purple-600/30 transition-all">
            <span className="text-xl block mb-1">📋</span>
            <span className="text-xs font-bold text-white">Pré-Cadastros</span>
          </a>
          <a href="/admin/propagandas" className="bg-cyan-600/20 border border-cyan-500/30 rounded-xl p-3 text-center hover:bg-cyan-600/30 transition-all">
            <Bell className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Propagandas</span>
          </a>
          {/* R */}
          <a href="/admin/resellers" className="bg-amber-600/20 border border-amber-500/30 rounded-xl p-3 text-center hover:bg-amber-600/30 transition-all">
            <ShoppingBag className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Revendedores</span>
          </a>
          {/* S */}
          <a href="/admin/codes" className="bg-purple-600/20 border border-purple-500/40 rounded-xl p-3 text-center hover:bg-purple-600/30 transition-all">
            <KeyRound className="w-5 h-5 text-purple-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Senhas Cadastro</span>
          </a>
          <a href="/admin/raffles" className="bg-yellow-600/20 border border-yellow-500/30 rounded-xl p-3 text-center hover:bg-yellow-600/30 transition-all">
            <Gift className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Sorteios</span>
          </a>
          <a href="/admin/status-types" className="bg-indigo-600/20 border border-indigo-500/30 rounded-xl p-3 text-center hover:bg-indigo-600/30 transition-all">
            <Shield className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Status</span>
          </a>
          {/* U */}
          <a href="/admin/media" className="bg-violet-600/20 border border-violet-500/30 rounded-xl p-3 text-center hover:bg-violet-600/30 transition-all">
            <Upload className="w-5 h-5 text-violet-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Upload Mídia</span>
          </a>
          {/* WA */}
          <a href="/admin/whatsapp-templates" className="bg-green-600/20 border border-green-500/30 rounded-xl p-3 text-center hover:bg-green-600/30 transition-all">
            <MessageCircle className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Msgs WhatsApp</span>
          </a>
          {/* V */}
          <a href="/admin/vpn" className="bg-rose-600/20 border border-rose-500/30 rounded-xl p-3 text-center hover:bg-rose-600/30 transition-all">
            <ShieldX className="w-5 h-5 text-rose-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">VPN</span>
          </a>
        </div>

        {/* ─── Senhas do Cadastro ─────────────────────────────────────────────── */}
        <div className="bg-black/40 backdrop-blur-md border border-purple-500/30 rounded-2xl p-4 md:p-6 space-y-6">

          {/* Header + Toggle */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <KeyRound className="w-6 h-6 text-purple-400" />
                Senhas do Cadastro
              </h2>
              <p className="text-white/50 mt-0.5 text-sm">Gerenciar acesso dos clientes ao acompanhamento de pedido</p>
            </div>

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
                  Liberação {currentMode === 'auto' ? 'AUTOMÁTICA' : 'MANUAL'}
                </p>
                <p className="text-xs text-white/40">
                  {currentMode === 'auto'
                    ? 'Cliente cria a própria senha (30 dias)'
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
                  <h3 className="text-lg font-bold text-amber-300">
                    {pendingList.length} senha{pendingList.length > 1 ? 's' : ''} aguardando liberação
                  </h3>
                  <p className="text-xs text-amber-200/70">
                    {pendingList.length > 1 ? 'Clientes criaram' : 'Cliente criou'} senha e aguarda você definir a validade
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {pendingList.map((c: any) => (
                  <div key={c.id} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      {/* Foto do cliente - clique para expandir */}
                      <div className="flex-shrink-0">
                        {c.profilePhotoUrl ? (
                          <button
                            onClick={() => setExpandedPhoto({ url: c.profilePhotoUrl, name: c.name })}
                            className="block relative group focus:outline-none"
                            title="Expandir foto"
                          >
                            <img
                              src={c.profilePhotoUrl}
                              alt={c.name}
                              className="w-12 h-12 rounded-full object-cover border-2 border-amber-400/60 group-hover:border-amber-300 transition-all group-hover:scale-105"
                            />
                            <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                            </span>
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-amber-500/30 border-2 border-amber-400/60 flex items-center justify-center text-amber-300 font-bold text-lg">
                            {(c.name || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm truncate">{c.name}</p>
                        <p className="text-amber-200/80 text-sm font-mono">{c.phone}</p>
                        {c.clientCreatedAt && (
                          <p className="text-amber-200/50 text-xs mt-0.5">
                            Criou em: {new Date(c.clientCreatedAt).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`https://wa.me/55${c.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-3 py-2.5 rounded-lg transition-colors"
                        title={`WhatsApp: ${c.phone}`}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        WhatsApp
                      </a>
                      <button
                        onClick={() => { setPendingModal({ id: c.id, name: c.name, phone: c.phone }); setPendingDays(30); }}
                        className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm px-3 py-2.5 rounded-lg transition-colors"
                      >
                        <CalendarClock className="w-4 h-4 flex-shrink-0" />
                        Liberar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Buscar cliente */}
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-bold text-white mb-1">Gerenciar senha de um cliente</h3>
              <p className="text-white/40 text-sm mb-3">Busque pelo telefone para ver o status e gerenciar a senha</p>
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder="Telefone do cliente (com DDD)"
                  className="bg-white/10 text-white border-white/20 placeholder:text-white/40 focus:border-purple-500"
                  style={{ fontSize: '16px' }}
                />
                <Button type="submit" disabled={isSearching} className="bg-purple-600 hover:bg-purple-700 text-white px-4 flex-shrink-0">
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </form>
            </div>

            {searchedPhone && (
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-white/40 text-xs mb-1">Telefone: <span className="text-white">{searchedPhone}</span></p>
                    <div>{statusBadge()}</div>
                    {statusData?.clientCreatedAt && (
                      <p className="text-white/30 text-xs mt-1 flex items-center gap-1">
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
                        onClick={() => { if (confirm(`Resetar a senha de ${searchedPhone}? O cliente precisará criar uma nova senha.`)) resetMutation.mutate({ phone: searchedPhone }); }}
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
          </div>
        </div>

        {/* ─── Bloqueio de Cadastro ───────────────────────────────────────────── */}
        <div className="bg-black/20 border border-red-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-400" />
              <h3 className="text-white font-semibold text-base">Bloqueio de Cadastro</h3>
              {blocklistQuery.data && blocklistQuery.data.length > 0 && (
                <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">{blocklistQuery.data.length}</span>
              )}
            </div>
            <button onClick={() => setIsAddingBlock(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-semibold transition-colors">
              <Plus className="w-3 h-3" /> Adicionar Bloqueio
            </button>
          </div>

          {isAddingBlock && (
            <div className="bg-black/30 border border-red-500/20 rounded-xl p-4 space-y-3">
              <p className="text-white/60 text-xs">Bloqueie um cadastro por nome, telefone ou ambos. O cliente não conseguirá se cadastrar.</p>
              <div className="flex gap-2">
                {(['phone', 'name', 'both'] as const).map(t => (
                  <button key={t} onClick={() => setBlockType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      blockType === t ? 'bg-red-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}>
                    {t === 'phone' ? '📱 Telefone' : t === 'name' ? '👤 Nome' : '🔒 Ambos'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {(blockType === 'phone' || blockType === 'both') && (
                  <input style={whiteInputStyle} placeholder="Telefone (somente números)" value={blockPhone}
                    onChange={e => setBlockPhone(e.target.value.replace(/\D/g, ''))}
                    maxLength={11} inputMode="numeric" />
                )}
                {(blockType === 'name' || blockType === 'both') && (
                  <input style={whiteInputStyle} placeholder="Nome completo (exato)" value={blockName}
                    onChange={e => setBlockName(e.target.value)} />
                )}
                <input style={whiteInputStyle} placeholder="Motivo (opcional)" value={blockReason}
                  onChange={e => setBlockReason(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => addBlockMutation.mutate({ type: blockType, name: blockName || undefined, phone: blockPhone || undefined, reason: blockReason || undefined })}
                  disabled={addBlockMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs flex-1">
                  <Ban className="w-3 h-3 mr-1" /> Confirmar Bloqueio
                </Button>
                <Button onClick={() => setIsAddingBlock(false)} variant="outline" className="text-xs">
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {blocklistQuery.isLoading ? (
            <p className="text-white/40 text-sm text-center py-2">Carregando...</p>
          ) : !blocklistQuery.data || blocklistQuery.data.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-3">Nenhum cadastro bloqueado.</p>
          ) : (
            <div className="space-y-2">
              {blocklistQuery.data.map(entry => (
                <div key={entry.id} className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserX className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold uppercase">
                          {entry.type === 'phone' ? 'Tel' : entry.type === 'name' ? 'Nome' : 'Ambos'}
                        </span>
                        {entry.phone && <span className="text-white font-mono text-sm">{entry.phone}</span>}
                        {entry.name && <span className="text-white/80 text-sm">{entry.name}</span>}
                      </div>
                      {entry.reason && <p className="text-white/40 text-xs mt-0.5 truncate">{entry.reason}</p>}
                    </div>
                  </div>
                  <button onClick={() => { if (confirm('Remover este bloqueio?')) removeBlockMutation.mutate({ id: entry.id }); }}
                    className="ml-2 flex-shrink-0 px-2.5 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-semibold transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Fuso Horário ───────────────────────────────────────────────────── */}
        <div className="border-2 border-blue-500/50 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-blue-500/15">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-blue-300 text-sm">Fuso Horário do Sistema</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-white/60">Selecione o fuso horário para exibição de datas e horários em todo o painel.</p>
            <div className="flex gap-2">
              <select
                value={selectedTz}
                onChange={e => setSelectedTz(e.target.value)}
                style={{ ...whiteInputStyle, textAlign: 'left' }}
              >
                {TIMEZONE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={handleSaveTz}
                disabled={setConfigMutation.isPending}
                className="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {setConfigMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
            <div className="text-xs text-white/50">
              Horário atual: <span className="text-white/80 font-mono">
                {new Date().toLocaleString('pt-BR', { timeZone: selectedTz, hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* ─── Modal: liberar senha pendente ──────────────────────────────────── */}
      {pendingModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] border border-amber-500/40 rounded-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Liberar senha</h3>
              <button onClick={() => setPendingModal(null)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-white/70 text-sm">
              Definir validade para a senha de <span className="text-amber-300 font-bold">{pendingModal.name}</span>
            </p>
            <div>
              <label className="text-white/40 text-xs block mb-1">Validade (dias)</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {[7, 15, 30, 60, 90, 180, 365].map(d => (
                  <button key={d} onClick={() => setPendingDays(d)}
                    className={`px-3 py-1 rounded text-sm font-bold transition ${pendingDays === d ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                    {d}d
                  </button>
                ))}
              </div>
              <input
                type="number" min={1} max={3650}
                value={pendingDays}
                onChange={(e) => setPendingDays(Number(e.target.value))}
                style={whiteInputStyle}
              />
              <p className="text-white/30 text-xs mt-1">
                Vence em: {new Date(Date.now() + pendingDays * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setPendingModal(null)} variant="outline" className="flex-1 border-white/20 text-white/60">Cancelar</Button>
              <Button onClick={handleApprove} disabled={isApproving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold">
                {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> Liberar</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: definir senha manual ────────────────────────────────────── */}
      {setPasswordModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] border border-purple-500/40 rounded-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Definir senha</h3>
              <button onClick={() => { setSetPasswordModal(null); setSetPwdValue(''); }} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-white/70 text-sm">
              Definir senha para <span className="text-purple-300 font-bold">{setPasswordModal.phone}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-white/40 text-xs block mb-1">Nova senha (mín. 4 caracteres)</label>
                <div className="relative">
                  <input
                    type={showSetPwd ? 'text' : 'password'}
                    value={setPwdValue}
                    onChange={(e) => setSetPwdValue(e.target.value)}
                    placeholder="Digite a senha"
                    style={{ ...whiteInputStyle, paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showSetPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-white/40 text-xs block mb-1">Validade (dias)</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {[7, 15, 30, 60, 90, 180, 365].map(d => (
                    <button key={d} onClick={() => setSetPwdDays(d)}
                      className={`px-3 py-1 rounded text-sm font-bold transition ${setPwdDays === d ? 'bg-purple-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
                <input
                  type="number" min={1} max={3650}
                  value={setPwdDays}
                  onChange={(e) => setSetPwdDays(Number(e.target.value))}
                  style={whiteInputStyle}
                />
                <p className="text-white/30 text-xs mt-1">
                  Vence em: {new Date(Date.now() + setPwdDays * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => { setSetPasswordModal(null); setSetPwdValue(''); }} variant="outline" className="flex-1 border-white/20 text-white/60">Cancelar</Button>
              <Button onClick={handleSetPassword} disabled={isSetting || setPwdValue.length < 4} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold">
                {isSetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> Salvar</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de foto expandida */}
      {expandedPhoto && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setExpandedPhoto(null)}
        >
          <div className="relative max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setExpandedPhoto(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
            >
              <X className="w-7 h-7" />
            </button>
            <img
              src={expandedPhoto.url}
              alt={expandedPhoto.name}
              className="w-full rounded-2xl object-cover shadow-2xl border-2 border-amber-400/40"
            />
            <p className="text-center text-white font-bold mt-3 text-base">{expandedPhoto.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}
