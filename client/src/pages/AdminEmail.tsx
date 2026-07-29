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
  ExternalLink,
  RefreshCw,
  Copy,
  Search,
  Shuffle,
  Server,
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
  users: ZohoUser[];
}

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

function generateFullAccount(existingEmails: string[]) {
  const existingUsernames = new Set(existingEmails.map((e) => e.split("@")[0].toLowerCase()));
  let username = "", firstName = "", lastName = "";
  for (let attempt = 0; attempt < 50; attempt++) {
    firstName = pick(FIRST_NAMES);
    lastName = pick(LAST_NAMES);
    const num = Math.floor(Math.random() * 900) + 100;
    const candidate = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${num}`;
    if (!existingUsernames.has(candidate)) { username = candidate; break; }
  }
  if (!username) {
    username = `user_${Date.now().toString(36).slice(-5)}`;
    firstName = pick(FIRST_NAMES);
    lastName = pick(LAST_NAMES);
  }
  return { username, firstName, lastName, displayName: `${firstName} ${lastName}`, password: "Walk@@3095" };
}

// Cores por servidor
const SERVER_COLORS = [
  { border: "border-blue-500/40", bg: "bg-blue-500/10", text: "text-blue-400", badge: "bg-blue-500/20 text-blue-300" },
  { border: "border-purple-500/40", bg: "bg-purple-500/10", text: "text-purple-400", badge: "bg-purple-500/20 text-purple-300" },
  { border: "border-green-500/40", bg: "bg-green-500/10", text: "text-green-400", badge: "bg-green-500/20 text-green-300" },
  { border: "border-orange-500/40", bg: "bg-orange-500/10", text: "text-orange-400", badge: "bg-orange-500/20 text-orange-300" },
];

export default function AdminEmail() {
  const utils = trpc.useUtils();

  const { data: groups = [], isLoading, refetch } = trpc.email.list.useQuery();

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState<ZohoUser | null>(null);
  const [showCreated, setShowCreated] = useState<{ email: string; password: string } | null>(null);

  const [form, setForm] = useState({
    username: "", displayName: "", password: "Walk@@3095",
    firstName: "", lastName: "", type: 'membro' as 'principal' | 'membro',
  });
  const [isGeneratingUsername, setIsGeneratingUsername] = useState(false);

  // Todos os emails para geração de username único
  const allEmails = (groups as ServerGroup[]).flatMap(g => g.users.map(u => u.primaryEmailAddress));
  const totalCount = allEmails.length;

  const handleGenerateUsername = useCallback(() => {
    setIsGeneratingUsername(true);
    const generated = generateFullAccount(allEmails);
    setForm(f => ({ ...f, ...generated }));
    setTimeout(() => setIsGeneratingUsername(false), 400);
  }, [allEmails]);

  const createMutation = trpc.email.create.useMutation({
    onSuccess: (data) => {
      const email = (data as any).user?.primaryEmailAddress ?? `${form.username}@walkajuda.com`;
      setShowCreated({ email, password: form.password });
      setShowCreate(false);
      setForm({ username: "", displayName: "", password: "Walk@@3095", firstName: "", lastName: "", type: 'membro' });
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado!`));
  };

  // Filtrar por pesquisa
  const filteredGroups = (groups as ServerGroup[]).map(group => ({
    ...group,
    users: group.users.filter(u =>
      u.primaryEmailAddress.toLowerCase().includes(search.toLowerCase()) ||
      u.displayName.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(g => g.users.length > 0 || !search);

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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open("https://mail.zoho.com", "_blank")}>
              <ExternalLink className="w-4 h-4 mr-2" /> Abrir Webmail
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button onClick={() => setShowCreate(true)}>
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

              return (
                <div key={group.serverId} className={`border ${colors.border} rounded-xl overflow-hidden`}>
                  {/* Cabeçalho do servidor */}
                  <div className={`${colors.bg} px-4 py-3 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <Server className={`w-4 h-4 ${colors.text}`} />
                      <span className={`font-semibold ${colors.text}`}>{group.serverName}</span>
                      <Badge className={`text-xs ${colors.badge}`}>
                        {group.users.length}/5 contas
                      </Badge>
                    </div>
                    {group.users.length >= 5 && (
                      <Badge className="bg-red-500/20 text-red-400 text-xs">Lotado</Badge>
                    )}
                  </div>

                  {/* Tabela de emails */}
                  <div className="divide-y divide-gray-800">
                    {/* Email Principal */}
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
                                    <button onClick={() => copyToClipboard(user.primaryEmailAddress, "Email")}
                                      className="opacity-40 hover:opacity-100 transition-opacity">
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{user.displayName || "—"}</TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" title="Excluir conta"
                                      onClick={() => setShowDelete(user)}>
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

                    {/* Email Membros */}
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
                                    <button onClick={() => copyToClipboard(user.primaryEmailAddress, "Email")}
                                      className="opacity-40 hover:opacity-100 transition-opacity">
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{user.displayName || "—"}</TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" title="Excluir conta"
                                      onClick={() => setShowDelete(user)}>
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

                    {/* Sem emails neste servidor */}
                    {group.users.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Nenhuma conta neste servidor
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal: Criar conta */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Conta de Email</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
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
                  <span className="text-sm text-muted-foreground whitespace-nowrap">@walkajuda.com</span>
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
                    onClick={() => setForm(f => ({ ...f, password: "Walk@@3095" }))} title="Gerar nova senha">
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
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate(form as any)}
                disabled={createMutation.isPending || !form.username || !form.displayName || form.password.length < 8}>
                {createMutation.isPending ? "Criando..." : "Criar Conta"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Conta criada */}
        <Dialog open={!!showCreated} onOpenChange={() => setShowCreated(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-green-600">✅ Conta Criada!</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
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
