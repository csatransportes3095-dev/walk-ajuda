import { useMemo, useRef, useState } from "react";
import { Download, Upload, Plus, Gauge, Route, TrendingUp, WalletCards, Database, ChevronDown, ChevronUp, Trash2, CalendarDays } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Period = "day" | "week" | "month" | "year";
type ModuleTarget = "gastos" | "ganhos" | "operacional" | "metas" | "graficos" | "analisador";

type Props = {
  token: string;
  selectedMonth: string;
  onSelectedMonthChange: (month: string) => void;
  onNavigate: (target: ModuleTarget) => void;
  onDataChanged: () => void | Promise<void>;
};

const BACKUP_LAST_KEY = "h2_gastos_last_backup_at";

function n(value: unknown): number {
  const raw = String(value ?? "0").replace(/[^0-9,.-]/g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function sumEarning(row: any): number {
  return n(row.uber) + n(row.ninetynine) + n(row.indrive) + n(row.particular) + n(row.deliveries) + n(row.tips) + n(row.otherEarnings);
}

function sumExpense(row: any): number {
  return n(row.fuel) + n(row.carRental) + n(row.maintenance) + n(row.oilChange) + n(row.washing) + n(row.insurance) + n(row.internetPhone) + n(row.food) + n(row.parking) + n(row.tolls) + n(row.financing) + n(row.fines) + n(row.accessories) + n(row.otherExpenses);
}

function dateStringBrt(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function previousMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const d = new Date(year, monthNumber - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function minutesBetween(start: unknown, end: unknown): number {
  const parse = (value: unknown) => {
    const [h, m] = String(value || "").split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  const a = parse(start);
  const b = parse(end);
  if (a == null || b == null) return 0;
  return b >= a ? b - a : 24 * 60 - a + b;
}

function daysInMonth(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m, 0).getDate();
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function SpreadsheetInsightsPanel({ token, selectedMonth, onSelectedMonthChange, onNavigate, onDataChanged }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const [dataOpen, setDataOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const today = dateStringBrt();
  const year = selectedMonth.slice(0, 4);
  const previous = previousMonth(selectedMonth);

  const earningsQuery = trpc.spreadsheet.getEarningsByMonth.useQuery({ token, month: selectedMonth }, { enabled: !!token });
  const expensesQuery = trpc.spreadsheet.getExpensesByMonth.useQuery({ token, month: selectedMonth }, { enabled: !!token });
  const operationalQuery = trpc.spreadsheet.getOperationalByMonth.useQuery({ token, month: selectedMonth }, { enabled: !!token });
  const goalsQuery = trpc.spreadsheet.getGoalsByMonth.useQuery({ token, month: selectedMonth }, { enabled: !!token });
  const yearEarningsQuery = trpc.spreadsheet.getEarningsByYear.useQuery({ token, year }, { enabled: !!token && period === "year" });
  const yearExpensesQuery = trpc.spreadsheet.getExpensesByYear.useQuery({ token, year }, { enabled: !!token && period === "year" });
  const previousEarningsQuery = trpc.spreadsheet.getEarningsByMonth.useQuery({ token, month: previous }, { enabled: !!token });
  const previousExpensesQuery = trpc.spreadsheet.getExpensesByMonth.useQuery({ token, month: previous }, { enabled: !!token });
  const backupQuery = trpc.spreadsheet.exportBackup.useQuery({ token }, { enabled: false, retry: false });
  const restoreMutation = trpc.spreadsheet.restoreBackup.useMutation();
  const deleteAllMutation = trpc.spreadsheet.deleteAllData.useMutation();

  const earnings = (earningsQuery.data || []) as any[];
  const expenses = (expensesQuery.data || []) as any[];
  const operational = (operationalQuery.data || []) as any[];

  const metrics = useMemo(() => {
    const selectedDate = new Date(`${today}T12:00:00`);
    const weekDay = selectedDate.getDay();
    const weekStartDate = new Date(selectedDate);
    weekStartDate.setDate(selectedDate.getDate() - weekDay);
    const weekStart = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, "0")}-${String(weekStartDate.getDate()).padStart(2, "0")}`;

    const filterPeriod = (row: any) => {
      const date = String(row.date || "").slice(0, 10);
      if (period === "day") return date === today;
      if (period === "week") return date >= weekStart && date <= today;
      return true;
    };

    const periodEarnings = period === "year" ? ((yearEarningsQuery.data || []) as any[]) : earnings.filter(filterPeriod);
    const periodExpenses = period === "year" ? ((yearExpensesQuery.data || []) as any[]) : expenses.filter(filterPeriod);
    const revenue = periodEarnings.reduce((sum, row) => sum + sumEarning(row), 0);
    const costs = periodExpenses.reduce((sum, row) => sum + sumExpense(row), 0);
    const profit = revenue - costs;

    const periodOperational = operational.filter(filterPeriod);
    const km = periodOperational.reduce((sum, row) => sum + Math.max(0, n(row.kmFinal) - n(row.kmInitial)), 0);
    const minutes = periodOperational.reduce((sum, row) => sum + minutesBetween(row.timeInitial, row.timeFinal), 0);
    const rides = periodOperational.reduce((sum, row) => sum + n(row.rideCount || (n(row.ridesUber) + n(row.rides99) + n(row.ridesIndrive) + n(row.ridesParticular) + n(row.ridesDeliveries))), 0);

    const prevRevenue = ((previousEarningsQuery.data || []) as any[]).reduce((sum, row) => sum + sumEarning(row), 0);
    const prevCosts = ((previousExpensesQuery.data || []) as any[]).reduce((sum, row) => sum + sumExpense(row), 0);
    const prevProfit = prevRevenue - prevCosts;
    const monthProfit = earnings.reduce((sum, row) => sum + sumEarning(row), 0) - expenses.reduce((sum, row) => sum + sumExpense(row), 0);
    const comparison = prevProfit === 0 ? null : ((monthProfit - prevProfit) / Math.abs(prevProfit)) * 100;

    const currentMonth = today.slice(0, 7) === selectedMonth;
    const elapsed = currentMonth ? Math.max(1, Number(today.slice(8, 10))) : daysInMonth(selectedMonth);
    const totalDays = daysInMonth(selectedMonth);
    const monthRevenue = earnings.reduce((sum, row) => sum + sumEarning(row), 0);
    const projectedRevenue = currentMonth ? (monthRevenue / elapsed) * totalDays : monthRevenue;
    const monthlyGoal = n((goalsQuery.data as any)?.monthlyGoal);
    const remainingGoal = Math.max(0, monthlyGoal - monthRevenue);
    const remainingDays = currentMonth ? Math.max(1, totalDays - elapsed + 1) : 1;

    return {
      revenue, costs, profit, km, minutes, rides,
      revenuePerKm: km > 0 ? revenue / km : 0,
      profitPerKm: km > 0 ? profit / km : 0,
      revenuePerHour: minutes > 0 ? revenue / (minutes / 60) : 0,
      profitPerHour: minutes > 0 ? profit / (minutes / 60) : 0,
      ticket: rides > 0 ? revenue / rides : 0,
      costPerRide: rides > 0 ? costs / rides : 0,
      comparison,
      projectedRevenue,
      monthlyGoal,
      remainingGoal,
      neededPerDay: remainingGoal / remainingDays,
      monthRevenue,
    };
  }, [period, today, selectedMonth, earnings, expenses, operational, goalsQuery.data, yearEarningsQuery.data, yearExpensesQuery.data, previousEarningsQuery.data, previousExpensesQuery.data]);

  const lastBackup = Number(localStorage.getItem(BACKUP_LAST_KEY) || 0);
  const backupAgeDays = lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null;

  async function makeBackup() {
    setBackupBusy(true);
    setMessage("");
    try {
      const result = await backupQuery.refetch();
      if (!result.data) throw new Error("Não foi possível gerar o backup.");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadJson(result.data, `h2-planilha-backup-${stamp}.json`);
      const now = Date.now();
      localStorage.setItem(BACKUP_LAST_KEY, String(now));
      setMessage("Backup baixado no aparelho com sucesso.");
    } catch (error: any) {
      setMessage(error?.message || "Erro ao gerar backup.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreFile(file: File) {
    setRestoreBusy(true);
    setMessage("");
    try {
      if (file.size > 15_000_000) throw new Error("Arquivo muito grande.");
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.format !== "h2-spreadsheet-backup" || Number(parsed?.version) !== 1) throw new Error("Arquivo incompatível com a Planilha H2.");
      const confirmed = window.confirm("Restaurar este backup vai substituir os ganhos, gastos, operacional, metas e configuração do veículo atuais. Deseja continuar?");
      if (!confirmed) return;
      await restoreMutation.mutateAsync({ token, payload: text });
      await onDataChanged();
      setMessage("Backup restaurado com sucesso.");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error: any) {
      setMessage(error?.message || "Não foi possível restaurar o backup.");
    } finally {
      setRestoreBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function deleteAll() {
    const first = window.confirm("Isso vai apagar todos os lançamentos de ganhos, gastos, operacional e metas. Faça um backup antes. Continuar?");
    if (!first) return;
    const second = window.confirm("CONFIRMAÇÃO FINAL: esta ação não pode ser desfeita sem um arquivo de backup. Apagar os lançamentos?");
    if (!second) return;
    await deleteAllMutation.mutateAsync({ token });
    await onDataChanged();
    setMessage("Lançamentos apagados.");
  }

  const periodLabels: Record<Period, string> = { day: "Hoje", week: "Semana", month: "Mês", year: "Ano" };
  const comparisonText = metrics.comparison == null
    ? "Sem base suficiente para comparar com o mês anterior."
    : `${metrics.comparison >= 0 ? "+" : ""}${metrics.comparison.toFixed(1)}% de lucro em relação ao mês anterior.`;
  const smartText = metrics.revenue === 0 && metrics.costs === 0
    ? "Comece registrando seus ganhos e gastos para receber uma leitura automática do período."
    : `No período, você faturou ${money(metrics.revenue)}, gastou ${money(metrics.costs)} e ficou com ${money(metrics.profit)} de lucro. ${metrics.km > 0 ? `Seu lucro foi ${money(metrics.profitPerKm)}/km.` : "Registre a quilometragem para calcular lucro por km."}`;

  return (
    <section className="mb-6 space-y-4" aria-label="Painel financeiro inteligente">
      <style>{`
        .premium-summary, .premium-month-control { display:none !important; }
        .premium-header button[class*="border-orange-500"] { display:none !important; }
        @media (max-width: 767px) {
          .spreadsheet-module-strip { display:flex !important; overflow-x:auto !important; grid-template-columns:none !important; padding-bottom:6px !important; scrollbar-width:thin; }
          .spreadsheet-module-strip > * { min-width:92px !important; width:92px !important; height:82px !important; flex:0 0 92px !important; }
        }
      `}</style>

      <div className="rounded-2xl border border-blue-400/20 bg-slate-950/70 p-4 shadow-[0_16px_38px_rgba(2,8,23,.35)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">Visão financeira</p>
            <h2 className="mt-1 text-xl font-black text-white">Seu resultado sem enrolação</h2>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200">
            <CalendarDays className="h-4 w-4 text-blue-300" />
            <input type="month" value={selectedMonth} onChange={(event) => onSelectedMonthChange(event.target.value)} className="bg-transparent text-white outline-none" />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-black/25 p-1.5">
          {(Object.keys(periodLabels) as Period[]).map((key) => (
            <button key={key} type="button" onClick={() => setPeriod(key)} className={`rounded-lg px-2 py-2 text-xs font-black transition ${period === key ? "bg-blue-500 text-white shadow-lg" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
              {periodLabels[key]}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className={`rounded-2xl border p-4 sm:col-span-1 ${metrics.profit >= 0 ? "border-emerald-400/35 bg-emerald-500/10" : "border-red-400/35 bg-red-500/10"}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Lucro {periodLabels[period]}</p>
            <p className={`mt-2 text-3xl font-black ${metrics.profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money(metrics.profit)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[.07] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-200/70">Ganhos</p>
            <p className="mt-2 text-xl font-black text-white">{money(metrics.revenue)}</p>
          </div>
          <div className="rounded-2xl border border-red-400/25 bg-red-500/[.07] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-red-200/70">Gastos</p>
            <p className="mt-2 text-xl font-black text-white">{money(metrics.costs)}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["R$/km", metrics.revenuePerKm], ["Lucro/km", metrics.profitPerKm], ["R$/hora", metrics.revenuePerHour],
            ["Lucro/hora", metrics.profitPerHour], ["Ticket/corrida", metrics.ticket], ["Custo/corrida", metrics.costPerRide],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-white/10 bg-white/[.035] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{String(label)}</p>
              <p className="mt-1 text-sm font-black text-slate-100">{money(Number(value))}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-500/[.06] px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wider text-violet-300">Leitura inteligente</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-200">{smartText}</p>
          <p className="mt-1 text-xs text-slate-400">{comparisonText}</p>
        </div>

        {metrics.monthlyGoal > 0 && (
          <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/[.06] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-amber-300">Previsão da meta</p>
                <p className="mt-1 text-sm text-slate-200">Mantendo a média atual: <strong>{money(metrics.projectedRevenue)}</strong> no fechamento.</p>
              </div>
              <Gauge className="h-7 w-7 shrink-0 text-amber-300" />
            </div>
            {metrics.remainingGoal > 0 ? <p className="mt-2 text-xs text-slate-400">Faltam {money(metrics.remainingGoal)}. Ritmo necessário: {money(metrics.neededPerDay)} por dia.</p> : <p className="mt-2 text-xs font-bold text-emerald-300">Meta mensal já atingida.</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button type="button" onClick={() => onNavigate("ganhos")} className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-center text-xs font-black text-emerald-200 active:scale-95"><Plus className="mx-auto mb-1 h-5 w-5" />Ganho</button>
        <button type="button" onClick={() => onNavigate("gastos")} className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-center text-xs font-black text-red-200 active:scale-95"><WalletCards className="mx-auto mb-1 h-5 w-5" />Gasto</button>
        <button type="button" onClick={() => onNavigate("operacional")} className="rounded-xl border border-blue-400/25 bg-blue-500/10 p-3 text-center text-xs font-black text-blue-200 active:scale-95"><Route className="mx-auto mb-1 h-5 w-5" />KM</button>
        <button type="button" onClick={() => onNavigate("analisador")} className="rounded-xl border border-orange-400/25 bg-orange-500/10 p-3 text-center text-xs font-black text-orange-200 active:scale-95"><TrendingUp className="mx-auto mb-1 h-5 w-5" />Analisar</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/65">
        <button type="button" onClick={() => setDataOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <div className="flex items-center gap-3"><Database className="h-5 w-5 text-cyan-300" /><div><p className="text-sm font-black text-white">Backup e dados</p><p className="text-[11px] text-slate-500">Salve no celular ou computador e restaure quando precisar.</p></div></div>
          {dataOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {dataOpen && (
          <div className="border-t border-white/10 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={makeBackup} disabled={backupBusy} className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50"><Download className="h-4 w-4" />{backupBusy ? "Gerando..." : "Baixar backup"}</button>
              <button type="button" onClick={() => inputRef.current?.click()} disabled={restoreBusy} className="flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-200 disabled:opacity-50"><Upload className="h-4 w-4" />{restoreBusy ? "Restaurando..." : "Restaurar backup"}</button>
              <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreFile(file); }} />
            </div>
            <p className={`mt-2 text-xs ${backupAgeDays == null || backupAgeDays >= 7 ? "text-amber-300" : "text-slate-500"}`}>{backupAgeDays == null ? "Nenhum backup registrado neste aparelho. Recomendado fazer agora." : backupAgeDays === 0 ? "Backup realizado hoje neste aparelho." : `Último backup neste aparelho há ${backupAgeDays} dia(s).`}</p>
            {message && <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">{message}</p>}
            <div className="mt-4 border-t border-red-500/15 pt-4">
              <button type="button" onClick={() => void deleteAll()} disabled={deleteAllMutation.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[.07] px-4 py-3 text-xs font-bold text-red-300"><Trash2 className="h-4 w-4" />Apagar todos os lançamentos</button>
              <p className="mt-2 text-center text-[10px] text-slate-600">Empréstimos, cartões e dados controlados pelo ADM não entram no backup nem nesta exclusão.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
