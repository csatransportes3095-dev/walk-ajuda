import { useState, useCallback } from "react";
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
  Mail, Plus, Trash2, ExternalLink, RefreshCw,
  Copy, Search, Shuffle, Server, CheckCircle2, XCircle,
} from "lucide-react";

interface ZohoUser {
  accountId: string;
  primaryEmailAddress: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
  enabled: boolean;
  mailboxStatus: string;
  accountCreationTime: number;
  lastLogin: number;
  type?: string;
  serverId?: number;
  serverName?: string;
}

interface ServerGroup {
  serverId: number;
  serverName: string;
  domain: string;
  users: ZohoUser[];
}

const FIRST_NAMES = ["Ana","Bruno","Carlos","Daniel","Eduardo","Fernanda","Gabriel","Helena","Igor","Julia","Kevin","Lucas","Marcos","Natalia","Olivia","Paulo","Rafael","Sandra","Thiago","Vanessa","William","Xavier","Yasmin","Zeca","Adriana","Beatriz","Camila","Diego","Elisa","Felipe"];
const LAST_NAMES = ["Silva","Santos","Oliveira","Souza","Lima","Pereira","Costa","Ferreira","Rodrigues","Almeida","Nascimento","Carvalho","Gomes","Martins","Araujo","Melo","Barbosa","Ribeiro","Rocha","Cardoso","Mendes","Castro","Moreira","Nunes"];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function generateFullAccount(existingEmails: string[]) {
  const existingUsernames = new Set(existingEmails.map(e => e.split("@")[0].toLowerCase()));
  let username = "", firstName = "", lastName = "";
  for (let i = 0; i < 50; i++) {
    firstName = pick(FIRST_NAMES); lastName = pick(LAST_NAMES);
    const num = Math.floor(Math.random() * 900) + 100;
    const candidate = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${num}`;
    if (!existingUsernames.has(candidate)) { username = candidate; break; }
  }
  if (!username) { username = `user_${Date.now().toString(36).slice(-5)}`; firstName = pick(FIRST_NAMES); lastName = pick(LAST_NAMES); }
  return { username, firstName, lastName, displayName: `${firstName} ${lastName}`, password: "Walk@@3095" };
}

const SERVER_COLORS = [
  { border: "border-blue-500/40", bg: "bg-blue-500/10", text: "text-blue-400", badge: "bg-blue-500/20 text-blue-300", headerBg: "bg-blue-950/30" },
  { border: "border-purple-500/40", bg: "bg-purple-500/10", text: "text-purple-400", badge: "bg-purple-500/20 text-purple-300", headerBg: "bg-purple-950/30" },
  { border: "border-green-500/40", bg: "bg-green-500/10", text: "text-green-400", badge: "bg-green-500/20 text-green-300", headerBg: "bg-green-950/30" },
  { border: "border-orange-500/40", bg: "bg-orange-500/10", text: "text-orange-400", badge: "bg-orange-500/20 text-orange-300", headerBg: "bg-orange-950/30" },
];

// Etapas do modal
type ModalStep = 'select-server' | 'fill-form';

export default function AdminEmail() {
  const utils = trpc.useUtils();
  const { data: groups = [], isLoading, refetch } = trpc.email.list.useQuery();

  const [search, setSearch] = useState("");
  const [modalStep, setModalStep] = useState<ModalStep | null>(null);
  const [selectedServer, setSelectedServer] = useState<ServerGroup | null>(null);
  const [showDelete, setShowDelete] = useState<ZohoUser | null>(null);
  const [showCreated, setShowCreated] = useState<{ email: string; password: string; serverName: string } | null>(null);

  const [form, setForm] = useState({
    username: "", displayName: "", password: "Walk@@3095",
    firstName: "", lastName: "", type: 'membro' as 'principal' | 'membro',
  });
  const [isGeneratingUsername, setIsGeneratingUsername] = useState(false);

  const allEmails = (groups as ServerGroup[]).flatMap(g => g.users.map(u => u.primaryEmailAddress));
  const totalCount = allEmails.length;
  // Domínio do servidor selecionado
  const selectedDomain = selectedServer?.domain || 'walkajuda.com';

  const handleGenerateUsername = useCallback(() => {
    setIsGeneratingUsername(true);
    const generated = generateFullAccount(allEmails);
    setForm(f => ({ ...f, ...generated }));
    setTimeout(() => setIsGeneratingUsername(false), 400);
  }, [allEmails]);

  // Abrir modal: selecionar servidor primeiro
  function handleOpenCreate() {
    const serverList = groups as ServerGroup[];
    // Se só há um servidor disponível (não lotado), pular seleção
    const available = serverList.filter(g => g.users.length < 5);
    if (available.length === 1) {
      setSelectedServer(available[0]);
      setModalStep('fill-form');
    } else {
      setModalStep('select-server');
    }
  }

  function handleSelectServer(group: ServerGroup) {
    if (group.users.length >= 5) return; // Lotado, não permite
    setSelectedServer(group);
    setModalStep('fill-form');
  }

  function handleBackToSelect() {
    setModalStep('select-server');
    setSelectedServer(null);
  }

  const createMutation = trpc.email.create.useMutation({
    onSuccess: (data) => {
      const email = (data as any).user?.primaryEmailAddress ?? `${form.username}@walkajuda.com`;
      setShowCreated({ email, password: form.password, serverName: selectedServer?.serverName ?? 'auto' });
      setModalStep(null);
      setSelectedServer(null);
      setForm({ username: "", displayName: "", password: "Walk@@3095", firstName: "", lastName: "", type: 'membro' });
      utils.email.list.invalidate();
    },
    onError: (e) => toast.error("Erro ao criar conta: " + e.message),
  });

  const deleteMutation = trpc.email.delete.useMutation({
    onSuccess: () => { setShowDelete(null); utils.email.list.invalidate(); toast.success("Conta excluída com sucesso"); },
    onError: (e) => toast.error("Erro ao excluir conta: " + e.message),
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado!`));
  };

  const filteredGroups = (groups as ServerGroup[]).map(group => ({
    ...group,
    users: group.users.filter(u =>
      u.primaryEmailAddress.toLowerCase().includes(search.toLowerCase()) ||
      u.displayName.toLowerCase().includes(search.toLowerCase())
    ),
  }));

  // Servidor selecionado no header (seletor rápido)
  const availableServers = (groups as ServerGroup[]).filter(g => g.users.length < 5);
  const defaultServer = availableServers[0] ?? null;

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Mail className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Emails @walkajuda.com</h1>
              <p className="text-sm text-muted-foreground">
                {totalCount} conta{totalCount !== 1 ? "s" : ""} em {(groups as ServerGroup[]).length} servidor{(groups as ServerGroup[]).length !== 1 ? "es" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => window.open("https://mail.zoho.com", "_blank")}>
              <ExternalLink className="w-4 h-4 mr-2" /> Abrir Webmail
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" /> Nova Conta
            </Button>
          </div>
        </div>

        {/* Busca */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por email ou nome..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Blocos por servidor */}
        <div className="space-y-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando contas...</div>
          ) : (groups as ServerGroup[]).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma conta cadastrada</div>
          ) : (
            filteredGroups.map((group, idx) => {
              const colors = SERVER_COLORS[idx % SERVER_COLORS.length];
              const principalEmails = group.users.filter(u => u.type === 'principal');
              const membroEmails = group.users.filter(u => u.type !== 'principal');
              const isLotado = group.users.length >= 5;

              return (
                <div key={group.serverId} className={`border ${colors.border} rounded-xl overflow-hidden`}>
                  <div className={`${colors.headerBg} px-4 py-3 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <Server className={`w-4 h-4 ${colors.text}`} />
                      <span className={`font-semibold ${colors.text}`}>{group.serverName}</span>
                      <Badge className={`text-xs ${colors.badge}`}>{group.users.length}/5 contas</Badge>
                    </div>
                    {isLotado ? (
                      <Badge className="bg-red-500/20 text-red-400 text-xs">🔴 Lotado</Badge>
                    ) : (
                      <Badge className="bg-green-500/20 text-green-400 text-xs">🟢 Disponível</Badge>
                    )}
                  </div>

                  <div className="divide-y divide-gray-800">
                    {principalEmails.length > 0 && (
                      <div>
                        <div className="px-4 py-2 bg-gray-900/50">
                          <span className="text-xs font-medium text-gray-400">📧 Email Principal</span>
                        </div>
                        <Table>
                          <TableBody>
                            {principalEmails.map(user => (
                              <TableRow key={user.accountId}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm">{user.primaryEmailAddress}</span>
                                    <button onClick={() => copyToClipboard(user.primaryEmailAddress, "Email")} className="opacity-40 hover:opacity-100 transition-opacity">
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{user.displayName || "—"}</TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-end">
                                    <Button variant="ghost" size="icon" onClick={() => setShowDelete(user)}>
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {membroEmails.length > 0 && (
                      <div>
                        <div className="px-4 py-2 bg-gray-900/50">
                          <span className="text-xs font-medium text-gray-400">👥 Email Membros</span>
                        </div>
                        <Table>
                          <TableBody>
                            {membroEmails.map(user => (
                              <TableRow key={user.accountId}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm">{user.primaryEmailAddress}</span>
                                    <button onClick={() => copyToClipboard(user.primaryEmailAddress, "Email")} className="opacity-40 hover:opacity-100 transition-opacity">
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{user.displayName || "—"}</TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-end">
                                    <Button variant="ghost" size="icon" onClick={() => setShowDelete(user)}>
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {group.users.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma conta neste servidor</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* MODAL PASSO 1: Escolher servidor */}
        <Dialog open={modalStep === 'select-server'} onOpenChange={(o) => !o && setModalStep(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-400" />
                Escolha o Servidor
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Selecione em qual servidor o novo email será criado:</p>
              {(groups as ServerGroup[]).map((group, idx) => {
                const colors = SERVER_COLORS[idx % SERVER_COLORS.length];
                const isLotado = group.users.length >= 5;
                return (
                  <button
                    key={group.serverId}
                    onClick={() => handleSelectServer(group)}
                    disabled={isLotado}
                    className={`w-full text-left border rounded-xl p-4 transition ${
                      isLotado
                        ? "border-gray-700 bg-gray-900/30 opacity-60 cursor-not-allowed"
                        : `${colors.border} ${colors.bg} hover:opacity-90 cursor-pointer`
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Server className={`w-5 h-5 ${isLotado ? "text-gray-500" : colors.text}`} />
                        <div>
                          <p className={`font-bold text-base ${isLotado ? "text-gray-400" : "text-white"}`}>
                            {group.serverName.toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-400">Contas utilizadas: {group.users.length}/5</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {isLotado ? (
                          <div>
                            <Badge className="bg-red-500/20 text-red-400 text-xs mb-1 block">LOTADO</Badge>
                            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">SEM VAGAS</span>
                          </div>
                        ) : (
                          <div>
                            <Badge className="bg-green-500/20 text-green-400 text-xs mb-1 block">DISPONÍVEL</Badge>
                            <span className={`text-xs font-semibold ${colors.text} bg-gray-800 px-2 py-1 rounded`}>
                              CRIAR NO {group.serverName.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalStep(null)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL PASSO 2: Preencher formulário */}
        <Dialog open={modalStep === 'fill-form'} onOpenChange={(o) => !o && setModalStep(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Conta de Email</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Servidor selecionado */}
              {selectedServer && (() => {
                const idx = (groups as ServerGroup[]).findIndex(g => g.serverId === selectedServer.serverId);
                const colors = SERVER_COLORS[idx % SERVER_COLORS.length];
                return (
                  <div className={`flex items-center justify-between ${colors.bg} border ${colors.border} rounded-lg px-3 py-2`}>
                    <div className="flex items-center gap-2">
                      <Server className={`w-4 h-4 ${colors.text}`} />
                      <span className={`text-sm font-semibold ${colors.text}`}>
                        Servidor: {selectedServer.serverName.toUpperCase()}
                      </span>
                      <Badge className={`text-xs ${colors.badge}`}>{selectedServer.users.length}/5</Badge>
                    </div>
                    {(groups as ServerGroup[]).length > 1 && (
                      <button onClick={handleBackToSelect} className="text-xs text-gray-400 hover:text-white underline">
                        Trocar
                      </button>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-1">
                <Label>Tipo *</Label>
                <select value={form.type}
                  onChange={(e) => setForm(f => ({ ...f, type: e.target.value as 'principal' | 'membro' }))}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm">
                  <option value="principal">📧 Email Principal</option>
                  <option value="membro">👥 Email Membros</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Usuário *</Label>
                <div className="flex items-center gap-1">
                  <Input placeholder="nome.sobrenome" value={form.username}
                    onChange={(e) => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, ".") }))} />
                  <Button variant="outline" size="icon" type="button" onClick={handleGenerateUsername}
                    title="Gerar usuário aleatório único" className="shrink-0">
                    <Shuffle className={`w-4 h-4 ${isGeneratingUsername ? "animate-spin" : ""}`} />
                  </Button>
                  <span className="text-sm font-semibold text-blue-400 whitespace-nowrap">@{selectedDomain}</span>
                </div>
                <p className="text-xs text-muted-foreground">Clique em 🔀 para gerar um usuário aleatório único</p>
              </div>
              <div className="space-y-1">
                <Label>Nome de exibição *</Label>
                <Input placeholder="Ex: João Silva" value={form.displayName}
                  onChange={(e) => setForm(f => ({ ...f, displayName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Primeiro nome</Label>
                  <Input placeholder="João" value={form.firstName}
                    onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Sobrenome</Label>
                  <Input placeholder="Silva" value={form.lastName}
                    onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Senha inicial *</Label>
                <div className="flex gap-2">
                  <Input value={form.password}
                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} />
                  <Button variant="outline" size="icon" type="button"
                    onClick={() => setForm(f => ({ ...f, password: "Walk@@3095" }))} title="Resetar senha">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" type="button"
                    onClick={() => copyToClipboard(form.password, "Senha")} title="Copiar senha">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Mínimo 8 caracteres</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalStep(null)}>Cancelar</Button>
              <Button
                onClick={() => {
                  if (window.confirm(`A conta será criada no servidor ${selectedServer?.serverName?.toUpperCase()}:\n\n${form.username}@${selectedDomain}\n\nConfirmar?`)) {
                    createMutation.mutate({
                      ...form,
                      serverId: selectedServer?.serverId,
                    } as any);
                  }
                }}
                disabled={createMutation.isPending || !form.username || !form.displayName || form.password.length < 8}>
                {createMutation.isPending ? "Criando..." : `Criar Conta`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Conta criada com sucesso */}
        <Dialog open={!!showCreated} onOpenChange={() => setShowCreated(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-green-500 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Conta Criada com Sucesso!
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {showCreated?.serverName && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-center">
                  <p className="text-sm text-green-400 font-semibold">
                    ✅ CONTA CRIADA NO SERVIDOR {showCreated.serverName.toUpperCase()}
                  </p>
                </div>
              )}
              <p className="text-sm text-muted-foreground">Guarde as credenciais e compartilhe com o usuário:</p>
              <div className="bg-muted rounded-lg p-3 space-y-2 font-mono text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Email:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{showCreated?.email}</span>
                    <button onClick={() => copyToClipboard(showCreated?.email ?? "", "Email")}>
                      <Copy className="w-3 h-3 opacity-60 hover:opacity-100" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Senha:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{showCreated?.password}</span>
                    <button onClick={() => copyToClipboard(showCreated?.password ?? "", "Senha")}>
                      <Copy className="w-3 h-3 opacity-60 hover:opacity-100" />
                    </button>
                  </div>
                </div>
              </div>
              <Button className="w-full" variant="outline"
                onClick={() => copyToClipboard(`Email: ${showCreated?.email}\nSenha: ${showCreated?.password}`, "Credenciais")}>
                <Copy className="w-4 h-4 mr-2" /> Copiar tudo
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowCreated(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Confirmar exclusão */}
        <AlertDialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Conta?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir{" "}
                <span className="font-mono font-medium text-foreground">{showDelete?.primaryEmailAddress}</span>?
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => showDelete && deleteMutation.mutate({ email: showDelete.primaryEmailAddress })}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
