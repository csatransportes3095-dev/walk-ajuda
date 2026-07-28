import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("pt-BR");
}

function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("pt-BR");
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x.getTime(); }

type TabId = "resumo" | "vendas" | "fluxo" | "relatorios";
type StatusFilter = "all" | "pendente" | "pago" | "cancelado";
type GroupBy = "day" | "week" | "month" | "year";

interface SaleForm {
  customerName: string;
  customerPhone: string;
  productName: string;
  productOption: string;
  saleValue: string;
  costValue: string;
  paymentMethod: string;
  status: "pendente" | "pago" | "cancelado";
  saleDate: string;
  notes: string;
}

const EMPTY_FORM: SaleForm = {
  customerName: "", customerPhone: "", productName: "", productOption: "",
  saleValue: "", costValue: "0", paymentMethod: "pix",
  status: "pendente", saleDate: new Date().toISOString().slice(0, 10), notes: "",
};

// ─── Componente principal ────────────────────────────────────────────────────

export default function AdminFinanceiro() {

  const utils = trpc.useUtils();

  // Aba ativa
  const [tab, setTab] = useState<TabId>("resumo");

  // Filtros globais de data
  const [filterStart, setFilterStart] = useState<string>(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [filterEnd, setFilterEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Filtros de vendas
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  // Fluxo de caixa
  const [groupBy, setGroupBy] = useState<GroupBy>("month");

  // Modal de venda
  const [saleModal, setSaleModal] = useState<{ open: boolean; editing: number | null }>({ open: false, editing: null });
  const [form, setForm] = useState<SaleForm>(EMPTY_FORM);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Relatórios
  const [reportPeriod, setReportPeriod] = useState<"day" | "week" | "month" | "year" | "custom">("month");
  const [reportStart, setReportStart] = useState<string>(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [reportEnd, setReportEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const tableRef = useRef<HTMLTableElement>(null);

  // Calcular datas do filtro
  const startTs = useMemo(() => filterStart ? startOfDay(new Date(filterStart + "T00:00:00")) : undefined, [filterStart]);
  const endTs = useMemo(() => filterEnd ? endOfDay(new Date(filterEnd + "T00:00:00")) : undefined, [filterEnd]);

  // Queries
  const summaryQ = trpc.financial.summary.useQuery({ startDate: startTs, endDate: endTs }, { refetchInterval: 30000 });
  const salesQ = trpc.financial.list.useQuery({ status: statusFilter === "all" ? undefined : statusFilter, startDate: startTs, endDate: endTs, search: search || undefined, limit: 200 }, { refetchInterval: 30000 });
  const cashFlowQ = trpc.financial.cashFlow.useQuery({ groupBy, startDate: startTs, endDate: endTs });

  // Relatórios — calcular datas
  const reportDates = useMemo(() => {
    const now = new Date();
    if (reportPeriod === "day") {
      return { start: startOfDay(now), end: endOfDay(now) };
    } else if (reportPeriod === "week") {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay());
      return { start: startOfDay(d), end: endOfDay(now) };
    } else if (reportPeriod === "month") {
      const d = new Date(now); d.setDate(1);
      return { start: startOfDay(d), end: endOfDay(now) };
    } else if (reportPeriod === "year") {
      const d = new Date(now.getFullYear(), 0, 1);
      return { start: startOfDay(d), end: endOfDay(now) };
    } else {
      return {
        start: reportStart ? startOfDay(new Date(reportStart + "T00:00:00")) : undefined,
        end: reportEnd ? endOfDay(new Date(reportEnd + "T00:00:00")) : undefined,
      };
    }
  }, [reportPeriod, reportStart, reportEnd]);

  const reportSalesQ = trpc.financial.list.useQuery({ startDate: reportDates.start, endDate: reportDates.end, limit: 500 });
  const reportSummaryQ = trpc.financial.summary.useQuery({ startDate: reportDates.start, endDate: reportDates.end });

  // Mutations
  const createMut = trpc.financial.create.useMutation({
    onSuccess: () => { utils.financial.list.invalidate(); utils.financial.summary.invalidate(); utils.financial.cashFlow.invalidate(); setSaleModal({ open: false, editing: null }); toast.success("Venda registrada!"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.financial.update.useMutation({
    onSuccess: () => { utils.financial.list.invalidate(); utils.financial.summary.invalidate(); utils.financial.cashFlow.invalidate(); setSaleModal({ open: false, editing: null }); toast.success("Venda atualizada!"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.financial.delete.useMutation({
    onSuccess: () => { utils.financial.list.invalidate(); utils.financial.summary.invalidate(); utils.financial.cashFlow.invalidate(); toast.success("Venda removida"); },
    onError: (e) => toast.error(e.message),
  });
  const resetMut = trpc.financial.reset.useMutation({
    onSuccess: () => { utils.financial.list.invalidate(); utils.financial.summary.invalidate(); utils.financial.cashFlow.invalidate(); setResetConfirm(false); toast.success("Todos os dados financeiros foram resetados!"); },
    onError: (e) => toast.error(e.message),
  });

  // Abrir modal de criação
  function openCreate() {
    setForm({ ...EMPTY_FORM, saleDate: new Date().toISOString().slice(0, 10) });
    setSaleModal({ open: true, editing: null });
  }

  // Abrir modal de edição
  function openEdit(sale: typeof salesQ.data extends (infer T)[] | undefined ? T : never) {
    if (!sale) return;
    setForm({
      customerName: (sale as any).customerName ?? "",
      customerPhone: (sale as any).customerPhone ?? "",
      productName: (sale as any).productName ?? "",
      productOption: (sale as any).productOption ?? "",
      saleValue: String(((sale as any).saleValue ?? 0) / 100),
      costValue: String(((sale as any).costValue ?? 0) / 100),
      paymentMethod: (sale as any).paymentMethod ?? "pix",
      status: (sale as any).status ?? "pendente",
      saleDate: (sale as any).saleDate ? new Date((sale as any).saleDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      notes: (sale as any).notes ?? "",
    });
    setSaleModal({ open: true, editing: (sale as any).id });
  }

  // Submeter formulário
  function handleSubmit() {
    const saleValueCents = Math.round(parseFloat(form.saleValue.replace(",", ".") || "0") * 100);
    const costValueCents = Math.round(parseFloat(form.costValue.replace(",", ".") || "0") * 100);
    const saleDateTs = form.saleDate ? startOfDay(new Date(form.saleDate + "T00:00:00")) : Date.now();
    if (!form.customerName.trim()) { toast.error("Informe o nome do cliente"); return; }
    if (!form.productName.trim()) { toast.error("Informe o produto/serviço"); return; }
    if (saleValueCents <= 0) { toast.error("Informe o valor da venda"); return; }

    const payload = {
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      productName: form.productName,
      productOption: form.productOption,
      saleValue: saleValueCents,
      costValue: costValueCents,
      paymentMethod: form.paymentMethod,
      status: form.status,
      saleDate: saleDateTs,
      receivedDate: form.status === "pago" ? Date.now() : null,
      notes: form.notes || null,
    };

    if (saleModal.editing) {
      updateMut.mutate({ id: saleModal.editing, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  // Exportar PDF (imprimir)
  function exportPDF() {
    window.print();
  }

  // Exportar CSV
  function exportCSV() {
    const sales = reportSalesQ.data ?? [];
    const rows = [
      ["Data", "Cliente", "Telefone", "Produto", "Opção", "Valor", "Custo", "Lucro", "Pagamento", "Status", "Recebimento", "Obs"],
      ...sales.map(s => [
        fmtDate((s as any).saleDate),
        (s as any).customerName,
        (s as any).customerPhone,
        (s as any).productName,
        (s as any).productOption,
        fmtCents((s as any).saleValue),
        fmtCents((s as any).costValue),
        fmtCents(((s as any).saleValue ?? 0) - ((s as any).costValue ?? 0)),
        (s as any).paymentMethod,
        (s as any).status,
        fmtDate((s as any).receivedDate),
        (s as any).notes ?? "",
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "relatorio-financeiro.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const summary = summaryQ.data;
  const sales = salesQ.data ?? [];
  const cashFlow = cashFlowQ.data ?? [];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AdminHeader title="Controle Financeiro" icon="💰" backTo="/admin/codes" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Título */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-green-400">💰 Controle Financeiro</h1>
            <p className="text-gray-400 text-sm mt-1">Gestão completa de receitas, vendas e fluxo de caixa</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setResetConfirm(true)} className="bg-red-600 hover:bg-red-700 text-white">
              🔄 Resetar Financeiro
            </Button>
            <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white">
              + Nova Venda
            </Button>
          </div>
        </div>

        {/* Filtro de período global */}
        <div className="flex flex-wrap gap-3 mb-6 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <div className="flex items-center gap-2">
            <Label className="text-gray-400 text-sm whitespace-nowrap">Período:</Label>
            <Input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white w-36 h-8 text-sm" />
            <span className="text-gray-500">até</span>
            <Input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white w-36 h-8 text-sm" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setFilterStart(d.toISOString().slice(0,10)); setFilterEnd(d.toISOString().slice(0,10)); }}
            className="border-gray-700 text-gray-300 hover:bg-gray-800 h-8 text-xs">Hoje</Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setDate(1); setFilterStart(d.toISOString().slice(0,10)); setFilterEnd(new Date().toISOString().slice(0,10)); }}
            className="border-gray-700 text-gray-300 hover:bg-gray-800 h-8 text-xs">Este mês</Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(new Date().getFullYear(), 0, 1); setFilterStart(d.toISOString().slice(0,10)); setFilterEnd(new Date().toISOString().slice(0,10)); }}
            className="border-gray-700 text-gray-300 hover:bg-gray-800 h-8 text-xs">Este ano</Button>
        </div>

        {/* Abas */}
        <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-xl border border-gray-800 w-fit">
          {([
            { id: "resumo", label: "📊 Resumo" },
            { id: "vendas", label: "🛒 Vendas" },
            { id: "fluxo", label: "📈 Fluxo de Caixa" },
            { id: "relatorios", label: "📄 Relatórios" },
          ] as { id: TabId; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-green-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── ABA RESUMO ── */}
        {tab === "resumo" && (
          <div>
            {summaryQ.isLoading ? (
              <div className="text-center text-gray-500 py-12">Carregando métricas...</div>
            ) : (
              <>
                {/* Cards de métricas */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                  {[
                    { label: "Faturamento Total", value: fmtCents(summary?.totalRevenue ?? 0), color: "text-green-400", bg: "bg-green-900/20 border-green-800/40" },
                    { label: "Faturamento Hoje", value: fmtCents(summary?.todayRevenue ?? 0), color: "text-blue-400", bg: "bg-blue-900/20 border-blue-800/40" },
                    { label: "Faturamento do Mês", value: fmtCents(summary?.monthRevenue ?? 0), color: "text-purple-400", bg: "bg-purple-900/20 border-purple-800/40" },
                    { label: "Lucro Líquido", value: fmtCents(summary?.netProfit ?? 0), color: "text-emerald-400", bg: "bg-emerald-900/20 border-emerald-800/40" },
                    { label: "Valor Pendente", value: fmtCents(summary?.pendingValue ?? 0), color: "text-yellow-400", bg: "bg-yellow-900/20 border-yellow-800/40" },
                    { label: "Valor Recebido", value: fmtCents(summary?.receivedValue ?? 0), color: "text-teal-400", bg: "bg-teal-900/20 border-teal-800/40" },
                    { label: "Ticket Médio", value: fmtCents(summary?.avgTicket ?? 0), color: "text-orange-400", bg: "bg-orange-900/20 border-orange-800/40" },
                    { label: "Total de Vendas", value: String(summary?.totalSales ?? 0), color: "text-pink-400", bg: "bg-pink-900/20 border-pink-800/40" },
                  ].map(card => (
                    <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
                      <p className="text-gray-400 text-xs mb-1">{card.label}</p>
                      <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                    </div>
                  ))}
                </div>

                {/* Status breakdown */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-xl p-4 text-center">
                    <p className="text-yellow-400 text-2xl font-bold">{summary?.pendingSales ?? 0}</p>
                    <p className="text-gray-400 text-sm mt-1">Pendentes</p>
                  </div>
                  <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-4 text-center">
                    <p className="text-green-400 text-2xl font-bold">{summary?.paidSales ?? 0}</p>
                    <p className="text-gray-400 text-sm mt-1">Pagas</p>
                  </div>
                  <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4 text-center">
                    <p className="text-red-400 text-2xl font-bold">{summary?.canceledSales ?? 0}</p>
                    <p className="text-gray-400 text-sm mt-1">Canceladas</p>
                  </div>
                </div>

                {/* Gráfico de barras resumo */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-4">Distribuição de Receitas</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={[
                      { name: "Recebido", value: (summary?.receivedValue ?? 0) / 100 },
                      { name: "Pendente", value: (summary?.pendingValue ?? 0) / 100 },
                      { name: "Cancelado", value: (summary?.canceledValue ?? 0) / 100 },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={v => `R$${v}`} />
                      <Tooltip formatter={(v: number) => [`R$ ${v.toFixed(2)}`, "Valor"]} contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }} />
                      <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ABA VENDAS ── */}
        {tab === "vendas" && (
          <div>
            {/* Filtros */}
            <div className="flex flex-wrap gap-3 mb-4">
              <Input placeholder="Buscar cliente, produto..." value={search} onChange={e => setSearch(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white w-64 h-9" />
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white w-40 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tabela */}
            {salesQ.isLoading ? (
              <div className="text-center text-gray-500 py-12">Carregando vendas...</div>
            ) : sales.length === 0 ? (
              <div className="text-center text-gray-500 py-12">Nenhuma venda encontrada</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-900 border-b border-gray-800">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Data</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Cliente</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Produto/Serviço</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Valor</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Custo</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Lucro</th>
                      <th className="text-center px-4 py-3 text-gray-400 font-medium">Pagamento</th>
                      <th className="text-center px-4 py-3 text-gray-400 font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Recebimento</th>
                      <th className="text-center px-4 py-3 text-gray-400 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale: any) => {
                      const profit = (sale.saleValue ?? 0) - (sale.costValue ?? 0);
                      return (
                        <tr key={sale.id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                          <td className="px-4 py-3 text-gray-300">{fmtDate(sale.saleDate)}</td>
                          <td className="px-4 py-3">
                            <div className="text-white font-medium">{sale.customerName || "—"}</div>
                            {sale.customerPhone && <div className="text-gray-500 text-xs">{sale.customerPhone}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-gray-200">{sale.productName || "—"}</div>
                            {sale.productOption && <div className="text-gray-500 text-xs">{sale.productOption}</div>}
                          </td>
                          <td className="px-4 py-3 text-right text-green-400 font-semibold">{fmtCents(sale.saleValue ?? 0)}</td>
                          <td className="px-4 py-3 text-right text-red-400">{fmtCents(sale.costValue ?? 0)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtCents(profit)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded-full uppercase">{sale.paymentMethod}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              sale.status === "pago" ? "bg-green-900/40 text-green-300" :
                              sale.status === "cancelado" ? "bg-red-900/40 text-red-300" :
                              "bg-yellow-900/40 text-yellow-300"
                            }`}>{sale.status}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(sale.receivedDate)}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => openEdit(sale)} className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-900/20 transition-colors">Editar</button>
                              {sale.status === "pendente" && (
                                <button onClick={() => updateMut.mutate({ id: sale.id, status: "pago", receivedDate: Date.now() })}
                                  className="text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded hover:bg-green-900/20 transition-colors">Pago ✓</button>
                              )}
                              <button onClick={() => { if (confirm("Remover esta venda?")) deleteMut.mutate({ id: sale.id }); }}
                                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20 transition-colors">✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-900 border-t border-gray-700">
                      <td colSpan={3} className="px-4 py-3 text-gray-400 text-sm font-medium">{sales.length} registros</td>
                      <td className="px-4 py-3 text-right text-green-400 font-bold">
                        {fmtCents(sales.filter((s: any) => s.status !== "cancelado").reduce((a: number, s: any) => a + (s.saleValue ?? 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-red-400 font-bold">
                        {fmtCents(sales.filter((s: any) => s.status !== "cancelado").reduce((a: number, s: any) => a + (s.costValue ?? 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold">
                        {fmtCents(sales.filter((s: any) => s.status !== "cancelado").reduce((a: number, s: any) => a + ((s.saleValue ?? 0) - (s.costValue ?? 0)), 0))}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ABA FLUXO DE CAIXA ── */}
        {tab === "fluxo" && (
          <div>
            <div className="flex gap-2 mb-6">
              {(["day", "week", "month", "year"] as GroupBy[]).map(g => (
                <button key={g} onClick={() => setGroupBy(g)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${groupBy === g ? "bg-green-600 text-white" : "bg-gray-900 border border-gray-700 text-gray-400 hover:text-white"}`}>
                  {g === "day" ? "Diário" : g === "week" ? "Semanal" : g === "month" ? "Mensal" : "Anual"}
                </button>
              ))}
            </div>

            {cashFlowQ.isLoading ? (
              <div className="text-center text-gray-500 py-12">Carregando fluxo de caixa...</div>
            ) : cashFlow.length === 0 ? (
              <div className="text-center text-gray-500 py-12">Nenhum dado para o período selecionado</div>
            ) : (
              <>
                {/* Gráfico de linha */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
                  <h3 className="text-white font-semibold mb-4">Evolução de Receitas e Lucro</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={cashFlow.map(r => ({ ...r, revenue: r.revenue / 100, cost: r.cost / 100, profit: r.profit / 100 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="period" stroke="#9ca3af" fontSize={11} />
                      <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={v => `R$${v}`} />
                      <Tooltip formatter={(v: number) => [`R$ ${v.toFixed(2)}`]} contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" name="Receita" stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="cost" name="Custo" stroke="#ef4444" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="profit" name="Lucro" stroke="#a855f7" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Tabela de fluxo */}
                <div className="overflow-x-auto rounded-xl border border-gray-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-900 border-b border-gray-800">
                        <th className="text-left px-4 py-3 text-gray-400">Período</th>
                        <th className="text-right px-4 py-3 text-gray-400">Entradas</th>
                        <th className="text-right px-4 py-3 text-gray-400">Custos</th>
                        <th className="text-right px-4 py-3 text-gray-400">Lucro</th>
                        <th className="text-right px-4 py-3 text-gray-400">Qtd. Vendas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashFlow.map((row, i) => (
                        <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                          <td className="px-4 py-3 text-gray-200 font-medium">{row.period}</td>
                          <td className="px-4 py-3 text-right text-green-400">{fmtCents(row.revenue)}</td>
                          <td className="px-4 py-3 text-right text-red-400">{fmtCents(row.cost)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${row.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtCents(row.profit)}</td>
                          <td className="px-4 py-3 text-right text-gray-300">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-900 border-t border-gray-700">
                        <td className="px-4 py-3 text-gray-400 font-medium">Total</td>
                        <td className="px-4 py-3 text-right text-green-400 font-bold">{fmtCents(cashFlow.reduce((a, r) => a + r.revenue, 0))}</td>
                        <td className="px-4 py-3 text-right text-red-400 font-bold">{fmtCents(cashFlow.reduce((a, r) => a + r.cost, 0))}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-bold">{fmtCents(cashFlow.reduce((a, r) => a + r.profit, 0))}</td>
                        <td className="px-4 py-3 text-right text-gray-300 font-bold">{cashFlow.reduce((a, r) => a + r.count, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ABA RELATÓRIOS ── */}
        {tab === "relatorios" && (
          <div>
            {/* Seletor de período */}
            <div className="flex flex-wrap gap-3 mb-6 p-4 bg-gray-900 rounded-xl border border-gray-800">
              <div className="flex gap-2 flex-wrap">
                {([
                  { id: "day", label: "Hoje" },
                  { id: "week", label: "Esta Semana" },
                  { id: "month", label: "Este Mês" },
                  { id: "year", label: "Este Ano" },
                  { id: "custom", label: "Personalizado" },
                ] as { id: typeof reportPeriod; label: string }[]).map(p => (
                  <button key={p.id} onClick={() => setReportPeriod(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${reportPeriod === p.id ? "bg-green-600 text-white" : "bg-gray-800 border border-gray-700 text-gray-400 hover:text-white"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              {reportPeriod === "custom" && (
                <div className="flex items-center gap-2">
                  <Input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white w-36 h-8 text-sm" />
                  <span className="text-gray-500">até</span>
                  <Input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white w-36 h-8 text-sm" />
                </div>
              )}
              <div className="flex gap-2 ml-auto">
                <Button onClick={exportCSV} variant="outline" size="sm"
                  className="border-green-700 text-green-400 hover:bg-green-900/20 h-8 text-xs">
                  📥 Exportar Excel/CSV
                </Button>
                <Button onClick={exportPDF} variant="outline" size="sm"
                  className="border-blue-700 text-blue-400 hover:bg-blue-900/20 h-8 text-xs">
                  🖨️ Exportar PDF
                </Button>
              </div>
            </div>

            {/* Resumo do relatório */}
            {reportSummaryQ.data && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Faturamento", value: fmtCents(reportSummaryQ.data.totalRevenue), color: "text-green-400" },
                  { label: "Recebido", value: fmtCents(reportSummaryQ.data.receivedValue), color: "text-teal-400" },
                  { label: "Lucro Líquido", value: fmtCents(reportSummaryQ.data.netProfit), color: "text-emerald-400" },
                  { label: "Qtd. Vendas", value: String(reportSummaryQ.data.totalSales), color: "text-purple-400" },
                ].map(c => (
                  <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-gray-400 text-xs mb-1">{c.label}</p>
                    <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tabela do relatório */}
            {reportSalesQ.isLoading ? (
              <div className="text-center text-gray-500 py-12">Carregando relatório...</div>
            ) : (reportSalesQ.data ?? []).length === 0 ? (
              <div className="text-center text-gray-500 py-12">Nenhum dado para o período selecionado</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table ref={tableRef} className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-900 border-b border-gray-800">
                      <th className="text-left px-4 py-3 text-gray-400">Data</th>
                      <th className="text-left px-4 py-3 text-gray-400">Cliente</th>
                      <th className="text-left px-4 py-3 text-gray-400">Produto</th>
                      <th className="text-right px-4 py-3 text-gray-400">Valor</th>
                      <th className="text-right px-4 py-3 text-gray-400">Custo</th>
                      <th className="text-right px-4 py-3 text-gray-400">Lucro</th>
                      <th className="text-center px-4 py-3 text-gray-400">Pagamento</th>
                      <th className="text-center px-4 py-3 text-gray-400">Status</th>
                      <th className="text-left px-4 py-3 text-gray-400">Recebimento</th>
                      <th className="text-left px-4 py-3 text-gray-400">Obs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportSalesQ.data ?? []).map((sale: any) => {
                      const profit = (sale.saleValue ?? 0) - (sale.costValue ?? 0);
                      return (
                        <tr key={sale.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                          <td className="px-4 py-2 text-gray-300 text-xs">{fmtDate(sale.saleDate)}</td>
                          <td className="px-4 py-2 text-white">{sale.customerName || "—"}</td>
                          <td className="px-4 py-2 text-gray-200">{[sale.productName, sale.productOption].filter(Boolean).join(" — ")}</td>
                          <td className="px-4 py-2 text-right text-green-400">{fmtCents(sale.saleValue ?? 0)}</td>
                          <td className="px-4 py-2 text-right text-red-400">{fmtCents(sale.costValue ?? 0)}</td>
                          <td className={`px-4 py-2 text-right font-semibold ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtCents(profit)}</td>
                          <td className="px-4 py-2 text-center text-xs text-blue-300 uppercase">{sale.paymentMethod}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              sale.status === "pago" ? "bg-green-900/40 text-green-300" :
                              sale.status === "cancelado" ? "bg-red-900/40 text-red-300" :
                              "bg-yellow-900/40 text-yellow-300"
                            }`}>{sale.status}</span>
                          </td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{fmtDate(sale.receivedDate)}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">{sale.notes || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-900 border-t border-gray-700">
                      <td colSpan={3} className="px-4 py-3 text-gray-400 text-sm">{(reportSalesQ.data ?? []).length} registros</td>
                      <td className="px-4 py-3 text-right text-green-400 font-bold">
                        {fmtCents((reportSalesQ.data ?? []).filter((s: any) => s.status !== "cancelado").reduce((a: number, s: any) => a + (s.saleValue ?? 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-red-400 font-bold">
                        {fmtCents((reportSalesQ.data ?? []).filter((s: any) => s.status !== "cancelado").reduce((a: number, s: any) => a + (s.costValue ?? 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold">
                        {fmtCents((reportSalesQ.data ?? []).filter((s: any) => s.status !== "cancelado").reduce((a: number, s: any) => a + ((s.saleValue ?? 0) - (s.costValue ?? 0)), 0))}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal de venda ── */}
      <Dialog open={saleModal.open} onOpenChange={open => { if (!open) setSaleModal({ open: false, editing: null }); }}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-green-400">{saleModal.editing ? "Editar Venda" : "Nova Venda"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">Cliente *</Label>
                <Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  placeholder="Nome do cliente" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Telefone</Label>
                <Input value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="(11) 99999-9999" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">Produto/Serviço *</Label>
                <Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))}
                  placeholder="Ex: Habilitação" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Opção</Label>
                <Input value={form.productOption} onChange={e => setForm(f => ({ ...f, productOption: e.target.value }))}
                  placeholder="Ex: Nome Completo" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">Valor da Venda (R$) *</Label>
                <Input value={form.saleValue} onChange={e => setForm(f => ({ ...f, saleValue: e.target.value }))}
                  placeholder="0,00" type="number" step="0.01" min="0" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Custo/Comissão (R$)</Label>
                <Input value={form.costValue} onChange={e => setForm(f => ({ ...f, costValue: e.target.value }))}
                  placeholder="0,00" type="number" step="0.01" min="0" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Data da Venda</Label>
                <Input value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))}
                  type="date" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">Forma de Pagamento</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as SaleForm["status"] }))}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Observações opcionais..." className="bg-gray-800 border-gray-700 text-white mt-1 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSaleModal({ open: false, editing: null })}
              className="border-gray-700 text-gray-300 hover:bg-gray-800">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}
              className="bg-green-600 hover:bg-green-700 text-white">
              {createMut.isPending || updateMut.isPending ? "Salvando..." : saleModal.editing ? "Salvar" : "Registrar Venda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog para confirmacao de reset */}
      <AlertDialog open={resetConfirm} onOpenChange={setResetConfirm}>
        <AlertDialogContent className="bg-gray-900 border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400">Resetar Todos os Dados Financeiros?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Esta acao e IRREVERSIVEL. Todos os registros de vendas, receitas e fluxo de caixa serao deletados permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel className="border-gray-700 text-gray-300 hover:bg-gray-800">Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => resetMut.mutate()} disabled={resetMut.isPending}
            className="bg-red-600 hover:bg-red-700 text-white">
            {resetMut.isPending ? "Resetando..." : "Sim, Resetar Tudo"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
