import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Settings,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Copy,
  Eye,
  EyeOff,
  Loader,
  HelpCircle,
  ExternalLink,
} from "lucide-react";

interface ZohoConfig {
  id: number;
  name: string;
  zohoOrgId: string;
  zohoClientId: string;
  zohoClientSecret: string;
  zohoRefreshToken: string;
  isActive: number;
  status: 'active' | 'inactive' | 'error';
  lastError: string | null;
  lastTestAt: number | null;
}

const GUIDE_STEPS = [
  {
    title: "1. Acessar API Console",
    description: "Acesse https://api-console.zoho.com/",
    icon: "🔗",
  },
  {
    title: "2. Criar ou Selecionar Aplicação",
    description: "Vá em Zoho Mail e crie uma nova aplicação OAuth ou use uma existente",
    icon: "📱",
  },
  {
    title: "3. Obter Client ID e Secret",
    description: "Copie o Client ID e Client Secret da aplicação",
    icon: "🔑",
  },
  {
    title: "4. Gerar Refresh Token",
    description: "Autorize a aplicação para obter o Refresh Token",
    icon: "🔄",
  },
  {
    title: "5. Encontrar Organization ID",
    description: "Vá em Zoho Admin > Organization Settings para copiar o Organization ID",
    icon: "🏢",
  },
];

export default function AdminZohoConfig() {
  const utils = trpc.useUtils();
  const { data: configs = [], isLoading, refetch } = trpc.zohoConfig.list.useQuery();

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
