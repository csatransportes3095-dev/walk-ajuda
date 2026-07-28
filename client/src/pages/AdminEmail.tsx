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
  type?: 'principal' | 'membro';
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

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
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
    type: 'membro' as 'principal' | 'membro',
  });
  const [isGeneratingUsername, setIsGeneratingUsername] = useState(false);

  const handleGenerateUsername = useCallback(() => {
    setIsGeneratingUsername(true);
    const existingEmails = users.map((u) => u.primaryEmailAddress);
    const generated = generateFullAccount(existingEmails);
    setForm((f) => ({
      ...f,
      username: generated.username,
      displayName: generated.displayName,
      firstName: generated.firstName,
      lastName: generated.lastName,
      password: generated.password,
    }));
    setTimeout(() => setIsGeneratingUsername(false), 400);
  }, [users]);

  const createMutation = trpc.email.create.useMutation({
    onSuccess: (data) => {
      const email = data.user?.primaryEmailAddress ?? `${form.username}@walkajuda.com`;
      const pwd = form.password;
      setShowCreated({ email, password: pwd });
      setShowCreate(false);
      setForm({ username: "", displayName: "", password: generatePassword(), firstName: "", lastName: "", type: 'membro' });
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
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copiado!`);
    });
  };

  // Agrupar por tipo
  const filtered = users.filter(
    (u) =>
      u.primaryEmailAddress.toLowerCase().includes(search.toLowerCase()) ||
      u.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const principalEmails = filtered.filter(u => u.type === 'principal');
  const membroEmails = filtered.filter(u => u.type !== 'principal');

  const renderEmailsTable = (emails: ZohoUser[], sectionTitle: string) => {
    if (emails.length === 0) return null;

    return (
      <div key={sectionTitle} className="space-y-3">
        <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
          {sectionTitle === '📧 Email Principal' ? '📧' : '👥'} {sectionTitle}
        </h3>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((user) => (
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
                  <TableCell>{user.displayName || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir conta"
                        onClick={() => setShowDelete(user)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
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
              <h1 className="text-2xl font-bold">Emails @walkajuda.com</h1>
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
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Conta
            </Button>
          </div>
        </div>

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

        {/* Tabelas por tipo */}
        <div className="space-y-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando contas...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? "Nenhuma conta encontrada" : "Nenhuma conta cadastrada"}
            </div>
          ) : (
            <>
              {renderEmailsTable(principalEmails, '📧 Email Principal')}
              {renderEmailsTable(membroEmails, '👥 Email Membros')}
            </>
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
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      type: e.target.value as 'principal' | 'membro',
                    }))
                  }
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                >
                  <option value="principal">📧 Email Principal</option>
                  <option value="membro">👥 Email Membros</option>
                </select>
              </div>
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
                  <span className="text-sm text-muted-foreground whitespace-nowrap">@walkajuda.com</span>
                </div>
                <p className="text-xs text-muted-foreground">Clique em 🔀 para gerar um usuário aleatório único</p>
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
                onClick={() => createMutation.mutate(form as any)}
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
              <DialogTitle className="text-green-600">✅ Conta Criada!</DialogTitle>
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

        {/* Modal: Confirmar exclusão */}
        <AlertDialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Conta?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir{" "}
                <span className="font-mono font-medium text-foreground">
                  {showDelete?.primaryEmailAddress}
                </span>
                ? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => showDelete && deleteMutation.mutate({ email: showDelete.primaryEmailAddress })}
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
