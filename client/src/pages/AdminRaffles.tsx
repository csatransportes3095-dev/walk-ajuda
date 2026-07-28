import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Gift, Plus, Trash2, Play, Eye, EyeOff, Edit2, Trophy, Users, Shield, Key, Ticket, Package, Globe, Lock, ExternalLink, Save } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";

type Raffle = {
  id: number;
  title: string;
  description: string | null;
  status: "open" | "closed" | "drawn";
  winnerNumber: number | null;
  winnerName: string | null;
  winnerPhone: string | null;
  drawnAt: Date | null;
  createdAt: Date;
  maxNumbersPerPerson: number | null;
};

type RaffleEntry = {
  id: number;
  raffleId: number;
  number: number;
  customerName: string;
  customerPhone: string;
  paymentStatus: 'pending' | 'paid';
  createdAt: Date;
};

export default function AdminRaffles() {
  const utils = trpc.useUtils();
  const { data: raffles, isLoading } = trpc.raffles.list.useQuery(undefined, {
  });
  const createMutation = trpc.raffles.create.useMutation({ onSuccess: () => utils.raffles.list.invalidate() });
  const updateMutation = trpc.raffles.update.useMutation({ onSuccess: () => { utils.raffles.list.invalidate(); utils.raffles.getById.invalidate(); } });
  const deleteMutation = trpc.raffles.delete.useMutation({ onSuccess: () => utils.raffles.list.invalidate() });
  const drawMutation = trpc.raffles.draw.useMutation({ onSuccess: () => { utils.raffles.list.invalidate(); utils.raffles.getById.invalidate(); } });
  const updateEntryPaymentMutation = trpc.raffles.updateEntryPayment.useMutation({
    onSuccess: () => { utils.raffles.getById.invalidate(); toast.success('Status atualizado!'); },
    onError: () => toast.error('Erro ao atualizar status'),
  });
  const removeEntryMutation = trpc.raffles.removeEntry.useMutation({
    onSuccess: () => {
      utils.raffles.getById.invalidate();
      utils.raffles.list.invalidate();
      toast.success('Número liberado com sucesso!');
      setConfirmRemoveEntry(null);
    },
    onError: () => toast.error('Erro ao liberar número'),
  });

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMaxNumbers, setNewMaxNumbers] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMaxNumbers, setEditMaxNumbers] = useState(1);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [confirmRemoveEntry, setConfirmRemoveEntry] = useState<{ entryId: number; raffleId: number; number: number; name: string } | null>(null);

  // Configuração de senha do sorteio
  const { data: raffleConfig, refetch: refetchRaffleConfig } = trpc.raffleAccess.getConfig.useQuery();
  const saveRaffleConfigMutation = trpc.raffleAccess.saveConfig.useMutation({
    onSuccess: () => { toast.success('Configurações salvas!'); refetchRaffleConfig(); },
    onError: () => toast.error('Erro ao salvar configurações'),
  });
  const [rafflePassword, setRafflePassword] = useState('');
  const [rafflePasswordEnabled, setRafflePasswordEnabled] = useState('0');
  const [raffleTitle, setRaffleTitle] = useState('');
  const [raffleSubtitle, setRaffleSubtitle] = useState('');
  const [showRafflePassword, setShowRafflePassword] = useState(false);
  useEffect(() => {
    if (raffleConfig) {
      setRafflePassword(raffleConfig.password || '');
      setRafflePasswordEnabled(raffleConfig.enabled || '0');
      setRaffleTitle(raffleConfig.title || 'SORTEIO');
      setRaffleSubtitle(raffleConfig.subtitle || 'Participe do nosso sorteio exclusivo!');
    }
  }, [raffleConfig]);

  const { data: viewingRaffle } = trpc.raffles.getById.useQuery(
    { id: viewingId! },
    { enabled: viewingId !== null }
  );

  // Auth checks
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-white/60">Carregando...</div></div>;
  }
  const handleCreate = async () => {
    if (!newTitle.trim()) { toast.error("Informe o título do sorteio"); return; }
    await createMutation.mutateAsync({ title: newTitle.trim(), description: newDescription.trim() || undefined, maxNumbersPerPerson: newMaxNumbers });
    setNewTitle("");
    setNewDescription("");
    setNewMaxNumbers(1);
    toast.success("Sorteio criado!");
  };

  const handleUpdate = async (id: number) => {
    await updateMutation.mutateAsync({ id, title: editTitle.trim() || undefined, description: editDescription.trim() || undefined, maxNumbersPerPerson: editMaxNumbers });
    setEditingId(null);
    toast.success("Sorteio atualizado!");
  };

  const handleToggleStatus = async (raffle: Raffle) => {
    const newStatus = raffle.status === "open" ? "closed" : "open";
    await updateMutation.mutateAsync({ id: raffle.id, status: newStatus });
    toast.success(newStatus === "open" ? "Sorteio ativado!" : "Sorteio desativado!");
  };

  const handleDraw = async (id: number) => {
    if (!confirm("Tem certeza que deseja realizar o sorteio? Esta ação não pode ser desfeita.")) return;
    const res = await drawMutation.mutateAsync({ id });
    if (res.success && res.winner) {
      toast.success(`Sorteio realizado! Ganhador: ${res.winner.name} - Número ${res.winner.number}`);
    } else {
      toast.error(res.error || "Erro ao realizar sorteio");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir este sorteio e todos os números escolhidos?")) return;
    await deleteMutation.mutateAsync({ id });
    toast.success("Sorteio excluído!");
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 11) return `(${phone.slice(0,2)}) ${phone.slice(2,7)}-${phone.slice(7)}`;
    return phone;
  };

  return (
    <>
    <div className="min-h-screen bg-background">
      <AdminHeader title="Sorteios" icon={<Gift className="w-5 h-5 text-yellow-400" />} />

      <div className="container py-6 px-4 space-y-6">
        {/* Navigation Links */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <a href="/admin/codes" className="bg-purple-600/20 border border-purple-500/40 rounded-xl p-3 text-center hover:bg-purple-600/30 transition-all">
            <Key className="w-5 h-5 text-purple-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Senhas Cadastro</span>
          </a>
          <a href="/admin/coupons" className="bg-green-600/20 border border-green-500/30 rounded-xl p-3 text-center hover:bg-green-600/30 transition-all">
            <Ticket className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Cupons</span>
          </a>
          <a href="/admin/products" className="bg-blue-600/20 border border-blue-500/30 rounded-xl p-3 text-center hover:bg-blue-600/30 transition-all">
            <Package className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Cards</span>
          </a>
          <a href="/admin/customers" className="bg-cyan-600/20 border border-cyan-500/30 rounded-xl p-3 text-center hover:bg-cyan-600/30 transition-all">
            <Users className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Clientes</span>
          </a>
          <a href="/admin/raffles" className="bg-yellow-600/20 border border-yellow-500/30 rounded-xl p-3 text-center hover:bg-yellow-600/30 transition-all ring-2 ring-yellow-500/50">
            <Gift className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Sorteios</span>
          </a>
          <a href="/admin/settings" className="bg-orange-600/20 border border-orange-500/30 rounded-xl p-3 text-center hover:bg-orange-600/30 transition-all">
            <Globe className="w-5 h-5 text-orange-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Configurações</span>
          </a>
        </div>

        {/* Configuração de Senha do Sorteio */}
        <div className="bg-black/40 backdrop-blur-md border border-yellow-500/30 rounded-2xl p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-yellow-400" /> Acesso à Página de Sorteio
            </h3>
            <a href="/sorteio" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> Ver página
            </a>
          </div>
          <div className="space-y-4">

            {/* Seletor de modo de acesso */}
            <div>
              <label className="text-white/70 text-sm mb-2 block font-semibold">Modo de Acesso</label>
              <div className="grid grid-cols-2 gap-3">
                {/* Acesso Livre */}
                <button
                  type="button"
                  onClick={() => setRafflePasswordEnabled('0')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    rafflePasswordEnabled === '0'
                      ? 'bg-green-500/20 border-green-500 text-green-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <Globe className="w-6 h-6" />
                  <div className="text-center">
                    <p className="font-bold text-sm">Acesso Livre</p>
                    <p className="text-xs opacity-70">Link direto, sem senha</p>
                  </div>
                  {rafflePasswordEnabled === '0' && (
                    <span className="text-xs font-bold bg-green-500/30 px-2 py-0.5 rounded-full">ATIVO</span>
                  )}
                </button>

                {/* Com Senha */}
                <button
                  type="button"
                  onClick={() => setRafflePasswordEnabled('1')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    rafflePasswordEnabled === '1'
                      ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <Lock className="w-6 h-6" />
                  <div className="text-center">
                    <p className="font-bold text-sm">Com Senha</p>
                    <p className="text-xs opacity-70">Exige senha para entrar</p>
                  </div>
                  {rafflePasswordEnabled === '1' && (
                    <span className="text-xs font-bold bg-yellow-500/30 px-2 py-0.5 rounded-full">ATIVO</span>
                  )}
                </button>
              </div>

              {/* Status atual */}
              <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                rafflePasswordEnabled === '0'
                  ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                  : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300'
              }`}>
                {rafflePasswordEnabled === '0' ? (
                  <><Globe className="w-3.5 h-3.5" /> Qualquer pessoa com o link <span className="font-mono">/sorteio</span> entra direto, sem precisar de senha.</>
                ) : (
                  <><Lock className="w-3.5 h-3.5" /> Clientes precisam digitar a senha abaixo para acessar o sorteio.</>
                )}
              </div>
            </div>

            {/* Senha (só aparece quando modo = com senha) */}
            {rafflePasswordEnabled === '1' && (
            <div>
              <label className="text-white/70 text-sm mb-1 block">Senha de acesso</label>
              <div className="relative">
                <input
                  type={showRafflePassword ? 'text' : 'password'}
                  value={rafflePassword}
                  onChange={(e) => setRafflePassword(e.target.value)}
                  placeholder="Digite a senha exclusiva do sorteio"
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowRafflePassword(!showRafflePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                >
                  {showRafflePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            )}

            {/* Título e subtitulo da página */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-white/70 text-sm mb-1 block">Título da página</label>
                <input
                  type="text"
                  value={raffleTitle}
                  onChange={(e) => setRaffleTitle(e.target.value)}
                  placeholder="SORTEIO"
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-white/70 text-sm mb-1 block">Subtítulo</label>
                <input
                  type="text"
                  value={raffleSubtitle}
                  onChange={(e) => setRaffleSubtitle(e.target.value)}
                  placeholder="Participe do nosso sorteio exclusivo!"
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={() => saveRaffleConfigMutation.mutate({
                password: rafflePassword,
                enabled: rafflePasswordEnabled,
                title: raffleTitle,
                subtitle: raffleSubtitle,
              })}
              disabled={saveRaffleConfigMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-black bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saveRaffleConfigMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </div>

        {/* Criar novo sorteio */}
        <div className="bg-black/40 backdrop-blur-md border border-yellow-500/30 rounded-2xl p-4 md:p-6">
          <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-yellow-400" /> Criar Novo Sorteio
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-white/70 text-sm mb-1 block">Título *</label>
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none"
                placeholder="Ex: Sorteio de Natal 2026" />
            </div>
            <div>
              <label className="text-white/70 text-sm mb-1 block">Descrição / Regras (opcional)</label>
              <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none resize-none whitespace-pre-wrap"
                rows={8} placeholder="Regras, prêmio, data do sorteio...\nUse Enter para quebras de linha." />
            </div>
            <div>
              <label className="text-white/70 text-sm mb-1 block">Números por pessoa (máx.)</label>
              <div className="flex items-center gap-3">
                <input type="number" min={1} max={10} value={newMaxNumbers} onChange={(e) => setNewMaxNumbers(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  className="w-24 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:border-yellow-500 focus:outline-none text-center font-bold text-lg" />
                <span className="text-white/50 text-sm">número(s) por cadastro</span>
              </div>
            </div>
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="px-6 py-2 rounded-lg font-bold text-black bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 transition-all disabled:opacity-50">
              {createMutation.isPending ? "Criando..." : "Criar Sorteio"}
            </button>
          </div>
        </div>

        {/* Lista de sorteios */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-yellow-400" /> Sorteios ({raffles?.length || 0})
          </h3>

          {isLoading && <p className="text-white/50 text-center py-8">Carregando...</p>}

          {!isLoading && (!raffles || raffles.length === 0) && (
            <p className="text-white/50 text-center py-8">Nenhum sorteio criado ainda.</p>
          )}

          {raffles?.map((raffle: Raffle) => (
            <div key={raffle.id} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4">
              {editingId === raffle.id ? (
                /* Modo edição */
                <div className="space-y-3">
                  <div>
                    <label className="text-white/70 text-sm mb-1 block">Título</label>
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:border-yellow-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-white/70 text-sm mb-1 block">Descrição / Regras</label>
                    <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:border-yellow-500 focus:outline-none resize-none whitespace-pre-wrap" rows={8} />
                  </div>
                  <div>
                    <label className="text-white/70 text-sm mb-1 block">Números por pessoa (máx.)</label>
                    <div className="flex items-center gap-3">
                      <input type="number" min={1} max={10} value={editMaxNumbers} onChange={(e) => setEditMaxNumbers(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                        className="w-24 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:border-yellow-500 focus:outline-none text-center font-bold text-lg" />
                      <span className="text-white/50 text-sm">número(s) por cadastro</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(raffle.id)} className="px-4 py-1.5 rounded-lg bg-yellow-500 text-black font-bold text-sm">Salvar</button>
                    <button onClick={() => setEditingId(null)} className="px-4 py-1.5 rounded-lg bg-white/10 text-white text-sm">Cancelar</button>
                  </div>
                </div>
              ) : (
                /* Modo visualização */
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-white text-lg">{raffle.title}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        raffle.status === "open" ? "bg-green-500/20 text-green-400 border border-green-500/40" :
                        raffle.status === "closed" ? "bg-red-500/20 text-red-400 border border-red-500/40" :
                        "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                      }`}>
                        {raffle.status === "open" ? "Ativo" : raffle.status === "closed" ? "Desativado" : "Sorteado"}
                      </span>
                    </div>
                    <span className="text-white/40 text-xs">{new Date(raffle.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                  </div>

                  {raffle.description && <p className="text-white/60 text-sm mb-3 whitespace-pre-line">{raffle.description}</p>}

                  {/* Resultado do sorteio */}
                  {raffle.status === "drawn" && raffle.winnerName && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3">
                      <p className="text-yellow-400 font-bold flex items-center gap-1"><Trophy className="w-4 h-4" /> Ganhador</p>
                      <p className="text-white">{raffle.winnerName} - Número <span className="text-yellow-400 font-bold">{raffle.winnerNumber}</span></p>
                      <p className="text-white/50 text-sm">{raffle.winnerPhone && formatPhone(raffle.winnerPhone)}</p>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {raffle.status !== "drawn" && (
                      <button onClick={() => handleToggleStatus(raffle)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          raffle.status === "open" 
                            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30" 
                            : "bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30"
                        }`}>
                        {raffle.status === "open" ? <><EyeOff className="w-4 h-4" /> Desativar</> : <><Eye className="w-4 h-4" /> Ativar</>}
                      </button>
                    )}

                    {raffle.status === "open" && (
                      <button onClick={() => handleDraw(raffle.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30 transition-all">
                        <Play className="w-4 h-4" /> Sortear
                      </button>
                    )}

                    <button onClick={() => { setViewingId(viewingId === raffle.id ? null : raffle.id); }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 transition-all">
                      <Users className="w-4 h-4" /> Ver Números
                    </button>

                    {raffle.status !== "drawn" && (
                      <button onClick={() => { setEditingId(raffle.id); setEditTitle(raffle.title); setEditDescription(raffle.description || ""); setEditMaxNumbers(raffle.maxNumbersPerPerson ?? 1); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/10 text-white/70 hover:bg-white/20 border border-white/20 transition-all">
                        <Edit2 className="w-4 h-4" /> Editar
                      </button>
                    )}

                    <button onClick={() => handleDelete(raffle.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all">
                      <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                  </div>

                  {/* Tabela de números escolhidos */}
                  {viewingId === raffle.id && viewingRaffle && (
                    <div className="mt-4 bg-black/30 border border-white/10 rounded-lg p-4">
                      <h5 className="font-bold text-white mb-3 flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-400" /> Números Escolhidos ({viewingRaffle.entries?.length || 0})
                      </h5>
                      {(!viewingRaffle.entries || viewingRaffle.entries.length === 0) ? (
                        <p className="text-white/50 text-sm">Nenhum número escolhido ainda.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-white/50 border-b border-white/10">
                                <th className="text-left py-2 px-2">Nº</th>
                                <th className="text-left py-2 px-2">Nome</th>
                                <th className="text-left py-2 px-2">Telefone</th>
                                <th className="text-left py-2 px-2">Data/Hora</th>
                                <th className="text-left py-2 px-2">Pagamento</th>
                              </tr>
                            </thead>
                            <tbody>
                              {viewingRaffle.entries.map((entry: RaffleEntry) => (
                                <tr key={entry.id} className={`border-b border-white/5 ${raffle.winnerNumber === entry.number ? 'bg-yellow-500/10' : ''}`}>
                                  <td className={`py-2 px-2 font-bold ${raffle.winnerNumber === entry.number ? 'text-yellow-400' : 'text-white'}`}>
                                    {entry.number} {raffle.winnerNumber === entry.number && <Trophy className="w-3 h-3 inline text-yellow-400" />}
                                  </td>
                                  <td className="py-2 px-2 text-white/80">{entry.customerName}</td>
                                  <td className="py-2 px-2 text-white/60">{formatPhone(entry.customerPhone)}</td>
                                  <td className="py-2 px-2 text-white/40">
                                    <div>{new Date(entry.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
                                    <div className="text-[10px] text-white/30">{new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</div>
                                  </td>
                                  <td className="py-2 px-2">
                                    <button
                                      onClick={() => updateEntryPaymentMutation.mutate({ entryId: entry.id, paymentStatus: entry.paymentStatus === 'paid' ? 'pending' : 'paid' })}
                                      disabled={updateEntryPaymentMutation.isPending}
                                      className={`px-2 py-1 rounded text-xs font-semibold transition-colors border ${
                                        entry.paymentStatus === 'paid'
                                          ? 'bg-green-600/30 hover:bg-green-600/60 text-green-300 border-green-500/30'
                                          : 'bg-orange-600/30 hover:bg-orange-600/60 text-orange-300 border-orange-500/30'
                                      }`}
                                    >
                                      {entry.paymentStatus === 'paid' ? '✓ Pago' : 'Aguardando'}
                                    </button>
                                  </td>
                                  <td className="py-2 px-2">
                                    {raffle.status === 'open' && raffle.winnerNumber !== entry.number && (
                                      <button
                                        onClick={() => setConfirmRemoveEntry({ entryId: entry.id, raffleId: raffle.id, number: entry.number, name: entry.customerName })}
                                        className="px-2 py-1 rounded text-xs bg-red-600/30 hover:bg-red-600/60 text-red-300 hover:text-white transition-colors border border-red-500/30"
                                        title="Liberar número (não pago)"
                                      >
                                        Liberar
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Grid visual dos números */}
                      <div className="mt-4">
                        <p className="text-white/50 text-xs mb-2">Mapa de números:</p>
                        <div className="grid grid-cols-10 gap-1">
                          {Array.from({ length: 100 }, (_, i) => i + 1).map(num => {
                            const entry = viewingRaffle.entries?.find((e: RaffleEntry) => e.number === num);
                            const isWinner = raffle.winnerNumber === num;
                            return (
                              <div key={num} title={entry ? `${entry.customerName} - ${formatPhone(entry.customerPhone)}` : `Número ${num} - Disponível`}
                                className={`aspect-square rounded text-[10px] flex items-center justify-center font-bold ${
                                  isWinner ? 'bg-yellow-500 text-black ring-2 ring-yellow-300' :
                                  entry ? 'bg-blue-600/60 text-white' : 'bg-white/5 text-white/30'
                                }`}>
                                {num}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-[10px] text-white/50">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-white/5"></span> Disponível</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-600/60"></span> Ocupado</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-500"></span> Ganhador</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
    {/* Modal de confirmação: liberar número */}
      {confirmRemoveEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setConfirmRemoveEntry(null)}>
          <div className="bg-gray-900 border border-red-500/40 rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Liberar número {confirmRemoveEntry.number}?</h3>
            <p className="text-white/60 text-sm mb-6">
              O número <span className="text-yellow-400 font-bold">{confirmRemoveEntry.number}</span> escolhido por <span className="text-white font-semibold">{confirmRemoveEntry.name}</span> será devolvido para disponível. Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRemoveEntry(null)} className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors">Cancelar</button>
              <button
                onClick={() => removeEntryMutation.mutate({ entryId: confirmRemoveEntry.entryId, raffleId: confirmRemoveEntry.raffleId })}
                disabled={removeEntryMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                {removeEntryMutation.isPending ? 'Liberando...' : 'Sim, liberar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
