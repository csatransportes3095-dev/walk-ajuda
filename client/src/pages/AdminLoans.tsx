import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle, Clock,
  Plus, Search, Eye, CheckCircle, XCircle, ChevronDown, ChevronUp,
  Settings, Banknote, RefreshCw, ExternalLink, Trash2, RotateCcw,
  Paperclip, Download, Pencil, ImageIcon, FileText, X
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt(val: any) {
  return parseFloat(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  return `${day}/${m}/${y}`;
}
function fmtDateTime(ts: number | string | Date | null | undefined) {
  if (!ts) return "\u2014";
  // O banco retorna paidAt como string "2026-07-18 20:00:49" (sem Z, sem T) via drizzle raw SQL.
  // Sem o Z, new Date() interpreta como horário LOCAL do browser, causando erro.
  // Solução: se é string sem Z/offset, adicionar 'Z' para forçar interpretação como UTC.
  let d: Date;
  if (ts instanceof Date) {
    d = ts;
  } else if (typeof ts === 'string') {
    // Se não tem Z, T, + ou offset, é string do banco em UTC
    const s = ts.includes('T') || ts.includes('Z') || ts.includes('+') ? ts : ts.replace(' ', 'T') + 'Z';
    d = new Date(s);
  } else {
    d = new Date(ts);
  }
  // Converte UTC para BRT (UTC-3)
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const dd = String(brt.getUTCDate()).padStart(2, '0');
  const mm = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = brt.getUTCFullYear();
  const hh = String(brt.getUTCHours()).padStart(2, '0');
  const min = String(brt.getUTCMinutes()).padStart(2, '0');
  const ss = String(brt.getUTCSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}:${ss}`;
}

const LOAN_STATUS_COLORS: Record<string, string> = {
  pendente:             "bg-blue-500/20 text-blue-300 border-blue-500/30",
  aprovado:             "bg-green-500/20 text-green-300 border-green-500/30",
  aguardando_pagamento: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  em_analise:           "bg-purple-500/20 text-purple-300 border-purple-500/30",
  pago:                 "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  cancelado:            "bg-gray-500/20 text-gray-400 border-gray-500/30",
  reprovado:            "bg-red-500/20 text-red-300 border-red-500/30",
};
const LOAN_STATUS_LABELS: Record<string, string> = {
  pendente:             "Aguardando aprovação",
  aprovado:             "Aprovado",
  aguardando_pagamento: "Aguardando pagamento",
  em_analise:           "Comprovante em análise",
  pago:                 "Pago",
  cancelado:            "Cancelado",
  reprovado:            "Reprovado",
};
const INST_STATUS_COLORS: Record<string, string> = {
  vence_hoje:  "bg-amber-500/30 text-amber-200 border-amber-400/50",
  pendente:    "bg-yellow-500/20 text-yellow-300",
  em_analise:  "bg-purple-500/20 text-purple-300 border-purple-400/50",
  pago:        "bg-emerald-500/20 text-emerald-300",
  atrasado:    "bg-red-500/20 text-red-300",
  pago_juros:  "bg-orange-500/20 text-orange-300 border-orange-400/50",
};

type TabId = "dashboard" | "loans" | "clients" | "profiles" | "pix" | "access" | "latefee" | "financeiro" | "proofhistory";

export default function AdminLoans() {
  const [tab, setTab] = useState<TabId>("dashboard");
  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Empréstimos" icon="💳" backTo="/admin/codes" />
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {([
            ["dashboard", "📊 Dashboard"],
            ["loans",     "💰 Empréstimos"],
            ["clients",   "👥 Clientes"],
            ["access",    "🔐 Controle de Acesso"],
            ["profiles",  "⭐ Perfis"],
            ["pix",       "🏦 PIX"],
            ["latefee",   "⚠️ Taxas & Regras"],
            ["financeiro", "📈 Análise Financeira"],
            ["proofhistory", "📎 Comprovantes"],
          ] as [TabId, string][]).map(([id, label]) => (
            <Button key={id} size="sm" variant={tab === id ? "default" : "outline"}
              className={tab !== id ? "bg-transparent border-border text-muted-foreground hover:text-foreground" : ""}
              onClick={() => setTab(id)}>
              {label}
            </Button>
          ))}
        </div>

        {tab === "dashboard" && <DashboardTab />}
        {tab === "loans"     && <LoansTab />}
        {tab === "clients"   && <ClientsTab />}
        {tab === "access"    && <AccessControlTab />}
        {tab === "profiles"  && <ProfilesTab />}
        {tab === "pix"       && <PixTab />}
        {tab === "latefee"  && <LateFeeTab />}
        {tab === "financeiro" && <FinanceiroTab />}
        {tab === "proofhistory" && <ProofHistoryTab />}
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function DashboardTab() {
  const { data, isLoading } = trpc.loans.getDashboard.useQuery();
  const { data: proofStats } = trpc.loans.getProofDashboardStats.useQuery();
  if (isLoading) return <div className="text-center py-12 text-muted-foreground"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></div>;
  if (!data) return null;

  const cards = [
    { label: "📅 A Receber Hoje",        value: fmt(data.totalDueToday ?? 0),     color: "text-amber-400",   icon: <Clock className="w-5 h-5" />,         tooltip: "Soma das parcelas que vencem hoje (ainda pendentes)" },
    { label: "✅ Recebido Hoje",         value: fmt(data.totalReceivedToday ?? 0),color: "text-emerald-400", icon: <CheckCircle className="w-5 h-5" />,   tooltip: "Soma das parcelas confirmadas como pagas hoje" },
    { label: "💰 Total Emprestado",      value: fmt(data.totalLent),              color: "text-blue-400",    icon: <TrendingUp className="w-5 h-5" />,    tooltip: "Capital que saiu do caixa" },
    { label: "📈 Total Previsto",        value: fmt(data.totalExpected),          color: "text-cyan-400",    icon: <TrendingUp className="w-5 h-5" />,    tooltip: "Capital + juros de todos os empréstimos" },
    { label: "✅ Total Recebido",        value: fmt(data.totalReceived),          color: "text-green-400",   icon: <DollarSign className="w-5 h-5" />,    tooltip: "Soma das parcelas já pagas" },
    { label: "⏳ Valor em Aberto",       value: fmt(data.valorEmAberto),          color: "text-yellow-400",  icon: <Clock className="w-5 h-5" />,         tooltip: "Total Previsto − Total Recebido (ainda na rua)" },
    { label: "💵 Lucro Recebido",        value: fmt(data.totalInterestReceived),  color: "text-emerald-400", icon: <DollarSign className="w-5 h-5" />,    tooltip: "Juros já recebidos" },
    { label: "👥 Empréstimos Ativos",    value: String(data.activeCount),         color: "text-purple-400",  icon: <Users className="w-5 h-5" />,         tooltip: "Empréstimos em andamento" },
    { label: "⚠️ Inadimplentes",         value: String(data.overdueClientsCount), color: "text-orange-400",  icon: <AlertTriangle className="w-5 h-5" />, tooltip: "Empréstimos com parcelas vencidas" },
    { label: "🚨 Valor Vencido",         value: fmt(data.totalOverdue),           color: "text-red-400",     icon: <TrendingDown className="w-5 h-5" />,  tooltip: "Parcelas vencidas não pagas" },
    { label: "📊 Lucro Total Previsto",   value: fmt(data.totalExpectedProfit),    color: "text-teal-400",    icon: <TrendingUp className="w-5 h-5" />,    tooltip: "Soma dos juros de todos os empréstimos ativos" },
    { label: "💵 Lucro a Receber",        value: fmt((data as any).lucroAReceber ?? 0), color: "text-lime-400",  icon: <DollarSign className="w-5 h-5" />,    tooltip: "Juros ainda pendentes de recebimento dos empréstimos ativos." },
  ];

  const proofCards = [
    { label: "📎 Com Comprovante",     value: String(proofStats?.withProof ?? 0),      color: "text-blue-400",   tooltip: "Pagamentos com comprovante anexado" },
    { label: "⚠️ Sem Comprovante",    value: String(proofStats?.withoutProof ?? 0),   color: "text-amber-400",  tooltip: "Pagamentos confirmados sem comprovante" },
    { label: "📅 Comprovantes no Mês", value: String(proofStats?.thisMonthProofs ?? 0), color: "text-emerald-400", tooltip: "Comprovantes anexados no mês atual" },
    { label: "🔍 Aguardando Conferência", value: String(proofStats?.awaitingReview ?? 0), color: "text-purple-400",  tooltip: "Parcelas com comprovante enviado pelo cliente aguardando confirmação" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-3 bg-card/60 border-border" title={c.tooltip}>
            <div className={`flex items-center gap-2 mb-1 ${c.color}`}>{c.icon}<span className="text-xs text-muted-foreground">{c.label}</span></div>
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
            {c.tooltip && <p className="text-xs text-muted-foreground/50 mt-1 leading-tight">{c.tooltip}</p>}
          </Card>
        ))}
      </div>
      {/* Cards de comprovantes */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Comprovantes de Pagamento</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {proofCards.map((c) => (
            <Card key={c.label} className="p-3 bg-card/60 border-border" title={c.tooltip}>
              <div className={`flex items-center gap-2 mb-1 ${c.color}`}><Paperclip className="w-4 h-4" /><span className="text-xs text-muted-foreground">{c.label}</span></div>
              <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
              {c.tooltip && <p className="text-xs text-muted-foreground/50 mt-1 leading-tight">{c.tooltip}</p>}
            </Card>
          ))}
        </div>
      </div>
      {data.monthlyChart.length > 0 && (
        <Card className="p-4 bg-card/60 border-border">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Emprestado × Recebido (últimos 6 meses)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.monthlyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#888" }} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "#1a1a2e", border: "1px solid #333" }} />
              <Legend />
              <Bar dataKey="lent" fill="#3b82f6" name="Emprestado" radius={[3, 3, 0, 0]} />
              <Bar dataKey="received" fill="#22c55e" name="Recebido" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// ─── Pagamento Só de Juros (Admin) ──────────────────────────────────────────
function InterestOnlySection({ loan }: { loan: any }) {
  const utils = trpc.useUtils();

  const toggleMutation = trpc.loans.toggleInterestOnly.useMutation({
    onSuccess: () => { toast.success(loan.interestOnlyEnabled ? "Função desativada" : "Função ativada! Botão 'Cobrar Juros' aparecerá nas parcelas vencidas."); utils.loans.listLoans.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const { data: history = [] } = trpc.loans.getInterestOnlyHistory.useQuery({ loanId: loan.id });

  return (
    <div className="mt-4 border-t border-amber-500/20 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-amber-400">Pagamento Só de Juros</span>
          <Badge variant="outline" className={`text-xs ${loan.interestOnlyEnabled ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-muted text-muted-foreground"}`}>
            {loan.interestOnlyEnabled ? "Ativado" : "Desativado"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{loan.interestOnlyEnabled ? "Desativar" : "Ativar"}</span>
          <Switch
            checked={!!loan.interestOnlyEnabled}
            onCheckedChange={(v) => toggleMutation.mutate({ loanId: loan.id, enabled: v })}
            disabled={toggleMutation.isPending}
          />
        </div>
      </div>

      {loan.interestOnlyEnabled && (
        <>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm">
            <p className="text-amber-300 text-xs">&#128161; Com esta função ativada, o botão <strong>"Cobrar Juros"</strong> aparecerá diretamente em cada parcela vencida acima. Clique nele para cobrar os juros da parcela específica e rolar a dívida para a próxima data.</p>
          </div>

          {(history as any[]).filter((h: any) => h.status === "pago_juros" || h.status === "pago").length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Histórico de juros cobrados:</p>
              {(history as any[]).filter((h: any) => h.status === "pago_juros" || h.status === "pago").map((h: any) => (
                <div key={h.id} className="flex justify-between text-xs bg-muted/20 rounded px-2 py-1">
                  <span className="text-amber-400">⚠️ Juros rolados: {fmt(h.amount)}</span>
                  <span className="text-muted-foreground">Parcela #{h.installmentNumber} — {fmtDate(h.dueDate)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Helper: ler arquivo como base64 ─────────────────────────────────────────
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

// ─── Empréstimos ─────────────────────────────────────────────────────────────
function LoansTab() {
  const [search, setSearch] = useState("");
  const [loanTab, setLoanTab] = useState<"ativos" | "finalizados" | "aguardando_pagamento" | "atrasado" | "em_analise" | "pago_hoje" | "todos">("ativos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedLoan, setExpandedLoan] = useState<number | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ id: number; clientName: string; clientPhone?: string; clientEmail?: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectEmailInput, setRejectEmailInput] = useState("");
  const [rejectEmailSending, setRejectEmailSending] = useState(false);
  const [rejectWaSending, setRejectWaSending] = useState(false);
  const [editLoanData, setEditLoanData] = useState<any | null>(null);
  const [approvalNotifyModal, setApprovalNotifyModal] = useState<any | null>(null); // loan object
  const [installmentNotifyModal, setInstallmentNotifyModal] = useState<{ loan: any; inst: any } | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<{ loanId: number; clientName: string; currentWorkDays: string; pendingCount: number } | null>(null);
  const [rescheduleWorkDays, setRescheduleWorkDays] = useState<"seg_sab" | "seg_dom">("seg_sab");
  const [rescheduleResult, setRescheduleResult] = useState<{ rescheduled: number; preview: any[] } | null>(null);
  const rescheduleInstallments = trpc.loans.rescheduleInstallments.useMutation();

  // Modal de Cobrar Juros por parcela individual
  const [interestOnlyInstModal, setInterestOnlyInstModal] = useState<{ inst: any; loan: any } | null>(null);
  const payInterestOnlyMut = trpc.loans.payInterestOnly.useMutation({
    onSuccess: (data) => {
      toast.success(`Juros de ${fmt(data.cycleInterest)} registrados! Nova parcela vence em ${fmtDate(data.newDueDate)}`);
      setInterestOnlyInstModal(null);
      utils.loans.listLoans.invalidate();
      utils.loans.getLoan.invalidate({ id: interestOnlyInstModal?.loan?.id });
      utils.loans.getDashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Estado do modal de pagamento manual com comprovante
  const [paymentModal, setPaymentModal] = useState<{ inst: any; loanId: number } | null>(null);
  const [pmAmountPaid, setPmAmountPaid] = useState("");
  // Data de hoje no fuso de São Paulo (GMT-3)
  const todayBRT = () => new Date(new Date().getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [pmPaidAt, setPmPaidAt] = useState(todayBRT);
  const [pmObservation, setPmObservation] = useState("");
  const [pmFile, setPmFile] = useState<File | null>(null);
  const [pmFilePreview, setPmFilePreview] = useState<string | null>(null);
  const [pmUploading, setPmUploading] = useState(false);
  const pmFileRef = useRef<HTMLInputElement>(null);

  // Estado do modal de adicionar/substituir comprovante em parcela já paga
  const [proofModal, setProofModal] = useState<{ inst: any; mode: 'add' | 'replace' } | null>(null);
  const [prFile, setPrFile] = useState<File | null>(null);
  const [prFilePreview, setPrFilePreview] = useState<string | null>(null);
  const [prUploading, setPrUploading] = useState(false);
  const prFileRef = useRef<HTMLInputElement>(null);

  // Estado do modal de visualização de comprovante
  const [viewProofUrl, setViewProofUrl] = useState<string | null>(null);
  const [viewProofMime, setViewProofMime] = useState<string | null>(null);

  // Estado do modal de exclusão de comprovante
  const [deleteProofModal, setDeleteProofModal] = useState<{ inst: any } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const utils = trpc.useUtils();
  // Mapeia a aba selecionada para o filtro de status
  const tabStatusFilter = loanTab;
  const { data: loans = [], isLoading } = trpc.loans.listLoans.useQuery({ search, status: tabStatusFilter });
  const { data: instData } = trpc.loans.getLoan.useQuery(
    { id: expandedLoan! },
    { enabled: !!expandedLoan }
  );
  // Buscar comprovantes do empréstimo expandido
  const { data: proofsMap = {} } = trpc.loans.getProofsByLoan.useQuery(
    { loanId: expandedLoan! },
    { enabled: !!expandedLoan }
  );

  const approveLoan = trpc.loans.approveLoan.useMutation({
    onSuccess: () => { toast.success("Empréstimo aprovado!"); utils.loans.listLoans.invalidate(); utils.loans.getDashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const rejectLoan = trpc.loans.rejectLoan.useMutation({
    onSuccess: () => { toast.success("Empréstimo reprovado."); setRejectDialog(null); setRejectReason(""); setRejectEmailInput(""); utils.loans.listLoans.invalidate(); utils.loans.getDashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const sendRejectionNotice = trpc.loans.sendRejectionNotice.useMutation({
    onSuccess: (d) => { if (d.sentTo) toast.success(`Notificação enviada para ${d.sentTo}`); },
    onError: (e) => toast.error(e.message),
  });
  const cancelLoan = trpc.loans.cancelLoan.useMutation({
    onSuccess: () => { toast.success("Empréstimo cancelado."); utils.loans.listLoans.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const confirmPayment = trpc.loans.confirmInstallmentPayment.useMutation({
    onSuccess: () => { toast.success("Pagamento confirmado!"); utils.loans.listLoans.invalidate(); utils.loans.getDashboard.invalidate(); utils.loans.getLoan.invalidate({ id: expandedLoan! }); utils.loans.getProofsByLoan.invalidate({ loanId: expandedLoan! }); },
    onError: (e) => toast.error(e.message),
  });
  const confirmPaymentWithProof = trpc.loans.confirmInstallmentPaymentWithProof.useMutation({
    onSuccess: (data) => {
      toast.success(data.hasProof ? "Pagamento confirmado com comprovante!" : "Pagamento confirmado sem comprovante.");
      setPaymentModal(null); setPmAmountPaid(""); setPmObservation(""); setPmFile(null); setPmFilePreview(null);
      utils.loans.listLoans.invalidate(); utils.loans.getDashboard.invalidate();
      utils.loans.getLoan.invalidate({ id: expandedLoan! });
      utils.loans.getProofsByLoan.invalidate({ loanId: expandedLoan! });
    },
    onError: (e) => { toast.error(e.message); setPmUploading(false); },
  });
  const addProofMutation = trpc.loans.addProofToExistingPayment.useMutation({
    onSuccess: () => {
      toast.success("Comprovante adicionado!");
      setProofModal(null); setPrFile(null); setPrFilePreview(null);
      utils.loans.getProofsByLoan.invalidate({ loanId: expandedLoan! });
      utils.loans.getLoan.invalidate({ id: expandedLoan! });
    },
    onError: (e) => { toast.error(e.message); setPrUploading(false); },
  });
  const replaceProofMutation = trpc.loans.replaceInstallmentProof.useMutation({
    onSuccess: () => {
      toast.success("Comprovante substituído!");
      setProofModal(null); setPrFile(null); setPrFilePreview(null);
      utils.loans.getProofsByLoan.invalidate({ loanId: expandedLoan! });
      utils.loans.getLoan.invalidate({ id: expandedLoan! });
    },
    onError: (e) => { toast.error(e.message); setPrUploading(false); },
  });
  const deleteProofMutation = trpc.loans.deleteInstallmentProof.useMutation({
    onSuccess: () => {
      toast.success("Comprovante excluído.");
      setDeleteProofModal(null); setDeleteReason("");
      utils.loans.getProofsByLoan.invalidate({ loanId: expandedLoan! });
      utils.loans.getLoan.invalidate({ id: expandedLoan! });
    },
    onError: (e) => toast.error(e.message),
  });
  const refusePayment = trpc.loans.refuseInstallmentPayment.useMutation({
    onSuccess: () => { toast.success("Comprovante recusado."); utils.loans.listLoans.invalidate(); utils.loans.getLoan.invalidate({ id: expandedLoan! }); utils.loans.getProofsByLoan.invalidate({ loanId: expandedLoan! }); },
    onError: (e) => toast.error(e.message),
  });
  const undoPayment = trpc.loans.undoInstallmentPayment.useMutation({
    onSuccess: () => { toast.success("Pagamento desfeito! Parcela voltou para Pendente."); utils.loans.listLoans.invalidate(); utils.loans.getDashboard.invalidate(); utils.loans.getLoan.invalidate({ id: expandedLoan! }); utils.loans.getProofsByLoan.invalidate({ loanId: expandedLoan! }); },
    onError: (e) => toast.error(e.message),
  });
  const undoInterestOnly = trpc.loans.undoInterestOnly.useMutation({
    onSuccess: () => { toast.success("Cobrança de juros desfeita! Parcela voltou para Pendente."); utils.loans.listLoans.invalidate(); utils.loans.getDashboard.invalidate(); utils.loans.getLoan.invalidate({ id: expandedLoan! }); },
    onError: (e) => toast.error(e.message),
  });
  const deleteLoan = trpc.loans.deleteLoan.useMutation({
    onSuccess: () => { toast.success("Empréstimo excluído."); utils.loans.listLoans.invalidate(); utils.loans.getDashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // ─── Estados e mutations para recibo ────────────────────────────────────────────────────
  const [receiptModal, setReceiptModal] = useState<{ inst: any } | null>(null);
  const [receiptData, setReceiptData] = useState<any | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptEmailInput, setReceiptEmailInput] = useState("");
  const [receiptEmailSending, setReceiptEmailSending] = useState(false);

  // Estado do modal de extrato completo do empréstimo
  const [statementModal, setStatementModal] = useState<{ loanId: number; clientName: string } | null>(null);
  const [statementData, setStatementData] = useState<any | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementEmailInput, setStatementEmailInput] = useState("");
  const [statementEmailSending, setStatementEmailSending] = useState(false);
  const generateReceiptMutation = trpc.loans.generateReceipt.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const sendReceiptEmailMutation = trpc.loans.sendReceiptByEmail.useMutation({
    onSuccess: (d) => toast.success(`Recibo enviado para ${d.sentTo}`),
    onError: (e) => toast.error(e.message),
  });

  // Handler: abrir modal de extrato completo do empréstimo
  const generateStatementMutation = trpc.loans.generateLoanStatement.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const sendStatementEmailMutation = trpc.loans.sendLoanStatementByEmail.useMutation({
    onSuccess: (d) => toast.success(`Extrato enviado para ${d.sentTo}`),
    onError: (e) => toast.error(e.message),
  });

  // ─── Taxa de atraso ────────────────────────────────────────────────────────────
  const { data: lateFeeConfig } = trpc.loans.getLateFeeConfig.useQuery();
  const [feeModal, setFeeModal] = useState<{ inst: any; loanId: number } | null>(null);
  const [feeCustomAmount, setFeeCustomAmount] = useState("");
  const applyLateFee = trpc.loans.applyLateFeeToInstallment.useMutation({
    onSuccess: (d) => {
      toast.success(`Taxa aplicada! Novo valor: R$ ${d.newAmount.toFixed(2).replace('.', ',')}`);
      setFeeModal(null); setFeeCustomAmount("");
      utils.loans.getLoan.invalidate({ id: expandedLoan! });
      utils.loans.listLoans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeLateFee = trpc.loans.removeLateFeeFromInstallment.useMutation({
    onSuccess: (d) => {
      toast.success(`Taxa removida! Valor restaurado: R$ ${d.restoredAmount.toFixed(2).replace('.', ',')}`);
      utils.loans.getLoan.invalidate({ id: expandedLoan! });
      utils.loans.listLoans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const handleOpenStatement = async (loan: any) => {
    setStatementModal({ loanId: loan.id, clientName: loan.clientName });
    setStatementData(null);
    setStatementLoading(true);
    setStatementEmailInput("");
    try {
      const data = await generateStatementMutation.mutateAsync({ loanId: loan.id });
      setStatementData(data);
      setStatementEmailInput(data.clientEmail || "");
    } catch (_) {}
    setStatementLoading(false);
  };

  // Handler: abrir modal de recibo (gera o PDF ao abrir)
  const handleOpenReceipt = async (inst: any) => {
    setReceiptModal({ inst });
    setReceiptData(null);
    setReceiptLoading(true);
    setReceiptEmailInput("");
    try {
      const data = await generateReceiptMutation.mutateAsync({ installmentId: inst.id });
      setReceiptData(data);
      setReceiptEmailInput(data.clientEmail || "");
    } catch (_) {}
    setReceiptLoading(false);
  };

  // Handler: selecionar arquivo no modal de pagamento manual
  const handlePmFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo: 10 MB."); return; }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) { toast.error("Formato não permitido. Use JPG, PNG, WEBP ou PDF."); return; }
    setPmFile(file);
    if (file.type.startsWith('image/')) setPmFilePreview(URL.createObjectURL(file));
    else setPmFilePreview(null);
  };

  // Handler: selecionar arquivo no modal de adicionar/substituir comprovante
  const handlePrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo: 10 MB."); return; }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) { toast.error("Formato não permitido. Use JPG, PNG, WEBP ou PDF."); return; }
    setPrFile(file);
    if (file.type.startsWith('image/')) setPrFilePreview(URL.createObjectURL(file));
    else setPrFilePreview(null);
  };

  // Handler: confirmar pagamento manual com comprovante
  const handleConfirmPaymentWithProof = async () => {
    if (!paymentModal) return;
    const amountNum = parseFloat(pmAmountPaid);
    if (!pmAmountPaid || isNaN(amountNum) || amountNum <= 0) { toast.error("Informe o valor pago."); return; }
    setPmUploading(true);
    try {
      let fileBase64: string | undefined;
      let fileName: string | undefined;
      let mimeType: string | undefined;
      let fileSizeBytes: number | undefined;
      if (pmFile) {
        fileBase64 = await readFileAsBase64(pmFile);
        fileName = pmFile.name;
        mimeType = pmFile.type;
        fileSizeBytes = pmFile.size;
      }
      await confirmPaymentWithProof.mutateAsync({
        installmentId: paymentModal.inst.id,
        amountPaid: amountNum,
        paidAt: pmPaidAt,
        observation: pmObservation || undefined,
        fileBase64,
        fileName,
        mimeType,
        fileSizeBytes,
      });
    } catch (e: any) {
      toast.error(e.message || "Erro ao confirmar pagamento");
    } finally {
      setPmUploading(false);
    }
  };

  // Handler: adicionar/substituir comprovante
  const handleProofUpload = async () => {
    if (!proofModal || !prFile) { toast.error("Selecione um arquivo."); return; }
    setPrUploading(true);
    try {
      const fileBase64 = await readFileAsBase64(prFile);
      if (proofModal.mode === 'add') {
        await addProofMutation.mutateAsync({ installmentId: proofModal.inst.id, fileBase64, fileName: prFile.name, mimeType: prFile.type, fileSizeBytes: prFile.size });
      } else {
        await replaceProofMutation.mutateAsync({ installmentId: proofModal.inst.id, fileBase64, fileName: prFile.name, mimeType: prFile.type, fileSizeBytes: prFile.size });
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar comprovante");
    } finally {
      setPrUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou telefone..." className="pl-8 h-9 bg-card/60" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-full grid grid-cols-3 gap-2">
          {([
            { id: "ativos",             emoji: "⚡", label: "Ativos",            color: "border-violet-500/50 bg-violet-500/10 text-violet-300",  active: "border-violet-500 bg-violet-600 text-white shadow-lg" },
            { id: "aguardando_pagamento", emoji: "⏳", label: "Aguardando",        color: "border-yellow-500/50 bg-yellow-500/10 text-yellow-300", active: "border-yellow-500 bg-yellow-600 text-white shadow-lg" },
            { id: "atrasado",           emoji: "🔴", label: "Atrasado",          color: "border-red-500/50 bg-red-500/10 text-red-300",         active: "border-red-500 bg-red-600 text-white shadow-lg" },
            { id: "em_analise",         emoji: "🔍", label: "Em Análise",        color: "border-purple-500/50 bg-purple-500/10 text-purple-300", active: "border-purple-500 bg-purple-600 text-white shadow-lg" },
            { id: "finalizados",        emoji: "✅", label: "Finalizados",        color: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300", active: "border-emerald-500 bg-emerald-600 text-white shadow-lg" },
            { id: "pago_hoje",         emoji: "💰", label: "Pago Hoje",        color: "border-green-600/50 bg-green-600/10 text-green-400",    active: "border-green-600 bg-green-700 text-white shadow-lg" },
            { id: "todos",              emoji: "📄", label: "Todos",             color: "border-border/50 bg-muted/20 text-muted-foreground",    active: "border-border bg-muted text-foreground shadow-lg" },
          ] as const).map(({ id, emoji, label, color, active }) => (
            <button
              key={id}
              onClick={() => { setLoanTab(id as any); setExpandedLoan(null); }}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-3 px-2 text-center transition-all active:scale-95 ${
                loanTab === id ? active : color
              }`}
            >
              <span className="text-xl leading-none">{emoji}</span>
              <span className="text-xs font-semibold leading-tight">{label}</span>
            </button>
          ))}
        </div>
        <Button size="sm" className="h-9 gap-1" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />Novo Empréstimo
        </Button>
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground"><RefreshCw className="w-5 h-5 animate-spin mx-auto" /></div>}
      {!isLoading && (loans as any[]).length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Banknote className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Nenhum empréstimo encontrado</p>
        </div>
      )}

      <div className="space-y-3">
        {(loans as any[]).map((loan) => {
          const effectiveStatus = Number(loan.pendingProofs) > 0 && loan.status !== 'pago' && loan.status !== 'cancelado' && loan.status !== 'reprovado'
            ? 'em_analise'
            : loan.hasInstallmentDueToday && loan.status === 'aprovado'
            ? 'aguardando_pagamento'
            : loan.status;
          const st = LOAN_STATUS_COLORS[effectiveStatus] || LOAN_STATUS_COLORS.cancelado;
          const stLabel = LOAN_STATUS_LABELS[effectiveStatus] || effectiveStatus;
          const isExpanded = expandedLoan === loan.id;
          const cpfDisplay = loan.clientCpf || loan.customerCpf;
          const photoUrl = loan.clientPhoto;
          const initials = (loan.clientName || "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          const paymentLabel = loan.paymentType === "diario" ? "Diário" : loan.paymentType === "semanal" ? "Semanal" : loan.paymentType === "quinzenal" ? "Quinzenal" : "Mensal";
          const workDaysLabel = loan.workDays === "seg_sab" ? "Seg–Sáb (20x)" : loan.workDays === "seg_dom" ? "Seg–Dom (25x)" : loan.workDays === "custom" ? `Personalizado (${loan.installments}x)` : "";

          return (
            <Card key={loan.id} className={`border ${loan.isOverdue ? "border-red-500/40" : loan.status === "pendente" ? "border-yellow-500/40" : "border-border/60"} bg-card/60 overflow-hidden`}>
              {/* Barra de status colorida no topo */}
              <div className={`h-1 w-full ${loan.status === "pendente" ? "bg-yellow-500" : loan.status === "aprovado" ? "bg-green-500" : loan.status === "pago" ? "bg-emerald-500" : loan.status === "reprovado" ? "bg-red-500" : loan.isOverdue ? "bg-red-500" : "bg-violet-500"}`} />
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Avatar do cliente + botão WhatsApp */}
                  <div className="shrink-0 flex sm:flex-col flex-row items-center gap-2 sm:gap-1">
                    {photoUrl ? (
                      <img src={photoUrl} alt={loan.clientName} className="w-14 h-14 rounded-full object-cover border-2 border-border" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-violet-500/20 border-2 border-violet-500/30 flex items-center justify-center text-violet-300 font-bold text-lg">
                        {initials}
                      </div>
                    )}
                    {loan.clientPhone && (
                      <a
                        href={`https://wa.me/55${loan.clientPhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-14 flex items-center justify-center gap-1 rounded-md bg-green-600 hover:bg-green-500 active:scale-95 transition-all text-white text-xs font-semibold py-1"
                        title={`WhatsApp: ${loan.clientPhone}`}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.524 5.845L.057 23.943l6.249-1.437A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.36-.213-3.71.853.882-3.601-.234-.371A9.818 9.818 0 1112 21.818z"/></svg>
                        WA
                      </a>
                    )}
                  </div>

                  {/* Conteúdo principal */}
                  <div className="flex-1 min-w-0 w-full">
                    {/* Cabeçalho: nome + badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-bold text-base">{loan.clientName}</span>
                      <Badge variant="outline" className={`text-xs ${st}`}>{stLabel}</Badge>
                      {loan.isOverdue && (
                        <Badge variant="outline" className="text-xs bg-red-500/20 text-red-300 border-red-500/30 gap-1">
                          <AlertTriangle className="w-3 h-3" />Atrasado
                        </Badge>
                      )}
                      {loan.clientProfile && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground capitalize">{loan.clientProfile}</span>
                      )}
                    </div>

                    {/* Dados de identificação */}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mb-3">
                      {loan.clientPhone && <span>📱 {loan.clientPhone}</span>}
                      {cpfDisplay && <span>🪪 CPF: {cpfDisplay}</span>}
                      {loan.clientPixKey ? (
                        <span className="flex items-center gap-1 text-green-400">
                          💠 PIX: <span className="font-mono">{loan.clientPixKey}</span>
                          {loan.clientPixName && <span className="text-muted-foreground">· {loan.clientPixName}</span>}
                          {loan.clientPixBank && <span className="text-muted-foreground">· {loan.clientPixBank}</span>}
                        </span>
                      ) : (
                        <span className="text-amber-400">⚠️ Sem chave PIX cadastrada</span>
                      )}
                    </div>

                    {/* Grid de valores */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                      <div className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Solicitado</p>
                        <p className="font-semibold text-sm">{fmt(loan.amount)}</p>
                      </div>
                      <div className="bg-yellow-500/10 rounded-lg p-2 text-center border border-yellow-500/20">
                        <p className="text-xs text-muted-foreground mb-0.5">Total c/ juros</p>
                        <p className="font-bold text-sm text-yellow-400">{fmt(loan.totalAmount)}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Juros ({parseFloat(loan.interestRate).toFixed(0)}%)</p>
                        <p className="font-semibold text-sm text-orange-400">{fmt(loan.interestAmount)}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Parcelas</p>
                        <p className="font-semibold text-sm">{loan.paidInstallments}<span className="text-muted-foreground">/{loan.totalInstallments}</span></p>
                      </div>
                    </div>

                    {/* ─── Linha de valores pagos/restantes ─── */}
                    {(() => {
                      // Parcelas pagas normalmente (status='pago')
                      const paid = Number(loan.paidInstallments) || 0;
                      // Usar installments (original) para o ratio, não totalInstallments (que inclui parcelas roladas)
                      const originalInstallments = Number(loan.installments) || Number(loan.totalInstallments) || 1;
                      const ratio = paid / originalInstallments;
                      const principalTotal = parseFloat(loan.amount || 0);
                      const interestTotal = parseFloat(loan.interestAmount || 0);
                      const grandTotal = parseFloat(loan.totalAmount || 0);
                      // Juros cobrados via rolagem de dívida (parcelas pago_juros)
                      const interestOnlyPaid = parseFloat(loan.interestOnlyPaidTotal || 0);
                      // Principal pago = proporção das parcelas quitadas × principal total
                      const principalPaid = Math.round(principalTotal * ratio * 100) / 100;
                      // Juros pagos = proporção das parcelas quitadas × juros originais + juros de rolagem cobrados
                      const interestPaid = Math.round((interestTotal * ratio + interestOnlyPaid) * 100) / 100;
                      const totalPaid = Math.round((principalPaid + interestPaid) * 100) / 100;
                      const principalLeft = Math.round((principalTotal - principalPaid) * 100) / 100;
                      // Juros restantes = apenas os juros das parcelas ainda não pagas (não subtrair rolagem pois ela gera novas parcelas)
                      const interestLeft = Math.round(interestTotal * (1 - ratio) * 100) / 100;
                      const totalLeft = Math.round((principalLeft + interestLeft) * 100) / 100;
                      return (
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3">
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-emerald-400/80 mb-0.5 leading-tight">✅ Pago (principal)</p>
                            <p className="font-bold text-xs text-emerald-400">{fmt(principalPaid)}</p>
                          </div>
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-emerald-400/80 mb-0.5 leading-tight">✅ Pago (juros)</p>
                            <p className="font-bold text-xs text-emerald-400">{fmt(interestPaid)}</p>
                          </div>
                          <div className="bg-emerald-600/15 border border-emerald-500/30 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-emerald-300/80 mb-0.5 leading-tight">✅ Total pago</p>
                            <p className="font-bold text-xs text-emerald-300">{fmt(totalPaid)}</p>
                          </div>
                          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-red-400/80 mb-0.5 leading-tight">⏳ Falta (principal)</p>
                            <p className="font-bold text-xs text-red-400">{fmt(principalLeft)}</p>
                          </div>
                          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-red-400/80 mb-0.5 leading-tight">⏳ Falta (juros)</p>
                            <p className="font-bold text-xs text-red-400">{fmt(interestLeft)}</p>
                          </div>
                          <div className="bg-red-600/15 border border-red-500/30 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-red-300/80 mb-0.5 leading-tight">⏳ Total restante</p>
                            <p className="font-bold text-xs text-red-300">{fmt(totalLeft)}</p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Datas e tipo */}
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span>📅 Liberação: <span className="text-foreground">{fmtDate(loan.releaseDate)}</span></span>
                      <span>⏰ Vencimento: <span className={loan.isOverdue ? "text-red-400 font-medium" : "text-foreground"}>{fmtDate(loan.dueDate)}</span></span>
                      <span>💳 {paymentLabel}{workDaysLabel ? ` · ${workDaysLabel}` : ""}</span>
                      {loan.notes && <span>📝 {loan.notes}</span>}
                    </div>

                    {loan.status === "reprovado" && loan.rejectedReason && (
                      <p className="text-xs text-red-400 mt-2 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">❌ Motivo: {loan.rejectedReason}</p>
                    )}
                  </div>

                </div>

                {/* Rodapé de ações */}
                <div className="mt-4 pt-3 border-t border-border/40">
                    <div className="grid grid-cols-3 gap-2">
                      {/* Parcelas - sempre visível */}
                      <button
                        onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}
                        className={`flex flex-col items-center gap-1 rounded-xl border py-3 px-2 text-center transition-all active:scale-95 ${
                          isExpanded ? "border-violet-500 bg-violet-600 text-white shadow-lg" : "border-violet-500/40 bg-violet-500/10 text-violet-300"
                        }`}
                      >
                        <span className="text-xl">{isExpanded ? "▲" : "▼"}</span>
                        <span className="text-xs font-semibold">Parcelas</span>
                      </button>

                      {/* Extrato PDF - sempre visível */}
                      <button
                        onClick={() => handleOpenStatement(loan)}
                        className="flex flex-col items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 py-3 px-2 text-center transition-all active:scale-95"
                      >
                        <span className="text-xl">📄</span>
                        <span className="text-xs font-semibold">Extrato PDF</span>
                      </button>

                      {/* Reagendar parcelas (diário ativo) */}
                      {loan.paymentType === 'diario' && !['pago','cancelado','reprovado'].includes(loan.status) && (
                        <button
                          onClick={() => {
                            const pending = (loan.installmentsList || []).filter((i: any) => i.status !== 'pago').length;
                            setRescheduleResult(null);
                            setRescheduleWorkDays((loan.workDays === 'seg_sab' ? 'seg_dom' : 'seg_sab') as 'seg_sab' | 'seg_dom');
                            setRescheduleModal({ loanId: loan.id, clientName: loan.clientName, currentWorkDays: loan.workDays || 'seg_sab', pendingCount: pending });
                          }}
                          className="flex flex-col items-center gap-1 rounded-xl border border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 py-3 px-2 text-center transition-all active:scale-95"
                        >
                          <span className="text-xl">📅</span>
                          <span className="text-xs font-semibold">Reagendar</span>
                        </button>
                      )}

                      {/* Editar (ativo/aprovado) */}
                      {!['pago','cancelado','reprovado','pendente'].includes(loan.status) && (
                        <button
                          onClick={() => setEditLoanData(loan)}
                          className="flex flex-col items-center gap-1 rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 py-3 px-2 text-center transition-all active:scale-95"
                        >
                          <span className="text-xl">✏️</span>
                          <span className="text-xs font-semibold">Editar</span>
                        </button>
                      )}

                      {/* Notificar Aprovação (ativo/aprovado) */}
                      {!['pago','cancelado','reprovado','pendente'].includes(loan.status) && (
                        <button
                          onClick={() => setApprovalNotifyModal(loan)}
                          className="flex flex-col items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 py-3 px-2 text-center transition-all active:scale-95"
                        >
                          <span className="text-xl">📨</span>
                          <span className="text-xs font-semibold">Notificar</span>
                        </button>
                      )}
                      {/* Aprovar (pendente) */}
                      {loan.status === 'pendente' && (
                        <button
                          onClick={() => approveLoan.mutate({ id: loan.id })}
                          className="flex flex-col items-center gap-1 rounded-xl border border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/20 py-3 px-2 text-center transition-all active:scale-95"
                        >
                          <span className="text-xl">✅</span>
                          <span className="text-xs font-semibold">Aprovar</span>
                        </button>
                      )}

                      {/* Reprovar (pendente) */}
                      {loan.status === 'pendente' && (
                        <button
                          onClick={() => { setRejectDialog({ id: loan.id, clientName: loan.clientName, clientPhone: loan.clientPhone, clientEmail: loan.clientEmail }); setRejectReason(''); setRejectEmailInput(loan.clientEmail || ''); }}
                          className="flex flex-col items-center gap-1 rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 py-3 px-2 text-center transition-all active:scale-95"
                        >
                          <span className="text-xl">❌</span>
                          <span className="text-xs font-semibold">Reprovar</span>
                        </button>
                      )}

                      {/* Cancelar (ativo/aprovado) */}
                      {!['pago','cancelado','reprovado','pendente'].includes(loan.status) && (
                        <button
                          onClick={() => { if (confirm('Cancelar este empréstimo?')) cancelLoan.mutate({ id: loan.id }); }}
                          className="flex flex-col items-center gap-1 rounded-xl border border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 py-3 px-2 text-center transition-all active:scale-95"
                        >
                          <span className="text-xl">🚫</span>
                          <span className="text-xs font-semibold">Cancelar</span>
                        </button>
                      )}

                      {/* Excluir - sempre visível */}
                      <button
                        onClick={() => { if (confirm(`Excluir permanentemente o empréstimo de ${loan.clientName}? Esta ação não pode ser desfeita.`)) deleteLoan.mutate({ id: loan.id }); }}
                        disabled={deleteLoan.isPending}
                        className="flex flex-col items-center gap-1 rounded-xl border border-red-700/40 bg-red-700/10 text-red-400 hover:bg-red-700/20 py-3 px-2 text-center transition-all active:scale-95 disabled:opacity-50"
                      >
                        <span className="text-xl">🗑️</span>
                        <span className="text-xs font-semibold">Excluir</span>
                      </button>
                    </div>
                </div>

                {/* Parcelas expandidas */}
                {isExpanded && instData && instData.id === loan.id && (
                  <div className="mt-4 border-t border-border pt-4 space-y-2">
                    <p className="text-sm font-medium mb-3">
                      Parcelas — {loan.paymentType === "diario" ? "Pagamento Diário" : loan.paymentType === "semanal" ? "Pagamento Semanal" : loan.paymentType === "quinzenal" ? "Pagamento Quinzenal" : "Pagamento Mensal"}
                    </p>
                    {(instData.installments as any[]).map((inst) => {
                      const todayDateStr = new Date().toISOString().slice(0, 10);
                      const isVenceHoje = inst.status === "pendente" && inst.dueDate === todayDateStr;
                      const instStKey = inst.isOverdue && inst.status !== "pago" && inst.status !== "pago_juros" ? "atrasado" : isVenceHoje ? "vence_hoje" : inst.status;
                      const instSt = INST_STATUS_COLORS[instStKey] || INST_STATUS_COLORS.pendente;
                      const isRolled = inst.notes && (inst.notes as string).includes('rolled_from_interest_only');
                      const instLabel = inst.status === "pago_juros" ? "⚠️ Juros Pagos (dívida rolada)" : inst.isOverdue && inst.status !== "pago" ? "Atrasado" : isVenceHoje ? "Aguardando Pagamento" : inst.status === "pendente" && isRolled ? "🔄 Dívida Rolada" : inst.status === "pendente" ? "Pendente" : inst.status === "em_analise" ? "Em análise" : inst.status === "pago" ? "Pago" : inst.status;
                      // Comprovante admin (da nova tabela)
                      const adminProof = (proofsMap as any)[inst.id];
                      return (
                        <div key={inst.id} className="flex flex-col gap-2 bg-muted/30 rounded-lg px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="text-xs text-muted-foreground w-6 mt-0.5">#{inst.installmentNumber}</span>
                            <div>
                              <p className="text-sm font-medium">{fmt(inst.amount)}</p>
                              <p className="text-xs text-muted-foreground">Vence: {fmtDate(inst.dueDate)}</p>
                              {inst.paidAt && <p className="text-xs text-emerald-400">Pago em: {fmtDateTime(inst.paidAt)}{inst.paidBy ? ` por ${inst.paidBy.replace(/CSA TRANSPORTES LTDA/gi, 'CSA EMPRESTIMOS SP')}` : ""}</p>}
                              {/* Indicador de comprovante admin */}
                              {inst.status === "pago" && adminProof?.hasProof ? (
                                <div className="flex items-center gap-1 mt-1">
                                  <Paperclip className="w-3 h-3 text-blue-400" />
                                  <span className="text-xs text-blue-400">Comprovante anexado</span>
                                  <button className="text-xs text-blue-400 hover:text-blue-300 underline ml-1" onClick={() => { setViewProofUrl(adminProof.fileUrl); setViewProofMime(adminProof.fileMimeType); }}>Visualizar</button>
                                  <a href={adminProof.fileUrl} download={adminProof.originalFileName} className="text-xs text-blue-400 hover:text-blue-300 ml-1" title="Baixar"><Download className="w-3 h-3" /></a>
                                  <button className="text-xs text-yellow-400 hover:text-yellow-300 ml-1" onClick={() => { setProofModal({ inst, mode: 'replace' }); setPrFile(null); setPrFilePreview(null); }} title="Substituir"><Pencil className="w-3 h-3" /></button>
                                  <button className="text-xs text-red-400 hover:text-red-300 ml-1" onClick={() => { setDeleteProofModal({ inst }); setDeleteReason(""); }} title="Excluir"><X className="w-3 h-3" /></button>
                                </div>
                              ) : inst.status === "pago" && adminProof && !adminProof.hasProof ? (
                                <div className="flex items-center gap-1 mt-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                                  <span className="text-xs text-amber-400">Sem comprovante</span>
                                  <button className="text-xs text-emerald-400 hover:text-emerald-300 underline ml-1" onClick={() => { setProofModal({ inst, mode: 'add' }); setPrFile(null); setPrFilePreview(null); }}>
                                    <Paperclip className="w-3 h-3 inline" /> Adicionar
                                  </button>
                                </div>
                              ) : inst.status === "pago" && !adminProof ? (
                                <div className="flex items-center gap-1 mt-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                                  <span className="text-xs text-amber-400">Sem comprovante</span>
                                  <button className="text-xs text-emerald-400 hover:text-emerald-300 underline ml-1" onClick={() => { setProofModal({ inst, mode: 'add' }); setPrFile(null); setPrFilePreview(null); }}>
                                    <Paperclip className="w-3 h-3 inline" /> Adicionar
                                  </button>
                                </div>
                              ) : null}
                              {/* Comprovante enviado pelo cliente (fluxo antigo) */}
                              {inst.proofUrl && !adminProof?.hasProof && (
                                <a href={inst.proofUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-blue-400 hover:underline flex items-center gap-1 mt-0.5">
                                  <ExternalLink className="w-3 h-3" />{inst.status === "pago" ? "Ver comprovante cliente" : "Ver comprovante enviado"}
                                </a>
                              )}
                              {inst.proofSentAt && !inst.paidAt && (
                                <p className="text-xs text-muted-foreground">Comprovante enviado: {fmtDateTime(inst.proofSentAt)}</p>
                              )}
                              {inst.status === "pago_juros" && (
                                <p className="text-xs text-orange-400 mt-0.5">⚠️ Só juros pagos — principal rolado para nova parcela</p>
                              )}
                              {isRolled && inst.status === "pendente" && (
                                <p className="text-xs text-blue-400 mt-0.5">🔄 Gerada por rolagem de juros</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            <Badge variant="outline" className={`text-xs ${instSt}`}>{instLabel}</Badge>
                          </div>
                          </div>
                          {/* Botões de ação como cards na parte inferior da parcela */}
                          {((inst.status === "pendente" || inst.isOverdue) && inst.status !== "pago" && inst.status !== "pago_juros") && (
                            <div className={`grid gap-2 pt-1 border-t border-border/30 ${loan.interestOnlyEnabled && inst.isOverdue ? 'grid-cols-2' : 'grid-cols-3'}`}>
                              <button
                                className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all text-xs font-semibold active:scale-95"
                                onClick={() => {
                                  setPaymentModal({ inst, loanId: loan.id });
                                  setPmAmountPaid(String(parseFloat(inst.amount) || ""));
                                  setPmPaidAt(todayBRT());
                                  setPmObservation(""); setPmFile(null); setPmFilePreview(null);
                                }}>
                                <CheckCircle className="w-4 h-4" />
                                Pago Manual
                              </button>
                              {/* Botão Cobrar Juros - aparece apenas em parcelas vencidas com interestOnly ativado */}
                              {loan.interestOnlyEnabled && inst.isOverdue ? (
                                <button
                                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-semibold active:scale-95"
                                  onClick={() => setInterestOnlyInstModal({ inst, loan })}>
                                  <DollarSign className="w-4 h-4" />
                                  Cobrar Juros
                                </button>
                              ) : inst.feeApplied != null ? (
                                <button
                                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-all text-xs font-semibold active:scale-95"
                                  onClick={() => { if (confirm(`Remover taxa de atraso de R$ ${parseFloat(inst.feeApplied).toFixed(2).replace('.',',')} da parcela #${inst.installmentNumber}?`)) removeLateFee.mutate({ installmentId: inst.id }); }}
                                  disabled={removeLateFee.isPending}>
                                  <AlertTriangle className="w-4 h-4" />
                                  -Taxa
                                </button>
                              ) : (
                                <button
                                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-semibold active:scale-95"
                                  onClick={() => { setFeeModal({ inst, loanId: loan.id }); setFeeCustomAmount(""); }}>
                                  <AlertTriangle className="w-4 h-4" />
                                  +Taxa
                                </button>
                              )}
                              {/* Botão Avisar Parcela */}
                              {!loan.interestOnlyEnabled || !inst.isOverdue ? (
                                <button
                                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-all text-xs font-semibold active:scale-95"
                                  onClick={() => setInstallmentNotifyModal({ loan, inst })}>
                                  <span className="text-base">&#128241;</span>
                                  Avisar
                                </button>
                              ) : null}
                            </div>
                          )}
                          {/* Parcela em análise: cards Confirmar e Recusar */}
                          {inst.status === "em_analise" && (
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/30">
                              <button
                                className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all text-xs font-semibold active:scale-95"
                                onClick={() => {
                                  setPaymentModal({ inst, loanId: loan.id });
                                  setPmAmountPaid(String(parseFloat(inst.amount) || ""));
                                  setPmPaidAt(todayBRT());
                                  setPmObservation(""); setPmFile(null); setPmFilePreview(null);
                                }}>
                                <CheckCircle className="w-4 h-4" />
                                Confirmar
                              </button>
                              <button
                                className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all text-xs font-semibold active:scale-95"
                                onClick={() => refusePayment.mutate({ installmentId: inst.id, reason: "Comprovante inválido" })}>
                                <XCircle className="w-4 h-4" />
                                Recusar
                              </button>
                            </div>
                          )}
                          {/* Parcela pago_juros: cards Desfazer Juros e Recibo */}
                          {inst.status === "pago_juros" && (
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/30">
                              <button
                                className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-all text-xs font-semibold active:scale-95"
                                onClick={() => { if (confirm(`Desfazer cobrança de juros da parcela #${inst.installmentNumber}? Ela voltará para Pendente e a parcela rolada será removida.`)) undoInterestOnly.mutate({ loanId: loan.id, installmentId: inst.id }); }}
                                disabled={undoInterestOnly.isPending}>
                                <RotateCcw className="w-4 h-4" />
                                Desfazer Juros
                              </button>
                              <button
                                className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-semibold active:scale-95"
                                onClick={() => handleOpenReceipt(inst)}>
                                <FileText className="w-4 h-4" />
                                Recibo Juros
                              </button>
                            </div>
                          )}
                          {/* Parcela paga: cards Desfazer e Recibo */}
                          {inst.status === "pago" && (
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/30">
                              <button
                                className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-all text-xs font-semibold active:scale-95"
                                onClick={() => { if (confirm(`Desfazer pagamento da parcela #${inst.installmentNumber}? Ela voltará para Pendente.`)) undoPayment.mutate({ installmentId: inst.id }); }}
                                disabled={undoPayment.isPending}>
                                <RotateCcw className="w-4 h-4" />
                                Desfazer
                              </button>
                              <button
                                className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-all text-xs font-semibold active:scale-95"
                                onClick={() => handleOpenReceipt(inst)}>
                                <FileText className="w-4 h-4" />
                                Recibo
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ─ Seção: Pagamento Só de Juros (admin) ─ */}
                {["quinzenal", "mensal", "semanal"].includes(loan.paymentType) && !["pago", "cancelado", "reprovado"].includes(loan.status) && (
                  <InterestOnlySection loan={loan} />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal criar empréstimo */}
      {showCreate && <CreateLoanModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); utils.loans.listLoans.invalidate(); utils.loans.getDashboard.invalidate(); }} />}

      {/* Modal editar empréstimo */}
      {editLoanData && <EditLoanModal loan={editLoanData} onClose={() => setEditLoanData(null)} onSuccess={() => { setEditLoanData(null); utils.loans.listLoans.invalidate(); utils.loans.getDashboard.invalidate(); }} />}

      {/* Modal reagendar parcelas */}
      {rescheduleModal && (
        <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-orange-500/30 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">📅 Reagendar Parcelas</h3>
              <button onClick={() => { setRescheduleModal(null); setRescheduleResult(null); }} className="text-slate-400 hover:text-white text-xl">×</button>
            </div>
            {!rescheduleResult ? (
              <div className="space-y-4">
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <p className="text-sm text-slate-300"><span className="font-bold text-white">{rescheduleModal.clientName}</span></p>
                  <p className="text-xs text-slate-400 mt-1">Regime atual: <span className="text-orange-300 font-semibold">{rescheduleModal.currentWorkDays === 'seg_sab' ? 'Seg–Sáb (folga domingo)' : rescheduleModal.currentWorkDays === 'seg_dom' ? 'Seg–Dom (corrido)' : 'Personalizado'}</span></p>
                  <p className="text-xs text-slate-400">Parcelas pendentes: <span className="text-yellow-300 font-semibold">{rescheduleModal.pendingCount}</span></p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-2">Novo regime para parcelas pendentes:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['seg_sab', 'seg_dom'] as const).map(wd => (
                      <button
                        key={wd}
                        onClick={() => setRescheduleWorkDays(wd)}
                        className={`py-3 px-3 rounded-xl text-sm font-bold border transition-colors ${
                          rescheduleWorkDays === wd
                            ? 'bg-orange-600 border-orange-500 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-orange-500'
                        }`}
                      >
                        {wd === 'seg_sab' ? '📅 Seg–Sáb' : '🗓️ Seg–Dom'}
                        <span className="block text-xs font-normal mt-0.5 opacity-75">{wd === 'seg_sab' ? 'folga domingo' : 'todos os dias'}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-3">
                  <p className="text-xs text-amber-300">⚠️ Apenas parcelas <strong>pendentes</strong> serão reagendadas. Parcelas já pagas não serão alteradas.</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const res = await rescheduleInstallments.mutateAsync({ loanId: rescheduleModal.loanId, newWorkDays: rescheduleWorkDays });
                      setRescheduleResult({ rescheduled: res.rescheduled, preview: res.preview });
                      utils.loans.listLoans.invalidate();
                      utils.loans.getDashboard.invalidate();
                    } catch (e: any) {
                      alert('Erro: ' + (e?.message || 'Tente novamente'));
                    }
                  }}
                  disabled={rescheduleInstallments.isPending}
                  className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  {rescheduleInstallments.isPending ? '⏳ Reagendando...' : '📅 Confirmar Reagendamento'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4 text-center">
                  <div className="text-3xl mb-2">✅</div>
                  <p className="text-emerald-300 font-bold">{rescheduleResult.rescheduled} parcelas reagendadas!</p>
                  <p className="text-xs text-slate-400 mt-1">Novo regime: {rescheduleWorkDays === 'seg_sab' ? 'Seg–Sáb (folga domingo)' : 'Seg–Dom (corrido)'}</p>
                </div>
                {rescheduleResult.preview.length > 0 && (
                  <div className="bg-slate-700/50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-2">Próximas datas:</p>
                    {rescheduleResult.preview.map((p: any, idx: number) => (
                      <p key={idx} className="text-xs text-slate-300">📅 {new Date(String(p.dueDate).slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</p>
                    ))}
                  </div>
                )}
                <button onClick={() => { setRescheduleModal(null); setRescheduleResult(null); }} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-colors">
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialog reprovar */}
      <Dialog open={!!rejectDialog} onOpenChange={(o) => { if (!o) { setRejectDialog(null); setRejectReason(""); setRejectEmailInput(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <XCircle className="w-5 h-5" />
              Reprovar Empréstimo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Info do cliente */}
            <div className="bg-muted/40 rounded-lg px-4 py-3 border border-border">
              <p className="text-sm font-semibold">{rejectDialog?.clientName}</p>
              {rejectDialog?.clientPhone && (
                <p className="text-xs text-muted-foreground mt-0.5">📱 {rejectDialog.clientPhone}</p>
              )}
              {rejectDialog?.clientEmail && (
                <p className="text-xs text-muted-foreground">📧 {rejectDialog.clientEmail}</p>
              )}
            </div>

            {/* Motivo */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Motivo da reprovação <span className="text-red-400">*</span></Label>
              <Textarea
                placeholder="Informe o motivo da reprovação (ex: Documentos insuficientes, Renda não comprovada, CPF com restrições...)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="bg-card/60 resize-none"
              />
            </div>

            {/* Notificar por E-mail */}
            <div className="border border-border rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">📧 Notificar por E-mail</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder={rejectDialog?.clientEmail || "E-mail do cliente"}
                  value={rejectEmailInput}
                  onChange={(e) => setRejectEmailInput(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 text-blue-400 border-blue-500/30 hover:bg-blue-500/10 shrink-0"
                  disabled={rejectEmailSending || !rejectReason.trim() || !rejectEmailInput.trim()}
                  onClick={async () => {
                    setRejectEmailSending(true);
                    try {
                      const result = await sendRejectionNotice.mutateAsync({
                        loanId: rejectDialog!.id,
                        reason: rejectReason,
                        emailOverride: rejectEmailInput.trim() || undefined,
                      });
                      if (result.sentTo) toast.success(`E-mail enviado para ${result.sentTo}`);
                      else toast.error('Não foi possível enviar o e-mail');
                    } catch (_) {}
                    setRejectEmailSending(false);
                  }}
                >
                  {rejectEmailSending ? <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" /> : <span>Enviar E-mail</span>}
                </Button>
              </div>
              {!rejectEmailInput && !rejectDialog?.clientEmail && (
                <p className="text-xs text-amber-400">Cliente sem e-mail cadastrado</p>
              )}
            </div>

            {/* Notificar por WhatsApp */}
            {rejectDialog?.clientPhone && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">📱 Notificar por WhatsApp</p>
                <a
                  href={rejectReason.trim() ? `https://wa.me/55${rejectDialog.clientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${rejectDialog.clientName}! Infelizmente sua solicitação de empréstimo foi reprovada.\n\nMotivo: ${rejectReason}\n\nEm caso de dúvidas, entre em contato conosco.`)}` : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { if (!rejectReason.trim()) { e.preventDefault(); toast.error('Informe o motivo antes de enviar pelo WhatsApp'); } }}
                  className="flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors w-full"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Abrir WhatsApp ({rejectDialog.clientPhone})
                </a>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectReason(""); setRejectEmailInput(""); }}>Cancelar</Button>
            <Button variant="destructive" onClick={() => rejectLoan.mutate({ id: rejectDialog!.id, reason: rejectReason })}
              disabled={!rejectReason.trim() || rejectLoan.isPending}>
              {rejectLoan.isPending ? "Reprovando..." : "❌ Reprovar Empréstimo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Pagamento Manual com Comprovante ─── */}
      <Dialog open={!!paymentModal} onOpenChange={(o) => { if (!o) { setPaymentModal(null); setPmFile(null); setPmFilePreview(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              Confirmar Pagamento Manual
            </DialogTitle>
          </DialogHeader>
          {paymentModal && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Parcela <strong className="text-foreground">#{paymentModal.inst.installmentNumber}</strong> — Valor original: <strong className="text-foreground">{fmt(paymentModal.inst.amount)}</strong></p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Valor pago <span className="text-red-400">*</span></Label>
                  <Input type="number" step="0.01" min="0.01" placeholder="0,00" value={pmAmountPaid} onChange={(e) => setPmAmountPaid(e.target.value)} className="bg-card/60" />
                </div>
                <div className="space-y-1.5">
                  <Label>Data do pagamento <span className="text-red-400">*</span></Label>
                  <Input type="date" value={pmPaidAt} onChange={(e) => setPmPaidAt(e.target.value)} className="bg-card/60" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Observação (opcional)</Label>
                <Textarea placeholder="Ex: Pago via PIX, recibo nº 123..." value={pmObservation} onChange={(e) => setPmObservation(e.target.value)} rows={2} className="bg-card/60" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Paperclip className="w-4 h-4" />Comprovante (opcional)</Label>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => pmFileRef.current?.click()}
                >
                  {pmFilePreview ? (
                    <img src={pmFilePreview} alt="preview" className="max-h-32 mx-auto rounded object-contain" />
                  ) : pmFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <FileText className="w-5 h-5 text-blue-400" />
                      <span className="truncate max-w-[200px]">{pmFile.name}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-40" />
                      <p>Clique para selecionar</p>
                      <p className="text-xs mt-0.5">JPG, PNG, WEBP ou PDF — máx. 10 MB</p>
                    </div>
                  )}
                </div>
                <input ref={pmFileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf" className="hidden" onChange={handlePmFileChange} />
                {pmFile && (
                  <Button variant="ghost" size="sm" className="text-xs text-red-400 h-6 px-2" onClick={() => { setPmFile(null); setPmFilePreview(null); if (pmFileRef.current) pmFileRef.current.value = ""; }}>
                    <X className="w-3 h-3 mr-1" />Remover arquivo
                  </Button>
                )}
              </div>
              {!pmFile && (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
                  ⚠️ Sem comprovante: o pagamento será registrado, mas a parcela ficará marcada como <strong>sem comprovante</strong>.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaymentModal(null); setPmFile(null); setPmFilePreview(null); }}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handleConfirmPaymentWithProof} disabled={pmUploading || confirmPaymentWithProof.isPending}>
              {pmUploading || confirmPaymentWithProof.isPending ? "Confirmando..." : "Confirmar Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Adicionar/Substituir Comprovante ─── */}
      <Dialog open={!!proofModal} onOpenChange={(o) => { if (!o) { setProofModal(null); setPrFile(null); setPrFilePreview(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="w-5 h-5 text-blue-400" />
              {proofModal?.mode === 'replace' ? 'Substituir Comprovante' : 'Adicionar Comprovante'}
            </DialogTitle>
          </DialogHeader>
          {proofModal && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Parcela <strong className="text-foreground">#{proofModal.inst.installmentNumber}</strong></p>
              <div
                className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => prFileRef.current?.click()}
              >
                {prFilePreview ? (
                  <img src={prFilePreview} alt="preview" className="max-h-32 mx-auto rounded object-contain" />
                ) : prFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <span className="truncate max-w-[200px]">{prFile.name}</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-40" />
                    <p>Clique para selecionar</p>
                    <p className="text-xs mt-0.5">JPG, PNG, WEBP ou PDF — máx. 10 MB</p>
                  </div>
                )}
              </div>
              <input ref={prFileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf" className="hidden" onChange={handlePrFileChange} />
              {prFile && (
                <Button variant="ghost" size="sm" className="text-xs text-red-400 h-6 px-2" onClick={() => { setPrFile(null); setPrFilePreview(null); if (prFileRef.current) prFileRef.current.value = ""; }}>
                  <X className="w-3 h-3 mr-1" />Remover
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setProofModal(null); setPrFile(null); setPrFilePreview(null); }}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-500 text-white" onClick={handleProofUpload} disabled={!prFile || prUploading}>
              {prUploading ? "Enviando..." : proofModal?.mode === 'replace' ? 'Substituir' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Visualizar Comprovante (lightbox) ─── */}
      <Dialog open={!!viewProofUrl} onOpenChange={(o) => { if (!o) { setViewProofUrl(null); setViewProofMime(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Paperclip className="w-4 h-4" />Comprovante</DialogTitle>
          </DialogHeader>
          {viewProofUrl && (
            viewProofMime?.startsWith('image/') ? (
              <img src={viewProofUrl} alt="Comprovante" className="w-full max-h-[70vh] object-contain rounded" />
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto mb-3 text-blue-400" />
                <p className="text-sm text-muted-foreground mb-4">Arquivo PDF</p>
                <a href={viewProofUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="gap-2"><ExternalLink className="w-4 h-4" />Abrir PDF em nova aba</Button>
                </a>
              </div>
            )
          )}
          <DialogFooter>
            {viewProofUrl && (
              <a href={viewProofUrl} download>
                <Button variant="outline" className="gap-2"><Download className="w-4 h-4" />Baixar</Button>
              </a>
            )}
            <Button variant="outline" onClick={() => { setViewProofUrl(null); setViewProofMime(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Excluir Comprovante ─── */}
      <Dialog open={!!deleteProofModal} onOpenChange={(o) => { if (!o) { setDeleteProofModal(null); setDeleteReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-red-400">Excluir Comprovante</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Excluir o comprovante da parcela <strong className="text-foreground">#{deleteProofModal?.inst.installmentNumber}</strong>?
              <br /><span className="text-amber-400">O pagamento não será desfeito.</span>
            </p>
            <div className="space-y-1.5">
              <Label>Motivo (opcional)</Label>
              <Input placeholder="Ex: Arquivo errado, duplicado..." value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="bg-card/60" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteProofModal(null); setDeleteReason(""); }}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteProofMutation.mutate({ installmentId: deleteProofModal!.inst.id, deleteReason: deleteReason || undefined })} disabled={deleteProofMutation.isPending}>
              {deleteProofMutation.isPending ? "Excluindo..." : "Excluir Comprovante"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ─── Modal de Cobrar Juros por Parcela ──────────────────────────────────────── */}
      {interestOnlyInstModal && (() => {
        const { inst, loan: iLoan } = interestOnlyInstModal;
        const loanPrincipal = parseFloat(iLoan.amount || 0);
        const totalInst = parseInt(iLoan.installments || 1);
        const interestRate = parseFloat(iLoan.interestRate || 0);
        const principalPerInst = Math.round((loanPrincipal / totalInst) * 100) / 100;
        const feeApplied = parseFloat(inst.feeApplied || 0);
        const interestOnPrincipal = Math.round(principalPerInst * (interestRate / 100) * 100) / 100;
        const totalJuros = Math.round((interestOnPrincipal + feeApplied) * 100) / 100;
        const newInstAmount = Math.round((principalPerInst + interestOnPrincipal) * 100) / 100;
        const renewDays = iLoan.paymentType === "quinzenal" ? 15 : iLoan.paymentType === "semanal" ? 7 : 30;
        return (
          <Dialog open={true} onOpenChange={(o) => { if (!o) setInterestOnlyInstModal(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-amber-400" />
                  Cobrar Juros — Parcela #{inst.installmentNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Principal da parcela</span><span className="font-bold text-white">{fmt(principalPerInst)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Juros ({interestRate}%)</span><span className="text-amber-400 font-medium">{fmt(interestOnPrincipal)}</span></div>
                  {feeApplied > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Taxa de atraso</span><span className="text-red-400 font-medium">+ {fmt(feeApplied)}</span></div>}
                  <div className="flex justify-between border-t border-amber-500/20 pt-1 mt-1"><span className="font-semibold">Total a cobrar</span><span className="font-bold text-amber-300">{fmt(totalJuros)}</span></div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Nova parcela gerada</span><span className="text-blue-300">{fmt(newInstAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vence em</span><span className="text-blue-300">{renewDays} dias após a última parcela</span></div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-1">
                  <p className="font-semibold text-red-400">⚠️ ATENÇÃO</p>
                  <p className="text-muted-foreground">Pagar só os juros <strong className="text-white">NÃO quita a parcela</strong>. O principal de <strong className="text-white">{fmt(principalPerInst)}</strong> é rolado para uma nova parcela.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInterestOnlyInstModal(null)}>Cancelar</Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-500 text-white"
                  onClick={() => payInterestOnlyMut.mutate({ loanId: iLoan.id, installmentId: inst.id })}
                  disabled={payInterestOnlyMut.isPending}
                >
                  {payInterestOnlyMut.isPending ? "Registrando..." : `Confirmar (${fmt(totalJuros)})`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}


      {/* ─── Modal de Taxa de Atraso ─────────────────────────────────────────────────────────── */}
      <Dialog open={!!feeModal} onOpenChange={(o) => { if (!o) { setFeeModal(null); setFeeCustomAmount(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Aplicar Taxa de Atraso
            </DialogTitle>
          </DialogHeader>
          {feeModal && (() => {
            const inst = feeModal.inst;
            const originalAmt = parseFloat(inst.amount);
            const cfg = lateFeeConfig;
            const feeAfter18h = cfg ? parseFloat(String(cfg.fee_after_18h)) || 0 : 10;
            const feeAfter20h = cfg ? parseFloat(String(cfg.fee_after_20h)) || 0 : 10;
            const feeMidnightPct = cfg ? parseFloat(String(cfg.fee_after_midnight_pct)) || 100 : 100;
            const feeTotal18_20 = feeAfter18h + feeAfter20h;
            const feeMidnight = Math.round(originalAmt * (feeMidnightPct / 100) * 100) / 100;
            const customFee = parseFloat(feeCustomAmount) || 0;
            return (
              <div className="space-y-4">
                <div className="bg-muted/40 rounded-lg p-3 text-sm">
                  <p className="text-muted-foreground">Parcela <strong className="text-foreground">#{inst.installmentNumber}</strong></p>
                  <p className="text-muted-foreground">Valor atual: <strong className="text-foreground">{fmt(inst.amount)}</strong></p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Taxa pré-estabelecida</p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-left transition-colors"
                      onClick={() => applyLateFee.mutate({ installmentId: inst.id, feeAmount: feeAfter18h })}
                      disabled={applyLateFee.isPending}
                    >
                      <span className="text-sm text-amber-300">Taxa 18h–20h</span>
                      <span className="text-sm font-bold text-amber-400">+R$ {feeAfter18h.toFixed(2).replace('.', ',')}</span>
                    </button>
                    <button
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 text-left transition-colors"
                      onClick={() => applyLateFee.mutate({ installmentId: inst.id, feeAmount: feeTotal18_20 })}
                      disabled={applyLateFee.isPending}
                    >
                      <span className="text-sm text-orange-300">Taxa 20h–23:59 (acumulada)</span>
                      <span className="text-sm font-bold text-orange-400">+R$ {feeTotal18_20.toFixed(2).replace('.', ',')}</span>
                    </button>
                    <button
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-left transition-colors"
                      onClick={() => applyLateFee.mutate({ installmentId: inst.id, feeAmount: feeMidnight })}
                      disabled={applyLateFee.isPending}
                    >
                      <span className="text-sm text-red-300">Taxa após meia-noite ({feeMidnightPct}%)</span>
                      <span className="text-sm font-bold text-red-400">+R$ {feeMidnight.toFixed(2).replace('.', ',')}</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ou valor personalizado</p>
                  <div className="flex gap-2">
                    <input
                      type="number" min="0" step="0.01"
                      placeholder="Ex: 15.00"
                      value={feeCustomAmount}
                      onChange={(e) => setFeeCustomAmount(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                    <Button
                      size="sm"
                      disabled={customFee <= 0 || applyLateFee.isPending}
                      onClick={() => applyLateFee.mutate({ installmentId: inst.id, feeAmount: customFee })}
                      className="bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      Aplicar
                    </Button>
                  </div>
                  {customFee > 0 && (
                    <p className="text-xs text-muted-foreground">Novo valor: <strong className="text-foreground">{fmt(String(originalAmt + customFee))}</strong></p>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── Modal de Recibo ───────────────────────────────────────────────────────────────────── */}
      <Dialog open={!!receiptModal} onOpenChange={(o) => { if (!o) { setReceiptModal(null); setReceiptData(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-violet-400" />
              Recibo de Pagamento
            </DialogTitle>
          </DialogHeader>
          {receiptLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Gerando recibo...</p>
            </div>
          ) : receiptData ? (
            <div className="space-y-4">
              {/* Preview do recibo */}
              <div className="bg-muted/40 rounded-lg p-4 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Nº do Recibo</span>
                  <span className="text-sm font-bold text-violet-400">{receiptData.receiptNumber}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">Cliente</span>
                  <span className="font-medium text-right">{receiptData.clientName}</span>
                  <span className="text-muted-foreground">Parcela</span>
                  <span className="font-medium text-right">{receiptData.installmentNumber} de {receiptData.totalInstallments}</span>
                  {receiptData.feeApplied && parseFloat(receiptData.feeApplied) > 0 ? (
                    <>
                      <span className="text-muted-foreground">Valor Original</span>
                      <span className="font-medium text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(receiptData.originalAmount || receiptData.amountPaid))}</span>
                      <span className="text-red-400 font-medium">Taxa / Multa de Atraso</span>
                      <span className="font-bold text-red-400 text-right">+ {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(receiptData.feeApplied))}</span>
                      <span className="text-muted-foreground">Valor Total Pago</span>
                      <span className="font-bold text-emerald-400 text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(receiptData.amountPaid))}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">Valor Pago</span>
                      <span className="font-bold text-emerald-400 text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(receiptData.amountPaid))}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Data do Pagamento</span>
                  <span className="font-medium text-right">{receiptData.paidAt}</span>
                  {receiptData.nextDueDate && (
                    <>
                      <span className="text-muted-foreground">Próximo Vencimento</span>
                      <span className="font-medium text-right">{receiptData.nextDueDate}</span>
                    </>
                  )}
                </div>
              </div>
              {/* Botões de ação */}
              <div className="grid grid-cols-1 gap-2">
                <div className="flex gap-2">
                  <a href={receiptData.pdfUrl} target="_blank" rel="noopener noreferrer" download={`${receiptData.receiptNumber}.pdf`}
                    className="flex-1 flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors">
                    <Download className="w-4 h-4" /> Baixar PDF
                  </a>
                  {receiptData.jpgUrl ? (
                    <a href={receiptData.jpgUrl} target="_blank" rel="noopener noreferrer" download={`${receiptData.receiptNumber}.jpg`}
                      className="flex-1 flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors">
                      <ImageIcon className="w-4 h-4" /> Baixar JPG
                    </a>
                  ) : (
                    <button disabled className="flex-1 flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-amber-600/20 text-amber-400/40 cursor-not-allowed">
                      <ImageIcon className="w-4 h-4" /> JPG indisponível
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input type="email"
                    placeholder={receiptData.clientEmail ? receiptData.clientEmail : "E-mail do cliente"}
                    value={receiptEmailInput}
                    onChange={(e) => setReceiptEmailInput(e.target.value)}
                    className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500" />
                  <Button size="sm" variant="outline"
                    className="h-9 gap-1.5 text-blue-400 border-blue-500/30 hover:bg-blue-500/10 shrink-0"
                    disabled={receiptEmailSending || !receiptEmailInput.trim()}
                    onClick={async () => {
                      setReceiptEmailSending(true);
                      await sendReceiptEmailMutation.mutateAsync({ installmentId: receiptModal!.inst.id, emailOverride: receiptEmailInput.trim() || undefined });
                      setReceiptEmailSending(false);
                    }}>
                    {receiptEmailSending ? <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" /> : <span>Enviar E-mail</span>}
                  </Button>
                </div>
                {receiptData.clientPhone && (
                  <a href={`https://wa.me/55${receiptData.clientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${receiptData.clientName}! Segue seu recibo da Parcela #${receiptData.installmentNumber} no valor de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(receiptData.amountPaid))}. Acesse o PDF: ${receiptData.pdfUrl}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Enviar por WhatsApp
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <p className="text-sm text-red-400">Erro ao gerar recibo. Tente novamente.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReceiptModal(null); setReceiptData(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Extrato Completo do Empréstimo */}
      <Dialog open={!!statementModal} onOpenChange={(o) => { if (!o) { setStatementModal(null); setStatementData(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" />
              Extrato do Empréstimo
            </DialogTitle>
          </DialogHeader>
          {statementLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Gerando extrato completo...</p>
              <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
            </div>
          ) : statementData ? (
            <div className="space-y-4">
              {/* Preview do extrato */}
              <div className="bg-muted/40 rounded-lg p-4 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Documento</span>
                  <span className="text-sm font-bold text-amber-400">{statementData.docId}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">Cliente</span>
                  <span className="font-medium text-right">{statementData.clientName}</span>
                  {statementData.clientPhone && (
                    <>
                      <span className="text-muted-foreground">Telefone</span>
                      <span className="font-medium text-right">{statementData.clientPhone}</span>
                    </>
                  )}
                  {statementData.clientEmail && (
                    <>
                      <span className="text-muted-foreground">E-mail</span>
                      <span className="font-medium text-right text-xs">{statementData.clientEmail}</span>
                    </>
                  )}
                </div>
              </div>
              {/* Ações */}
              <div className="grid grid-cols-1 gap-2">
                <a href={statementData.pdfUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors">
                  <Download className="w-4 h-4" /> Baixar PDF
                </a>
                <div className="flex gap-2">
                  <input type="email"
                    placeholder={statementData.clientEmail || "E-mail do cliente"}
                    value={statementEmailInput}
                    onChange={(e) => setStatementEmailInput(e.target.value)}
                    className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  <Button size="sm" variant="outline"
                    className="h-9 gap-1.5 text-blue-400 border-blue-500/30 hover:bg-blue-500/10 shrink-0"
                    disabled={statementEmailSending || !statementEmailInput.trim()}
                    onClick={async () => {
                      setStatementEmailSending(true);
                      await sendStatementEmailMutation.mutateAsync({
                        loanId: statementModal!.loanId,
                        emailOverride: statementEmailInput.trim() || undefined,
                        pdfBase64: statementData.pdfBuffer,
                        docId: statementData.docId,
                        clientName: statementData.clientName,
                      });
                      setStatementEmailSending(false);
                    }}>
                    {statementEmailSending ? <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" /> : <span>Enviar E-mail</span>}
                  </Button>
                </div>
                {statementData.whatsappUrl && (
                  <a href={statementData.whatsappUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Enviar por WhatsApp
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <p className="text-sm text-red-400">Erro ao gerar extrato. Tente novamente.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStatementModal(null); setStatementData(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
            </Dialog>

      {/* ─── Modal: Notificar Aprovação / Depósito ─── */}
      {approvalNotifyModal && (
        <ApprovalNotifyModal
          loan={approvalNotifyModal}
          lateFeeConfig={lateFeeConfig}
          onClose={() => setApprovalNotifyModal(null)}
        />
      )}

      {/* ─── Modal: Avisar Parcela Vencendo ─── */}
      {installmentNotifyModal && (
        <InstallmentNotifyModal
          loan={installmentNotifyModal.loan}
          inst={installmentNotifyModal.inst}
          lateFeeConfig={lateFeeConfig}
          onClose={() => setInstallmentNotifyModal(null)}
        />
      )}
    </div>
  );
}

// ─── Modal de Notificação de Aprovação ─────────────────────────────────────
function ApprovalNotifyModal({ loan, lateFeeConfig, onClose }: { loan: any; lateFeeConfig: any; onClose: () => void }) {
  const paymentLabels: Record<string, string> = {
    diario: 'Diário',
    semanal: 'Semanal',
    quinzenal: 'Quinzenal',
    mensal: 'Mensal',
  };
  const workDaysLabels: Record<string, string> = {
    seg_sab: 'Segunda a Sábado (20x)',
    seg_dom: 'Segunda a Domingo (25x)',
  };

  const paymentLabel = paymentLabels[loan.paymentType] || loan.paymentType || 'Diário';
  const workDaysLabel = loan.paymentType === 'diario' && loan.workDays
    ? workDaysLabels[loan.workDays] || loan.workDays
    : '';
  const paymentFull = workDaysLabel ? `${paymentLabel} — ${workDaysLabel}` : paymentLabel;

  const amount = parseFloat(loan.amount || 0);
  const totalAmount = parseFloat(loan.totalAmount || 0);
  const interestRate = parseFloat(loan.interestRate || 0);
  const installments = loan.totalInstallments || loan.installments || '?';
  const installmentAmt = installments > 0 ? (totalAmount / installments) : 0;
  const dueDate = loan.dueDate ? (() => { const s = String(loan.dueDate).slice(0,10); const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; })() : '—';

  const fee18h = lateFeeConfig?.fee_after_18h ?? 10;
  const fee20h = lateFeeConfig?.fee_after_20h ?? 10;
  const feeMidnight = lateFeeConfig?.fee_after_midnight_pct ?? 100;
  const rulesText = lateFeeConfig?.rules_text || '';

  const pixKey = loan.clientPixKey || loan.pixKey || '';
  const pixName = loan.clientPixName || loan.pixName || '';
  const pixBank = loan.clientPixBank || loan.pixBank || '';

  const defaultMsg = `Ola ${loan.clientName},\n\n` +
    `*SEU PIX JA FOI LIBERADO!*\n` +
    `Em breve estara disponivel em sua conta.\n\n` +
    `*Valor liberado:* R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
    `*Seu pagamento e:* ${paymentFull}\n` +
    `*Taxa de juros:* ${interestRate.toFixed(0)}%\n` +
    `*Total a pagar:* R$ ${totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${installments}x de R$ ${installmentAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
    `*Vencimento final:* ${dueDate}\n\n` +
    `*NORMAS E TAXAS DE ATRASO:*\n` +
    (rulesText ? rulesText + '\n' :
      `- Apos 18h: taxa adicional de R$ ${fee18h.toFixed(2).replace('.',',')}\n` +
      `- Apos 20h: taxa adicional de mais R$ ${fee20h.toFixed(2).replace('.',',')}\n` +
      `- Apos meia-noite: ${feeMidnight}% do valor da parcela\n`) +
    `\nQualquer duvida, estamos a disposicao!`;

  const [msg, setMsg] = useState(defaultMsg);

  const copyMsg = () => {
    navigator.clipboard.writeText(msg);
    toast.success('Mensagem copiada!');
  };

  const waUrl = loan.clientPhone
    ? `https://wa.me/55${loan.clientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`
    : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">📨</span>
            Notificar Aprovação — {loan.clientName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Info do empréstimo */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 space-y-1 text-sm">
            <p>💰 <strong>Valor:</strong> R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p>💳 <strong>Pagamento:</strong> {paymentFull}</p>
            <p>📊 <strong>Taxa:</strong> {interestRate.toFixed(0)}% — Total: R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            {pixKey && <p>💠 <strong>PIX:</strong> {pixKey}{pixName ? ` · ${pixName}` : ''}{pixBank ? ` · ${pixBank}` : ''}</p>}
          </div>
          {/* Mensagem editável */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Mensagem (editável)</label>
            <Textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              rows={14}
              className="font-mono text-xs resize-none"
            />
          </div>
          {/* Botões */}
          <div className="flex flex-col gap-2">
            <Button onClick={copyMsg} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              📋 Copiar Mensagem
            </Button>
            {waUrl ? (
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="w-full">
                <Button variant="outline" className="w-full border-green-500/40 text-green-400 hover:bg-green-500/10">
                  <span className="mr-2">📱</span> Abrir no WhatsApp ({loan.clientPhone})
                </Button>
              </a>
            ) : (
              <p className="text-xs text-amber-400 text-center">⚠️ Cliente sem telefone cadastrado</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de Aviso de Parcela Vencendo ──────────────────────────────────
function InstallmentNotifyModal({ loan, inst, lateFeeConfig, onClose }: { loan: any; inst: any; lateFeeConfig: any; onClose: () => void }) {
  const paymentLabels: Record<string, string> = {
    diario: 'Diario',
    semanal: 'Semanal',
    quinzenal: 'Quinzenal',
    mensal: 'Mensal',
  };
  const cycleDays: Record<string, string> = {
    diario: 'diario',
    semanal: '7 dias',
    quinzenal: '15 dias',
    mensal: '30 dias',
  };

  const paymentLabel = paymentLabels[loan.paymentType] || loan.paymentType || 'Diario';
  const cycleLabel = cycleDays[loan.paymentType] || '';
  const isDiario = loan.paymentType === 'diario';
  const isSemanal = loan.paymentType === 'semanal';
  const isQuinzenal = loan.paymentType === 'quinzenal';
  const isMensal = loan.paymentType === 'mensal';
  const isPeriodico = isQuinzenal || isMensal; // taxa diferente: R$ 50/dia

  const instNum = inst.installmentNumber || '?';
  const totalInst = loan.totalInstallments || loan.installments || '?';
  const amount = parseFloat(inst.amount || 0);
  const dueDate = inst.dueDate ? (() => { const s = String(inst.dueDate).slice(0,10); const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; })() : '?';

  const fee18h = lateFeeConfig?.fee_after_18h ?? 10;
  const fee20h = lateFeeConfig?.fee_after_20h ?? 10;
  const feeMidnight = lateFeeConfig?.fee_after_midnight_pct ?? 100;
  const rulesText = lateFeeConfig?.rules_text || '';

  // Regras de atraso conforme tipo de pagamento
  const lateRules = isPeriodico
    ? `- Multa de atraso: R$ 50,00 por dia de atraso\n`
    : (rulesText ? rulesText + '\n' :
        `- Apos 18h: taxa adicional de R$ ${fee18h.toFixed(2).replace('.',',')}\n` +
        `- Apos 20h: taxa adicional de mais R$ ${fee20h.toFixed(2).replace('.',',')}\n` +
        `- Apos meia-noite: ${feeMidnight}% do valor da parcela\n`);

  const lateFooter = isPeriodico
    ? ''
    : '\nPague antes das 18h para evitar taxas adicionais.';

  const defaultMsg =
    `Ola ${loan.clientName},\n\n` +
    `*LEMBRETE DE PAGAMENTO*\n\n` +
    `Voce tem uma parcela com vencimento HOJE, ${dueDate}.\n\n` +
    `*Parcela:* #${instNum} de ${totalInst}\n` +
    `*Valor:* R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
    `*Tipo de pagamento:* ${paymentLabel}${!isDiario ? ` (a cada ${cycleLabel})` : ''}\n\n` +
    `*ATENCAO - TAXAS DE ATRASO:*\n` +
    lateRules +
    lateFooter +
    `\n\nQualquer duvida, estamos a disposicao!`;

  const [msg, setMsg] = useState(defaultMsg);

  const copyMsg = () => {
    navigator.clipboard.writeText(msg);
    toast.success('Mensagem copiada!');
  };

  const waUrl = loan.clientPhone
    ? `https://wa.me/55${loan.clientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`
    : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">&#128241;</span>
            Avisar Parcela #{instNum} — {loan.clientName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 space-y-1 text-sm">
            <p><strong>Parcela:</strong> #{instNum} de {totalInst}</p>
            <p><strong>Valor:</strong> R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p><strong>Vencimento:</strong> {dueDate}</p>
            <p><strong>Tipo:</strong> {paymentLabel}{!isDiario ? ` — a cada ${cycleLabel}` : ''}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Mensagem (editável)</label>
            <Textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              rows={14}
              className="font-mono text-xs resize-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={copyMsg} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              &#128203; Copiar Mensagem
            </Button>
            {waUrl ? (
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="w-full">
                <Button variant="outline" className="w-full border-green-500/40 text-green-400 hover:bg-green-500/10">
                  <span className="mr-2">&#128241;</span> Abrir no WhatsApp ({loan.clientPhone})
                </Button>
              </a>
            ) : (
              <p className="text-xs text-amber-400 text-center">⚠️ Cliente sem telefone cadastrado</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal criar empréstimo ──────────────────────────────────────────────────
function CreateLoanModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { data: clients = [] } = trpc.loans.listClients.useQuery({});
  const [clientId, setClientId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState<"diario" | "semanal" | "mensal" | "quinzenal">("diario");
  const [workDays, setWorkDays] = useState<"seg_sab" | "seg_dom" | "custom">("seg_sab");
  const [customInstallments, setCustomInstallments] = useState("10");
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [customDays, setCustomDays] = useState(""); // prazo editável para semanal/quinzenal/mensal
  const [customRate, setCustomRate] = useState(""); // taxa de juros editável

    const selectedClient = (clients as any[]).find((c) => String(c.id) === clientId);
  // Modos de pagamento permitidos pelo perfil do cliente
  const allowedModes: string[] = selectedClient?.defaultPaymentTypes
    ? selectedClient.defaultPaymentTypes.split(",").map((t: string) => t.trim()).filter(Boolean)
    : ["diario", "semanal", "quinzenal", "mensal"];
  // Pré-preenche a taxa com o valor do perfil quando cliente é selecionado
  useEffect(() => {
    if (selectedClient) {
      setCustomRate(String(parseFloat(selectedClient.interestRate) || 0));
      setCustomDays(""); // reseta prazo ao trocar cliente
      // Se o paymentType atual não é permitido, muda para o primeiro permitido
      const modes = selectedClient.defaultPaymentTypes
        ? selectedClient.defaultPaymentTypes.split(",").map((t: string) => t.trim()).filter(Boolean)
        : ["diario", "semanal", "quinzenal", "mensal"];
      if (!modes.includes(paymentType)) {
        setPaymentType(modes[0] as any || "diario");
      }
    } else {
      setCustomRate("");
      setCustomDays("");
    }
  }, [clientId]);

  const createLoan = trpc.loans.createLoan.useMutation({
    onSuccess,
    onError: (e) => toast.error(e.message),
  });

  const defaultRate = selectedClient ? parseFloat(selectedClient.interestRate) : 0;
  // interestRate: usa o valor digitado no campo (já pré-preenchido com o padrão do perfil)
  const interestRate = customRate !== "" ? (parseFloat(customRate) || 0) : defaultRate;
  const amountNum = parseFloat(amount) || 0;
  const interest = amountNum * (interestRate / 100);
  const total = amountNum + interest;
  // Prazo máximo por tipo de pagamento (padrão do perfil)
  const getDefaultDaysByType = () => {
    if (!selectedClient) return 30;
    if (paymentType === "semanal") return parseInt(selectedClient.maxDaysSemanal) || parseInt(selectedClient.maxDays) || 60;
    if (paymentType === "quinzenal") return parseInt(selectedClient.maxDaysQuinzenal) || parseInt(selectedClient.maxDays) || 60;
    if (paymentType === "mensal") return parseInt(selectedClient.maxDaysMensal) || parseInt(selectedClient.maxDays) || 90;
    return parseInt(selectedClient.maxDays) || 30; // diario
  };
  // Prazo efetivo: usa customDays se preenchido, senão usa padrão do perfil
  const days = paymentType !== "diario" && customDays ? (parseInt(customDays) || getDefaultDaysByType()) : getDefaultDaysByType();

  // Calcula parcelas conforme regime
  const calcInstallments = () => {
    if (paymentType === "diario") {
      if (workDays === "seg_sab") return 20;
      if (workDays === "seg_dom") return 25;
      return parseInt(customInstallments) || 1;
    }
    if (paymentType === "semanal") return Math.max(1, Math.floor(days / 7));
    if (paymentType === "quinzenal") return Math.max(1, Math.floor(days / 15));
    // mensal
    return Math.max(1, Math.floor(days / 30));
  };
  const numInstallments = calcInstallments();
  const perInstallment = numInstallments > 0 ? total / numInstallments : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo Empréstimo</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="bg-card/60"><SelectValue placeholder="Selecione o cliente..." /></SelectTrigger>
              <SelectContent>
                {(clients as any[]).filter((c) => c.status === "ativo" && c.loanEnabled).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedClient && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Limite</span><span className="text-green-400 font-medium">{fmt(selectedClient.creditLimit)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Taxa</span><span>{interestRate.toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Prazo máximo ({paymentType === "diario" ? "Diário" : paymentType === "semanal" ? "Semanal" : paymentType === "quinzenal" ? "Quinzenal" : "Mensal"})</span><span>{days} dias</span></div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input type="number" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Taxa de Juros (%)</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                placeholder={defaultRate.toFixed(1)}
                value={customRate}
                onChange={(e) => setCustomRate(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">%</span>
            </div>
            <p className="text-xs text-muted-foreground">Padrão do perfil: {defaultRate.toFixed(1)}% — edite para usar outra taxa neste empréstimo</p>
          </div>

          <div className="space-y-2">
            <Label>Tipo de pagamento</Label>
            <Select value={paymentType} onValueChange={(v) => setPaymentType(v as any)}>
              <SelectTrigger className="bg-card/60"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedModes.includes("diario") && <SelectItem value="diario">Diário</SelectItem>}
                {allowedModes.includes("semanal") && <SelectItem value="semanal">Semanal</SelectItem>}
                {allowedModes.includes("quinzenal") && <SelectItem value="quinzenal">Quinzenal (15 em 15 dias)</SelectItem>}
                {allowedModes.includes("mensal") && <SelectItem value="mensal">Mensal</SelectItem>}
              </SelectContent>
            </Select>
            {selectedClient && allowedModes.length < 4 && (
              <p className="text-xs text-amber-400/80">Perfil permite apenas: {allowedModes.map((m: string) => m === "diario" ? "Diário" : m === "semanal" ? "Semanal" : m === "quinzenal" ? "Quinzenal" : "Mensal").join(", ")}</p>
            )}
          </div>
          {paymentType !== "diario" && (
            <div className="space-y-2">
              <Label>Prazo (dias)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                placeholder={`Padrão: ${getDefaultDaysByType()} dias`}
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para usar o padrão do perfil ({getDefaultDaysByType()} dias) —{" "}
                {paymentType === "semanal" && `${Math.max(1, Math.floor(days / 7))} parcela(s) semanal(is)`}
                {paymentType === "quinzenal" && `${Math.max(1, Math.floor(days / 15))} parcela(s) quinzenal(is)`}
                {paymentType === "mensal" && `${Math.max(1, Math.floor(days / 30))} parcela(s) mensal(is)`}
              </p>
            </div>
          )}

          {paymentType === "diario" && (
            <div className="space-y-2">
              <Label>Número de Parcelas Diárias</Label>
              <Input
                type="number"
                min={1}
                max={365}
                placeholder="Ex: 5, 10, 20..."
                value={customInstallments}
                onChange={(e) => { setCustomInstallments(e.target.value); setWorkDays("custom"); }}
                className="border-orange-500/50 focus:border-orange-400"
              />
              <p className="text-xs text-muted-foreground">Digite quantas parcelas diárias deseja — ou escolha um regime padrão abaixo</p>
            </div>
          )}

          {paymentType === "diario" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Regime de dias úteis (opcional)</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { setWorkDays("seg_sab"); setCustomInstallments("20"); }}
                  className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                    workDays === "seg_sab"
                      ? "border-violet-500 bg-violet-500/20 text-violet-300"
                      : "border-border bg-card/40 text-muted-foreground hover:border-violet-500/50"
                  }`}
                >
                  <div className="font-bold">Seg – Sáb</div>
                  <div className="text-xs opacity-75">20x · folga dom</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setWorkDays("seg_dom"); setCustomInstallments("25"); }}
                  className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                    workDays === "seg_dom"
                      ? "border-green-500 bg-green-500/20 text-green-300"
                      : "border-border bg-card/40 text-muted-foreground hover:border-green-500/50"
                  }`}
                >
                  <div className="font-bold">Seg – Dom</div>
                  <div className="text-xs opacity-75">25x · corrido</div>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkDays("custom")}
                  className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                    workDays === "custom"
                      ? "border-orange-500 bg-orange-500/20 text-orange-300"
                      : "border-border bg-card/40 text-muted-foreground hover:border-orange-500/50"
                  }`}
                >
                  <div className="font-bold">Personalizado</div>
                  <div className="text-xs opacity-75">escolha o nº</div>
                </button>
              </div>
              {workDays === "custom" && (
                <div className="space-y-1">
                  <Label className="text-orange-300">Número de parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    placeholder="Ex: 5"
                    value={customInstallments}
                    onChange={(e) => setCustomInstallments(e.target.value)}
                    className="border-orange-500/50 focus:border-orange-400"
                  />
                  <p className="text-xs text-muted-foreground">Parcelas diárias consecutivas (pula domingo)</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Data de liberação</Label>
            <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
          </div>

          {amountNum > 0 && selectedClient && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Juros</span><span className="text-yellow-400">{fmt(interest)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total a receber</span><span className="font-bold text-green-400">{fmt(total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Parcelas</span><span>{numInstallments}x de {fmt(perInstallment)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Prazo</span><span>{days} dias</span></div>
              {paymentType === "diario" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Regime</span>
                  <span className={workDays === "seg_sab" ? "text-violet-300" : workDays === "seg_dom" ? "text-green-300" : "text-orange-300"}>
                    {workDays === "seg_sab" ? "Seg–Sáb (folga domingo)" : workDays === "seg_dom" ? "Seg–Dom (corrido)" : `Personalizado (${parseInt(customInstallments) || 1}x)`}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea placeholder="..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => createLoan.mutate({ clientId: parseInt(clientId), amount: amountNum, interestRate, days, paymentType, workDays: workDays as "seg_sab" | "seg_dom" | "custom", customInstallments: workDays === "custom" ? parseInt(customInstallments) || 1 : undefined, releaseDate, notes })}
            disabled={!clientId || !amount || amountNum <= 0 || createLoan.isPending}>
            {createLoan.isPending ? "Criando..." : "Criar Empréstimo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Modal editar empréstimo ──────────────────────────────────────────────────
function EditLoanModal({ loan, onClose, onSuccess }: { loan: any; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState(String(loan.amount || ""));
  const [interestRate, setInterestRate] = useState(String(loan.interestRate || ""));
  const [days, setDays] = useState(String(loan.days || ""));
  const [paymentType, setPaymentType] = useState<"diario" | "semanal" | "mensal" | "quinzenal">(loan.paymentType || "diario");
  const editAllowedModes: string[] = loan.profileAllowedModes
    ? loan.profileAllowedModes.split(",").map((t: string) => t.trim()).filter(Boolean)
    : ["diario", "semanal", "quinzenal", "mensal"];
  const [workDays, setWorkDays] = useState<"seg_sab" | "seg_dom" | "custom">(loan.workDays || "seg_sab");
  // Inicializa customInstallments com o número atual de parcelas do empréstimo
  const [customInstallments, setCustomInstallments] = useState(String(loan.installments || (loan.workDays === "seg_dom" ? 25 : 20)));
  const [releaseDate, setReleaseDate] = useState(loan.releaseDate ? loan.releaseDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(loan.notes || "");

  const editLoan = trpc.loans.editLoan.useMutation({
    onSuccess,
    onError: (e) => toast.error(e.message),
  });

  const amountNum = parseFloat(amount) || 0;
  const rateNum = parseFloat(interestRate) || 0;
  const daysNum = parseInt(days) || 1;
  const interest = amountNum * (rateNum / 100);
  const total = amountNum + interest;
  const numInstallments = paymentType === "diario"
    ? (workDays === "custom" ? (parseInt(customInstallments) || 1) : workDays === "seg_sab" ? 20 : 25)
    : paymentType === "semanal" ? Math.max(1, Math.floor(daysNum / 7))
    : paymentType === "quinzenal" ? Math.max(1, Math.floor(daysNum / 15))
    : Math.max(1, Math.floor(daysNum / 30));
  const perInstallment = numInstallments > 0 ? total / numInstallments : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Empréstimo</DialogTitle>
          <p className="text-sm text-muted-foreground">{loan.clientName}</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">
            ⚠️ As parcelas <strong>já pagas</strong> serão preservadas. Apenas as parcelas <strong>pendentes</strong> serão recalculadas.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Taxa de Juros (%)</Label>
              <Input type="number" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Prazo (dias)</Label>
              <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data de liberação</Label>
              <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de pagamento</Label>
            <Select value={paymentType} onValueChange={(v) => setPaymentType(v as any)}>
              <SelectTrigger className="bg-card/60"><SelectValue /></SelectTrigger>
              <SelectContent>
                {editAllowedModes.includes("diario") && <SelectItem value="diario">Diário</SelectItem>}
                {editAllowedModes.includes("semanal") && <SelectItem value="semanal">Semanal</SelectItem>}
                {editAllowedModes.includes("quinzenal") && <SelectItem value="quinzenal">Quinzenal (15 em 15 dias)</SelectItem>}
                {editAllowedModes.includes("mensal") && <SelectItem value="mensal">Mensal</SelectItem>}
              </SelectContent>
            </Select>
            {editAllowedModes.length < 4 && (
              <p className="text-xs text-amber-400/80">Perfil permite apenas: {editAllowedModes.map((m: string) => m === "diario" ? "Diário" : m === "semanal" ? "Semanal" : m === "quinzenal" ? "Quinzenal" : "Mensal").join(", ")}</p>
            )}
          </div>
          {paymentType === "diario" && (
            <div className="space-y-2">
              <Label>Número de Parcelas Diárias</Label>
              <Input
                type="number"
                min={1}
                max={365}
                placeholder="Ex: 5, 10, 20..."
                value={customInstallments}
                onChange={(e) => { setCustomInstallments(e.target.value); setWorkDays("custom"); }}
                className="border-orange-500/50 focus:border-orange-400"
              />
              <p className="text-xs text-muted-foreground">Digite quantas parcelas diárias — ou escolha um regime padrão abaixo</p>
            </div>
          )}

          {paymentType === "diario" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Regime padrão (opcional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setWorkDays("seg_sab"); setCustomInstallments("20"); }}
                  className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                    workDays === "seg_sab" ? "border-violet-500 bg-violet-500/20 text-violet-300" : "border-border bg-card/40 text-muted-foreground hover:border-violet-500/50"
                  }`}>
                  <div className="font-bold">Seg – Sáb</div>
                  <div className="text-xs opacity-75">20 parcelas · folga domingo</div>
                </button>
                <button type="button" onClick={() => { setWorkDays("seg_dom"); setCustomInstallments("25"); }}
                  className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                    workDays === "seg_dom" ? "border-green-500 bg-green-500/20 text-green-300" : "border-border bg-card/40 text-muted-foreground hover:border-green-500/50"
                  }`}>
                  <div className="font-bold">Seg – Dom</div>
                  <div className="text-xs opacity-75">25 parcelas · todos os dias</div>
                </button>
              </div>
            </div>
          )}

          {amountNum > 0 && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Juros</span><span className="text-yellow-400">{fmt(interest)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total a receber</span><span className="font-bold text-green-400">{fmt(total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Parcelas</span><span>{numInstallments}x de {fmt(perInstallment)}</span></div>
              {paymentType === "diario" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Regime</span>
                  <span className={workDays === "seg_sab" ? "text-violet-300" : "text-green-300"}>
                    {workDays === "seg_sab" ? "Seg–Sáb (folga domingo)" : "Seg–Dom (corrido)"}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea placeholder="..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => editLoan.mutate({ id: loan.id, amount: amountNum, interestRate: rateNum, days: daysNum, paymentType, workDays: workDays as "seg_sab" | "seg_dom" | "custom", customInstallments: workDays === "custom" ? (parseInt(customInstallments) || 1) : undefined, releaseDate, notes })}
            disabled={!amount || amountNum <= 0 || editLoan.isPending}>
            {editLoan.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Clientes ────────────────────────────────────────────────────────────────
function ClientsTab() {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "sem_limite" | "desabilitado">("all");
  const [editClient, setEditClient] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();
  const { data: clientsRaw = [], isLoading } = trpc.loans.listClients.useQuery({ search });
  const clients = (clientsRaw as any[]).filter((c) => {
    if (filterMode === "sem_limite") return parseFloat(c.creditLimit || 0) === 0;
    if (filterMode === "desabilitado") return !c.loanEnabled;
    return true;
  });
  const { data: profiles = [] } = trpc.loans.listProfiles.useQuery();

  const toggleEnabled = trpc.loans.toggleLoanEnabled.useMutation({
    onSuccess: () => utils.loans.listClients.invalidate(),
    onError: (e) => toast.error(e.message),
  });
    const deleteClient = trpc.loans.deleteClient.useMutation({
    onSuccess: () => { toast.success("Cliente removido."); utils.loans.listClients.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const syncFromGastos = trpc.loans.syncFromGastos.useMutation({
    onSuccess: (res) => {
      utils.loans.listClients.invalidate();
      toast.success(`Sincronizado! ${res.total} clientes do Gastos. ${res.created} novo(s) criado(s), ${res.updated} já existia(m).`);
    },
    onError: (e) => toast.error("Erro ao sincronizar: " + e.message),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF ou telefone..." className="pl-8 h-9 bg-card/60" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={filterMode === "all" ? "default" : "outline"} className={`h-9 text-xs ${filterMode !== "all" ? "bg-transparent border-border text-muted-foreground hover:text-foreground" : ""}`} onClick={() => setFilterMode("all")}>
            Todos ({(clientsRaw as any[]).length})
          </Button>
          <Button size="sm" variant={filterMode === "sem_limite" ? "default" : "outline"} className={`h-9 text-xs gap-1 ${filterMode === "sem_limite" ? "bg-amber-600 hover:bg-amber-700 border-amber-600" : "bg-transparent border-amber-500/40 text-amber-400 hover:bg-amber-500/10"}`} onClick={() => setFilterMode(filterMode === "sem_limite" ? "all" : "sem_limite")}>
            💰 Limite R$0 ({(clientsRaw as any[]).filter((c) => parseFloat(c.creditLimit || 0) === 0).length})
          </Button>
          <Button size="sm" variant={filterMode === "desabilitado" ? "default" : "outline"} className={`h-9 text-xs gap-1 ${filterMode === "desabilitado" ? "bg-red-700 hover:bg-red-800 border-red-700" : "bg-transparent border-red-500/40 text-red-400 hover:bg-red-500/10"}`} onClick={() => setFilterMode(filterMode === "desabilitado" ? "all" : "desabilitado")}>
            🔴 Desabilitado ({(clientsRaw as any[]).filter((c) => !c.loanEnabled).length})
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 bg-transparent"
          onClick={() => syncFromGastos.mutate()}
          disabled={syncFromGastos.isPending}
          title="Sincronizar clientes com senhas ativas do Gastos"
        >
          <RefreshCw className={`w-4 h-4 ${syncFromGastos.isPending ? 'animate-spin' : ''}`} />
          {syncFromGastos.isPending ? 'Sincronizando...' : 'Sync Gastos'}
        </Button>
        <Button size="sm" className="h-9 gap-1" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />Novo Cliente
        </Button>
      </div>

      {isLoading && <div className="text-center py-8"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>}

      <div className="space-y-2">
        {(clients as any[]).map((c) => (
          <Card key={c.id} className="p-3 bg-card/60 border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold">{c.name}</span>
                  <Badge variant="outline" className={`text-xs ${c.status === "ativo" ? "bg-green-500/20 text-green-300" : c.status === "bloqueado" ? "bg-red-500/20 text-red-300" : "bg-orange-500/20 text-orange-300"}`}>
                    {c.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-muted/50 text-muted-foreground capitalize">{c.profileSlug}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {c.cpf && <span>CPF: {c.cpf}</span>}
                  {c.phone && <span>Tel: {c.phone}</span>}
                  <span>Limite: {fmt(c.creditLimit)}</span>
                  <span>Taxa: {parseFloat(c.interestRate).toFixed(1)}%</span>
                  <span>Prazo: {c.maxDays} dias</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Empréstimo</span>
                  <Switch checked={!!c.loanEnabled} onCheckedChange={(v) => toggleEnabled.mutate({ clientId: c.id, enabled: v ? 1 : 0 })} />
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditClient(c)}>
                  <Settings className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-300"
                  onClick={() => { if (confirm(`Remover ${c.name}?`)) deleteClient.mutate({ id: c.id }); }}>
                  <XCircle className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {(showCreate || editClient) && (
        <ClientFormModal
          client={editClient}
          profiles={profiles as any[]}
          onClose={() => { setShowCreate(false); setEditClient(null); }}
          onSuccess={() => { setShowCreate(false); setEditClient(null); utils.loans.listClients.invalidate(); }}
        />
      )}
    </div>
  );
}

function ClientFormModal({ client, profiles, onClose, onSuccess }: { client: any; profiles: any[]; onClose: () => void; onSuccess: () => void }) {
  const isEdit = !!client;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const searchResults = trpc.loans.searchMainCustomer.useQuery(
    { query: searchQuery },
    { enabled: searchEnabled && searchQuery.length >= 2 }
  );

  const [form, setForm] = useState({
    name: client?.name || "",
    cpf: client?.cpf || "",
    phone: client?.phone || "",
    status: client?.status || "ativo",
    profileSlug: client?.profileSlug || "bronze",
    creditLimit: client?.creditLimit || "",
    interestRate: client?.interestRate || "",
    notes: client?.notes || "",
    pixKey: client?.pixKey || "",
    pixKeyType: client?.pixKeyType || "cpf",
    pixName: client?.pixName || "",
    spreadsheetToken: client?.spreadsheetToken || "",
  });
  const getDefaultAllowedTypes = (profileSlug?: string) => {
    if (profileSlug && profiles.length) {
      const p = profiles.find((x) => x.slug === profileSlug);
      if (p?.defaultPaymentTypes) return p.defaultPaymentTypes.split(",").filter(Boolean);
    }
    return ["diario"];
  };
  const [allowedTypes, setAllowedTypes] = useState<string[]>(
    client?.allowedPaymentTypes
      ? client.allowedPaymentTypes.split(",").filter(Boolean)
      : getDefaultAllowedTypes(client?.profileSlug)
  );

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const onProfileChange = (slug: string) => {
    const p = profiles.find((x) => x.slug === slug);
    if (p) {
      setForm((prev) => ({ ...prev, profileSlug: slug, creditLimit: String(p.defaultLimit ?? p.creditLimit ?? ""), interestRate: String(p.defaultInterestRate ?? p.interestRate ?? "") }));
      // Atualiza os modos de pagamento com os do novo perfil
      if (p.defaultPaymentTypes) {
        setAllowedTypes(p.defaultPaymentTypes.split(",").filter(Boolean));
      }
    } else {
      set("profileSlug", slug);
    }
  };

  function selectCustomer(c: any) {
    setForm(prev => ({ ...prev, name: c.name || "", phone: c.phone || "", cpf: c.cpf || "" }));
    setSearchQuery("");
    setSearchEnabled(false);
  }

  function toggleMode(id: string) {
    setAllowedTypes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const save = trpc.loans.saveClient.useMutation({
    onSuccess,
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Cliente" : "Novo Cliente"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Busca no sistema principal */}
          {!isEdit && (
            <div className="bg-violet-950/30 border border-violet-500/30 rounded-lg p-3 space-y-2">
              <Label className="text-xs text-violet-300 font-semibold">🔍 Buscar cliente cadastrado no sistema</Label>
              <Input
                placeholder="Digite nome, telefone ou CPF..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchEnabled(true); }}
                className="bg-black/20 border-violet-500/30"
              />
              {searchResults.data && searchResults.data.length > 0 && (
                <div className="border border-violet-500/30 rounded-lg overflow-hidden">
                  {(searchResults.data as any[]).map((c: any) => (
                    <button key={c.id} onClick={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2 hover:bg-violet-600/20 border-b border-violet-500/20 last:border-0 transition-colors">
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone}{c.cpf ? ` · ${c.cpf}` : ""}</div>
                    </button>
                  ))}
                </div>
              )}
              {searchEnabled && searchQuery.length >= 2 && searchResults.data?.length === 0 && (
                <p className="text-xs text-red-400">Nenhum cliente encontrado no sistema.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>Nome completo</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1"><Label>CPF</Label><Input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" /></div>
            <div className="space-y-1"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="bg-card/60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="bloqueado">Bloqueado</SelectItem>
                  <SelectItem value="inadimplente">Inadimplente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Perfil</Label>
              <Select value={form.profileSlug} onValueChange={onProfileChange}>
                <SelectTrigger className="bg-card/60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => <SelectItem key={p.slug} value={p.slug} className="capitalize">{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Limite (R$)</Label><Input type="number" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} /></div>
            <div className="space-y-1"><Label>Taxa (%)</Label><Input type="number" step="0.1" value={form.interestRate} onChange={(e) => set("interestRate", e.target.value)} /></div>
          </div>
          {/* Modos de pagamento liberados */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Modos de pagamento liberados</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["diario", "semanal", "mensal"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMode(m)}
                  className={`rounded-lg border py-2 px-3 text-sm font-medium transition-all ${
                    allowedTypes.includes(m)
                      ? "border-violet-500 bg-violet-500/20 text-violet-300"
                      : "border-border/50 text-muted-foreground hover:border-violet-500/40"
                  }`}
                >
                  {m === "diario" ? "Diário" : m === "semanal" ? "Semanal" : "Mensal"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Clique para ativar/desativar cada modo</p>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">💰 PIX do cliente (para você enviar o dinheiro do empréstimo)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de chave PIX</Label>
                <Select value={form.pixKeyType} onValueChange={(v) => set("pixKeyType", v)}>
                  <SelectTrigger className="bg-card/60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="aleatoria">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Chave PIX</Label><Input value={form.pixKey} onChange={(e) => set("pixKey", e.target.value)} /></div>
              <div className="col-span-2 space-y-1"><Label>Nome do titular PIX</Label><Input value={form.pixName} onChange={(e) => set("pixName", e.target.value)} /></div>
            </div>
          </div>
          <div className="space-y-1"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate({ id: client?.id, ...form, creditLimit: parseFloat(form.creditLimit), interestRate: parseFloat(form.interestRate), allowedPaymentTypes: allowedTypes.join(",") })}
            disabled={!form.name || save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Perfis ──────────────────────────────────────────────────────────────────
function ProfilesTab() {
  const utils = trpc.useUtils();
  const { data: profiles = [], isLoading } = trpc.loans.listProfiles.useQuery();
  const [editProfile, setEditProfile] = useState<any | null>(null);
  const [syncingSlug, setSyncingSlug] = useState<string | null>(null);

  const save = trpc.loans.saveProfile.useMutation({
    onSuccess: () => { toast.success("Perfil salvo!"); setEditProfile(null); utils.loans.listProfiles.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const sync = trpc.loans.syncProfile.useMutation({
    onSuccess: (res) => { toast.success(`✅ ${res.count} cliente(s) sincronizado(s) com os valores do perfil!`); setSyncingSlug(null); utils.loans.listClients.invalidate(); },
    onError: (e) => { toast.error(e.message); setSyncingSlug(null); },
  });

  if (isLoading) return <div className="text-center py-8"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Configure os valores padrão de cada perfil. Ao selecionar um perfil para um cliente, esses valores são preenchidos automaticamente (mas podem ser ajustados individualmente).</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(profiles as any[]).map((p) => (
          <Card key={p.id} className="p-4 bg-card/60 border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold capitalize">{p.name}</h3>
                {p.slug === "bronze" && <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5">Padrão</span>}
              </div>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditProfile(p)}>
                <Settings className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Limite padrão</span><span className="font-medium">{fmt(p.creditLimit)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Taxa padrão</span><span>{parseFloat(p.interestRate || 0).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Diário Seg–Sáb</span><span className="text-violet-300 font-medium">20 parcelas</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Diário Seg–Dom</span><span className="text-violet-300 font-medium">25 parcelas</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Prazo Semanal</span><span>{p.maxDaysSemanal || p.maxDays} dias ({Math.max(1, Math.floor((p.maxDaysSemanal || p.maxDays || 60) / 7))}x)</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Prazo Quinzenal</span><span>{p.maxDaysQuinzenal || p.maxDays} dias ({Math.max(1, Math.floor((p.maxDaysQuinzenal || p.maxDays || 60) / 15))}x)</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Prazo Mensal</span><span>{p.maxDaysMensal || p.maxDays} dias ({Math.max(1, Math.floor((p.maxDaysMensal || p.maxDays || 90) / 30))}x)</span></div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/50">
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs gap-1.5 border-violet-500/40 text-violet-300 hover:bg-violet-500/10"
                disabled={syncingSlug === p.slug}
                onClick={() => { setSyncingSlug(p.slug); sync.mutate({ profileSlug: p.slug }); }}
              >
                {syncingSlug === p.slug ? <><RefreshCw className="w-3 h-3 animate-spin" /> Sincronizando...</> : <><RefreshCw className="w-3 h-3" /> Aplicar valores a todos os clientes {p.name}</>}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {editProfile && (
        <Dialog open onOpenChange={() => setEditProfile(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Editar Perfil — {editProfile.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Limite padrão (R$)</Label>
                <Input type="number" defaultValue={editProfile.creditLimit}
                  onChange={(e) => setEditProfile((p: any) => ({ ...p, creditLimit: parseFloat(e.target.value) }))} />
              </div>
              <div className="space-y-1"><Label>Taxa padrão (%)</Label>
                <Input type="number" step="0.1" defaultValue={editProfile.interestRate}
                  onChange={(e) => setEditProfile((p: any) => ({ ...p, interestRate: parseFloat(e.target.value) }))} />
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-sm space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-1">Parcelas diárias (fixo)</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Seg – Sáb</span><span className="text-violet-300 font-semibold">20 parcelas</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Seg – Dom</span><span className="text-violet-300 font-semibold">25 parcelas</span></div>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-400">Prazo máximo por tipo de pagamento</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Semanal (dias)</Label>
                    <Input type="number" min={7} defaultValue={editProfile.maxDaysSemanal || 60}
                      onChange={(e) => setEditProfile((p: any) => ({ ...p, maxDaysSemanal: parseInt(e.target.value) }))} />
                    <p className="text-xs text-muted-foreground">{Math.max(1, Math.floor((editProfile.maxDaysSemanal || 60) / 7))}x parcelas</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Quinzenal (dias)</Label>
                    <Input type="number" min={15} defaultValue={editProfile.maxDaysQuinzenal || 60}
                      onChange={(e) => setEditProfile((p: any) => ({ ...p, maxDaysQuinzenal: parseInt(e.target.value) }))} />
                    <p className="text-xs text-muted-foreground">{Math.max(1, Math.floor((editProfile.maxDaysQuinzenal || 60) / 15))}x parcelas</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Mensal (dias)</Label>
                    <Input type="number" min={30} defaultValue={editProfile.maxDaysMensal || 90}
                      onChange={(e) => setEditProfile((p: any) => ({ ...p, maxDaysMensal: parseInt(e.target.value) }))} />
                    <p className="text-xs text-muted-foreground">{Math.max(1, Math.floor((editProfile.maxDaysMensal || 90) / 30))}x parcelas</p>
                  </div>
                </div>
              </div>
              {/* Modos de pagamento padrão do perfil */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Modos de pagamento padrão</Label>
                <div className="grid grid-cols-4 gap-2">
                  {(["diario", "semanal", "quinzenal", "mensal"] as const).map(m => {
                    const profileModes: string[] = (editProfile.defaultPaymentTypes || "diario").split(",").map((t: string) => t.trim());
                    const active = profileModes.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          const current = (editProfile.defaultPaymentTypes || "diario").split(",").map((t: string) => t.trim()).filter(Boolean);
                          const next = active ? current.filter((x: string) => x !== m) : [...current, m];
                          setEditProfile((p: any) => ({ ...p, defaultPaymentTypes: next.join(",") || "diario" }));
                        }}
                        className={`rounded-lg border py-2 px-3 text-sm font-medium transition-all ${
                          active
                            ? "border-violet-500 bg-violet-500/20 text-violet-300"
                            : "border-border/50 text-muted-foreground hover:border-violet-500/40"
                        }`}
                      >
                        {m === "diario" ? "Diário" : m === "semanal" ? "Semanal" : m === "quinzenal" ? "Quinzenal" : "Mensal"}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Modos liberados por padrão ao criar cliente com este perfil</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditProfile(null)}>Cancelar</Button>
              <Button onClick={() => save.mutate({ id: editProfile.id, name: editProfile.name, slug: editProfile.slug, creditLimit: parseFloat(String(editProfile.creditLimit)) || 0, interestRate: parseFloat(String(editProfile.interestRate)) || 0, maxDays: parseInt(String(editProfile.maxDays)) || 30, maxDaysSemanal: parseInt(String(editProfile.maxDaysSemanal)) || 60, maxDaysQuinzenal: parseInt(String(editProfile.maxDaysQuinzenal)) || 60, maxDaysMensal: parseInt(String(editProfile.maxDaysMensal)) || 90, defaultPaymentTypes: editProfile.defaultPaymentTypes || "diario" })}
                disabled={save.isPending}>
                {save.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── PIX ─────────────────────────────────────────────────────────────────────
function PixTab() {
  const utils = trpc.useUtils();
  const { data: configs = [], isLoading } = trpc.loans.getPixConfig.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ pixKey: "", pixKeyType: "cpf", pixName: "", bankName: "" });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = trpc.loans.savePixConfig.useMutation({
    onSuccess: () => { toast.success("PIX salvo!"); setShowForm(false); setForm({ pixKey: "", pixKeyType: "cpf", pixName: "", bankName: "" }); utils.loans.getPixConfig.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.loans.deletePixConfig.useMutation({
    onSuccess: () => { toast.success("PIX removido."); utils.loans.getPixConfig.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Chaves PIX para recebimento</h3>
          <p className="text-sm text-muted-foreground">A chave PIX ativa é exibida para o cliente na aba de empréstimos.</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />Adicionar PIX
        </Button>
      </div>

      {isLoading && <div className="text-center py-8"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>}

      <div className="space-y-2">
        {(configs as any[]).map((c) => (
          <Card key={c.id} className="p-3 bg-card/60 border-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium font-mono">{c.pixKey}</p>
                <p className="text-xs text-muted-foreground">{c.pixName}{c.bankName ? ` · ${c.bankName}` : ""} · {c.pixKeyType.toUpperCase()}</p>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-300"
                onClick={() => { if (confirm("Remover esta chave PIX?")) del.mutate({ id: c.id }); }}>
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
        {!isLoading && (configs as any[]).length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Banknote className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma chave PIX cadastrada</p>
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Chave PIX</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tipo de chave</Label>
              <Select value={form.pixKeyType} onValueChange={(v) => set("pixKeyType", v)}>
                <SelectTrigger className="bg-card/60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Chave PIX</Label><Input value={form.pixKey} onChange={(e) => set("pixKey", e.target.value)} /></div>
            <div className="space-y-1"><Label>Nome do titular</Label><Input value={form.pixName} onChange={(e) => set("pixName", e.target.value)} /></div>
            <div className="space-y-1"><Label>Banco (opcional)</Label><Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="Ex: Nubank, Itaú..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate({ ...form, pixKeyType: form.pixKeyType as any })} disabled={!form.pixKey || !form.pixName || save.isPending}>
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Controle de Acesso ───────────────────────────────────────────────────────
function AccessControlTab() {
  const { data: clients, isLoading, refetch } = trpc.loans.listSpreadsheetClients.useQuery();
  const toggle = trpc.loans.toggleLoanByPhone.useMutation({ onSuccess: () => refetch() });
  const [search, setSearch] = useState("");

  const filtered = ((clients || []) as any[]).filter((c: any) =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) || c.cpf?.includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Controle de Acesso — Empréstimos</h3>
          <p className="text-sm text-muted-foreground">
            Todos os clientes com senha cadastrada no sistema. Por padrão, todos têm acesso liberado.
            Desative individualmente se necessário.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {filtered.length} cliente{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      <input
        className="w-full px-3 py-2 rounded-lg bg-card/60 border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="Buscar por nome, telefone ou CPF..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Carregando clientes...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhum cliente encontrado com senha cadastrada.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c: any) => {
            const enabled = c.loanEnabled === 1 || c.loanEnabled === null || c.loanClientId === null;
            // Se não tem loanClient, padrão é habilitado
            const isEnabled = c.loanClientId === null ? true : !!c.loanEnabled;
            const isPending = toggle.isPending && (toggle.variables as any)?.phone === c.phone;
            return (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-card/60 border border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{c.name}</span>
                    {(c.activeLoans > 0) && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        {c.activeLoans} empréstimo{c.activeLoans > 1 ? "s" : ""} ativo{c.activeLoans > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {c.phone}{c.cpf ? ` · CPF: ${c.cpf}` : ""}
                    {c.loanClientId && c.profileSlug && (
                      <span className="ml-2 capitalize">· Perfil: {c.profileSlug}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-3">
                  <span className={`text-xs font-medium ${isEnabled ? "text-emerald-400" : "text-red-400"}`}>
                    {isEnabled ? "Liberado" : "Bloqueado"}
                  </span>
                  <button
                    disabled={isPending}
                    onClick={() => toggle.mutate({ phone: c.phone, enabled: isEnabled ? 0 : 1 })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      isEnabled ? "bg-emerald-500" : "bg-muted"
                    } ${isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      isEnabled ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Taxa de Atraso & Regras ──────────────────────────────────────────────────
function LateFeeTab() {
  const utils = trpc.useUtils();
  const { data: cfg, isLoading } = trpc.loans.getLateFeeConfig.useQuery();
  const { data: clients } = trpc.loans.listClients.useQuery();
  const fixSunday = trpc.loans.fixSundayInstallments.useMutation({
    onSuccess: (r) => toast.success(r.message),
    onError: (e) => toast.error(e.message),
  });
  const saveCfg = trpc.loans.saveLateFeeConfig.useMutation({
    onSuccess: () => { toast.success("Configuração salva!"); utils.loans.getLateFeeConfig.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const toggleFee = trpc.loans.toggleClientLateFee.useMutation({
    onSuccess: () => { toast.success("Atualizado!"); utils.loans.listClients.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const [form, setForm] = useState<any>(null);
  const [search, setSearch] = useState("");

  if (!form && cfg) {
    setForm({
      enabled: !!cfg.enabled,
      fee_after_18h: parseFloat(String(cfg.fee_after_18h)) || 10,
      fee_after_20h: parseFloat(String(cfg.fee_after_20h)) || 10,
      fee_after_midnight_pct: parseFloat(String(cfg.fee_after_midnight_pct)) || 100,
      rules_text: cfg.rules_text || "Regras de pagamento:\n- Pague sua parcela diária até as 18h para evitar taxas adicionais.\n- Após 18h: taxa adicional de R$ 10,00.\n- Após 20h: taxa adicional de mais R$ 10,00 (acumulada: R$ 20,00).\n- Após 23:59: a parcela do dia é cobrada integralmente (100%).",
    });
  }

  const filteredClients = ((clients || []) as any[]).filter((c: any) =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  if (isLoading || !form) return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;

  return (
    <div className="space-y-6">
      {/* Card de correção de parcelas no domingo */}
      <Card className="bg-card/60 border-violet-500/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-sm mb-1">🔧 Corrigir parcelas no domingo (Seg–Sáb)</div>
              <div className="text-xs text-muted-foreground">Move parcelas pendentes que caem no domingo para segunda-feira, nos empréstimos com regime Seg–Sáb (folga domingo).</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-violet-500/50 text-violet-300 hover:bg-violet-500/10"
              onClick={() => fixSunday.mutate()}
              disabled={fixSunday.isPending}
            >
              {fixSunday.isPending ? "Corrigindo..." : "Corrigir agora"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">⚠️ Taxa de Atraso — Configuração Global</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{form.enabled ? "Ativa" : "Desativada"}</span>
              <button onClick={() => setForm((f: any) => ({ ...f, enabled: !f.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.enabled ? "bg-emerald-500" : "bg-muted"} cursor-pointer`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Taxas aplicadas automaticamente quando o cliente não paga até o horário limite.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Taxa após 18h (R$)</Label>
              <Input type="number" min="0" step="0.01" value={form.fee_after_18h}
                onChange={(e) => setForm((f: any) => ({ ...f, fee_after_18h: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <Label>Taxa após 20h (R$)</Label>
              <Input type="number" min="0" step="0.01" value={form.fee_after_20h}
                onChange={(e) => setForm((f: any) => ({ ...f, fee_after_20h: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <Label>Após 23:59 (% da parcela)</Label>
              <Input type="number" min="0" max="1000" step="1" value={form.fee_after_midnight_pct}
                onChange={(e) => setForm((f: any) => ({ ...f, fee_after_midnight_pct: parseFloat(e.target.value) || 100 }))} />
              <p className="text-xs text-muted-foreground">100% = cobra a parcela inteira novamente</p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300 space-y-1">
            <p className="font-medium">Resumo das regras:</p>
            <p>• Até 18h: sem taxa</p>
            <p>• 18h–20h: +R$ {(form.fee_after_18h || 0).toFixed(2)}</p>
            <p>• 20h–23:59: +R$ {((form.fee_after_18h || 0) + (form.fee_after_20h || 0)).toFixed(2)} (acumulado)</p>
            <p>• Após 23:59: +{form.fee_after_midnight_pct}% da parcela</p>
          </div>
          <div className="space-y-1">
            <Label>Texto de regras básicas (exibido para os clientes)</Label>
            <Textarea rows={6} value={form.rules_text}
              onChange={(e) => setForm((f: any) => ({ ...f, rules_text: e.target.value }))}
              placeholder="Digite as regras que serão exibidas para os clientes..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Este texto aparece na aba de Empréstimos do cliente antes das parcelas.</p>
          </div>
          <Button onClick={() => saveCfg.mutate(form)} disabled={saveCfg.isPending}>
            {saveCfg.isPending ? "Salvando..." : "Salvar configuração"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">🚫 Exceções por Cliente</CardTitle>
          <p className="text-sm text-muted-foreground">Desative a taxa de atraso para clientes específicos.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {filteredClients.map((c: any) => {
              const disabled = !!c.late_fee_disabled;
              const isPending = toggleFee.isPending && (toggleFee.variables as any)?.clientId === c.id;
              return (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.phone}{c.cpf ? ` · ${c.cpf}` : ""} · {c.profileSlug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${disabled ? "text-red-400" : "text-emerald-400"}`}>
                      {disabled ? "Taxa desativada" : "Taxa ativa"}
                    </span>
                    <button disabled={isPending}
                      onClick={() => toggleFee.mutate({ clientId: c.id, disabled: !disabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        !disabled ? "bg-emerald-500" : "bg-muted"
                      } ${isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        !disabled ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Análise Financeira ───────────────────────────────────────────────────────
function FinanceiroTab() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);
  const yearStr = todayStr.slice(0, 4);

  const [period, setPeriod] = useState<"day" | "month" | "year">("month");
  const [dateValue, setDateValue] = useState(monthStr);

  // Ajusta o dateValue quando o período muda
  function handlePeriodChange(p: "day" | "month" | "year") {
    setPeriod(p);
    if (p === "day") setDateValue(todayStr);
    else if (p === "month") setDateValue(monthStr);
    else setDateValue(yearStr);
  }

  const { data, isLoading, refetch } = trpc.loans.getFinancialAnalysis.useQuery(
    { period, date: dateValue },
    { enabled: !!dateValue }
  );

  const periodLabel =
    period === "day" ? `Dia ${fmtDate(dateValue)}` :
    period === "month" ? `Mês ${dateValue.slice(5, 7)}/${dateValue.slice(0, 4)}` :
    `Ano ${dateValue}`;

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Período</Label>
              <div className="flex gap-2">
                {(["day", "month", "year"] as const).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={period === p ? "default" : "outline"}
                    className={period !== p ? "bg-transparent border-border text-muted-foreground" : "bg-blue-600 text-white"}
                    onClick={() => handlePeriodChange(p)}
                  >
                    {p === "day" ? "📅 Dia" : p === "month" ? "📆 Mês" : "📊 Ano"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {period === "day" ? "Data" : period === "month" ? "Mês/Ano" : "Ano"}
              </Label>
              {period === "day" && (
                <Input type="date" value={dateValue} onChange={e => setDateValue(e.target.value)}
                  className="h-9 w-44 bg-background border-border text-sm" />
              )}
              {period === "month" && (
                <Input type="month" value={dateValue} onChange={e => setDateValue(e.target.value)}
                  className="h-9 w-44 bg-background border-border text-sm" />
              )}
              {period === "year" && (
                <select value={dateValue} onChange={e => setDateValue(e.target.value)}
                  className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                  {Array.from({ length: 5 }, (_, i) => String(today.getFullYear() - i)).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="h-9 border-border">
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando análise...</div>
      ) : !data ? null : (
        <>
          {/* Cards principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Já recebi */}
            <Card className="bg-emerald-500/10 border-emerald-500/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wide mb-1">✅ Já Recebi</p>
                <p className="text-2xl font-bold text-emerald-300">{fmt(data.alreadyReceived)}</p>
                <p className="text-xs text-emerald-400/60 mt-1">{data.alreadyReceivedCount} parcela(s) paga(s)</p>
                <p className="text-xs text-emerald-400/50 mt-0.5">{periodLabel}</p>
              </CardContent>
            </Card>

            {/* Vou receber */}
            <Card className="bg-blue-500/10 border-blue-500/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-blue-400 font-semibold uppercase tracking-wide mb-1">⏳ Vou Receber</p>
                <p className="text-2xl font-bold text-blue-300">{fmt(data.willReceive)}</p>
                <p className="text-xs text-blue-400/60 mt-1">{data.willReceiveCount} parcela(s) pendente(s)</p>
                <p className="text-xs text-blue-400/50 mt-0.5">Vencimento: {periodLabel}</p>
              </CardContent>
            </Card>

            {/* Juros recebidos */}
            <Card className="bg-purple-500/10 border-purple-500/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-purple-400 font-semibold uppercase tracking-wide mb-1">💰 Juros Recebidos</p>
                <p className="text-2xl font-bold text-purple-300">{fmt(data.receivedInterest)}</p>
                <p className="text-xs text-purple-400/60 mt-1">Projeção: {fmt(data.projectedInterest)}</p>
                <p className="text-xs text-purple-400/50 mt-0.5">{periodLabel}</p>
              </CardContent>
            </Card>

            {/* Perdas */}
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-red-400 font-semibold uppercase tracking-wide mb-1">❌ Perdas</p>
                <p className="text-2xl font-bold text-red-300">{fmt(data.lostPrincipal)}</p>
                <p className="text-xs text-red-400/60 mt-1">{data.lostCount} empr. cancelado(s)/reprovado(s)</p>
                <p className="text-xs text-red-400/50 mt-0.5">Juros perdidos: {fmt(data.lostInterest)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Segunda linha de cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Total do período */}
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">📊 Total do Período</p>
                <p className="text-2xl font-bold text-foreground">{fmt((data.alreadyReceived || 0) + (data.willReceive || 0))}</p>
                <p className="text-xs text-muted-foreground mt-1">Recebido + A receber</p>
              </CardContent>
            </Card>

            {/* Inadimplência */}
            <Card className="bg-orange-500/10 border-orange-500/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-orange-400 font-semibold uppercase tracking-wide mb-1">⚠️ Inadimplência</p>
                <p className="text-2xl font-bold text-orange-300">{fmt(data.overdueAmount)}</p>
                <p className="text-xs text-orange-400/60 mt-1">{data.overdueCount} parcela(s) atrasada(s)</p>
                <p className="text-xs text-orange-400/50 mt-0.5">Vencidas e não pagas</p>
              </CardContent>
            </Card>

            {/* Lucro líquido */}
            <Card className="bg-yellow-500/10 border-yellow-500/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wide mb-1">🏆 Lucro Líquido</p>
                <p className="text-2xl font-bold text-yellow-300">{fmt((data.receivedInterest || 0) - (data.lostInterest || 0))}</p>
                <p className="text-xs text-yellow-400/60 mt-1">Juros recebidos − Juros perdidos</p>
              </CardContent>
            </Card>
          </div>

          {/* Card Rentabilidade (movido do Dashboard) */}
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <Card className="bg-lime-500/10 border-lime-500/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-lime-400 font-semibold uppercase tracking-wide mb-1">📈 Rentabilidade Geral</p>
                <p className="text-2xl font-bold text-lime-300">{`${Number(data.rentabilidade ?? 0).toFixed(2)}%`}</p>
                <p className="text-xs text-lime-400/60 mt-1">Lucro previsto ÷ Capital emprestado (todos os empréstimos ativos)</p>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico de timeline (mês/ano) */}
          {data.timeline && data.timeline.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">
                  {period === "month" ? "Recebimentos por Dia do Mês" : "Recebimentos por Mês do Ano"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.timeline} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey={period === "month" ? "day" : "month"}
                      tick={{ fill: "#888", fontSize: 11 }}
                      tickFormatter={(v: string) => period === "month" ? String(v).slice(8) : String(v).slice(5)}
                    />
                    <YAxis tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v: number) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => [fmt(v)]}
                      labelFormatter={(l: string) => period === "month" ? `Dia ${String(l).slice(8)}` : `Mês ${String(l).slice(5)}`}
                      contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }}
                    />
                    <Legend />
                    <Bar dataKey="received" name="Recebido" fill="#10b981" radius={[4,4,0,0]} />
                    <Bar dataKey="pending" name="A Receber" fill="#3b82f6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Tabela: Quando vou receber */}
          {data.upcoming && data.upcoming.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">
                  📅 Parcelas a Receber — {periodLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="text-left px-4 py-2">Cliente</th>
                        <th className="text-left px-4 py-2">Parcela</th>
                        <th className="text-left px-4 py-2">Vencimento</th>
                        <th className="text-right px-4 py-2">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.upcoming.map((u: any) => {
                        const isOverdue = u.dueDate < todayStr;
                        return (
                          <tr key={u.id} className={`border-b border-border/50 hover:bg-muted/30 ${isOverdue ? "bg-red-500/5" : ""}`}>
                            <td className="px-4 py-2 font-medium text-foreground">{u.clientName}</td>
                            <td className="px-4 py-2 text-muted-foreground">#{u.installmentNumber}</td>
                            <td className="px-4 py-2">
                              <span className={isOverdue ? "text-red-400 font-semibold" : "text-foreground"}>
                                {fmtDate(u.dueDate)}
                                {isOverdue && <span className="ml-1 text-xs bg-red-500/20 text-red-400 px-1 rounded">Atrasado</span>}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-blue-300">{fmt(u.amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-muted-foreground">Total</td>
                        <td className="px-4 py-2 text-right font-bold text-blue-300">{fmt(data.willReceive)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mensagem quando não há dados */}
          {(!data.upcoming || data.upcoming.length === 0) && data.alreadyReceived === 0 && data.willReceive === 0 && (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                <p className="text-4xl mb-3">📊</p>
                <p className="font-semibold">Nenhum dado para {periodLabel}</p>
                <p className="text-sm mt-1">Tente selecionar outro período</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Histórico de Comprovantes ───────────────────────────────────────────────
function ProofHistoryTab() {
  const [filterHasProof, setFilterHasProof] = useState<"all" | "yes" | "no">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const { data: rows = [], isLoading } = trpc.loans.getProofHistory.useQuery({
    hasProof: filterHasProof === "all" ? undefined : filterHasProof === "yes",
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
  });

  const [viewProofUrl, setViewProofUrl] = useState<string | null>(null);
  const [viewProofMime, setViewProofMime] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-3 bg-card/60 border-border">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Comprovante</Label>
            <Select value={filterHasProof} onValueChange={(v) => setFilterHasProof(v as any)}>
              <SelectTrigger className="w-[160px] h-8 text-xs bg-card/60"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="yes">Com comprovante</SelectItem>
                <SelectItem value="no">Sem comprovante</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data de</Label>
            <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-8 text-xs bg-card/60 w-[140px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data até</Label>
            <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-8 text-xs bg-card/60 w-[140px]" />
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setFilterHasProof("all"); setFilterDateFrom(""); setFilterDateTo(""); }}>
            Limpar
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : rows.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Paperclip className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Nenhum comprovante encontrado</p>
            <p className="text-sm mt-1">Ajuste os filtros ou confirme pagamentos com comprovante</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card/60 border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Cliente</th>
                  <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Parcela</th>
                  <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">Valor Pago</th>
                  <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Data Pgto</th>
                  <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Confirmado por</th>
                  <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Observação</th>
                  <th className="px-3 py-2 text-center text-xs text-muted-foreground font-medium">Comprovante</th>
                </tr>
              </thead>
              <tbody>
                {(rows as any[]).map((row, i) => (
                  <tr key={row.id || i} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2 font-medium">{row.clientName}</td>
                    <td className="px-3 py-2 text-muted-foreground">#{row.installmentNumber}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-400">{fmt(row.amountPaid)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.paidAt ? new Date(row.paidAt).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{(row.paidBy || "—").replace(/CSA TRANSPORTES LTDA/gi, 'CSA EMPRESTIMOS SP')}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs max-w-[150px] truncate">{row.observation || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {row.hasProof && row.fileUrl ? (
                        <button
                          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                          onClick={() => { setViewProofUrl(row.fileUrl); setViewProofMime(row.fileMimeType); }}
                        >
                          <Paperclip className="w-3 h-3" />Visualizar
                        </button>
                      ) : (
                        <span className="text-xs text-amber-400 flex items-center justify-center gap-1">
                          <AlertTriangle className="w-3 h-3" />Sem arquivo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Lightbox de comprovante */}
      <Dialog open={!!viewProofUrl} onOpenChange={(o) => { if (!o) { setViewProofUrl(null); setViewProofMime(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Paperclip className="w-4 h-4" />Comprovante</DialogTitle>
          </DialogHeader>
          {viewProofUrl && (
            viewProofMime?.startsWith('image/') ? (
              <img src={viewProofUrl} alt="Comprovante" className="w-full max-h-[70vh] object-contain rounded" />
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto mb-3 text-blue-400" />
                <p className="text-sm text-muted-foreground mb-4">Arquivo PDF</p>
                <a href={viewProofUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="gap-2"><ExternalLink className="w-4 h-4" />Abrir PDF em nova aba</Button>
                </a>
              </div>
            )
          )}
          <DialogFooter>
            {viewProofUrl && (
              <a href={viewProofUrl} download>
                <Button variant="outline" className="gap-2"><Download className="w-4 h-4" />Baixar</Button>
              </a>
            )}
            <Button variant="outline" onClick={() => { setViewProofUrl(null); setViewProofMime(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}