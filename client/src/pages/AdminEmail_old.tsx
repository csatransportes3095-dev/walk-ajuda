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
  Mail,
  Plus,
  Trash2,
  KeyRound,
  ExternalLink,
  RefreshCw,
  Power,
  PowerOff,
  Copy,
  Search,
  Shuffle,
  Inbox,
  Users,
  ChevronLeft,
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
}

function formatDate(ts: number) {
  if (!ts || ts === -1) return "�";
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Dados para geração aleatória completa
const FIRST_NAMES = [
  "Ana", "Bruno", "Carlos", "Daniel", "Eduardo", "Fernanda", "Gabriel",
  "Helena", "Igor", "Julia", "Kevin", "Lucas", "Marcos", "Natalia",
  "Olivia", "Paulo", "Rafael", "Sandra", "Thiago", "Vanessa",
  "William", "Xavier", "Yasmin", "Zeca", "Adriana", "Beatriz",
  "Camila", "Diego", "Elisa", "Felipe",
];

const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Costa",
  "Ferreira", "Rodrigues", "Almeida", "Nascimento", "Carvalho",
  "Gomes", "Martins", "Araujo", "Melo", "Barbosa", "Ribeiro",
  "Rocha", "Cardoso", "Mendes", "Castro", "Moreira", "Nunes",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface GeneratedAccount {
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  password: string;
}

function generateFullAccount(existingEmails: string[]): GeneratedAccount {
  const existingUsernames = new Set(
    existingEmails.map((e) => e.split("@")[0].toLowerCase())
  );

  let username = "";
  let firstName = "";
  let lastName = "";

  // Tentar gerar username único baseado em nome real
  for (let attempt = 0; attempt < 50; attempt++) {
    firstName = pick(FIRST_NAMES);
    lastName = pick(LAST_NAMES);
    const num = Math.floor(Math.random() * 900) + 100; // 100-999
    const candidate = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${num}`;
    if (!existingUsernames.has(candidate)) {
      username = candidate;
      break;
    }
  }

  // Fallback se não encontrou
  if (!username) {
    username = `user_${Date.now().toString(36).slice(-5)}`;
    firstName = pick(FIRST_NAMES);
    lastName = pick(LAST_NAMES);
  }

  const displayName = `${firstName} ${lastName}`;
  const password = generatePassword();

  return { username, firstName, lastName, displayName, password };
}

function generatePassword() {
  return "Walk@@3095";
}

export default function AdminEmail() {
  const utils = trpc.useUtils();

  const { data: users = [], isLoading, refetch } = trpc.email.list.useQuery();

  const [activeTab, setActiveTab] = useState<'contas' | 'inbox'>('contas');
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Inbox state
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFolderId] = useState<string>('inbox');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const { data: mailAccounts = [] } = trpc.email.listAccounts.useQuery(
    undefined,
    { enabled: activeTab === 'inbox' }
  );

  const { data: messages = [], isLoading: loadingMessages, refetch: refetchMessages } = trpc.email.listMessages.useQuery(
    { accountId: selectedAccountId ?? '', folderId: selectedFolderId, limit: 30 },
    { enabled: !!selectedAccountId && activeTab === 'inbox' }
  );

  const { data: messageContent, isLoading: loadingContent } = trpc.email.getMessage.useQuery(
    { accountId: selectedAccountId ?? '', messageId: selectedMessageId ?? '' },
    { enabled: !!selectedAccountId && !!selectedMessageId }
  );

  const markReadMutation = trpc.email.markRead.useMutation({
    onSuccess: () => refetchMessages(),
  });

  const handleOpenMessage = (msgId: string, isUnread: boolean) => {
    setSelectedMessageId(msgId);
    if (isUnread && selectedAccountId) {
      markReadMutation.mutate({ accountId: selectedAccountId, messageId: msgId });
    }
  };
  const [showReset, setShowReset] = useState<ZohoUser | null>(null);
  const [showDelete, setShowDelete] = useState<ZohoUser | null>(null);
  const [showCreated, setShowCreated] = useState<{
    email: string;
    password: string;
  } | null>(null);

  // Form state
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: generatePassword(),
    firstName: "",
    lastName: "",
  });
  const [resetPassword, setResetPassword] = useState(generatePassword());
  const [isGeneratingUsername, setIsGeneratingUsername] = useState(false);

  const handleGenerateUsername = useCallback(() => {
    setIsGeneratingUsername(true);
    const existingEmails = users.map((u) => u.primaryEmailAddress);
    const generated = generateFullAccount(existingEmails);
    setForm({
      username: generated.username,
      displayName: generated.displayName,
      firstName: generated.firstName,
      lastName: generated.lastName,
      password: generated.password,
    });
    setTimeout(() => setIsGeneratingUsername(false), 400);
  }, [users]);

  const createMutation = trpc.email.create.useMutation({
    onSuccess: (data) => {
      const email = data.user?.primaryEmailAddress ?? `${form.username}@h2colombiano.com`;
      const pwd = form.password;
      setShowCreated({ email, password: pwd });
      setShowCreate(false);
      setForm({ username: "", displayName: "", password: generatePassword(), firstName: "", lastName: "" });
      utils.email.list.invalidate();
      toast.success("Conta criada com sucesso!");
    },
    onError: (e) => toast.error("Erro ao criar conta: " + e.message),
  });

  const deleteMutation = trpc.email.delete.useMutation({
    onSuccess: () => {
      setShowDelete(null);
      utils.email.list.invalidate();
      toast.success("Conta excluída com sucesso");
    },
    onError: (e) => toast.error("Erro ao excluir conta: " + e.message),
  });

  const resetMutation = trpc.email.resetPassword.useMutation({
    onSuccess: () => {
      setShowReset(null);
      toast.success("Senha redefinida com sucesso!");
    },
    onError: (e) => toast.error("Erro ao redefinir senha: " + e.message),
  });

  const toggleMutation = trpc.email.toggle.useMutation({
    onSuccess: () => {
      utils.email.list.invalidate();
      toast.success("Status atualizado");
    },
    onError: (e) => toast.error("Erro ao alterar status: " + e.message),
  });

  const filtered = users.filter(
    (u) =>
      u.primaryEmailAddress.toLowerCase().includes(search.toLowerCase()) ||
      u.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copiado!`);
    });
  };

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
            <h1 className="text-2xl font-bold">Emails @h2colombiano.com</h1>
            <p className="text-sm text-muted-foreground">
              {users.length} conta{users.length !== 1 ? "s" : ""} cadastrada{users.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("https://mail.zoho.com", "_blank")}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Abrir Webmail
          </Button>
          {activeTab === 'contas' && (
            <>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Conta
              </Button>
            </>
          )}
          {activeTab === 'inbox' && selectedAccountId && (
            <Button variant="outline" size="sm" onClick={() => refetchMessages()} disabled={loadingMessages}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingMessages ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-muted/30 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('contas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'contas' ? 'bg-blue-600 text-white shadow' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-4 h-4" />
          Contas
        </button>
        <button
          onClick={() => setActiveTab('inbox')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'inbox' ? 'bg-blue-600 text-white shadow' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Inbox className="w-4 h-4" />
          Inbox
        </button>
      </div>

      {activeTab === 'inbox' && (
        <div className="space-y-4">
          {/* Seletor de conta */}
          {!selectedAccountId ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Selecione uma conta para ver o inbox:</p>
              <div className="grid gap-2">
                {mailAccounts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando contas...</div>
                ) : mailAccounts.map((acc: any) => {
                  const email = acc.emailAddress?.find((e: any) => e.isPrimary)?.mailId ?? acc.incomingUserName;
                  return (
                    <button
                      key={acc.accountId}
                      onClick={() => { setSelectedAccountId(acc.accountId); setSelectedMessageId(null); }}
                      className="flex items-center gap-3 p-3 bg-muted/20 border border-border rounded-lg hover:bg-muted/40 transition-all text-left"
                    >
                      <div className="p-2 bg-blue-500/10 rounded-full">
                        <Mail className="w-4 h-4 text-blue-500" />
                      </div>
                      <span className="font-mono text-sm">{email}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : selectedMessageId ? (
            /* Leitura de mensagem */
            <div className="space-y-3">
              <button
                onClick={() => setSelectedMessageId(null)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar para inbox
              </button>
              {loadingContent ? (
                <div className="text-center py-8 text-muted-foreground">Carregando mensagem...</div>
              ) : messageContent ? (
                <div className="bg-muted/10 border border-border rounded-lg p-4 space-y-3">
                  <div className="space-y-1 border-b border-border pb-3">
                    <h2 className="text-lg font-semibold">{(messageContent as any).subject}</h2>
                    <p className="text-sm text-muted-foreground">De: {(messageContent as any).fromAddress}</p>
                    <p className="text-sm text-muted-foreground">Para: {(messageContent as any).toAddress}</p>
                    <p className="text-xs text-muted-foreground">{new Date(Number((messageContent as any).receivedTime)).toLocaleString('pt-BR')}</p>
                  </div>
                  <div
                    className="prose prose-invert max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: (messageContent as any).htmlContent ?? (messageContent as any).content ?? '' }}
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">Mensagem não encontrada</div>
              )}
            </div>
          ) : (
            /* Lista de mensagens */
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setSelectedAccountId(null); setSelectedMessageId(null); }}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Trocar conta
                </button>
                <span className="text-sm text-muted-foreground">|</span>
                <span className="text-sm font-mono text-blue-400">
                  {mailAccounts.find((a: any) => a.accountId === selectedAccountId)
                    ?.emailAddress?.find((e: any) => e.isPrimary)?.mailId ?? selectedAccountId}
                </span>
              </div>
              {loadingMessages ? (
                <div className="text-center py-8 text-muted-foreground">Carregando mensagens...</div>
              ) : (messages as any[]).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Inbox className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhuma mensagem no inbox</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {(messages as any[]).map((msg) => {
                    const isUnread = msg.status === '0';
                    return (
                      <button
                        key={msg.messageId}
                        onClick={() => handleOpenMessage(msg.messageId, isUnread)}
                        className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left hover:bg-muted/30 ${
                          isUnread ? 'border-blue-500/30 bg-blue-500/5' : 'border-border bg-muted/10'
                        }`}
                      >
                        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${isUnread ? 'bg-blue-500' : 'bg-transparent'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm truncate ${isUnread ? 'font-semibold' : 'font-normal text-muted-foreground'}`}>
                              {msg.fromAddress}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {new Date(Number(msg.receivedTime)).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <p className={`text-sm truncate ${isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {msg.subject || '(sem assunto)'}
                          </p>
                          {msg.summary && (
                            <p className="text-xs text-muted-foreground truncate">{msg.summary}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'contas' && (
      <>
      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por email ou nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabela */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>�altimo acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Carregando contas...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {search ? "Nenhuma conta encontrada" : "Nenhuma conta cadastrada"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => (
                <TableRow key={user.accountId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{user.primaryEmailAddress}</span>
                      <button
                        onClick={() => copyToClipboard(user.primaryEmailAddress, "Email")}
                        className="opacity-40 hover:opacity-100 transition-opacity"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>{user.displayName || "�"}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "super_admin" ? "default" : "secondary"}>
                      {user.role === "super_admin" ? "Super Admin" : user.role === "admin" ? "Admin" : "Membro"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.enabled ? "default" : "destructive"}>
                      {user.enabled ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(user.accountCreationTime)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(user.lastLogin)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={user.enabled ? "Desativar conta" : "Ativar conta"}
                        onClick={() =>
                          toggleMutation.mutate({ email: user.primaryEmailAddress, enabled: !user.enabled })
                        }
                        disabled={user.role === "super_admin"}
                      >
                        {user.enabled ? (
                          <PowerOff className="w-4 h-4 text-orange-500" />
                        ) : (
                          <Power className="w-4 h-4 text-green-500" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Redefinir senha"
                        onClick={() => {
                          setResetPassword(generatePassword());
                          setShowReset(user);
                        }}
                      >
                        <KeyRound className="w-4 h-4 text-blue-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir conta"
                        onClick={() => setShowDelete(user)}
                        disabled={user.role === "super_admin"}
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

      {/* Modal: Criar conta */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Conta de Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Usuário *</Label>
              <div className="flex items-center gap-1">
                <Input
                  placeholder="nome.sobrenome"
                  value={form.username}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, ".") }))
                  }
                />
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={handleGenerateUsername}
                  title="Gerar usuário aleatório único"
                  className="shrink-0"
                >
                  <Shuffle className={`w-4 h-4 ${isGeneratingUsername ? "animate-spin" : ""}`} />
                </Button>
                <span className="text-sm text-muted-foreground whitespace-nowrap">@h2colombiano.com</span>
              </div>
              <p className="text-xs text-muted-foreground">Clique em �x� para gerar um usuário aleatório único</p>
            </div>
            <div className="space-y-1">
              <Label>Nome de exibição *</Label>
              <Input
                placeholder="Ex: João Silva"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Primeiro nome</Label>
                <Input
                  placeholder="João"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Sobrenome</Label>
                <Input
                  placeholder="Silva"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Senha inicial *</Label>
              <div className="flex gap-2">
                <Input
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}
                  title="Gerar nova senha"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={() => copyToClipboard(form.password, "Senha")}
                  title="Copiar senha"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={
                createMutation.isPending ||
                !form.username ||
                !form.displayName ||
                form.password.length < 8
              }
            >
              {createMutation.isPending ? "Criando..." : "Criar Conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Conta criada com sucesso */}
      <Dialog open={!!showCreated} onOpenChange={() => setShowCreated(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-green-600">�S& Conta Criada!</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Guarde as credenciais abaixo e compartilhe com o usuário:
            </p>
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
            <Button
              className="w-full"
              variant="outline"
              onClick={() =>
                copyToClipboard(
                  `Email: ${showCreated?.email}\nSenha: ${showCreated?.password}`,
                  "Credenciais"
                )
              }
            >
              <Copy className="w-4 h-4 mr-2" />
              Copiar tudo
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowCreated(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Redefinir senha */}
      <Dialog open={!!showReset} onOpenChange={() => setShowReset(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Conta: <span className="font-mono font-medium">{showReset?.primaryEmailAddress}</span>
            </p>
            <div className="space-y-1">
              <Label>Nova senha *</Label>
              <div className="flex gap-2">
                <Input
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={() => setResetPassword(generatePassword())}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={() => copyToClipboard(resetPassword, "Senha")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReset(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                resetMutation.mutate({
                  email: showReset!.primaryEmailAddress,
                  newPassword: resetPassword,
                })
              }
              disabled={resetMutation.isPending || resetPassword.length < 8}
            >
              {resetMutation.isPending ? "Salvando..." : "Redefinir Senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmar exclusão */}
      <AlertDialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta de email?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta <span className="font-mono font-medium">{showDelete?.primaryEmailAddress}</span> será
              permanentemente excluída. Todos os emails serão perdidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ email: showDelete!.primaryEmailAddress })}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
      )}
    </div>
    </div>
  );
}
