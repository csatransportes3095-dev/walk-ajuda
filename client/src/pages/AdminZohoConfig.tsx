import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield, Plus, Trash2, CheckCircle, TestTube2,
  RefreshCw, Eye, EyeOff, Zap, KeyRound, ChevronDown, ChevronUp
} from "lucide-react";

type Config = {
  id: number; name: string; zohoOrgId: string;
  zohoClientId: string; zohoClientSecret: string;
  zohoRefreshToken: string; isActive: number;
  status: string; createdAt: number;
};

const EMPTY_FORM = { name: "", zohoOrgId: "", zohoClientId: "", zohoClientSecret: "", zohoRefreshToken: "" };

export default function AdminZohoConfig() {
  const { data: configs = [], isLoading, refetch } = trpc.zohoConfig.list.useQuery(
    undefined, { refetchInterval: 5000 }
  );

  const [showAdd, setShowAdd] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const createMut = trpc.zohoConfig.create.useMutation();
  const getAuthUrlMut = trpc.zohoConfig.getAuthUrl.useMutation();
  const setActiveMut = trpc.zohoConfig.setActive.useMutation();
  const testMut = trpc.zohoConfig.test.useMutation();
  const deleteMut = trpc.zohoConfig.delete.useMutation();

  const activeConfig = configs.find((c: Config) => c.isActive === 1);

  async function handleAutoToken() {
    if (!form.name || !form.zohoOrgId || !form.zohoClientId || !form.zohoClientSecret) {
      toast.error("Preencha Nome, Org ID, Client ID e Client Secret antes.");
      return;
    }
    try {
      const res = await getAuthUrlMut.mutateAsync({
        name: form.name, zohoOrgId: form.zohoOrgId,
        zohoClientId: form.zohoClientId, zohoClientSecret: form.zohoClientSecret,
      });
      window.open(res.authUrl, "_blank");
      toast.success("Aba aberta! Autorize no Zoho. O painel atualiza automaticamente.");
      setForm(EMPTY_FORM);
      setShowAdd(false);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  }

  async function handleManualAdd() {
    if (!form.name || !form.zohoOrgId || !form.zohoClientId || !form.zohoClientSecret || !form.zohoRefreshToken) {
      toast.error("Preencha todos os campos.");
      return;
    }
    try {
      await createMut.mutateAsync(form);
      toast.success("Configuração adicionada!");
      setForm(EMPTY_FORM); setShowAdd(false); setShowManual(false);
      refetch();
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    }
  }

  async function handleTest(id: number) {
    setTestingId(id);
    try {
      const res = await testMut.mutateAsync({ id });
      toast.success(res.message);
      refetch();
    } catch (e: any) {
      toast.error("Falhou: " + e.message);
      refetch();
    } finally { setTestingId(null); }
  }

  async function handleActivate(id: number) {
    try {
      await setActiveMut.mutateAsync({ id });
      toast.success("Servidor ativado!");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Deletar "${name}"?`)) return;
    try {
      await deleteMut.mutateAsync({ id });
      toast.success("Deletado.");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function statusBadge(status: string, isActive: number) {
    if (isActive === 1) return <Badge className="bg-green-500/20 text-green-400 border-green-500/40">✅ Ativo</Badge>;
    if (status === "active") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/40">🔵 Testado</Badge>;
    if (status === "error") return <Badge className="bg-red-500/20 text-red-400 border-red-500/40">❌ Erro</Badge>;
    return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/40">⏳ Inativo</Badge>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pb-20">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-7 h-7 text-purple-400" />
            <div>
              <h1 className="text-xl font-bold">Configuração Zoho Mail</h1>
              <p className="text-sm text-gray-400">Gerencie múltiplos servidores OAuth</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="border-gray-600 text-gray-300">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => { setShowAdd(!showAdd); setShowManual(false); }}
              className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </div>
        </div>

        {/* Status ativo */}
        {activeConfig && (
          <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-3 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            <span className="text-sm text-green-300">Usando: <strong>{(activeConfig as Config).name}</strong></span>
          </div>
        )}
        {!activeConfig && configs.length > 0 && (
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-3 mb-4">
            <p className="text-sm text-yellow-300">⚠️ Nenhum servidor ativo. Clique em <strong>✓</strong> para ativar um.</p>
          </div>
        )}

        {/* Formulário de adição */}
        {showAdd && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-5 space-y-4">
            <h2 className="font-semibold text-white">Nova Configuração</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs mb-1 block">Nome *</Label>
                <input placeholder="Ex: Servidor 1" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500" />
              </div>
              <div>
                <Label className="text-gray-300 text-xs mb-1 block">Organization ID *</Label>
                <input placeholder="Ex: 931276368" value={form.zohoOrgId}
                  onChange={e => setForm(f => ({ ...f, zohoOrgId: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-gray-300 text-xs mb-1 block">Client ID *</Label>
                <input placeholder="1000.XXXX..." value={form.zohoClientId}
                  onChange={e => setForm(f => ({ ...f, zohoClientId: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-gray-300 text-xs mb-1 block">Client Secret *</Label>
                <div className="relative">
                  <input type={showSecret ? "text" : "password"} placeholder="••••••••" value={form.zohoClientSecret}
                    onChange={e => setForm(f => ({ ...f, zohoClientSecret: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-purple-500" />
                  <button onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* AUTOMÁTICO */}
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-purple-300">Gerar Token Automaticamente</span>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/40 text-xs">Recomendado</Badge>
              </div>
              <p className="text-xs text-gray-400 mb-1">Preencha os 4 campos acima → clique → autorize no Zoho → token salvo sozinho.</p>
              <p className="text-xs text-yellow-400 mb-3">
                ⚠️ Registre <code className="bg-gray-800 px-1 rounded">https://h2colombiano.com/api/zoho-oauth-callback</code> como Redirect URI no Zoho API Console.
              </p>
              <Button onClick={handleAutoToken} disabled={getAuthUrlMut.isPending}
                className="bg-purple-600 hover:bg-purple-700 w-full">
                <Zap className="w-4 h-4 mr-2" />
                {getAuthUrlMut.isPending ? "Gerando URL..." : "Abrir Autorização Zoho"}
              </Button>
            </div>

            {/* MANUAL */}
            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <button onClick={() => setShowManual(!showManual)}
                className="w-full flex items-center justify-between p-3 text-sm text-gray-400 hover:bg-gray-800 transition">
                <span className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4" /> Já tenho o Refresh Token (manual)
                </span>
                {showManual ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showManual && (
                <div className="p-3 border-t border-gray-700 bg-gray-900/50 space-y-3">
                  <p className="text-xs text-gray-500">Cole o Refresh Token obtido manualmente no Zoho API Console.</p>
                  <div className="relative">
                    <input type={showToken ? "text" : "password"} placeholder="1000.xxxx..." value={form.zohoRefreshToken}
                      onChange={e => setForm(f => ({ ...f, zohoRefreshToken: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-purple-500" />
                    <button onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button onClick={handleManualAdd} disabled={createMut.isPending}
                    className="w-full bg-gray-700 hover:bg-gray-600">
                    {createMut.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              )}
            </div>

            <Button variant="ghost" onClick={() => { setShowAdd(false); setShowManual(false); setForm(EMPTY_FORM); }}
              className="w-full text-gray-400 hover:text-white">
              Cancelar
            </Button>
          </div>
        )}

        {/* Guia */}
        <div className="mb-4">
          <button onClick={() => setShowGuide(!showGuide)}
            className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
            {showGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Como obter as credenciais do Zoho?
          </button>
          {showGuide && (
            <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg p-4 text-xs text-gray-300 space-y-2">
              <p><strong className="text-white">1. Organization ID:</strong> Zoho Admin → Settings → Organization Profile</p>
              <p><strong className="text-white">2. Client ID + Secret:</strong>{" "}
                <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                  api-console.zoho.com
                </a>{" "}→ "Server-based Applications"
              </p>
              <p><strong className="text-white">3. Redirect URI a registrar:</strong>{" "}
                <code className="bg-gray-800 px-1 rounded">https://h2colombiano.com/api/zoho-oauth-callback</code>
              </p>
              <p><strong className="text-white">4. Scope:</strong>{" "}
                <code className="bg-gray-800 px-1 rounded">ZohoMail.organization.accounts.ALL</code>
              </p>
            </div>
          )}
        </div>

        {/* Lista de configs */}
        {isLoading ? (
          <div className="text-center py-10 text-gray-500">Carregando...</div>
        ) : configs.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nenhuma configuração ainda.</p>
            <p className="text-sm mt-1">Clique em "+ Adicionar" para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((c: Config) => (
              <div key={c.id}
                className={`bg-gray-900 border rounded-xl p-4 ${c.isActive === 1 ? "border-green-500/50" : "border-gray-700"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{c.name}</span>
                      {statusBadge(c.status, c.isActive)}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      Org: {c.zohoOrgId} · Client: {c.zohoClientId.slice(0, 24)}...
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleTest(c.id)} disabled={testingId === c.id}
                      title="Testar conexão"
                      className="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 transition disabled:opacity-40">
                      <TestTube2 className={`w-4 h-4 ${testingId === c.id ? "animate-spin" : ""}`} />
                    </button>
                    {c.isActive !== 1 && (
                      <button onClick={() => handleActivate(c.id)} title="Ativar este servidor"
                        className="p-2 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 transition">
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => handleDelete(c.id, c.name)} title="Deletar"
                      className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rodapé informativo */}
        <div className="mt-8 bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-1">
          <p>📋 <strong className="text-gray-400">Fluxo:</strong> Adicionar → Testar → Ativar → Criar emails normalmente</p>
          <p>🔄 Quando lotar (5 contas FREE), adicione novo servidor e ative</p>
          <p>⚡ Painel atualiza a cada 5 segundos após autorizar no Zoho</p>
        </div>
      </div>
    </div>
  );
}


  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState<ZohoConfig | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [showPasswords, setShowPasswords] = useState<Set<number>>(new Set());

  const [form, setForm] = useState({
    name: "",
    zohoOrgId: "",
    zohoClientId: "",
    zohoClientSecret: "",
    zohoRefreshToken: "",
  });

  const createMutation = trpc.zohoConfig.create.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setForm({ name: "", zohoOrgId: "", zohoClientId: "", zohoClientSecret: "", zohoRefreshToken: "" });
      utils.zohoConfig.list.invalidate();
      toast.success("Configuração adicionada com sucesso!");
    },
    onError: (e) => toast.error("Erro ao adicionar: " + e.message),
  });

  const deleteMutation = trpc.zohoConfig.delete.useMutation({
    onSuccess: () => {
      setShowDelete(null);
      utils.zohoConfig.list.invalidate();
      toast.success("Configuração removida com sucesso");
    },
    onError: (e) => toast.error("Erro ao remover: " + e.message),
  });

  const setActiveMutation = trpc.zohoConfig.setActive.useMutation({
    onSuccess: () => {
      utils.zohoConfig.list.invalidate();
      toast.success("Configuração ativada!");
    },
    onError: (e) => toast.error("Erro ao ativar: " + e.message),
  });

  const testMutation = trpc.zohoConfig.test.useMutation({
    onSuccess: () => {
      utils.zohoConfig.list.invalidate();
      setTestingId(null);
      toast.success("Conexão bem-sucedida!");
    },
    onError: (e) => {
      setTestingId(null);
      toast.error("Erro na conexão: " + e.message);
    },
  });

  const togglePassword = (id: number) => {
    const newSet = new Set(showPasswords);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setShowPasswords(newSet);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copiado!`);
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'error': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Settings className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Configuração Zoho Mail</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie múltiplas credenciais OAuth para diferentes servidores
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGuide(true)}
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              Guia de Configuração
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              Atualizar
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Configuração
            </Button>
          </div>
        </div>

        {/* Tabela de Configurações */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Organization ID</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Carregando configurações...
                  </TableCell>
                </TableRow>
              ) : configs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Nenhuma configuração adicionada
                  </TableCell>
                </TableRow>
              ) : (
                configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{config.name}</span>
                        {config.isActive ? (
                          <Badge className="bg-blue-500 text-white">Ativo</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`border ${getStatusColor(config.status)}`}>
                        {config.status === 'active' && <Check className="w-3 h-3 mr-1" />}
                        {config.status === 'error' && <AlertCircle className="w-3 h-3 mr-1" />}
                        {config.status.charAt(0).toUpperCase() + config.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted/50 px-2 py-1 rounded">
                          {config.zohoOrgId}
                        </code>
                        <button
                          onClick={() => copyToClipboard(config.zohoOrgId, "Org ID")}
                          className="opacity-40 hover:opacity-100 transition-opacity"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {!config.isActive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Ativar esta configuração"
                            onClick={() => setActiveMutation.mutate({ id: config.id })}
                            disabled={setActiveMutation.isPending}
                          >
                            <Check className="w-4 h-4 text-green-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Testar conexão"
                          onClick={() => {
                            setTestingId(config.id);
                            testMutation.mutate({ id: config.id });
                          }}
                          disabled={testingId === config.id}
                        >
                          {testingId === config.id ? (
                            <Loader className="w-4 h-4 text-yellow-500 animate-spin" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-blue-500" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Excluir configuração"
                          onClick={() => setShowDelete(config)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Status da Última Configuração Ativa */}
        {configs.find(c => c.isActive) && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-blue-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-200">Configuração Ativa</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Usando: <strong>{configs.find(c => c.isActive)?.name}</strong>
                </p>
                {configs.find(c => c.isActive)?.lastError && (
                  <p className="text-sm text-red-400 mt-2">
                    ⚠️ Último erro: {configs.find(c => c.isActive)?.lastError}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Guia de Configuração */}
        <Dialog open={showGuide} onOpenChange={setShowGuide}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Guia: Como Configurar Zoho OAuth</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {GUIDE_STEPS.map((step, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{step.icon}</span>
                    <h3 className="font-semibold">{step.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground ml-11">{step.description}</p>
                </div>
              ))}

              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-yellow-400">⚠️ Escopos Necessários</h4>
                <p className="text-sm text-muted-foreground">Ao gerar o token, inclua esses escopos:</p>
                <code className="block bg-black/50 p-2 rounded text-xs text-yellow-300 overflow-auto">
                  ZohoMail.organization.accounts.ALL
                </code>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-blue-400">💡 Dica: Free Plan</h4>
                <p className="text-sm text-muted-foreground">
                  No plano Free do Zoho Mail, você pode criar até 5 contas de email por login OAuth.
                  Configure múltiplos tokens para gerenciar mais contas!
                </p>
              </div>

              <div className="pt-4">
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => window.open("https://api-console.zoho.com/", "_blank")}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir API Console do Zoho
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setShowGuide(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Adicionar Configuração */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Configuração Zoho</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Nome da Configuração *</Label>
                <Input
                  placeholder="Ex: Servidor 1"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Identifique esta configuração (ex: "Servidor Principal", "Backup")
                </p>
              </div>

              <div className="space-y-1">
                <Label>Organization ID *</Label>
                <Input
                  placeholder="Seu Org ID do Zoho"
                  value={form.zohoOrgId}
                  onChange={(e) => setForm((f) => ({ ...f, zohoOrgId: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Client ID *</Label>
                <Input
                  placeholder="Seu Client ID"
                  value={form.zohoClientId}
                  onChange={(e) => setForm((f) => ({ ...f, zohoClientId: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Client Secret *</Label>
                <div className="flex gap-2">
                  <Input
                    type={showPasswords.has(-1) ? "text" : "password"}
                    placeholder="Seu Client Secret"
                    value={form.zohoClientSecret}
                    onChange={(e) => setForm((f) => ({ ...f, zohoClientSecret: e.target.value }))}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => togglePassword(-1)}
                  >
                    {showPasswords.has(-1) ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Refresh Token *</Label>
                <div className="flex gap-2">
                  <Input
                    type={showPasswords.has(-2) ? "text" : "password"}
                    placeholder="Seu Refresh Token"
                    value={form.zohoRefreshToken}
                    onChange={(e) => setForm((f) => ({ ...f, zohoRefreshToken: e.target.value }))}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => togglePassword(-2)}
                  >
                    {showPasswords.has(-2) ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowGuide(true)}
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Ver Guia de Configuração
              </Button>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => createMutation.mutate(form as any)}
                disabled={
                  createMutation.isPending ||
                  !form.name ||
                  !form.zohoOrgId ||
                  !form.zohoClientId ||
                  !form.zohoClientSecret ||
                  !form.zohoRefreshToken
                }
              >
                {createMutation.isPending ? "Adicionando..." : "Adicionar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Confirmar Exclusão */}
        <AlertDialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Configuração?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir{" "}
                <span className="font-mono font-medium text-foreground">
                  {showDelete?.name}
                </span>
                ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => showDelete && deleteMutation.mutate({ id: showDelete.id })}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
