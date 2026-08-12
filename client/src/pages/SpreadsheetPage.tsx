
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import confetti from 'canvas-confetti';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { trpc } from "@/lib/trpc";
import { X, Shield, Clock, Trophy, Medal, Phone, Mail, CreditCard } from "lucide-react";
import { ChatSidebar } from "@/components/ChatSidebar";
import { LoansTab } from "./LoansTab";
import { ServicosExtras } from "@/components/ServicosExtras";
import { H2ParticularModule } from "@/components/private-transport/H2ParticularModule";
import { DashboardModuleCard, DashboardExternalModuleCard } from "@/components/DashboardModuleCard";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
const DATE_COLORS = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24", "#6c5ce7", "#a29bfe", "#fd79a8", "#fdcb6e", "#6c5ce7", "#00b894"];

const MODULE_THEMES = {
  gastos: { base: '#4a1420', active: '#e65367', border: '#873142', icon: '#ff9aa8', glow: 'rgba(230,83,103,.33)' },
  ganhos: { base: '#123c2c', active: '#22c77a', border: '#287455', icon: '#73e8ad', glow: 'rgba(34,199,122,.30)' },
  operacional: { base: '#493214', active: '#d99a2b', border: '#886121', icon: '#ffd27a', glow: 'rgba(217,154,43,.30)' },
  metas: { base: '#351c56', active: '#9d63e6', border: '#633a93', icon: '#d1b0ff', glow: 'rgba(157,99,230,.32)' },
  graficos: { base: '#182f64', active: '#4076e6', border: '#30529a', icon: '#9cbcff', glow: 'rgba(64,118,230,.32)' },
  emprestimos: { base: '#123f43', active: '#1bb8be', border: '#267378', icon: '#7be8e6', glow: 'rgba(27,184,190,.31)' },
  analisador: { base: '#513017', active: '#ed8a2f', border: '#93511f', icon: '#ffc181', glow: 'rgba(237,138,47,.32)' },
  particular: { base: '#103d56', active: '#19b9d5', border: '#287694', icon: '#89ebfb', glow: 'rgba(25,185,213,.34)' },
  cartoes: { base: '#32205b', active: '#9861e9', border: '#60429c', icon: '#cbb0ff', glow: 'rgba(152,97,233,.34)' },
} as const;

interface Earning {
  id: string;
  date: string;
  uber: string;
  ninetynine: string;
  indrive: string;
  particular: string;
  deliveries: string;
  tips: string;
  otherEarnings: string;
  createdAt?: string | Date;
}

interface Expense {
  id: string;
  date: string;
  fuel: string;
  carRental: string;
  maintenance: string;
  oilChange: string;
  washing: string;
  insurance: string;
  internetPhone: string;
  food: string;
  parking: string;
  tolls: string;
  financing: string;
  fines: string;
  accessories: string;
  otherExpenses: string;
  createdAt?: string | Date;
}

interface Operational {
  id: string;
  date: string;
  kmInitial: string;
  kmFinal: string;
  timeInitial: string;
  timeFinal: string;
  rideCount: string;
  ridesUber: string;
  rides99: string;
  ridesIndrive: string;
  ridesParticular: string;
  ridesDeliveries: string;
}

interface Goal {
  id: string;
  dailyGoal: string;
  weeklyGoal: string;
  monthlyGoal: string;
}

interface SpreadsheetPageProps {
  clientName?: string;
  token: string;
  onLogout?: () => void;
}

// Formata o createdAt (Date ou string UTC) para hora:minuto no fuso Brasil (UTC-3)
function formatCreatedAtTime(createdAt: string | Date | undefined | null): string | null {
  if (!createdAt) return null;
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return null;
    // Usar Intl para respeitar o fuso do Brasil (America/Sao_Paulo)
    return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return null;
  }
}

// Data local (YYYY-MM-DD) sem risco de fuso (evita voltar 1 dia no Brasil)
function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── MODAL DE EDIÇÃO ───────────────────────────────────────────────────────────
interface EditField {
  label: string;
  key: string;
  value: string;
  type?: string;
}

interface EditModalProps {
  title: string;
  date: string;
  fields: EditField[];
  onFieldChange: (key: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

function EditModal({ title, date, fields, onFieldChange, onSave, onCancel, isSaving }: EditModalProps) {
  // Fechar ao clicar fora
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full sm:max-w-md bg-[#0d1326] border border-primary/30 rounded-t-2xl sm:rounded-2xl shadow-[0_0_40px_-8px_var(--primary)] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">{title}</p>
            <p className="text-lg font-bold text-foreground">{date}</p>
          </div>
          <button
            onClick={onCancel}
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Campos */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {fields.map(f => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">{f.label}</label>
              <Input
                type={f.type || "number"}
                value={f.value}
                onChange={(e) => onFieldChange(f.key, e.target.value)}
                className="h-12 bg-input border-border text-foreground text-base focus-visible:border-ring focus-visible:ring-primary/30"
                autoFocus={fields.indexOf(f) === 0}
              />
            </div>
          ))}
        </div>

        {/* Botões */}
        <div className="px-5 py-4 border-t border-border/50 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-12 rounded-xl border border-border text-foreground font-semibold hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-bold shadow-[0_0_20px_-4px_var(--primary)] hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60"
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SpreadsheetPage({ clientName, token: tokenProp, onLogout }: SpreadsheetPageProps) {
  // Restaurar token do localStorage como fallback
  const [token, setToken] = useState<string>(() => {
    const saved = localStorage.getItem('gastos_token');
    return tokenProp || saved || '';
  });

  // Buscar informações do plano (vencimento)
  const { data: planInfo } = trpc.spreadsheet.getClientPlanInfo.useQuery(
    { token },
    { enabled: !!token, refetchInterval: 60000 }
  );

  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [operational, setOperational] = useState<Operational[]>([]);
  const [goals, setGoals] = useState<Goal | null>(null);
  const [newEarning, setNewEarning] = useState<Earning>({ id: "", date: getTodayLocalDate(), uber: "", ninetynine: "", indrive: "", particular: "", deliveries: "", tips: "", otherEarnings: "" });
  const [newExpense, setNewExpense] = useState<Expense>({ id: "", date: getTodayLocalDate(), fuel: "", carRental: "", maintenance: "", oilChange: "", washing: "", insurance: "", internetPhone: "", food: "", parking: "", tolls: "", financing: "", fines: "", accessories: "", otherExpenses: "" });
  const [newOperational, setNewOperational] = useState<Operational>({ id: "", date: getTodayLocalDate(), kmInitial: "", kmFinal: "", timeInitial: "", timeFinal: "", rideCount: "", ridesUber: "", rides99: "", ridesIndrive: "", ridesParticular: "", ridesDeliveries: "" });
  const [newGoal, setNewGoal] = useState<Goal>({ id: "", dailyGoal: "", weeklyGoal: "", monthlyGoal: "" });
  const getTodayLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };
  const [selectedMonth, setSelectedMonth] = useState(getTodayLocal());
  const [activeModule, setActiveModule] = useState("gastos");
  const tableRef = useRef<HTMLDivElement>(null);

  // ─── ESTADO DOS MODAIS DE EDIÇÃO ─────────────────────────────────────────────
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editExpenseValues, setEditExpenseValues] = useState<Record<string, string>>({});

  const [editingEarning, setEditingEarning] = useState<Earning | null>(null);
  const [editEarningValues, setEditEarningValues] = useState<Record<string, string>>({});

  const [editingOperational, setEditingOperational] = useState<Operational | null>(null);
  const [editOperationalValues, setEditOperationalValues] = useState<Record<string, string>>({});

  // ─── ESTADOS PARA NOTIFICAÇÕES MOTIVACIONAIS ────────────────────────────────
  const [shownMilestones, setShownMilestones] = useState<Set<string>>(new Set());
  const [activeMilestone, setActiveMilestone] = useState<{ pct: number; label: string } | null>(null);
  const milestoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estado do chat
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  // Buscar phone real do usuário a partir do token de sessão
  const { data: chatUserData } = trpc.chatUsers.getPhoneFromToken.useQuery(
    { token },
    { enabled: !!token, staleTime: Infinity }
  );
  const phoneFromToken = chatUserData?.phone || '';

  // Helper para exibir data sem fuso
  const formatDateLocal = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString('pt-BR');
  };

  // ─── CONFETE E MARCOS MOTIVACIONAIS ────────────────────────────────────────
  const fireConfetti = useCallback((type: 'milestone' | 'goal') => {
    if (type === 'goal') {
      // Confete duplo para meta concluída
      const end = Date.now() + 3000;
      const colors = ['#00FF88', '#FFD700', '#FF6B6B', '#4ECDC4', '#A29BFE'];
      const frame = () => {
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    } else {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'] });
    }
  }, []);

  const triggerMilestone = useCallback((pct: number, label: string, key: string) => {
    if (shownMilestones.has(key)) return;
    setShownMilestones(prev => new Set(prev).add(key));
    setActiveMilestone({ pct, label });
    fireConfetti(pct >= 100 ? 'goal' : 'milestone');
    if (milestoneTimeoutRef.current) clearTimeout(milestoneTimeoutRef.current);
    milestoneTimeoutRef.current = setTimeout(() => setActiveMilestone(null), 4500);
  }, [shownMilestones, fireConfetti]);

  // Banners informativos da página de gastos
  const { data: activeBanners = [] } = trpc.banners.listActive.useQuery({ page: 'gastos' });

  // Mutation para registrar acesso via sessão
  const recordAccessMutation = trpc.spreadsheet.recordAccess.useMutation();

  // ─── PROPAGANDA OBRIGATÓRIA ───────────────────────────────────────────────────
  const [adVisible, setAdVisible] = useState(false);
  const [adProgress, setAdProgress] = useState(0);
  const [adCanClose, setAdCanClose] = useState(false);
  const [adCampaign, setAdCampaign] = useState<any>(null);
  const recordImpressionMutation = trpc.adCampaigns.recordImpression.useMutation();
  const { data: adData } = trpc.adCampaigns.checkForClient.useQuery(
    { token, page: 'gastos' },
    { enabled: !!token, staleTime: Infinity }
  );
  useEffect(() => {
    if (adData?.campaign) {
      setAdCampaign(adData.campaign);
      setAdVisible(true);
      setAdProgress(0);
      setAdCanClose(false);
      recordImpressionMutation.mutate({ token, campaignId: adData.campaign.id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adData?.campaign?.id]);
  useEffect(() => {
    if (!adVisible || !adCampaign) return;
    const total = (adCampaign.requiredSeconds || 20) * 1000;
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      const pct = Math.min(100, Math.round((elapsed / total) * 100));
      setAdProgress(pct);
      if (elapsed >= total) {
        clearInterval(timer);
        setAdCanClose(true);
      }
    }, interval);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adVisible, adCampaign?.id]);

  // Atualizar token quando a prop muda
  useEffect(() => {
    if (tokenProp) {
      setToken(tokenProp);
    }
  }, [tokenProp]);

  // Registrar acesso ao abrir a planilha (token já salvo = usuário voltou sem fazer login)
  useEffect(() => {
    if (token) {
      recordAccessMutation.mutate({ token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Carregar dados do banco de dados usando tRPC
  const { data: earningsData, refetch: refetchEarnings, isLoading: earningsLoading } = trpc.spreadsheet.getEarningsByMonth.useQuery({ token, month: selectedMonth }, { enabled: !!token });
  const { data: expensesData, refetch: refetchExpenses, isLoading: expensesLoading } = trpc.spreadsheet.getExpensesByMonth.useQuery({ token, month: selectedMonth }, { enabled: !!token });
  // Usar o ano do mês selecionado (não fixo no ano atual)
  const selectedYear = selectedMonth.split('-')[0];
  const { data: yearlyEarningsData, refetch: refetchYearlyEarnings } = trpc.spreadsheet.getEarningsByYear.useQuery({ token, year: selectedYear }, { enabled: !!token, staleTime: 300000 });
  const { data: yearlyExpensesData, refetch: refetchYearlyExpenses } = trpc.spreadsheet.getExpensesByYear.useQuery({ token, year: selectedYear }, { enabled: !!token, staleTime: 300000 });
  const { data: operationalData, refetch: refetchOperational } = trpc.spreadsheet.getOperationalByMonth.useQuery({ token, month: selectedMonth }, { enabled: !!token });
  const { data: goalsData, refetch: refetchGoals } = trpc.spreadsheet.getGoalsByMonth.useQuery({ token, month: selectedMonth }, { enabled: !!token });

  useEffect(() => {
    if (earningsData !== undefined) setEarnings(earningsData as any);
  }, [earningsData]);

  useEffect(() => {
    if (expensesData !== undefined) setExpenses(expensesData as any);
  }, [expensesData]);

  useEffect(() => {
    if (operationalData) setOperational(operationalData as any);
  }, [operationalData]);

  useEffect(() => {
    if (goalsData) setGoals(goalsData as any);
  }, [goalsData]);

  // Mutations para salvar dados no banco
  const createEarningMutation = trpc.spreadsheet.createEarning.useMutation({
    onSuccess: async () => {
      await refetchEarnings();
      setNewEarning({ id: "", date: getTodayLocalDate(), uber: "", ninetynine: "", indrive: "", particular: "", deliveries: "", tips: "", otherEarnings: "" });
    },
  });

  const createExpenseMutation = trpc.spreadsheet.createExpense.useMutation({
    onSuccess: async () => {
      await refetchExpenses();
      setNewExpense({ id: "", date: getTodayLocalDate(), fuel: "", carRental: "", maintenance: "", oilChange: "", washing: "", insurance: "", internetPhone: "", food: "", parking: "", tolls: "", financing: "", fines: "", accessories: "", otherExpenses: "" });
    },
  });

  const createOperationalMutation = trpc.spreadsheet.createOperational.useMutation({
    onSuccess: async () => {
      await refetchOperational();
      setNewOperational({ id: "", date: getTodayLocalDate(), kmInitial: "", kmFinal: "", timeInitial: "", timeFinal: "", rideCount: "", ridesUber: "", rides99: "", ridesIndrive: "", ridesParticular: "", ridesDeliveries: "" });
    },
  });

  const createGoalMutation = trpc.spreadsheet.createGoal.useMutation({
    onSuccess: async () => {
      await refetchGoals();
      setNewGoal({ id: "", dailyGoal: "", weeklyGoal: "", monthlyGoal: "" });
    },
  });

  const deleteEarningMutation = trpc.spreadsheet.deleteEarning.useMutation({
    onSuccess: () => refetchEarnings(),
  });

  const deleteExpenseMutation = trpc.spreadsheet.deleteExpense.useMutation({
    onSuccess: () => refetchExpenses(),
  });

  const deleteOperationalMutation = trpc.spreadsheet.deleteOperational.useMutation({
    onSuccess: () => refetchOperational(),
  });

  const updateEarningMutation = trpc.spreadsheet.updateEarning.useMutation({
    onSuccess: () => { refetchEarnings(); setEditingEarning(null); },
  });

  const updateExpenseMutation = trpc.spreadsheet.updateExpense.useMutation({
    onSuccess: () => { refetchExpenses(); setEditingExpense(null); },
  });

  const updateOperationalMutation = trpc.spreadsheet.updateOperational.useMutation({
    onSuccess: () => { refetchOperational(); setEditingOperational(null); },
  });

  // ─── APAGAR TODOS OS DADOS ────────────────────────────────────────────────────
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  // Controle de datas abertas/fechadas no histórico (hoje fica sempre aberto)
  const [openExpenseDates, setOpenExpenseDates] = useState<Set<string>>(new Set());
  const [openEarningDates, setOpenEarningDates] = useState<Set<string>>(new Set());
  // Controla grupos de categoria abertos dentro de cada data: chave = "date::catKey"
  const [openExpenseCatGroups, setOpenExpenseCatGroups] = useState<Set<string>>(new Set());
  const [openEarningCatGroups, setOpenEarningCatGroups] = useState<Set<string>>(new Set());
  const todayLocalDate = getTodayLocalDate();
  const toggleExpenseDate = (date: string) => setOpenExpenseDates(prev => { const n = new Set(prev); n.has(date) ? n.delete(date) : n.add(date); return n; });
  const toggleEarningDate = (date: string) => setOpenEarningDates(prev => { const n = new Set(prev); n.has(date) ? n.delete(date) : n.add(date); return n; });
  const toggleExpenseCatGroup = (key: string) => setOpenExpenseCatGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleEarningCatGroup = (key: string) => setOpenEarningCatGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const deleteAllDataMutation = trpc.spreadsheet.deleteAllData.useMutation({
    onSuccess: async () => {
      // Atualiza tudo em tempo real sem recarregar a página
      setEarnings([]);
      setExpenses([]);
      setOperational([]);
      setGoals(null);
      await Promise.all([
        refetchEarnings(),
        refetchExpenses(),
        refetchYearlyEarnings(),
        refetchYearlyExpenses(),
        refetchOperational(),
        refetchGoals(),
      ]);
      setShowDeleteAllModal(false);
      setIsDeletingAll(false);
    },
    onError: () => {
      setIsDeletingAll(false);
    },
  });

  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    await deleteAllDataMutation.mutateAsync({ token });
  };

  // ─── ABRIR MODAL DE EDIÇÃO ────────────────────────────────────────────────────

  const handleEditExpense = (exp: Expense) => {
    setEditingExpense(exp);
    setEditExpenseValues({
      fuel: String((exp.fuel as any) ?? "0"),
      carRental: String((exp.carRental as any) ?? "0"),
      maintenance: String((exp.maintenance as any) ?? "0"),
      oilChange: String((exp.oilChange as any) ?? "0"),
      washing: String((exp.washing as any) ?? "0"),
      insurance: String((exp.insurance as any) ?? "0"),
      internetPhone: String((exp.internetPhone as any) ?? "0"),
      food: String((exp.food as any) ?? "0"),
      parking: String((exp.parking as any) ?? "0"),
      tolls: String((exp.tolls as any) ?? "0"),
      financing: String((exp.financing as any) ?? "0"),
      fines: String((exp.fines as any) ?? "0"),
      accessories: String((exp.accessories as any) ?? "0"),
      otherExpenses: String((exp.otherExpenses as any) ?? "0"),
    });
  };

  const handleSaveExpense = async () => {
    if (!editingExpense) return;
    await updateExpenseMutation.mutateAsync({
      token,
      id: parseInt(editingExpense.id),
      fuel: editExpenseValues.fuel || "0",
      carRental: editExpenseValues.carRental || "0",
      maintenance: editExpenseValues.maintenance || "0",
      oilChange: editExpenseValues.oilChange || "0",
      washing: editExpenseValues.washing || "0",
      insurance: editExpenseValues.insurance || "0",
      internetPhone: editExpenseValues.internetPhone || "0",
      food: editExpenseValues.food || "0",
      parking: editExpenseValues.parking || "0",
      tolls: editExpenseValues.tolls || "0",
      financing: editExpenseValues.financing || "0",
      fines: editExpenseValues.fines || "0",
      accessories: editExpenseValues.accessories || "0",
      otherExpenses: editExpenseValues.otherExpenses || "0",
    });
  };

  const handleEditEarning = (earn: Earning) => {
    setEditingEarning(earn);
    setEditEarningValues({
      uber: String((earn.uber as any) ?? "0"),
      ninetynine: String((earn.ninetynine as any) ?? "0"),
      indrive: String((earn.indrive as any) ?? "0"),
      particular: String((earn.particular as any) ?? "0"),
      deliveries: String((earn.deliveries as any) ?? "0"),
      tips: String((earn.tips as any) ?? "0"),
      otherEarnings: String((earn.otherEarnings as any) ?? "0"),
    });
  };

  const handleSaveEarning = async () => {
    if (!editingEarning) return;
    await updateEarningMutation.mutateAsync({
      token,
      id: parseInt(editingEarning.id),
      uber: editEarningValues.uber || "0",
      ninetynine: editEarningValues.ninetynine || "0",
      indrive: editEarningValues.indrive || "0",
      particular: editEarningValues.particular || "0",
      deliveries: editEarningValues.deliveries || "0",
      tips: editEarningValues.tips || "0",
      otherEarnings: editEarningValues.otherEarnings || "0",
    });
  };

  const handleEditOperational = (op: Operational) => {
    setEditingOperational(op);
    setEditOperationalValues({
      kmInitial: String((op.kmInitial as any) ?? "0"),
      kmFinal: String((op.kmFinal as any) ?? "0"),
      timeInitial: String((op.timeInitial as any) ?? ""),
      timeFinal: String((op.timeFinal as any) ?? ""),
      ridesUber: String((op.ridesUber as any) ?? "0"),
      rides99: String((op.rides99 as any) ?? "0"),
      ridesIndrive: String((op.ridesIndrive as any) ?? "0"),
      ridesParticular: String((op.ridesParticular as any) ?? "0"),
      ridesDeliveries: String((op.ridesDeliveries as any) ?? "0"),
    });
  };

  const handleSaveOperational = async () => {
    if (!editingOperational) return;
    await updateOperationalMutation.mutateAsync({
      token,
      id: parseInt(editingOperational.id),
      kmInitial: editOperationalValues.kmInitial || "0",
      kmFinal: editOperationalValues.kmFinal || "0",
      timeInitial: editOperationalValues.timeInitial || "",
      timeFinal: editOperationalValues.timeFinal || "",
      ridesUber: parseInt(editOperationalValues.ridesUber) || 0,
      rides99: parseInt(editOperationalValues.rides99) || 0,
      ridesIndrive: parseInt(editOperationalValues.ridesIndrive) || 0,
      ridesParticular: parseInt(editOperationalValues.ridesParticular) || 0,
      ridesDeliveries: parseInt(editOperationalValues.ridesDeliveries) || 0,
    });
  };

  // ─── ADICIONAR ────────────────────────────────────────────────────────────────

  const handleAddEarning = async () => {
    if (!newEarning.date) return;
    try {
      await createEarningMutation.mutateAsync({
        token,
        date: newEarning.date,
        uber: newEarning.uber || "0",
        ninetynine: newEarning.ninetynine || "0",
        indrive: newEarning.indrive || "0",
        particular: newEarning.particular || "0",
        deliveries: newEarning.deliveries || "0",
        tips: newEarning.tips || "0",
        otherEarnings: newEarning.otherEarnings || "0",
      });
      setNewEarning({ id: "", date: getTodayLocalDate(), uber: "", ninetynine: "", indrive: "", particular: "", deliveries: "", tips: "", otherEarnings: "" });
      await refetchEarnings();
    } catch (error) {
      console.error("Erro ao salvar ganho:", error);
    }
  };

  const handleAddExpense = async () => {
    if (!newExpense.date) return;
    const payload = {
      fuel: newExpense.fuel || "0",
      carRental: newExpense.carRental || "0",
      maintenance: newExpense.maintenance || "0",
      oilChange: newExpense.oilChange || "0",
      washing: newExpense.washing || "0",
      insurance: newExpense.insurance || "0",
      internetPhone: newExpense.internetPhone || "0",
      food: newExpense.food || "0",
      parking: newExpense.parking || "0",
      tolls: newExpense.tolls || "0",
      financing: newExpense.financing || "0",
      fines: newExpense.fines || "0",
      accessories: newExpense.accessories || "0",
      otherExpenses: newExpense.otherExpenses || "0",
    };
    try {
      await createExpenseMutation.mutateAsync({ token, date: newExpense.date, ...payload });
      setNewExpense({ id: "", date: getTodayLocalDate(), fuel: "", carRental: "", maintenance: "", oilChange: "", washing: "", insurance: "", internetPhone: "", food: "", parking: "", tolls: "", financing: "", fines: "", accessories: "", otherExpenses: "" });
      await refetchExpenses();
    } catch (error) {
      console.error("Erro ao salvar gasto:", error);
    }
  };

  const handleAddOperational = async () => {
    if (!newOperational.date) return;
    const payload = {
      kmInitial: newOperational.kmInitial || "0",
      kmFinal: newOperational.kmFinal || "0",
      timeInitial: newOperational.timeInitial || "",
      timeFinal: newOperational.timeFinal || "",
      ridesUber: parseInt(newOperational.ridesUber) || 0,
      rides99: parseInt(newOperational.rides99) || 0,
      ridesIndrive: parseInt(newOperational.ridesIndrive) || 0,
      ridesParticular: parseInt(newOperational.ridesParticular) || 0,
      ridesDeliveries: parseInt(newOperational.ridesDeliveries) || 0,
    };
    try {
      await createOperationalMutation.mutateAsync({ token, date: newOperational.date, rideCount: 0, ...payload });
      setNewOperational({ id: "", date: getTodayLocalDate(), kmInitial: "", kmFinal: "", timeInitial: "", timeFinal: "", rideCount: "", ridesUber: "", rides99: "", ridesIndrive: "", ridesParticular: "", ridesDeliveries: "" });
      await refetchOperational();
    } catch (error) {
      console.error("Erro ao salvar operacional:", error);
    }
  };

  const handleDeleteEarning = async (id: string) => {
    const numId = parseInt(id);
    if (!isNaN(numId)) {
      await deleteEarningMutation.mutateAsync({ token, id: numId });
    }
  };

  const handleDeleteExpense = async (id: string) => {
    const numId = parseInt(id);
    if (!isNaN(numId)) {
      await deleteExpenseMutation.mutateAsync({ token, id: numId });
    }
  };

  const handleDeleteOperational = async (id: string) => {
    const numId = parseInt(id);
    if (!isNaN(numId)) {
      await deleteOperationalMutation.mutateAsync({ token, id: numId });
    }
  };

  const handleSetGoals = async () => {
    try {
      await createGoalMutation.mutateAsync({
        token,
        month: selectedMonth,
        dailyGoal: newGoal.dailyGoal || "0",
        weeklyGoal: newGoal.weeklyGoal || "0",
        monthlyGoal: newGoal.monthlyGoal || "0",
      });
      setNewGoal({ id: "", dailyGoal: "", weeklyGoal: "", monthlyGoal: "" });
      await refetchGoals();
    } catch (error) {
      console.error("Erro ao salvar metas:", error);
    }
  };

  // Calcular soma de ganhos corretamente
  const calculateEarningTotal = (earn: Earning) => {
    return parseFloat((earn.uber as any) || '0') + parseFloat((earn.ninetynine as any) || '0') + parseFloat((earn.indrive as any) || '0') + parseFloat((earn.particular as any) || '0') + parseFloat((earn.deliveries as any) || '0') + parseFloat((earn.tips as any) || '0') + parseFloat((earn.otherEarnings as any) || '0');
  };

  const calculateExpenseTotal = (exp: Expense) => {
    return parseFloat((exp.fuel as any) || '0') + parseFloat((exp.carRental as any) || '0') + parseFloat((exp.maintenance as any) || '0') + parseFloat((exp.oilChange as any) || '0') + parseFloat((exp.washing as any) || '0') + parseFloat((exp.insurance as any) || '0') + parseFloat((exp.internetPhone as any) || '0') + parseFloat((exp.food as any) || '0') + parseFloat((exp.parking as any) || '0') + parseFloat((exp.tolls as any) || '0') + parseFloat((exp.financing as any) || '0') + parseFloat((exp.fines as any) || '0') + parseFloat((exp.accessories as any) || '0') + parseFloat((exp.otherExpenses as any) || '0');
  };

  // Calcular resumo
  const summary = useMemo(() => {
    // Helper: parse seguro de valor numérico (evita somar strings com R$)
    const safeNum = (v: any): number => {
      if (v === null || v === undefined || v === '') return 0;
      const s = String(v).replace(/[^0-9.,\-]/g, '').replace(',', '.');
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    };

    // Recalcular totais com safeNum para garantir conversão correta
    const safeEarningTotal = (earn: Earning) =>
      safeNum(earn.uber) + safeNum(earn.ninetynine) + safeNum(earn.indrive) +
      safeNum(earn.particular) + safeNum(earn.deliveries) + safeNum(earn.tips) + safeNum(earn.otherEarnings);

    const safeExpenseTotal = (exp: Expense) =>
      safeNum(exp.fuel) + safeNum(exp.carRental) + safeNum(exp.maintenance) + safeNum(exp.oilChange) +
      safeNum(exp.washing) + safeNum(exp.insurance) + safeNum(exp.internetPhone) + safeNum(exp.food) +
      safeNum(exp.parking) + safeNum(exp.tolls) + safeNum(exp.financing) + safeNum(exp.fines) +
      safeNum(exp.accessories) + safeNum(exp.otherExpenses);

    const totalEarnings = earnings.reduce((sum, e) => sum + safeEarningTotal(e), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + safeExpenseTotal(e), 0);
    const profit = totalEarnings - totalExpenses;

    // Data de hoje no fuso do Brasil (UTC-3)
    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const todayStr = `${nowBRT.getUTCFullYear()}-${String(nowBRT.getUTCMonth()+1).padStart(2,'0')}-${String(nowBRT.getUTCDate()).padStart(2,'0')}`;

    // Início da semana atual (domingo) no fuso Brasil
    const dayOfWeek = nowBRT.getUTCDay(); // 0=dom, 6=sab
    const startOfWeekBRT = new Date(nowBRT);
    startOfWeekBRT.setUTCDate(nowBRT.getUTCDate() - dayOfWeek);
    const weekStartStr = `${startOfWeekBRT.getUTCFullYear()}-${String(startOfWeekBRT.getUTCMonth()+1).padStart(2,'0')}-${String(startOfWeekBRT.getUTCDate()).padStart(2,'0')}`;

    // Diario: apenas hoje
    const dailyEarnings = earnings.filter(e => String(e.date).substring(0,10) === todayStr).reduce((sum, e) => sum + safeEarningTotal(e), 0);
    const dailyExpenses = expenses.filter(e => String(e.date).substring(0,10) === todayStr).reduce((sum, e) => sum + safeExpenseTotal(e), 0);

    // Semanal: de domingo até hoje (semana corrente)
    const weeklyEarnings = earnings.filter(e => { const d = String(e.date).substring(0,10); return d >= weekStartStr && d <= todayStr; }).reduce((sum, e) => sum + safeEarningTotal(e), 0);
    const weeklyExpenses = expenses.filter(e => { const d = String(e.date).substring(0,10); return d >= weekStartStr && d <= todayStr; }).reduce((sum, e) => sum + safeExpenseTotal(e), 0);

    // Mensal: mês selecionado (já filtrado pela query = total do mês)
    const monthlyEarnings = totalEarnings;
    const monthlyExpenses = totalExpenses;

    // Anual: todos os registros do ano do mês selecionado (via query separada)
    const yearlyEarnings = ((yearlyEarningsData as any[]) || []).reduce((sum: number, e: any) => sum + safeEarningTotal(e), 0);
    const yearlyExpenses = ((yearlyExpensesData as any[]) || []).reduce((sum: number, e: any) => sum + safeExpenseTotal(e), 0);

    return {
      totalEarnings, totalExpenses, profit,
      daily: { earnings: dailyEarnings, expenses: dailyExpenses, profit: dailyEarnings - dailyExpenses },
      weekly: { earnings: weeklyEarnings, expenses: weeklyExpenses, profit: weeklyEarnings - weeklyExpenses },
      monthly: { earnings: monthlyEarnings, expenses: monthlyExpenses, profit: monthlyEarnings - monthlyExpenses },
      yearly: { earnings: yearlyEarnings, expenses: yearlyExpenses, profit: yearlyEarnings - yearlyExpenses },
    };
  }, [earnings, expenses, yearlyEarningsData, yearlyExpensesData]);

  // Calcular totais por categoria (Gastos)
  const expensesByCategory = useMemo(() => {
    const categories: Record<string, number> = {
      fuel: 0, carRental: 0, maintenance: 0, oilChange: 0, washing: 0, insurance: 0,
      internetPhone: 0, food: 0, parking: 0, tolls: 0, financing: 0, fines: 0, accessories: 0, otherExpenses: 0,
    };
    expenses.forEach(e => {
      categories.fuel += parseFloat((e.fuel as any) || '0');
      categories.carRental += parseFloat((e.carRental as any) || '0');
      categories.maintenance += parseFloat((e.maintenance as any) || '0');
      categories.oilChange += parseFloat((e.oilChange as any) || '0');
      categories.washing += parseFloat((e.washing as any) || '0');
      categories.insurance += parseFloat((e.insurance as any) || '0');
      categories.internetPhone += parseFloat((e.internetPhone as any) || '0');
      categories.food += parseFloat((e.food as any) || '0');
      categories.parking += parseFloat((e.parking as any) || '0');
      categories.tolls += parseFloat((e.tolls as any) || '0');
      categories.financing += parseFloat((e.financing as any) || '0');
      categories.fines += parseFloat((e.fines as any) || '0');
      categories.accessories += parseFloat((e.accessories as any) || '0');
      categories.otherExpenses += parseFloat((e.otherExpenses as any) || '0');
    });
    return categories;
  }, [expenses]);

  // Calcular totais por categoria (Ganhos)
  const earningsByCategory = useMemo(() => {
    const categories: Record<string, number> = {
      uber: 0, ninetynine: 0, indrive: 0, particular: 0, deliveries: 0, tips: 0, otherEarnings: 0,
    };
    earnings.forEach(e => {
      categories.uber += parseFloat((e.uber as any) || '0');
      categories.ninetynine += parseFloat((e.ninetynine as any) || '0');
      categories.indrive += parseFloat((e.indrive as any) || '0');
      categories.particular += parseFloat((e.particular as any) || '0');
      categories.deliveries += parseFloat((e.deliveries as any) || '0');
      categories.tips += parseFloat((e.tips as any) || '0');
      categories.otherEarnings += parseFloat((e.otherEarnings as any) || '0');
    });
    return categories;
  }, [earnings]);

  // Dados para gráficos
  const chartData = useMemo(() => {
    const dates = Array.from(new Set(earnings.map(e => e.date))).sort();
    return dates.map(date => {
      const earningsForDate = earnings.filter(e => e.date === date);
      const expensesForDate = expenses.filter(e => e.date === date);
      const totalEarnings = earningsForDate.reduce((sum, e) => sum + (parseFloat((e.uber as any) || '0') + parseFloat((e.ninetynine as any) || '0') + parseFloat((e.indrive as any) || '0') + parseFloat((e.particular as any) || '0') + parseFloat((e.deliveries as any) || '0') + parseFloat((e.tips as any) || '0') + parseFloat((e.otherEarnings as any) || '0')), 0);
      const totalExpenses = expensesForDate.reduce((sum, e) => sum + (parseFloat((e.fuel as any) || '0') + parseFloat((e.carRental as any) || '0') + parseFloat((e.maintenance as any) || '0') + parseFloat((e.oilChange as any) || '0') + parseFloat((e.washing as any) || '0') + parseFloat((e.insurance as any) || '0') + parseFloat((e.internetPhone as any) || '0') + parseFloat((e.food as any) || '0') + parseFloat((e.parking as any) || '0') + parseFloat((e.tolls as any) || '0') + parseFloat((e.financing as any) || '0') + parseFloat((e.fines as any) || '0') + parseFloat((e.accessories as any) || '0') + parseFloat((e.otherExpenses as any) || '0')), 0);
      return { date, earnings: totalEarnings, expenses: totalExpenses, profit: totalEarnings - totalExpenses };
    });
  }, [earnings, expenses]);

  const uniqueDates = useMemo(() => Array.from(new Set([...earnings.map(e => e.date), ...expenses.map(e => e.date)])).sort(), [earnings, expenses]);

  // ─── CAMPOS DO MODAL DE EDIÇÃO ────────────────────────────────────────────────

  // Gastos: mostra TODOS os campos (todos são relevantes para edição)
  const expenseEditFields: EditField[] = [
    { label: 'Combustível', key: 'fuel' },
    { label: 'Aluguel do Carro', key: 'carRental' },
    { label: 'Manutenção', key: 'maintenance' },
    { label: 'Troca de Óleo', key: 'oilChange' },
    { label: 'Lavagem', key: 'washing' },
    { label: 'Seguro', key: 'insurance' },
    { label: 'Internet/Telefone', key: 'internetPhone' },
    { label: 'Alimentação', key: 'food' },
    { label: 'Estacionamento', key: 'parking' },
    { label: 'Pedágios', key: 'tolls' },
    { label: 'Financiamento', key: 'financing' },
    { label: 'Multas', key: 'fines' },
    { label: 'Acessórios', key: 'accessories' },
    { label: 'Outros Gastos', key: 'otherExpenses' },
  ].map(f => ({ ...f, value: editExpenseValues[f.key] ?? "0" }));

  // Ganhos: mostra TODOS os campos
  const earningEditFields: EditField[] = [
    { label: 'Uber', key: 'uber' },
    { label: '99', key: 'ninetynine' },
    { label: 'InDrive', key: 'indrive' },
    { label: 'Particular', key: 'particular' },
    { label: 'Entregas', key: 'deliveries' },
    { label: 'Gorjetas', key: 'tips' },
    { label: 'Outros Ganhos', key: 'otherEarnings' },
  ].map(f => ({ ...f, value: editEarningValues[f.key] ?? "0" }));

  // Operacional: todos os campos
  const operationalEditFields: EditField[] = [
    { label: 'KM Inicial', key: 'kmInitial' },
    { label: 'KM Final', key: 'kmFinal' },
    { label: 'Hora Inicial', key: 'timeInitial', type: 'time' },
    { label: 'Hora Final', key: 'timeFinal', type: 'time' },
    { label: 'Corridas Uber', key: 'ridesUber' },
    { label: 'Corridas 99', key: 'rides99' },
    { label: 'Corridas InDrive', key: 'ridesIndrive' },
    { label: 'Corridas Particular', key: 'ridesParticular' },
    { label: 'Corridas Entregas', key: 'ridesDeliveries' },
  ].map(f => ({ ...f, value: editOperationalValues[f.key] ?? "0" }));

  // Verificar se o plano está expirado
  const isPlanExpired = planInfo?.expiresAt ? new Date(planInfo.expiresAt).getTime() < Date.now() : false;

  // Tela de bloqueio por plano expirado
  if (isPlanExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f22 100%)' }}>
        <div className="w-full max-w-sm rounded-2xl p-8 text-center space-y-6" style={{ backgroundColor: '#0F172A', border: '2px solid rgba(239,68,68,0.4)', boxShadow: '0 0 40px rgba(239,68,68,0.15)' }}>
          {/* Ícone */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.4)' }}>
              <Shield className="w-10 h-10 text-red-400" />
            </div>
          </div>

          {/* Título */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-red-400">Acesso Bloqueado</h2>
            <p className="text-white font-semibold text-lg">Seu plano expirou</p>
          </div>

          {/* Mensagem */}
          <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-slate-300 text-sm leading-relaxed">
              O período de acesso à sua Planilha de Gastos encerrou.
            </p>
            <p className="text-slate-400 text-sm leading-relaxed">
              Para continuar usando, entre em contato com o administrador e solicite a renovação do seu plano.
            </p>
          </div>

          {/* Vencimento */}
          {planInfo?.expiresAt && (
            <div className="text-xs text-slate-500">
              Venceu em: {new Date(planInfo.expiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          )}

          {/* Botão sair */}
          <button
            onClick={onLogout}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-95"
            style={{ backgroundColor: '#1E293B', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#070a16] via-[#0a0f22] to-[#070a16] text-foreground p-4 pb-40 sm:p-6 sm:pb-8">
      {/* MODAL DE CONFIRMAÇÃO: APAGAR TODOS OS DADOS */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-5" style={{ backgroundColor: '#0F172A', border: '2px solid rgba(249,115,22,0.4)', boxShadow: '0 0 40px rgba(249,115,22,0.15)' }}>
            <div className="text-center">
              <div className="text-4xl mb-3">🗑️</div>
              <h2 className="text-xl font-black text-white mb-1">Apagar Todos os Dados?</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Isso vai apagar <strong className="text-orange-400">todos os seus ganhos, gastos, registros operacionais e metas</strong> lançados na planilha.
              </p>
              <p className="text-red-400 text-xs font-bold mt-2 uppercase tracking-wide">Esta ação não pode ser desfeita!</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteAllModal(false)}
                disabled={isDeletingAll}
                className="flex-1 py-3 rounded-xl font-bold text-sm border border-white/10 text-slate-300 hover:bg-white/5 transition-all active:scale-95 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
                className="flex-1 py-3 rounded-xl font-black text-sm text-white transition-all active:scale-95 disabled:opacity-60"
                style={{ background: isDeletingAll ? 'rgba(239,68,68,0.4)' : 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: isDeletingAll ? 'none' : '0 0 20px rgba(239,68,68,0.3)' }}
              >
                {isDeletingAll ? 'Apagando...' : '⚠️ Apagar Tudo'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL DE PROPAGANDA OBRIGATÓRIA */}
      {adVisible && adCampaign && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4">
          <div
            className="relative w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ border: '1.5px solid rgba(0,200,255,0.35)', boxShadow: '0 0 40px 4px rgba(0,180,255,0.15), 0 8px 32px rgba(0,0,0,0.8)', maxWidth: '520px', maxHeight: '96vh' }}
          >
            {/* Badge obrigatório */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1 border border-white/10">
              <Shield className="w-3 h-3 text-cyan-400" />
              <span className="text-xs text-gray-300 font-medium">Exibição obrigatória</span>
            </div>
            {/* Conteúdo */}
            <div className="bg-[#080c1e] flex flex-col">
              {adCampaign.type === 'image' && adCampaign.imageUrl ? (
                <img
                  src={adCampaign.imageUrl}
                  alt={adCampaign.title || 'Propaganda'}
                  className="w-full object-contain"
                  style={{ maxHeight: '55vh', minHeight: '200px' }}
                />
              ) : adCampaign.type === 'video' && adCampaign.videoUrl ? (
                <div className="w-full relative bg-black" style={{ maxHeight: '60vh' }}>
                  <video
                    src={adCampaign.videoUrl}
                    className="w-full object-contain"
                    style={{ display: 'block', maxHeight: '60vh', width: '100%' }}
                    autoPlay
                    playsInline
                    muted
                    crossOrigin="anonymous"
                    ref={(el) => { if (el) { el.muted = false; el.play().catch(() => { el.muted = true; el.play().catch(() => {}); }); } }}
                    onTimeUpdate={(e) => {
                      const v = e.currentTarget;
                      if (v.duration && v.duration > 0) {
                        const pct = Math.min(100, Math.round((v.currentTime / v.duration) * 100));
                        setAdProgress(pct);
                        if (pct >= 100) setAdCanClose(true);
                      }
                    }}
                    onEnded={(e) => {
                      setAdProgress(100);
                      const v = e.currentTarget;
                      const videoDuration = v.duration || 0;
                      const required = adCampaign.requiredSeconds || 20;
                      if (videoDuration <= required) {
                        setTimeout(() => setAdVisible(false), 300);
                      } else {
                        setAdCanClose(true);
                      }
                    }}
                    onError={(e) => {
                      console.error('[Ad] Erro ao carregar vídeo:', adCampaign.videoUrl, e);
                    }}
                  />
                </div>
              ) : (
                <div className="w-full h-40 flex items-center justify-center bg-gradient-to-br from-blue-900/40 to-cyan-900/30">
                  <span className="text-4xl">📢</span>
                </div>
              )}
              {/* Título e descrição */}
              {(adCampaign.title || adCampaign.description) && (
                <div className="px-4 pt-3 pb-1">
                  {adCampaign.title && <p className="text-white font-bold text-base">{adCampaign.title}</p>}
                  {adCampaign.description && <p className="text-gray-400 text-sm mt-0.5">{adCampaign.description}</p>}
                </div>
              )}
              {/* Barra de progresso */}
              <div className="px-4 pt-3 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {adCanClose ? 'Propaganda concluída' : `Encerrando em ${Math.ceil((adCampaign.requiredSeconds || 20) * (1 - adProgress / 100))}s`}
                  </span>
                  <span className="text-xs font-bold" style={{ color: adProgress < 30 ? '#ef4444' : adProgress < 70 ? '#f59e0b' : adProgress < 100 ? '#00d4ff' : '#22c55e' }}>
                    {adProgress}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${adProgress}%`,
                      background: adProgress < 30
                        ? 'linear-gradient(90deg, #ef4444, #f97316)'
                        : adProgress < 70
                        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                        : adProgress < 100
                        ? 'linear-gradient(90deg, #00d4ff, #0ea5e9)'
                        : 'linear-gradient(90deg, #22c55e, #4ade80)',
                      boxShadow: adProgress < 30 ? '0 0 10px rgba(239,68,68,0.6)' : adProgress < 70 ? '0 0 10px rgba(245,158,11,0.6)' : adProgress < 100 ? '0 0 10px rgba(0,212,255,0.7)' : '0 0 10px rgba(34,197,94,0.7)',
                    }}
                  />
                </div>
                {/* Botão de link (opcional) */}
                {adCampaign.linkUrl && (
                  <a
                    href={adCampaign.linkUrl}
                    target={adCampaign.linkTarget || '_blank'}
                    rel="noopener noreferrer"
                    className="mt-3 block w-full text-center py-2 rounded-lg text-sm font-semibold text-white transition-all"
                    style={{ background: 'linear-gradient(90deg, #0ea5e9, #06b6d4)', boxShadow: '0 0 16px rgba(14,165,233,0.3)' }}
                  >
                    {adCampaign.linkText || 'Saiba Mais'}
                  </a>
                )}
                {/* Botão fechar (só após o tempo) */}
                <button
                  onClick={() => adCanClose && setAdVisible(false)}
                  disabled={!adCanClose}
                  className="mt-3 w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: adCanClose ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                    color: adCanClose ? '#fff' : '#555',
                    border: adCanClose ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.05)',
                    cursor: adCanClose ? 'pointer' : 'not-allowed',
                  }}
                >
                  {adCanClose ? 'Fechar propaganda ✕' : `Aguarde ${Math.ceil((adCampaign.requiredSeconds || 20) * (1 - adProgress / 100))}s para fechar`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-9 w-1.5 rounded-full" style={{ background: 'var(--primary)', boxShadow: '0 0 18px 2px color-mix(in oklch, var(--primary) 60%, transparent)' }} />
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-primary/70 bg-clip-text text-transparent">Planilha de Gastos</h1>
            </div>
            <div className="mt-3 sm:pl-[18px]">
              <div className="flex max-w-2xl items-center gap-3 rounded-xl border border-primary/20 bg-card/70 px-3 py-2.5 shadow-sm backdrop-blur-sm">
                {planInfo?.profilePhotoUrl ? (
                  <img
                    src={planInfo.profilePhotoUrl}
                    alt={planInfo?.clientName || clientName || 'Cliente'}
                    className="h-12 w-12 rounded-full object-cover border-2 shrink-0"
                    style={{ borderColor: 'var(--primary)' }}
                  />
                ) : (
                  <div
                    className="h-12 w-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
                    style={{ background: 'color-mix(in oklch, var(--primary) 25%, transparent)', color: 'var(--primary)', border: '2px solid color-mix(in oklch, var(--primary) 40%, transparent)' }}
                  >
                    {(planInfo?.clientName || clientName || 'C').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{planInfo?.clientName || clientName || 'Cliente'}</p>
                  <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-3">
                    <span className="flex min-w-0 items-center gap-1 truncate"><Phone className="h-3 w-3 text-primary shrink-0" />{planInfo?.phone || 'Telefone não informado'}</span>
                    <span className="flex min-w-0 items-center gap-1 truncate"><CreditCard className="h-3 w-3 text-primary shrink-0" />{planInfo?.cpf || 'CPF não informado'}</span>
                    <span className="flex min-w-0 items-center gap-1 truncate"><Mail className="h-3 w-3 text-primary shrink-0" />{planInfo?.email || 'E-mail não informado'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Ícone de chat em destaque no topo */}
            {phoneFromToken && (
              <button
                onClick={() => {
                  // Disparar clique no botão flutuante do chat
                  const chatBtn = document.getElementById('chat-floating-btn');
                  if (chatBtn) chatBtn.click();
                }}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95"
                style={{ background: 'rgba(7,94,84,0.2)', borderColor: 'rgba(18,140,126,0.5)', color: '#25d366' }}
                title="Mensagens ao vivo"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#25d366' }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#25d366' }} />
                </span>
                💬 Chat
              </button>
            )}
            <button
              onClick={() => setShowDeleteAllModal(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 transition-all active:scale-95"
            >
              🗑️ Apagar Tudo
            </button>
            <Button onClick={onLogout} variant="outline" size="sm" className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300">Sair</Button>
          </div>
        </div>

        {/* Serviços Extras / Consultas — TOPO */}
        {phoneFromToken && (
          <div className="mb-6">
            <ServicosExtras
              customerPhone={phoneFromToken}
              customerName={clientName || ""}
              prominent
            />
          </div>
        )}

        {/* Card Plano Walk Ajuda */}
        {planInfo?.expiresAt && (() => {
          const expDate = new Date(planInfo.expiresAt);
          const now = new Date();
          const diffMs = expDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          const isExpiringSoon = diffDays <= 3 && diffDays > 0;
          const isExpired = diffMs < 0;
          return (
            <div className={`mb-6 flex items-center gap-3 px-4 py-3 rounded-xl border ${
              isExpired
                ? 'bg-red-500/10 border-red-500/40'
                : isExpiringSoon
                  ? 'bg-amber-500/10 border-amber-500/40'
                  : 'bg-primary/5 border-primary/20'
            }`}>
              <Shield className={`w-5 h-5 flex-shrink-0 ${
                isExpired ? 'text-red-400' : isExpiringSoon ? 'text-amber-400' : 'text-primary'
              }`} />
              <div className="flex-1">
                <p className={`text-xs font-semibold uppercase tracking-wide ${
                  isExpired ? 'text-red-400' : isExpiringSoon ? 'text-amber-400' : 'text-primary'
                }`}>Plano Walk Ajuda</p>
                <p className="text-white text-sm font-medium">
                  {isExpired
                    ? 'Plano expirado'
                    : `Ativo até ${expDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{isExpired ? 'Expirado' : isExpiringSoon ? `Vence em ${diffDays} dia${diffDays !== 1 ? 's' : ''}` : `${diffDays} dias restantes`}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Banners informativos */}
        {activeBanners.length > 0 && (
          <div className="space-y-3 mb-6">
            {activeBanners.map(b => (
              <div
                key={b.id}
                className="rounded-xl px-4 py-3 border border-white/10 flex items-start gap-3"
                style={{ backgroundColor: b.bgColor, color: b.textColor }}
              >
                <span className="text-base flex-shrink-0 mt-0.5">📢</span>
                <div className="min-w-0">
                  {b.title && <p className="text-sm font-bold leading-tight mb-0.5">{b.title}</p>}
                  <p className="text-xs leading-relaxed whitespace-pre-wrap opacity-90">{b.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Banner ao vivo do Chat */}
        {phoneFromToken && (
          <div
            className="mb-6 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-all"
            style={{ background: 'linear-gradient(135deg, rgba(7,94,84,0.4), rgba(18,140,126,0.3))', border: '1px solid rgba(37,211,102,0.3)', boxShadow: '0 0 20px rgba(37,211,102,0.1)' }}
            onClick={() => {
              const chatBtn = document.getElementById('chat-floating-btn');
              if (chatBtn) chatBtn.click();
            }}
          >
            <span className="relative flex h-3 w-3 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#25d366' }} />
              <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: '#25d366' }} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: '#25d366' }}>🔴 AO VIVO — Novo recurso!</p>
              <p className="text-xs text-white/70">Agora você pode conversar com outros usuários em tempo real. Toque para abrir.</p>
            </div>
            <span className="text-white/50 text-lg">💬</span>
          </div>
        )}

        {/* Resumo por periodo */}
        <div className="mb-8">
          {/* Cabecalho das colunas */}
          <div className="grid grid-cols-3 gap-2 mb-2 px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Gastos</span>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 flex-shrink-0" />
              <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Lucro</span>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Ganhos</span>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
            </div>
          </div>

          {/* Linhas de periodo */}
          {[
            { label: 'Hoje', data: summary.daily },
            { label: 'Semanal', data: summary.weekly },
            { label: 'Mensal', data: summary.monthly },
            { label: 'Anual', data: summary.yearly },
          ].map(({ label, data }) => (
            <div key={label} className="grid grid-cols-3 gap-2 mb-2">
              {/* Gastos */}
<Card className="relative overflow-hidden rounded-xl p-3" style={{ background: 'linear-gradient(135deg, #450a0a 0%, #1c0606 100%)', border: '2px solid rgba(239,68,68,0.8)', boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }}>
                <p className="text-[10px] text-red-400/70 font-semibold uppercase tracking-wider mb-0.5">{label}</p>
                {(earningsLoading || expensesLoading) ? (
                  <div className="h-5 w-16 bg-red-500/20 rounded animate-pulse" />
                ) : (
                  <p className="text-base font-extrabold text-red-400 leading-tight">{data.expenses.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                )}
              </Card>
              {/* Lucro */}
<Card className="relative overflow-hidden rounded-xl p-3" style={{ background: data.profit >= 0 ? 'linear-gradient(135deg, #052e16 0%, #021a0c 100%)' : 'linear-gradient(135deg, #450a0a 0%, #1c0606 100%)', border: data.profit >= 0 ? '2px solid rgba(34,197,94,0.8)' : '2px solid rgba(239,68,68,0.8)', boxShadow: data.profit >= 0 ? '0 4px 16px rgba(34,197,94,0.3)' : '0 4px 16px rgba(239,68,68,0.3)' }}>
                <p className="text-[10px] text-yellow-400/70 font-semibold uppercase tracking-wider mb-0.5 text-center">{label}</p>
                {(earningsLoading || expensesLoading) ? (
                  <div className="h-5 w-16 bg-yellow-500/20 rounded animate-pulse mx-auto" />
                ) : (
                  <p className={`text-base font-extrabold leading-tight text-center ${
                    data.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>{data.profit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                )}
              </Card>
              {/* Ganhos */}
<Card className="relative overflow-hidden rounded-xl p-3" style={{ background: 'linear-gradient(135deg, #052e16 0%, #021a0c 100%)', border: '2px solid rgba(34,197,94,0.8)', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
                <p className="text-[10px] text-emerald-400/70 font-semibold uppercase tracking-wider mb-0.5 text-right">{label}</p>
                {(earningsLoading || expensesLoading) ? (
                  <div className="h-5 w-16 bg-emerald-500/20 rounded animate-pulse ml-auto" />
                ) : (
                  <p className="text-base font-extrabold text-emerald-400 leading-tight text-right">{data.earnings.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                )}
              </Card>
            </div>
          ))}
        </div>

        {/* Seletor de Mês */}
        <div className="mb-4 max-w-md">
          <label className="mb-2 flex items-center gap-2 text-sm font-bold tracking-wide text-foreground">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" /> Selecionar Mês
          </label>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-12 rounded-xl border-primary/30 bg-card/80 px-4 font-semibold text-foreground shadow-sm transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/35"
          />
        </div>

        {/* Abas */}
        <Tabs value={activeModule} onValueChange={setActiveModule} className="w-full">
          <TabsList aria-label="Módulos da Planilha de Gastos" className="!grid !w-full grid-cols-3 md:grid-cols-5 xl:grid-cols-9 !h-auto !items-stretch gap-2.5 sm:gap-3 bg-transparent p-0 mb-5">
            <DashboardModuleCard value="gastos" label="Gastos" selected={activeModule === 'gastos'} theme={MODULE_THEMES.gastos} icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>} />
            <DashboardModuleCard value="ganhos" label="Ganhos" selected={activeModule === 'ganhos'} theme={MODULE_THEMES.ganhos} icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>} />
            <DashboardModuleCard value="operacional" label="Operacional" selected={activeModule === 'operacional'} theme={MODULE_THEMES.operacional} icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
            <DashboardModuleCard value="metas" label="Metas" selected={activeModule === 'metas'} theme={MODULE_THEMES.metas} icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>} />
            <DashboardModuleCard value="graficos" label="Gráficos" selected={activeModule === 'graficos'} theme={MODULE_THEMES.graficos} icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>} />
            <DashboardModuleCard value="emprestimos" label="Empréstimos" selected={activeModule === 'emprestimos'} theme={MODULE_THEMES.emprestimos} icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>} />
            <DashboardModuleCard value="analisador" label="Analisador" selected={activeModule === 'analisador'} theme={MODULE_THEMES.analisador} icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><path d="M20 2v4h-4"/></svg>} />
            <DashboardModuleCard value="particular" label="Particular" badge="NOVO" selected={activeModule === 'particular'} theme={MODULE_THEMES.particular} icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14v-5l-2-5H7l-2 5v5Z"/><circle cx="8.5" cy="17" r="1.5"/><circle cx="15.5" cy="17" r="1.5"/><path d="M8 7V4h8v3"/></svg>} />
            <DashboardExternalModuleCard label="Cartões" selected={false} theme={MODULE_THEMES.cartoes} onClick={() => window.location.href = '/cartoes'} icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>} />
          </TabsList>

          {/* H2 PARTICULAR */}
          <TabsContent value="particular" className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <H2ParticularModule token={token} />
          </TabsContent>

          {/* Aba Gastos */}
          <TabsContent value="gastos" className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            {/* Data + botão */}
            <div className="flex gap-3">
              <Input
                type="date"
                value={newExpense.date}
                onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                className="h-11 bg-input border-border text-foreground focus-visible:border-ring flex-1"
              />
              <Button onClick={handleAddExpense} className="h-11 px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-[0_0_16px_-4px_var(--primary)] whitespace-nowrap">Adicionar Gasto</Button>
            </div>

            {/* Lista unificada: categoria | input | valor lançado — mesma linha */}
            <div className="space-y-2">
              {[
                { label: 'Combustível', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22V8l9-6 9 6v14H3z"/><path d="M10 22v-6h4v6"/><path d="M18 8h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-2"/></svg>, key: 'fuel', val: newExpense.fuel, set: (v: string) => setNewExpense({ ...newExpense, fuel: v }) },
                { label: 'Aluguel', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, key: 'carRental', val: newExpense.carRental, set: (v: string) => setNewExpense({ ...newExpense, carRental: v }) },
                { label: 'Manutenção', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>, key: 'maintenance', val: newExpense.maintenance, set: (v: string) => setNewExpense({ ...newExpense, maintenance: v }) },
                { label: 'Troca de Óleo', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6l3 3-3 3v6"/><path d="M6 12H2"/><path d="M22 12h-4"/></svg>, key: 'oilChange', val: newExpense.oilChange, set: (v: string) => setNewExpense({ ...newExpense, oilChange: v }) },
                { label: 'Lavagem', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>, key: 'washing', val: newExpense.washing, set: (v: string) => setNewExpense({ ...newExpense, washing: v }) },
                { label: 'Seguro', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, key: 'insurance', val: newExpense.insurance, set: (v: string) => setNewExpense({ ...newExpense, insurance: v }) },
                { label: 'Internet/Tel.', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>, key: 'internetPhone', val: newExpense.internetPhone, set: (v: string) => setNewExpense({ ...newExpense, internetPhone: v }) },
                { label: 'Alimentação', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>, key: 'food', val: newExpense.food, set: (v: string) => setNewExpense({ ...newExpense, food: v }) },
                { label: 'Estacionamento', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>, key: 'parking', val: newExpense.parking, set: (v: string) => setNewExpense({ ...newExpense, parking: v }) },
                { label: 'Pedágios', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>, key: 'tolls', val: newExpense.tolls, set: (v: string) => setNewExpense({ ...newExpense, tolls: v }) },
                { label: 'Financiamento', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>, key: 'financing', val: newExpense.financing, set: (v: string) => setNewExpense({ ...newExpense, financing: v }) },
                { label: 'Multas', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>, key: 'fines', val: newExpense.fines, set: (v: string) => setNewExpense({ ...newExpense, fines: v }) },
                { label: 'Acessórios', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>, key: 'accessories', val: newExpense.accessories, set: (v: string) => setNewExpense({ ...newExpense, accessories: v }) },
                { label: 'Outros Gastos', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>, key: 'otherExpenses', val: newExpense.otherExpenses, set: (v: string) => setNewExpense({ ...newExpense, otherExpenses: v }) },
              ].map(({ label, icon, key, val, set }) => (
<div key={key} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all active:scale-[0.98]" style={{ background: 'linear-gradient(135deg, #2d0808 0%, #180404 100%)', border: '2px solid rgba(239,68,68,0.6)', boxShadow: '0 2px 10px rgba(239,68,68,0.15)' }}>
                  <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center flex-shrink-0 text-red-400">{icon}</div>
                  <span className="text-xs font-semibold text-white/70 flex-1 min-w-0 truncate">{label}</span>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    className="h-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:border-red-500 w-24 flex-shrink-0 text-center text-sm font-mono"
                  />
                  <div className="h-9 w-24 flex-shrink-0 bg-red-600/15 border border-red-500/25 rounded-lg flex items-center justify-end px-2.5">
                    <span className="text-red-400 font-bold text-sm font-mono">{(expensesByCategory[key as keyof typeof expensesByCategory] || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Histórico de lançamentos por data */}
            {expenses.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Histórico de Lançamentos</p>
                {uniqueDates.slice().sort((a, b) => b.localeCompare(a)).map((date, idx) => {
                  const expsForDate = expenses.filter(exp => exp.date === date);
                  const isToday = date === todayLocalDate;
                  const isOpen = isToday || openExpenseDates.has(date);
                  const totalDate = expsForDate.reduce((s, e) => s + calculateExpenseTotal(e), 0);
                  const expCats = [
                    { key: 'fuel', label: 'Combustível' },
                    { key: 'carRental', label: 'Aluguel' },
                    { key: 'maintenance', label: 'Manutenção' },
                    { key: 'oilChange', label: 'Troca de Óleo' },
                    { key: 'washing', label: 'Lavagem' },
                    { key: 'insurance', label: 'Seguro' },
                    { key: 'internetPhone', label: 'Internet/Tel.' },
                    { key: 'food', label: 'Alimentação' },
                    { key: 'parking', label: 'Estacionamento' },
                    { key: 'tolls', label: 'Pedágios' },
                    { key: 'financing', label: 'Financiamento' },
                    { key: 'fines', label: 'Multas' },
                    { key: 'accessories', label: 'Acessórios' },
                    { key: 'otherExpenses', label: 'Outros Gastos' },
                  ];
                  return (
<div key={date} className="rounded-xl overflow-hidden shadow-md" style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #070710 100%)', border: '1.5px solid rgba(99,102,241,0.25)' }}>
                      {/* Cabeçalho da data — clicavel para datas anteriores */}
                      <button
                        type="button"
                        onClick={() => !isToday && toggleExpenseDate(date)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${!isToday ? 'cursor-pointer hover:brightness-110 active:brightness-90' : 'cursor-default'}`}
                        style={{ backgroundColor: DATE_COLORS[idx % DATE_COLORS.length] + '33', borderBottom: isOpen ? '1px solid ' + DATE_COLORS[idx % DATE_COLORS.length] + '44' : 'none' }}
                      >
                        <div className="flex items-center gap-2">
                          {!isToday && (
                            <span className="text-xs" style={{ color: DATE_COLORS[idx % DATE_COLORS.length] }}>{isOpen ? '▼' : '►'}</span>
                          )}
                          <span className="font-bold text-sm" style={{ color: DATE_COLORS[idx % DATE_COLORS.length] }}>
                            {formatDateLocal(date)}{isToday ? ' — Hoje' : ''}
                          </span>
                        </div>
                        <span className="font-bold text-sm text-red-400">Total: R$ {totalDate.toFixed(2)}</span>
                      </button>
                      {/* Detalhamento agrupado por categoria — só visível quando aberto */}
                      {isOpen && (() => {
                        // Montar grupos: catKey -> { label, items: [{exp, value}] }
                        const catGroupsMap: Record<string, { label: string; items: { exp: Expense; value: number }[] }> = {};
                        for (const exp of expsForDate) {
                          for (const cat of expCats) {
                            const val = parseFloat((exp[cat.key as keyof Expense] as string) || '0');
                            if (val > 0) {
                              if (!catGroupsMap[cat.key]) catGroupsMap[cat.key] = { label: cat.label, items: [] };
                              catGroupsMap[cat.key].items.push({ exp, value: val });
                            }
                          }
                        }
                        const catGroups = Object.entries(catGroupsMap);
                        return (
                          <div className="px-4 py-2 space-y-1">
                            {catGroups.map(([catKey, group]) => {
                              const groupKey = `${date}::${catKey}`;
                              const catTotal = group.items.reduce((s, i) => s + i.value, 0);
                              const count = group.items.length;
                              // Grupos com 1 item ficam abertos por padrão; com 2+ ficam fechados
                              const isCatOpen = count === 1 || openExpenseCatGroups.has(groupKey);
                              return (
                                <div key={catKey} className="rounded-lg overflow-hidden border border-border/30">
                                  {/* Cabeçalho do grupo de categoria */}
                                  <button
                                    type="button"
                                    onClick={() => count > 1 && toggleExpenseCatGroup(groupKey)}
                                    className={`w-full flex items-center justify-between px-3 py-1.5 bg-muted/30 transition-colors ${count > 1 ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default'}`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {count > 1 && (
                                        <span className="text-[10px] text-muted-foreground">{isCatOpen ? '▼' : '►'}</span>
                                      )}
                                      <span className="text-xs font-semibold text-foreground">{group.label}</span>
                                      {count > 1 && (
                                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{count}x</span>
                                      )}
                                    </div>
                                    <span className="text-xs font-bold text-red-400">R$ {catTotal.toFixed(2)}</span>
                                  </button>
                                  {/* Itens individuais do grupo */}
                                  {isCatOpen && (
                                    <div className="divide-y divide-border/20">
                                      {group.items.map(({ exp, value }) => {
                                        const timeStr = formatCreatedAtTime(exp.createdAt);
                                        return (
                                          <div key={exp.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-1">
                                              {timeStr && (
                                                <span className="text-xs text-muted-foreground font-mono">{timeStr}</span>
                                              )}
                                              <span className="text-xs font-semibold text-red-400">R$ {value.toFixed(2)}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <button onClick={(e) => { e.stopPropagation(); handleEditExpense(exp); }} className="text-xs font-semibold text-primary hover:bg-primary/10 rounded px-2 py-0.5 active:scale-95 transition-all">Editar</button>
                                              <button onClick={(e) => { e.stopPropagation(); handleDeleteExpense(exp.id); }} className="text-xs font-semibold text-red-400 hover:bg-red-500/10 rounded px-2 py-0.5 active:scale-95 transition-all">Deletar</button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}

          </TabsContent>

          {/* Aba Ganhos */}
          <TabsContent value="ganhos" className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            {/* Data + botão */}
            <div className="flex gap-3">
              <Input
                type="date"
                value={newEarning.date}
                onChange={(e) => setNewEarning({ ...newEarning, date: e.target.value })}
                className="h-11 bg-input border-border text-foreground focus-visible:border-ring flex-1"
              />
              <Button onClick={handleAddEarning} className="h-11 px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-[0_0_16px_-4px_var(--primary)] whitespace-nowrap">Adicionar Ganho</Button>
            </div>

            {/* Lista unificada: categoria | input | valor lançado — mesma linha */}
            <div className="space-y-2">
              {[
                { label: 'Uber', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="1"/><circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>, key: 'uber', val: newEarning.uber, set: (v: string) => setNewEarning({ ...newEarning, uber: v }) },
                { label: '99', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>, key: 'ninetynine', val: newEarning.ninetynine, set: (v: string) => setNewEarning({ ...newEarning, ninetynine: v }) },
                { label: 'InDrive', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>, key: 'indrive', val: newEarning.indrive, set: (v: string) => setNewEarning({ ...newEarning, indrive: v }) },
                { label: 'Particular', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, key: 'particular', val: newEarning.particular, set: (v: string) => setNewEarning({ ...newEarning, particular: v }) },
                { label: 'Entregas', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>, key: 'deliveries', val: newEarning.deliveries, set: (v: string) => setNewEarning({ ...newEarning, deliveries: v }) },
                { label: 'Gorjetas', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, key: 'tips', val: newEarning.tips, set: (v: string) => setNewEarning({ ...newEarning, tips: v }) },
                { label: 'Outros Ganhos', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>, key: 'otherEarnings', val: newEarning.otherEarnings, set: (v: string) => setNewEarning({ ...newEarning, otherEarnings: v }) },
              ].map(({ label, icon, key, val, set }) => (
<div key={key} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all active:scale-[0.98]" style={{ background: 'linear-gradient(135deg, #052e16 0%, #021a0c 100%)', border: '2px solid rgba(34,197,94,0.7)', boxShadow: '0 2px 10px rgba(34,197,94,0.15)' }}>
                  <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 text-emerald-400">{icon}</div>
                  <span className="text-xs font-semibold text-white/70 flex-1 min-w-0 truncate">{label}</span>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    className="h-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:border-emerald-500 w-24 flex-shrink-0 text-center text-sm font-mono"
                  />
                  <div className="h-9 w-24 flex-shrink-0 bg-emerald-600/15 border border-emerald-500/25 rounded-lg flex items-center justify-end px-2.5">
                    <span className="text-emerald-400 font-bold text-sm font-mono">{(earningsByCategory[key as keyof typeof earningsByCategory] || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Histórico de lançamentos por data */}
            {earnings.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Histórico de Lançamentos</p>
                {Array.from(new Set(earnings.map(e => e.date))).sort((a, b) => b.localeCompare(a)).map((date, idx) => {
                  const earnsForDate = earnings.filter(e => e.date === date);
                  const isToday = date === todayLocalDate;
                  const isOpen = isToday || openEarningDates.has(date);
                  const totalDate = earnsForDate.reduce((s, e) => s + calculateEarningTotal(e), 0);
                  const earnCats = [
                    { key: 'uber', label: 'Uber' },
                    { key: 'ninetynine', label: '99' },
                    { key: 'indrive', label: 'InDrive' },
                    { key: 'particular', label: 'Particular' },
                    { key: 'deliveries', label: 'Entregas' },
                    { key: 'tips', label: 'Gorjetas' },
                    { key: 'otherEarnings', label: 'Outros Ganhos' },
                  ];
                  return (
<div key={date} className="rounded-xl overflow-hidden shadow-md" style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #070710 100%)', border: '1.5px solid rgba(34,197,94,0.25)' }}>
                      <button
                        type="button"
                        onClick={() => !isToday && toggleEarningDate(date)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${!isToday ? 'cursor-pointer hover:brightness-110 active:brightness-90' : 'cursor-default'}`}
                        style={{ backgroundColor: DATE_COLORS[idx % DATE_COLORS.length] + '33', borderBottom: isOpen ? '1px solid ' + DATE_COLORS[idx % DATE_COLORS.length] + '44' : 'none' }}
                      >
                        <div className="flex items-center gap-2">
                          {!isToday && (
                            <span className="text-xs" style={{ color: DATE_COLORS[idx % DATE_COLORS.length] }}>{isOpen ? '▼' : '►'}</span>
                          )}
                          <span className="font-bold text-sm" style={{ color: DATE_COLORS[idx % DATE_COLORS.length] }}>
                            {formatDateLocal(date)}{isToday ? ' — Hoje' : ''}
                          </span>
                        </div>
                        <span className="font-bold text-sm text-emerald-400">Total: R$ {totalDate.toFixed(2)}</span>
                      </button>
                      {/* Detalhamento agrupado por categoria — só visível quando aberto */}
                      {isOpen && (() => {
                        const earnGroupsMap: Record<string, { label: string; items: { earn: Earning; value: number }[] }> = {};
                        for (const earn of earnsForDate) {
                          for (const cat of earnCats) {
                            const val = parseFloat((earn[cat.key as keyof Earning] as string) || '0');
                            if (val > 0) {
                              if (!earnGroupsMap[cat.key]) earnGroupsMap[cat.key] = { label: cat.label, items: [] };
                              earnGroupsMap[cat.key].items.push({ earn, value: val });
                            }
                          }
                        }
                        const earnGroups = Object.entries(earnGroupsMap);
                        return (
                          <div className="px-4 py-2 space-y-1">
                            {earnGroups.map(([catKey, group]) => {
                              const groupKey = `${date}::${catKey}`;
                              const catTotal = group.items.reduce((s, i) => s + i.value, 0);
                              const count = group.items.length;
                              const isCatOpen = count === 1 || openEarningCatGroups.has(groupKey);
                              return (
                                <div key={catKey} className="rounded-lg overflow-hidden border border-border/30">
                                  <button
                                    type="button"
                                    onClick={() => count > 1 && toggleEarningCatGroup(groupKey)}
                                    className={`w-full flex items-center justify-between px-3 py-1.5 bg-muted/30 transition-colors ${count > 1 ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default'}`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {count > 1 && (
                                        <span className="text-[10px] text-muted-foreground">{isCatOpen ? '▼' : '►'}</span>
                                      )}
                                      <span className="text-xs font-semibold text-foreground">{group.label}</span>
                                      {count > 1 && (
                                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{count}x</span>
                                      )}
                                    </div>
                                    <span className="text-xs font-bold text-emerald-400">R$ {catTotal.toFixed(2)}</span>
                                  </button>
                                  {isCatOpen && (
                                    <div className="divide-y divide-border/20">
                                      {group.items.map(({ earn, value }) => {
                                        const timeStr = formatCreatedAtTime(earn.createdAt);
                                        return (
                                          <div key={earn.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-1">
                                              {timeStr && (
                                                <span className="text-xs text-muted-foreground font-mono">{timeStr}</span>
                                              )}
                                              <span className="text-xs font-semibold text-emerald-400">R$ {value.toFixed(2)}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <button onClick={(e) => { e.stopPropagation(); handleEditEarning(earn); }} className="text-xs font-semibold text-primary hover:bg-primary/10 rounded px-2 py-0.5 active:scale-95 transition-all">Editar</button>
                                              <button onClick={(e) => { e.stopPropagation(); handleDeleteEarning(earn.id); }} className="text-xs font-semibold text-red-400 hover:bg-red-500/10 rounded px-2 py-0.5 active:scale-95 transition-all">Deletar</button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Aba Operacional */}
          <TabsContent value="operacional" className="space-y-6">
            <div className="flex gap-4">
              <Input
                type="date"
                value={newOperational.date}
                onChange={(e) => setNewOperational({ ...newOperational, date: e.target.value })}
                className="h-11 bg-input border-border text-foreground focus-visible:border-ring flex-1"
                placeholder="Data"
              />
              <Button onClick={handleAddOperational} className="h-11 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-[0_0_16px_-4px_var(--primary)]">Adicionar Operacional</Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                type="number"
                placeholder="KM Inicial"
                value={newOperational.kmInitial}
                onChange={(e) => setNewOperational({ ...newOperational, kmInitial: e.target.value })}
                className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring"
              />
              <Input
                type="number"
                placeholder="KM Final"
                value={newOperational.kmFinal}
                onChange={(e) => setNewOperational({ ...newOperational, kmFinal: e.target.value })}
                className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring"
              />
              {/* Hora Inicial */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>⏰</span> Hora de Início
                </label>
                <Input
                  type="time"
                  value={newOperational.timeInitial}
                  onChange={(e) => setNewOperational({ ...newOperational, timeInitial: e.target.value })}
                  className="h-11 bg-input border-border text-foreground focus-visible:border-ring"
                />
                <p className="text-[11px] text-muted-foreground/60 px-1">Horário em que você iniciou sua jornada. <span className="text-muted-foreground/40">Ex: 08:00</span></p>
              </div>
              {/* Hora Final */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>⏰</span> Hora Final
                </label>
                <Input
                  type="time"
                  value={newOperational.timeFinal}
                  onChange={(e) => setNewOperational({ ...newOperational, timeFinal: e.target.value })}
                  className="h-11 bg-input border-border text-foreground focus-visible:border-ring"
                />
                <p className="text-[11px] text-muted-foreground/60 px-1">Horário em que você encerrou sua jornada. <span className="text-muted-foreground/40">Ex: 18:30</span></p>
              </div>
            </div>

            {/* Tempo trabalhado calculado automaticamente */}
            {newOperational.timeInitial && newOperational.timeFinal && (() => {
              const [hi, mi] = newOperational.timeInitial.split(':').map(Number);
              const [hf, mf] = newOperational.timeFinal.split(':').map(Number);
              const totalMin = (hf * 60 + mf) - (hi * 60 + mi);
              if (totalMin <= 0) return null;
              const horas = Math.floor(totalMin / 60);
              const minutos = totalMin % 60;
              return (
                <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
                  <span className="text-xl">📊</span>
                  <div>
                    <p className="text-xs text-primary/70 font-semibold uppercase tracking-wide">Tempo Trabalhado</p>
                    <p className="text-lg font-extrabold text-primary">{horas}h {minutos.toString().padStart(2,'0')}min</p>
                    <p className="text-[11px] text-muted-foreground/60">Calculado automaticamente com base nos horários informados</p>
                  </div>
                </div>
              );
            })()}

            {/* Aviso explicativo */}
            <div className="flex items-start gap-2 bg-card/60 border border-border/50 rounded-xl px-4 py-3">
              <span className="text-base mt-0.5">🚗</span>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                Informe o horário de início e término da sua jornada. O sistema calculará automaticamente o <strong className="text-muted-foreground">tempo total trabalhado</strong>, permitindo acompanhar ganho por hora e produtividade da jornada.
              </p>
            </div>

            <div>
              <p className="text-muted-foreground text-sm mb-2">Quantidade de Corridas por plataforma</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input type="number" placeholder="Corridas Uber" value={newOperational.ridesUber} onChange={(e) => setNewOperational({ ...newOperational, ridesUber: e.target.value })} className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring" />
                <Input type="number" placeholder="Corridas 99" value={newOperational.rides99} onChange={(e) => setNewOperational({ ...newOperational, rides99: e.target.value })} className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring" />
                <Input type="number" placeholder="Corridas InDrive" value={newOperational.ridesIndrive} onChange={(e) => setNewOperational({ ...newOperational, ridesIndrive: e.target.value })} className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring" />
                <Input type="number" placeholder="Corridas Particular" value={newOperational.ridesParticular} onChange={(e) => setNewOperational({ ...newOperational, ridesParticular: e.target.value })} className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring" />
                <Input type="number" placeholder="Corridas Entregas" value={newOperational.ridesDeliveries} onChange={(e) => setNewOperational({ ...newOperational, ridesDeliveries: e.target.value })} className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring" />
              </div>
              <div className="mt-3 bg-card border border-primary/20 rounded-xl p-3 flex justify-between items-center">
                <span className="text-muted-foreground">Total de Corridas</span>
                <span className="text-xl font-bold text-primary">
                  {(parseInt(newOperational.ridesUber) || 0) + (parseInt(newOperational.rides99) || 0) + (parseInt(newOperational.ridesIndrive) || 0) + (parseInt(newOperational.ridesParticular) || 0) + (parseInt(newOperational.ridesDeliveries) || 0)}
                </span>
              </div>
            </div>

            {/* Lista de Operacional */}
            <div className="space-y-2">
              {operational.map(op => {
                const ru = parseInt((op as any).ridesUber) || 0;
                const r99 = parseInt((op as any).rides99) || 0;
                const rin = parseInt((op as any).ridesIndrive) || 0;
                const rpa = parseInt((op as any).ridesParticular) || 0;
                const rde = parseInt((op as any).ridesDeliveries) || 0;
                const totalRides = ru + r99 + rin + rpa + rde;
                const hasBreakdown = totalRides > 0;
                const totalDisplay = hasBreakdown ? totalRides : (parseInt(op.rideCount) || 0);
                const kmDiff = (parseFloat(op.kmFinal as any) || 0) - (parseFloat(op.kmInitial as any) || 0);
                return (
                  <div key={op.id} className="flex justify-between items-start bg-card border border-border hover:border-primary/40 rounded-xl px-4 py-3 gap-3 transition-colors">
                    <div className="flex flex-col">
                      <span>{formatDateLocal(op.date)} - KM: {op.kmInitial} a {op.kmFinal} ({kmDiff} km)</span>
                      {hasBreakdown && (
                        <span className="text-muted-foreground text-sm">Corridas: Uber {ru} | 99 {r99} | InDrive {rin} | Particular {rpa} | Entregas {rde}</span>
                      )}
                      <span className="text-primary text-sm font-semibold">Total de Corridas: {totalDisplay}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditOperational(op); }}
                        className="min-h-[44px] min-w-[60px] px-3 text-sm font-semibold text-primary hover:bg-primary/10 rounded-lg active:scale-95 transition-all"
                      >
                        Editar
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteOperational(op.id); }}
                        className="min-h-[44px] min-w-[60px] px-3 text-sm font-semibold text-red-400 hover:bg-red-500/10 rounded-lg active:scale-95 transition-all"
                      >
                        Deletar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* Aba Metas */}
          <TabsContent value="metas" className="space-y-5">
            {/* Formulário de metas */}
            <Card className="bg-card/80 backdrop-blur border border-border/50 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">🎯 Definir Metas</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground/70 font-medium">Meta Diária</label>
                  <Input type="number" placeholder="Ex: 300" value={newGoal.dailyGoal} onChange={(e) => setNewGoal({ ...newGoal, dailyGoal: e.target.value })} className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ring" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground/70 font-medium">Meta Semanal</label>
                  <Input type="number" placeholder="Ex: 2000" value={newGoal.weeklyGoal} onChange={(e) => setNewGoal({ ...newGoal, weeklyGoal: e.target.value })} className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ring" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground/70 font-medium">Meta Mensal</label>
                  <Input type="number" placeholder="Ex: 5000" value={newGoal.monthlyGoal} onChange={(e) => setNewGoal({ ...newGoal, monthlyGoal: e.target.value })} className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ring" />
                </div>
              </div>
              <Button onClick={handleSetGoals} className="mt-4 h-11 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-[0_0_16px_-4px_var(--primary)]">Salvar Metas</Button>
            </Card>

            {goals && (() => {
              const fmtBR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
              const dailyGoalVal = parseFloat((goals.dailyGoal as any) || '0');
              const weeklyGoalVal = parseFloat((goals.weeklyGoal as any) || '0');
              const monthlyGoalVal = parseFloat((goals.monthlyGoal as any) || '0');

              const dailyCurrent = summary.daily.earnings;
              const weeklyCurrent = summary.weekly.earnings;
              const monthlyCurrent = summary.monthly.earnings;

              const clamp = (v: number) => Math.min(100, Math.max(0, v));
              const dailyPct = dailyGoalVal > 0 ? clamp((dailyCurrent / dailyGoalVal) * 100) : 0;
              const weeklyPct = weeklyGoalVal > 0 ? clamp((weeklyCurrent / weeklyGoalVal) * 100) : 0;
              const monthlyPct = monthlyGoalVal > 0 ? clamp((monthlyCurrent / monthlyGoalVal) * 100) : 0;

              const getBarColor = (pct: number) => {
                if (pct >= 100) return '#00FF88';
                if (pct >= 71) return '#2563EB';
                if (pct >= 31) return '#f59e0b';
                return '#ef4444';
              };
              const getBarGlow = (pct: number) => {
                if (pct >= 100) return '0 0 16px #00FF88';
                if (pct >= 71) return '0 0 16px #2563EB';
                if (pct >= 31) return '0 0 12px #f59e0b';
                return '0 0 12px #ef4444';
              };
              const getMilestoneMsg = (pct: number) => {
                if (pct >= 100) return { icon: '🏆', msg: 'Meta concluída com sucesso!' };
                if (pct >= 90) return { icon: '⚡', msg: 'Último esforço! Restam apenas 10%.' };
                if (pct >= 75) return { icon: '🚀', msg: 'Falta pouco! Você já concluiu 75%.' };
                if (pct >= 50) return { icon: '🔥', msg: 'Parabéns! Você chegou à metade da meta.' };
                if (pct >= 25) return { icon: '🎉', msg: 'Você já concluiu 25% da sua meta.' };
                return null;
              };

              // Dias restantes no mês selecionado
              const [selYear, selMonthNum] = selectedMonth.split('-').map(Number);
              const nowBRT2 = new Date(Date.now() - 3 * 60 * 60 * 1000);
              const todayDay = nowBRT2.getUTCDate();
              const daysInMonth = new Date(selYear, selMonthNum, 0).getDate();
              const daysRemaining = Math.max(1, daysInMonth - todayDay);
              const daysElapsed = Math.max(1, todayDay);
              const dailyAvgNeeded = monthlyGoalVal > 0 && monthlyCurrent < monthlyGoalVal ? (monthlyGoalVal - monthlyCurrent) / daysRemaining : 0;
              const dailyAvgEarned = monthlyCurrent / daysElapsed;
              const daysToGoal = dailyAvgEarned > 0 && monthlyCurrent < monthlyGoalVal ? Math.ceil((monthlyGoalVal - monthlyCurrent) / dailyAvgEarned) : 0;

              // ─── RANKING DOS 3 MELHORES DIAS ───────────────────────────────
              const topDays = [...chartData]
                .filter(d => d.earnings > 0)
                .sort((a, b) => b.earnings - a.earnings)
                .slice(0, 3);
              const rankMedals = [
                { icon: '🥇', label: '1º', color: '#FFD700', glow: '0 0 14px #FFD700' },
                { icon: '🥈', label: '2º', color: '#C0C0C0', glow: '0 0 14px #C0C0C0' },
                { icon: '🥉', label: '3º', color: '#CD7F32', glow: '0 0 14px #CD7F32' },
              ];

              // ─── DISPARAR MARCOS MOTIVACIONAIS ────────────────────────────────
              const MILESTONES = [25, 50, 75, 90, 100];
              const milestoneLabels: Record<number, string> = {
                25: '25% da meta atingido!',
                50: 'Metade da meta atingida!',
                75: '75% da meta atingido!',
                90: '90% da meta atingido!',
                100: 'META CONCLUÍDA!',
              };
              MILESTONES.forEach(m => {
                if (dailyGoalVal > 0 && dailyPct >= m) triggerMilestone(m, milestoneLabels[m], `daily-${m}-${selectedMonth}`);
                if (weeklyGoalVal > 0 && weeklyPct >= m) triggerMilestone(m, milestoneLabels[m], `weekly-${m}-${selectedMonth}`);
                if (monthlyGoalVal > 0 && monthlyPct >= m) triggerMilestone(m, milestoneLabels[m], `monthly-${m}-${selectedMonth}`);
              });

              const GoalCard = ({ label, goal, current, pct, icon }: { label: string; goal: number; current: number; pct: number; icon: string }) => {
                const color = getBarColor(pct);
                const glow = getBarGlow(pct);
                const milestone = getMilestoneMsg(pct);
                const remaining = Math.max(0, goal - current);
                return (
                  <Card className="bg-card/80 backdrop-blur border rounded-2xl p-5 space-y-4" style={{ borderColor: color + '40' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{icon}</span>
                        <span className="text-sm font-bold text-white/90 uppercase tracking-wide">{label}</span>
                      </div>
                      <span className="text-2xl font-extrabold" style={{ color, textShadow: glow }}>{Math.round(pct)}%</span>
                    </div>

                    {/* Barra de progresso animada */}
                    <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${pct}%`, background: color, boxShadow: glow }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white/5 rounded-xl p-2">
                        <p className="text-[10px] text-muted-foreground/60 uppercase">🎯 Meta</p>
                        <p className="text-sm font-bold text-white">{fmtBR(goal)}</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-2">
                        <p className="text-[10px] text-muted-foreground/60 uppercase">💰 Atual</p>
                        <p className="text-sm font-bold" style={{ color }}>{fmtBR(current)}</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-2">
                        <p className="text-[10px] text-muted-foreground/60 uppercase">🚀 Falta</p>
                        <p className="text-sm font-bold text-orange-400">{fmtBR(remaining)}</p>
                      </div>
                    </div>

                    {milestone && (
                      <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: color + '20', border: `1px solid ${color}40` }}>
                        <span className="text-lg">{milestone.icon}</span>
                        <span className="text-xs font-semibold" style={{ color }}>{milestone.msg}</span>
                      </div>
                    )}
                  </Card>
                );
              };

              return (
                <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                  {/* ─── NOTIFICAÇÃO MOTIVACIONAL FLUTUANTE ─── */}
                  {activeMilestone && (
                    <div
                      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border animate-bounce"
                      style={{
                        background: activeMilestone.pct >= 100 ? 'linear-gradient(135deg,#00FF88,#00b894)' : 'linear-gradient(135deg,#2563EB,#7c3aed)',
                        borderColor: activeMilestone.pct >= 100 ? '#00FF88' : '#7c3aed',
                        boxShadow: activeMilestone.pct >= 100 ? '0 0 32px #00FF88' : '0 0 24px #7c3aed',
                      }}
                    >
                      <span className="text-2xl">{activeMilestone.pct >= 100 ? '🏆' : activeMilestone.pct >= 90 ? '⚡' : activeMilestone.pct >= 75 ? '🚀' : activeMilestone.pct >= 50 ? '🔥' : '🎉'}</span>
                      <div>
                        <p className="text-xs font-bold text-white/80 uppercase tracking-widest">{activeMilestone.pct >= 100 ? 'META CONCLUÍDA!' : 'Marco atingido'}</p>
                        <p className="text-sm font-extrabold text-white">{activeMilestone.label}</p>
                      </div>
                      <button onClick={() => setActiveMilestone(null)} className="ml-2 text-white/60 hover:text-white text-lg leading-none">×</button>
                    </div>
                  )}

                  {dailyGoalVal > 0 && <GoalCard label="Meta Diária" goal={dailyGoalVal} current={dailyCurrent} pct={dailyPct} icon="☀️" />}
                  {weeklyGoalVal > 0 && <GoalCard label="Meta Semanal" goal={weeklyGoalVal} current={weeklyCurrent} pct={weeklyPct} icon="📅" />}
                  {monthlyGoalVal > 0 && <GoalCard label="Meta Mensal" goal={monthlyGoalVal} current={monthlyCurrent} pct={monthlyPct} icon="🗓️" />}

                  {/* Resumo rápido + alerta diário */}
                  {monthlyGoalVal > 0 && (
                    <Card className="bg-card/80 backdrop-blur border border-primary/20 rounded-2xl p-5 space-y-3">
                      <h4 className="text-sm font-bold text-primary uppercase tracking-wide">📊 Resumo da Meta Mensal</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/5 rounded-xl p-3">
                          <p className="text-[10px] text-muted-foreground/60 uppercase mb-1">Meta</p>
                          <p className="text-base font-extrabold text-white">{fmtBR(monthlyGoalVal)}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3">
                          <p className="text-[10px] text-muted-foreground/60 uppercase mb-1">Atual</p>
                          <p className="text-base font-extrabold" style={{ color: getBarColor(monthlyPct) }}>{fmtBR(monthlyCurrent)}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3">
                          <p className="text-[10px] text-muted-foreground/60 uppercase mb-1">Falta</p>
                          <p className="text-base font-extrabold text-orange-400">{fmtBR(Math.max(0, monthlyGoalVal - monthlyCurrent))}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3">
                          <p className="text-[10px] text-muted-foreground/60 uppercase mb-1">Progresso</p>
                          <p className="text-base font-extrabold" style={{ color: getBarColor(monthlyPct) }}>{Math.round(monthlyPct)}%</p>
                        </div>
                      </div>
                      {/* Alerta diário */}
                      <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 space-y-1">
                        {monthlyCurrent >= monthlyGoalVal ? (
                          <p className="text-sm font-semibold text-emerald-400">🏆 Você já atingiu sua meta mensal! Parabéns!</p>
                        ) : dailyAvgNeeded > 0 ? (
                          <>
                            <p className="text-xs text-muted-foreground/70">📈 Média necessária por dia para atingir a meta:</p>
                            <p className="text-lg font-extrabold text-primary">{fmtBR(dailyAvgNeeded)} / dia</p>
                            {daysToGoal > 0 && dailyAvgEarned > 0 && (
                              <p className="text-[11px] text-muted-foreground/60">No ritmo atual ({fmtBR(dailyAvgEarned)}/dia), você atingirá a meta em ~{daysToGoal} dias.</p>
                            )}
                            <p className="text-[11px] text-muted-foreground/50">{daysRemaining} dias restantes no mês.</p>
                          </>
                        ) : null}
                      </div>
                    </Card>
                  )}

                  {/* ─── RANKING DOS 3 MELHORES DIAS ─── */}
                  {topDays.length > 0 && (
                    <Card className="bg-card/80 backdrop-blur border border-yellow-500/30 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Trophy className="w-4 h-4 text-yellow-400" />
                        <h4 className="text-sm font-bold text-yellow-400 uppercase tracking-wide">Ranking dos Melhores Dias</h4>
                      </div>
                      <div className="space-y-2">
                        {topDays.map((day, idx) => {
                          const medal = rankMedals[idx];
                          const barPct = topDays[0].earnings > 0 ? (day.earnings / topDays[0].earnings) * 100 : 0;
                          return (
                            <div key={day.date} className="relative rounded-xl overflow-hidden">
                              {/* Barra de fundo */}
                              <div
                                className="absolute inset-0 rounded-xl opacity-15"
                                style={{ width: `${barPct}%`, background: medal.color }}
                              />
                              <div className="relative flex items-center gap-3 px-4 py-3">
                                <span className="text-2xl">{medal.icon}</span>
                                <div className="flex-1">
                                  <p className="text-xs text-muted-foreground/60 font-medium">{medal.label} lugar</p>
                                  <p className="text-sm font-bold text-white">
                                    {new Date(day.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                  </p>
                                </div>
                                <p className="text-base font-extrabold" style={{ color: medal.color, textShadow: medal.glow }}>
                                  {day.earnings.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}
                </div>
              );
            })()}
          </TabsContent>

          {/* Aba Gráficos */}
          <TabsContent value="graficos" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-card/80 backdrop-blur border border-primary/20 rounded-2xl p-6 shadow-lg shadow-primary/10">
                <h3 className="text-lg font-bold mb-4">Ganhos vs Gastos</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis dataKey="date" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                    <Legend />
                    <Line type="monotone" dataKey="earnings" stroke="#10b981" name="Ganhos" />
                    <Line type="monotone" dataKey="expenses" stroke="#ef4444" name="Gastos" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card className="bg-card/80 backdrop-blur border border-primary/20 rounded-2xl p-6 shadow-lg shadow-primary/10">
                <h3 className="text-lg font-bold mb-4">Distribuição de Gastos</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={Object.entries(expensesByCategory).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: v }))}
                      cx="50%" cy="50%" labelLine={false}
                      label={({ name, value }) => `${name}: R$ ${value.toFixed(2)}`}
                      outerRadius={80} fill="#8884d8" dataKey="value"
                    >
                      {Object.entries(expensesByCategory).filter(([, v]) => v > 0).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              <Card className="bg-card/80 backdrop-blur border border-primary/20 rounded-2xl p-6 shadow-lg shadow-primary/10">
                <h3 className="text-lg font-bold mb-4">Ganhos por Plataforma</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={[{ name: 'Ganhos', ...earningsByCategory }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                    <Legend />
                    <Bar dataKey="uber" fill="#3b82f6" name="Uber" />
                    <Bar dataKey="ninetynine" fill="#10b981" name="99" />
                    <Bar dataKey="indrive" fill="#f59e0b" name="InDrive" />
                    <Bar dataKey="particular" fill="#8b5cf6" name="Particular" />
                    <Bar dataKey="deliveries" fill="#ec4899" name="Entregas" />
                    <Bar dataKey="tips" fill="#06b6d4" name="Gorjetas" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="emprestimos" className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <LoansTab token={token} />
          </TabsContent>

          <TabsContent value="analisador" className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <RideAnalyzerTab token={token} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── MODAIS DE EDIÇÃO ──────────────────────────────────────────────────── */}

      {editingExpense && (
        <EditModal
          title="Editando Gasto"
          date={formatDateLocal(editingExpense.date)}
          fields={expenseEditFields}
          onFieldChange={(key, value) => setEditExpenseValues(prev => ({ ...prev, [key]: value }))}
          onSave={handleSaveExpense}
          onCancel={() => setEditingExpense(null)}
          isSaving={updateExpenseMutation.isPending}
        />
      )}

      {editingEarning && (
        <EditModal
          title="Editando Ganho"
          date={formatDateLocal(editingEarning.date)}
          fields={earningEditFields}
          onFieldChange={(key, value) => setEditEarningValues(prev => ({ ...prev, [key]: value }))}
          onSave={handleSaveEarning}
          onCancel={() => setEditingEarning(null)}
          isSaving={updateEarningMutation.isPending}
        />
      )}

      {editingOperational && (
        <EditModal
          title="Editando Operacional"
          date={formatDateLocal(editingOperational.date)}
          fields={operationalEditFields}
          onFieldChange={(key, value) => setEditOperationalValues(prev => ({ ...prev, [key]: value }))}
          onSave={handleSaveOperational}
          onCancel={() => setEditingOperational(null)}
          isSaving={updateOperationalMutation.isPending}
        />
      )}

      {/* Chat */}
      {phoneFromToken && (
        <ChatSidebar
          phone={phoneFromToken}
          onChatSelect={setSelectedChatId}
          selectedChatId={selectedChatId}
        />
      )}
    </div>
  );
}

// ─── ANALISADOR DE CORRIDAS ────────────────────────────────────────────────────
function RideAnalyzerTab({ token }: { token: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayMonth = today.slice(0, 7);

  // Configuração do veículo
  const { data: vehicleConfig, refetch: refetchConfig } = trpc.spreadsheet.getVehicleConfig.useQuery({ token }, { enabled: !!token });
  const saveConfigMut = trpc.spreadsheet.saveVehicleConfig.useMutation({ onSuccess: () => { refetchConfig(); setEditingConfig(false); } });
  const acceptRideMut = trpc.spreadsheet.acceptRide.useMutation();

  // Buscar gastos do dia para combustível
  const { data: expensesMonth } = trpc.spreadsheet.getExpensesByMonth.useQuery({ token, month: todayMonth }, { enabled: !!token });
  const todayExpense = expensesMonth?.find((e: any) => e.date === today);
  const todayFuel = parseFloat(todayExpense?.fuel || '0');

  // Buscar ganhos do dia para resumo
  const { data: earningsMonth, refetch: refetchEarnings } = trpc.spreadsheet.getEarningsByMonth.useQuery({ token, month: todayMonth }, { enabled: !!token });
  const todayEarning = earningsMonth?.find((e: any) => e.date === today);

  // Estado do formulário de corrida
  const [platform, setPlatform] = useState<'uber' | 'ninetynine' | 'indrive' | 'particular' | 'deliveries'>('uber');
  const [fareValue, setFareValue] = useState('');
  const [pickupKm, setPickupKm] = useState('');
  const [tripKm, setTripKm] = useState('');
  const [analysis, setAnalysis] = useState<null | {
    totalKm: number; fuelCost: number; netProfit: number; ratePerKm: number; score: number; label: string; color: string;
  }>(null);
  const [accepted, setAccepted] = useState(false);

  // Estado de configuração do veículo
  const [editingConfig, setEditingConfig] = useState(false);
  const [cfgName, setCfgName] = useState('');
  const [cfgKmL, setCfgKmL] = useState('');
  const [cfgFuelPrice, setCfgFuelPrice] = useState('');
  const [cfgTank, setCfgTank] = useState('');
  const [cfgMinKm, setCfgMinKm] = useState('');

  useEffect(() => {
    if (vehicleConfig) {
      setCfgName(vehicleConfig.vehicleName || 'Meu Veículo');
      setCfgKmL(vehicleConfig.kmPerLiter || '10');
      setCfgFuelPrice(vehicleConfig.fuelPricePerLiter || '6');
      setCfgTank(vehicleConfig.tankCapacityLiters || '50');
      setCfgMinKm(vehicleConfig.minRatePerKm || '2');
    }
  }, [vehicleConfig]);

  const kmPerLiter = parseFloat(vehicleConfig?.kmPerLiter || '10');
  const fuelPrice = parseFloat(vehicleConfig?.fuelPricePerLiter || '6');
  const minRatePerKm = parseFloat(vehicleConfig?.minRatePerKm || '2');
  const costPerKm = fuelPrice / kmPerLiter;

  function calcAnalysis() {
    const fare = parseFloat(fareValue.replace(',', '.')) || 0;
    const pkm = parseFloat(pickupKm.replace(',', '.')) || 0;
    const tkm = parseFloat(tripKm.replace(',', '.')) || 0;
    const totalKm = pkm + tkm;
    if (fare <= 0 || totalKm <= 0) return;
    const fuelCost = totalKm * costPerKm;
    const netProfit = fare - fuelCost;
    const ratePerKm = fare / totalKm;
    // Nota: baseada na taxa por km vs meta mínima
    const ratio = ratePerKm / minRatePerKm;
    let score = Math.min(100, Math.round(ratio * 70 + (netProfit > 0 ? 30 : 0)));
    let label = 'Ruim'; let color = '#ef4444';
    if (score >= 85) { label = 'Excelente'; color = '#10b981'; }
    else if (score >= 70) { label = 'Boa'; color = '#22c55e'; }
    else if (score >= 55) { label = 'Aceitável'; color = '#f59e0b'; }
    else if (score >= 40) { label = 'Fraca'; color = '#f97316'; }
    setAnalysis({ totalKm, fuelCost, netProfit, ratePerKm, score, label, color });
    setAccepted(false);
  }

  async function handleAccept() {
    if (!analysis) return;
    try {
      await acceptRideMut.mutateAsync({ token, date: today, platform, fareValue: fareValue.replace(',', '.'), pickupKm: pickupKm || '0', tripKm: tripKm || '0', note: analysis.score });
      setAccepted(true);
      refetchEarnings();
      setFareValue(''); setPickupKm(''); setTripKm(''); setAnalysis(null);
    } catch (e: any) {
      alert(e.message || 'Erro ao registrar corrida');
    }
  }

  const platformLabels: Record<string, string> = { uber: 'Uber', ninetynine: '99', indrive: 'InDrive', particular: 'Particular', deliveries: 'Entregas' };
  const todayTotal = todayEarning ? ['uber','ninetynine','indrive','particular','deliveries','tips','otherEarnings'].reduce((s, k) => s + parseFloat((todayEarning as any)[k] || '0'), 0) : 0;

  return (
    <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
      {/* Resumo do dia */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-3 text-center">
          <p className="text-xs text-emerald-400/70 mb-1">Ganhos Hoje</p>
          <p className="text-xl font-bold text-emerald-400">R$ {todayTotal.toFixed(2).replace('.', ',')}</p>
        </div>
        <div className="bg-orange-900/30 border border-orange-500/30 rounded-xl p-3 text-center">
          <p className="text-xs text-orange-400/70 mb-1">Combustível Hoje</p>
          <p className="text-xl font-bold text-orange-400">R$ {todayFuel.toFixed(2).replace('.', ',')}</p>
          {todayFuel > 0 && <p className="text-[10px] text-orange-400/50">R$ {costPerKm.toFixed(2)}/km</p>}
        </div>
      </div>

      {/* Configuração do veículo */}
      <div className="bg-card/60 border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-orange-400">🚗 {vehicleConfig?.vehicleName || 'Meu Veículo'}</h3>
          <button onClick={() => setEditingConfig(!editingConfig)} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1">
            {editingConfig ? 'Cancelar' : '⚙️ Configurar'}
          </button>
        </div>
        {!editingConfig ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs text-muted-foreground">Consumo</p><p className="text-sm font-bold text-white">{kmPerLiter} km/L</p></div>
            <div><p className="text-xs text-muted-foreground">Combustível</p><p className="text-sm font-bold text-white">R$ {fuelPrice.toFixed(2)}/L</p></div>
            <div><p className="text-xs text-muted-foreground">Meta/km</p><p className="text-sm font-bold text-white">R$ {minRatePerKm.toFixed(2)}</p></div>
          </div>
        ) : (
          <div className="space-y-2">
            <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="Nome do veículo" value={cfgName} onChange={e => setCfgName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="km/L (ex: 10)" value={cfgKmL} onChange={e => setCfgKmL(e.target.value)} />
              <input className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="R$/L (ex: 6.00)" value={cfgFuelPrice} onChange={e => setCfgFuelPrice(e.target.value)} />
              <input className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="Tanque (L)" value={cfgTank} onChange={e => setCfgTank(e.target.value)} />
              <input className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="Meta R$/km (ex: 2)" value={cfgMinKm} onChange={e => setCfgMinKm(e.target.value)} />
            </div>
            <button
              onClick={() => saveConfigMut.mutate({ token, vehicleName: cfgName, kmPerLiter: cfgKmL, fuelPricePerLiter: cfgFuelPrice, tankCapacityLiters: cfgTank, minRatePerKm: cfgMinKm })}
              disabled={saveConfigMut.isPending}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded-lg py-2 text-sm font-bold"
            >
              {saveConfigMut.isPending ? 'Salvando...' : 'Salvar Configuração'}
            </button>
          </div>
        )}
      </div>

      {/* Formulário de análise */}
      <div className="bg-card/60 border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-orange-400">🏁 Analisar Corrida</h3>

        {/* Plataforma */}
        <div className="grid grid-cols-5 gap-1">
          {(['uber','ninetynine','indrive','particular','deliveries'] as const).map(p => (
            <button key={p} onClick={() => setPlatform(p)}
              className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${platform === p ? 'bg-orange-500 border-orange-400 text-white' : 'bg-background border-border text-muted-foreground'}`}>
              {platformLabels[p]}
            </button>
          ))}
        </div>

        {/* Campos */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</label>
            <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="35,00" value={fareValue} onChange={e => setFareValue(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Busca (km)</label>
            <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="3,0" value={pickupKm} onChange={e => setPickupKm(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Viagem (km)</label>
            <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="12,0" value={tripKm} onChange={e => setTripKm(e.target.value)} />
          </div>
        </div>

        <button onClick={calcAnalysis} className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded-xl py-3 font-bold text-sm">
          ⚡ CALCULAR
        </button>
      </div>

      {/* Resultado da análise */}
      {analysis && (
        <div className="border-2 rounded-xl p-4 space-y-3" style={{ borderColor: analysis.color + '60', background: analysis.color + '10' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-black" style={{ color: analysis.color }}>{analysis.label}</p>
              <p className="text-xs text-muted-foreground">Nota {analysis.score}/100</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black" style={{ color: analysis.color }}>{analysis.score}</p>
              <div className="w-16 h-2 bg-border rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full transition-all" style={{ width: `${analysis.score}%`, background: analysis.color }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-background/50 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">Total km</p>
              <p className="font-bold">{analysis.totalKm.toFixed(1)} km</p>
            </div>
            <div className="bg-background/50 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">R$/km</p>
              <p className="font-bold">R$ {analysis.ratePerKm.toFixed(2)}</p>
            </div>
            <div className="bg-background/50 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">Combustível</p>
              <p className="font-bold text-orange-400">- R$ {analysis.fuelCost.toFixed(2)}</p>
            </div>
            <div className="bg-background/50 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">Lucro líquido</p>
              <p className={`font-bold ${analysis.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>R$ {analysis.netProfit.toFixed(2)}</p>
            </div>
          </div>

          {accepted ? (
            <div className="bg-emerald-900/40 border border-emerald-500/40 rounded-xl p-3 text-center">
              <p className="text-emerald-400 font-bold">✅ Corrida registrada nos ganhos do dia!</p>
            </div>
          ) : (
            <button onClick={handleAccept} disabled={acceptRideMut.isPending}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3 font-bold text-sm">
              {acceptRideMut.isPending ? 'Registrando...' : `✅ ACEITAR E REGISTRAR — ${platformLabels[platform]}`}
            </button>
          )}
        </div>
      )}

      {/* Dica */}
      <div className="bg-muted/20 border border-border/50 rounded-xl p-3 text-xs text-muted-foreground">
        <p className="font-semibold mb-1">💡 Como funciona</p>
        <p>Digite o valor, km de busca e km da viagem. O sistema calcula automaticamente o custo de combustível proporcional e a nota da corrida. Ao aceitar, o valor é lançado direto na aba <strong>Ganhos</strong> e a corrida é contada na aba <strong>Operacional</strong>.</p>
        {todayFuel > 0 && <p className="mt-1 text-orange-400/70">Combustível do dia (R$ {todayFuel.toFixed(2)}) já considerado no cálculo de custo por km.</p>}
      </div>
    </div>
  );
}
