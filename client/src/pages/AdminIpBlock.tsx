import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Shield, ShieldOff, ShieldCheck, Trash2, Search, Clock, User, Globe, AlertTriangle, RefreshCw, Ban } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { useTimezone } from "@/hooks/useTimezone";

const ACTION_LABELS: Record<string, string> = {
  verificar_cadastro: "Verificar Cadastro",
  atualizar_email: "Atualizar E-mail",
  ver_perfil: "Ver Perfil",
  acompanhar_pedido: "Acompanhar Pedido",
  ver_status_pedido: "Ver Status do Pedido",
  verificar_pin: "Verificar Senha",
  criar_senha: "Criar Senha",
  fazer_pedido: "Fazer Pedido",
  acesso: "Acesso Geral",
};

export default function AdminIpBlock() {
  const [activeTab, setActiveTab] = useState<"attempts" | "logs" | "blocked">("attempts");
  const [searchIp, setSearchIp] = useState("");
  const [blockIpInput, setBlockIpInput] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [filterIp, setFilterIp] = useState("");
  const { fmt } = useTimezone();

  const logsQuery = trpc.ipBlocklist.logs.useQuery({ limit: 200 });
  const blockedQuery = trpc.ipBlocklist.list.useQuery();
  const attemptsQuery = trpc.blockedAttempts.list.useQuery({ limit: 200 });
  const clearAttemptsMut = trpc.blockedAttempts.clear.useMutation({
    onSuccess: () => { toast.success("Histórico limpo!"); attemptsQuery.refetch(); },
  });
  const blockMut = trpc.ipBlocklist.block.useMutation({
    onSuccess: () => {
      toast.success("IP bloqueado com sucesso!");
      setBlockIpInput("");
      setBlockReason("");
      blockedQuery.refetch();
    },
    onError: () => toast.error("Erro ao bloquear IP"),
  });
  const unblockMut = trpc.ipBlocklist.unblock.useMutation({
    onSuccess: () => {
      toast.success("IP desbloqueado!");
      blockedQuery.refetch();
    },
    onError: () => toast.error("Erro ao desbloquear IP"),
  });

  const logs = logsQuery.data || [];
  const blocked = blockedQuery.data || [];
  const attempts = attemptsQuery.data || [];

  // Filtrar logs por IP
  const filteredLogs = filterIp
    ? logs.filter(l => l.ip.includes(filterIp))
    : logs;

  // Agrupar logs por IP para mostrar resumo
  const ipSummary = logs.reduce<Record<string, { count: number; lastAction: string; lastAt: Date | string; phones: Set<string>; names: Set<string> }>>((acc, log) => {
    if (!acc[log.ip]) acc[log.ip] = { count: 0, lastAction: log.action, lastAt: log.createdAt, phones: new Set(), names: new Set() };
    acc[log.ip].count++;
    acc[log.ip].lastAction = log.action;
    acc[log.ip].lastAt = log.createdAt;
    if (log.customerPhone) acc[log.ip].phones.add(log.customerPhone);
    if (log.customerName) acc[log.ip].names.add(log.customerName);
    return acc;
  }, {});

  // Agrupar tentativas por telefone
  const attemptsByPhone = attempts.reduce<Record<string, { count: number; actions: string[]; ips: Set<string>; lastAt: Date | string }>>((acc, a) => {
    if (!acc[a.phone]) acc[a.phone] = { count: 0, actions: [], ips: new Set(), lastAt: a.createdAt };
    acc[a.phone].count++;
    if (!acc[a.phone].actions.includes(a.action)) acc[a.phone].actions.push(a.action);
    if (a.ip) acc[a.phone].ips.add(a.ip);
    acc[a.phone].lastAt = a.createdAt;
    return acc;
  }, {});

  const blockedIps = new Set(blocked.map(b => b.ip));

  const handleBlockFromLog = (ip: string) => {
    setBlockIpInput(ip);
    setActiveTab("blocked");
  };

  const handleBlock = () => {
    const ip = blockIpInput.trim();
    if (!ip) { toast.error("Digite um IP"); return; }
    blockMut.mutate({ ip, reason: blockReason.trim() || undefined });
  };

  return (
    <div className="min-h-screen bg-[#0d0d2b]">
      <AdminHeader title="Bloqueio de IP" backTo="/admin/orders" />
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab("attempts")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "attempts" ? "bg-orange-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
          >
            <Ban className="inline w-4 h-4 mr-1" />
            Tentativas Bloqueadas
            {attempts.length > 0 && (
              <span className="ml-2 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">{attempts.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "logs" ? "bg-violet-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
          >
            <Globe className="inline w-4 h-4 mr-1" />
            Log de Acessos
          </button>
          <button
            onClick={() => setActiveTab("blocked")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "blocked" ? "bg-red-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
          >
            <Shield className="inline w-4 h-4 mr-1" />
            IPs Bloqueados
            {blocked.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{blocked.length}</span>
            )}
          </button>
        </div>

        {/* Tab: Tentativas Bloqueadas */}
        {activeTab === "attempts" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                <Ban className="w-4 h-4 text-orange-400" />
                Histórico de tentativas de números bloqueados
              </h2>
              <div className="flex gap-2">
                <button onClick={() => attemptsQuery.refetch()} className="text-white/40 hover:text-white/80 transition-colors p-1.5">
                  <RefreshCw className="w-4 h-4" />
                </button>
                {attempts.length > 0 && (
                  <button
                    onClick={() => clearAttemptsMut.mutate()}
                    disabled={clearAttemptsMut.isPending}
                    className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/40 transition-colors"
                  >
                    <Trash2 className="inline w-3 h-3 mr-1" />
                    Limpar histórico
                  </button>
                )}
              </div>
            </div>

            {/* Resumo por telefone */}
            {Object.keys(attemptsByPhone).length > 0 && (
              <div className="mb-6">
                <h3 className="text-white/60 text-xs font-medium mb-2 uppercase tracking-wider">Resumo por Número</h3>
                <div className="space-y-2">
                  {Object.entries(attemptsByPhone)
                    .sort(([, a], [, b]) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
                    .map(([phone, data]) => (
                      <div key={phone} className="flex items-center gap-3 p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg">
                        <Ban className="w-5 h-5 text-orange-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-mono text-sm">📱 {phone}</span>
                            <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30">
                              {data.count} tentativa{data.count !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="text-xs text-white/50 mt-0.5">
                            Ações: {data.actions.map(a => ACTION_LABELS[a] || a).join(", ")}
                          </div>
                          {data.ips.size > 0 && (
                            <div className="text-xs text-white/40 mt-0.5">
                              IPs: {Array.from(data.ips).join(", ")}
                            </div>
                          )}
                          <div className="text-xs text-white/30 mt-0.5">
                            <Clock className="inline w-3 h-3 mr-1" />
                            Última tentativa: {fmt(data.lastAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Lista detalhada de tentativas */}
            <h3 className="text-white/60 text-xs font-medium mb-2 uppercase tracking-wider">Registro Detalhado</h3>
            <div className="space-y-2">
              {attemptsQuery.isLoading ? (
                <div className="text-center text-white/30 py-8 text-sm">Carregando...</div>
              ) : attempts.length === 0 ? (
                <div className="text-center text-white/30 py-8 text-sm">
                  <Ban className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhuma tentativa registrada ainda
                </div>
              ) : (
                attempts.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium">
                          {ACTION_LABELS[a.action] || a.action}
                        </span>
                        <span className="text-white font-mono text-sm">📱 {a.phone}</span>
                        {a.ip && <span className="text-white/40 text-xs font-mono">{a.ip}</span>}
                      </div>
                      {a.reason && <div className="text-xs text-white/40 mt-0.5">Motivo do bloqueio: {a.reason}</div>}
                      <div className="text-xs text-white/30 mt-0.5">
                        <Clock className="inline w-3 h-3 mr-1" />
                        {fmt(a.createdAt)}
                      </div>
                    </div>
                    {a.ip && (
                      <button
                        onClick={() => { setBlockIpInput(a.ip!); setActiveTab("blocked"); }}
                        className="px-2 py-1 text-xs bg-red-600/20 text-red-400 border border-red-500/30 rounded hover:bg-red-600/40 transition-colors shrink-0"
                        title="Bloquear este IP"
                      >
                        <Shield className="inline w-3 h-3 mr-1" />
                        Bloquear IP
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab: Logs */}
        {activeTab === "logs" && (
          <div>
            {/* Resumo por IP */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm">Resumo por IP</h2>
                <button onClick={() => logsQuery.refetch()} className="text-white/40 hover:text-white/80 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  value={filterIp}
                  onChange={e => setFilterIp(e.target.value)}
                  placeholder="Filtrar por IP..."
                  className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div className="space-y-2">
                {Object.entries(ipSummary)
                  .filter(([ip]) => !filterIp || ip.includes(filterIp))
                  .sort(([, a], [, b]) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
                  .map(([ip, data]) => (
                    <div key={ip} className={`flex items-center gap-3 p-3 rounded-lg border ${blockedIps.has(ip) ? "bg-red-900/20 border-red-500/30" : "bg-white/5 border-white/10"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-mono text-sm">{ip}</span>
                          {blockedIps.has(ip) && (
                            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30">BLOQUEADO</span>
                          )}
                          <span className="text-xs text-white/40">{data.count} ação{data.count !== 1 ? "ões" : ""}</span>
                        </div>
                        {data.names.size > 0 && (
                          <div className="text-xs text-white/50 mt-0.5">
                            <User className="inline w-3 h-3 mr-1" />
                            {Array.from(data.names).join(", ")}
                          </div>
                        )}
                        {data.phones.size > 0 && (
                          <div className="text-xs text-white/40">
                            📱 {Array.from(data.phones).join(", ")}
                          </div>
                        )}
                        <div className="text-xs text-white/30 mt-0.5">
                          <Clock className="inline w-3 h-3 mr-1" />
                          {fmt(data.lastAt)} — última ação: {data.lastAction}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setFilterIp(ip)}
                          className="p-1.5 text-white/40 hover:text-white/80 transition-colors"
                          title="Ver detalhes"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                        {blockedIps.has(ip) ? (
                          <button
                            onClick={() => {
                              const b = blocked.find(x => x.ip === ip);
                              if (b) unblockMut.mutate({ id: b.id });
                            }}
                            className="px-2 py-1 text-xs bg-green-600/20 text-green-400 border border-green-500/30 rounded hover:bg-green-600/40 transition-colors"
                          >
                            <ShieldOff className="inline w-3 h-3 mr-1" />
                            Desbloquear
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBlockFromLog(ip)}
                            className="px-2 py-1 text-xs bg-red-600/20 text-red-400 border border-red-500/30 rounded hover:bg-red-600/40 transition-colors"
                          >
                            <Shield className="inline w-3 h-3 mr-1" />
                            Bloquear
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                {Object.keys(ipSummary).length === 0 && (
                  <div className="text-center text-white/30 py-8 text-sm">Nenhum acesso registrado ainda</div>
                )}
              </div>
            </div>

            {/* Logs detalhados */}
            {filterIp && (
              <div>
                <h2 className="text-white font-semibold text-sm mb-3">
                  Detalhes do IP: <span className="text-violet-400 font-mono">{filterIp}</span>
                  <button onClick={() => setFilterIp("")} className="ml-2 text-white/30 hover:text-white/60 text-xs">✕ limpar</button>
                </h2>
                <div className="space-y-2">
                  {filteredLogs.map(log => (
                    <div key={log.id} className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${log.action === 'register' ? 'bg-blue-500/20 text-blue-400' : log.action === 'order' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>
                            {log.action === 'register' ? '📝 Cadastro' : log.action === 'order' ? '📦 Pedido' : log.action}
                          </span>
                          {log.customerName && <span className="text-white/70 text-sm">{log.customerName}</span>}
                          {log.customerPhone && <span className="text-white/40 text-xs">📱 {log.customerPhone}</span>}
                        </div>
                        <div className="text-xs text-white/30 mt-0.5">
                          <Clock className="inline w-3 h-3 mr-1" />
                          {fmt(log.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredLogs.length === 0 && (
                    <div className="text-center text-white/30 py-4 text-sm">Nenhum log para este IP</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Bloqueados */}
        {activeTab === "blocked" && (
          <div>
            {/* Formulário para bloquear */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
              <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Bloquear IP
              </h2>
              <div className="flex gap-2 flex-wrap">
                <input
                  value={blockIpInput}
                  onChange={e => setBlockIpInput(e.target.value)}
                  placeholder="Endereço IP (ex: 192.168.1.1)"
                  className="flex-1 min-w-48 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-red-500"
                />
                <input
                  value={blockReason}
                  onChange={e => setBlockReason(e.target.value)}
                  placeholder="Motivo (opcional)"
                  className="flex-1 min-w-48 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-red-500"
                />
                <button
                  onClick={handleBlock}
                  disabled={blockMut.isPending}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <Shield className="inline w-4 h-4 mr-1" />
                  {blockMut.isPending ? "Bloqueando..." : "Bloquear"}
                </button>
              </div>
            </div>

            {/* Lista de IPs bloqueados */}
            <div className="space-y-2">
              {blocked.map(b => (
                <div key={b.id} className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                  <ShieldCheck className="w-5 h-5 text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-mono text-sm">{b.ip}</div>
                    {b.reason && <div className="text-xs text-white/50 mt-0.5">Motivo: {b.reason}</div>}
                    <div className="text-xs text-white/30 mt-0.5">
                      <Clock className="inline w-3 h-3 mr-1" />
                      Bloqueado em: {fmt(b.createdAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => unblockMut.mutate({ id: b.id })}
                    disabled={unblockMut.isPending}
                    className="px-3 py-1.5 text-xs bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-600/40 transition-colors disabled:opacity-50"
                  >
                    <ShieldOff className="inline w-3 h-3 mr-1" />
                    Desbloquear
                  </button>
                </div>
              ))}
              {blocked.length === 0 && (
                <div className="text-center text-white/30 py-8 text-sm">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhum IP bloqueado
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
