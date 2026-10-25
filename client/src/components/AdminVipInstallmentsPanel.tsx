import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, RefreshCw, Save, Search, ShieldCheck, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AdminVipInstallmentProductsPanel from "@/components/AdminVipInstallmentProductsPanel";

type TriState = "inherit" | "yes" | "no";

function centsToMoney(value: number | null | undefined) {
  if (value == null) return "";
  return (value / 100).toFixed(2).replace(".", ",");
}

function moneyLabel(value: number | null | undefined) {
  const cents = Number(value || 0);
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function moneyToCents(value: string): number | null {
  const raw = String(value || "").trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")
    : raw.replace(/[^0-9.-]/g, "");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
}

function triFromValue(value: boolean | null | undefined): TriState {
  if (value == null) return "inherit";
  return value ? "yes" : "no";
}

function triToValue(value: TriState): boolean | null {
  if (value === "inherit") return null;
  return value === "yes";
}

export default function AdminVipInstallmentsPanel() {
  const utils = trpc.useUtils();
  const configQuery = trpc.vipInstallments.adminConfig.useQuery(undefined, { staleTime: 10_000 });
  const installmentDirectoryQuery = trpc.vipInstallments.adminDirectory.useQuery(undefined, { staleTime: 10_000, refetchOnWindowFocus: true });
  const vipDirectoryQuery = trpc.vipMemberships.adminDirectory.useQuery(undefined, { staleTime: 10_000, refetchOnWindowFocus: true });

  const [configReady, setConfigReady] = useState(false);
  const [config, setConfig] = useState({
    enabled: false,
    minInstallments: 2,
    maxInstallments: 3,
    defaultInterestPercent: "0",
    entryMode: "none" as "none" | "fixed" | "percent",
    entryValue: "",
    allowDaily: true,
    allowWeekly: true,
    allowMonthly: true,
    dailyMode: "all_days" as "all_days" | "mon_sat",
  });
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [permissionForm, setPermissionForm] = useState({
    enabled: false,
    maxInstallments: "",
    interestPercent: "",
    creditLimit: "",
    allowDaily: "inherit" as TriState,
    allowWeekly: "inherit" as TriState,
    allowMonthly: "inherit" as TriState,
    notes: "",
  });

  useEffect(() => {
    if (!configQuery.data || configReady) return;
    const data = configQuery.data;
    setConfig({
      enabled: data.enabled,
      minInstallments: data.minInstallments,
      maxInstallments: data.maxInstallments,
      defaultInterestPercent: (data.defaultInterestBps / 100).toString().replace(".", ","),
      entryMode: data.entryMode,
      entryValue: data.entryMode === "fixed" ? centsToMoney(data.entryFixedCents) : data.entryMode === "percent" ? (data.entryPercentBps / 100).toString().replace(".", ",") : "",
      allowDaily: data.allowDaily,
      allowWeekly: data.allowWeekly,
      allowMonthly: data.allowMonthly,
      dailyMode: data.dailyMode,
    });
    setConfigReady(true);
  }, [configQuery.data, configReady]);

  const vipByCustomer = useMemo(() => {
    const map = new Map<number, any>();
    for (const customer of (vipDirectoryQuery.data || []) as any[]) map.set(Number(customer.customerId), customer);
    return map;
  }, [vipDirectoryQuery.data]);

  const rows = useMemo(() => {
    const qRaw = search.trim().toLowerCase();
    const qDigits = qRaw.replace(/\D/g, "");
    return ((installmentDirectoryQuery.data || []) as any[])
      .map((row) => ({ ...row, vip: vipByCustomer.get(Number(row.customerId)) || null }))
      .filter((row) => row.vip?.active)
      .filter((row) => {
        if (!qRaw) return true;
        return String(row.name || "").toLowerCase().includes(qRaw)
          || String(row.phone || "").replace(/\D/g, "").includes(qDigits)
          || String(row.customerNumber || "").includes(qRaw.replace("*", ""));
      });
  }, [installmentDirectoryQuery.data, vipByCustomer, search]);

  const stats = useMemo(() => ({
    enabled: rows.filter((row) => row.installmentEnabled).length,
    debt: rows.filter((row) => Number(row.balanceCents || 0) > 0).length,
    balance: rows.reduce((sum, row) => sum + Number(row.balanceCents || 0), 0),
  }), [rows]);

  const setConfigMutation = trpc.vipInstallments.setAdminConfig.useMutation({
    onSuccess: async () => {
      toast.success("Configuração do Parcelamento VIP salva.");
      await utils.vipInstallments.adminConfig.invalidate();
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar o Parcelamento VIP."),
  });

  const setPermissionMutation = trpc.vipInstallments.setCustomerPermission.useMutation({
    onSuccess: async () => {
      toast.success("Permissão de parcelamento atualizada.");
      setSelectedCustomerId(null);
      await utils.vipInstallments.adminDirectory.invalidate();
    },
    onError: (error) => toast.error(error.message || "Não foi possível atualizar o cliente."),
  });

  const refresh = async () => {
    await Promise.all([
      configQuery.refetch(),
      installmentDirectoryQuery.refetch(),
      vipDirectoryQuery.refetch(),
    ]);
  };

  const saveGlobal = () => {
    const interest = Number(config.defaultInterestPercent.replace(",", "."));
    if (!Number.isFinite(interest) || interest < 0 || interest > 1000) {
      toast.error("Informe uma taxa de juros válida.");
      return;
    }
    const entryNumeric = config.entryMode === "none" ? 0 : Number(config.entryValue.replace(",", "."));
    if (config.entryMode !== "none" && (!Number.isFinite(entryNumeric) || entryNumeric <= 0)) { toast.error("Informe uma entrada válida."); return; }
    if (config.entryMode === "percent" && entryNumeric >= 100) { toast.error("A entrada percentual deve ser menor que 100%."); return; }
    if (config.maxInstallments < config.minInstallments) {
      toast.error("O máximo de parcelas não pode ser menor que o mínimo.");
      return;
    }
    if (!config.allowDaily && !config.allowWeekly && !config.allowMonthly) {
      toast.error("Selecione pelo menos uma periodicidade.");
      return;
    }
    setConfigMutation.mutate({
      enabled: config.enabled,
      minInstallments: config.minInstallments,
      maxInstallments: config.maxInstallments,
      defaultInterestBps: Math.round(interest * 100),
      entryMode: config.entryMode,
      entryFixedCents: config.entryMode === "fixed" ? Math.round(entryNumeric * 100) : 0,
      entryPercentBps: config.entryMode === "percent" ? Math.round(entryNumeric * 100) : 0,
      allowDaily: config.allowDaily,
      allowWeekly: config.allowWeekly,
      allowMonthly: config.allowMonthly,
      dailyMode: config.dailyMode,
    });
  };

  const openCustomer = (row: any) => {
    setSelectedCustomerId(Number(row.customerId));
    setPermissionForm({
      enabled: Boolean(row.installmentEnabled),
      maxInstallments: row.maxInstallments == null ? "" : String(row.maxInstallments),
      interestPercent: row.interestBps == null ? "" : String(Number(row.interestBps) / 100).replace(".", ","),
      creditLimit: centsToMoney(row.creditLimitCents),
      allowDaily: triFromValue(row.allowDaily),
      allowWeekly: triFromValue(row.allowWeekly),
      allowMonthly: triFromValue(row.allowMonthly),
      notes: String(row.notes || ""),
    });
  };

  const selected = rows.find((row) => Number(row.customerId) === selectedCustomerId) || null;

  const saveCustomer = () => {
    if (!selected) return;
    setPermissionMutation.mutate({
      customerId: Number(selected.customerId),
      enabled: permissionForm.enabled,
      maxInstallments: null,
      interestBps: null,
      creditLimitCents: moneyToCents(permissionForm.creditLimit),
      allowDaily: null,
      allowWeekly: null,
      allowMonthly: null,
      notes: permissionForm.notes.trim() || null,
    });
  };

  const inputClass = "mt-2 w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-emerald-300/60";

  return (
    <section className="mt-10 overflow-hidden rounded-[28px] border border-emerald-400/30 bg-[linear-gradient(180deg,rgba(6,78,59,.14),rgba(2,6,23,.92))] shadow-[0_25px_70px_rgba(0,0,0,.30)]">
      <div className="border-b border-emerald-400/20 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-emerald-300"><CreditCard className="h-6 w-6" /><h2 className="text-2xl font-black">Parcelamento VIP</h2></div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Parcelamento por produto. O cliente precisa estar com VIP ativo e autorizado; as condições financeiras ficam somente na regra do produto.</p>
          </div>
          <button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-200">
            <RefreshCw className={`h-4 w-4 ${installmentDirectoryQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-6">
        <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.06] p-4 text-sm text-slate-300">
          <p className="font-black uppercase text-cyan-200">Configuração simplificada</p>
          <p className="mt-2">As regras financeiras agora são configuradas <strong className="text-white">somente por produto</strong>: parcelas, juros, entrada e periodicidade. O cliente possui apenas autorização para parcelar e limite de crédito.</p>
        </div>

        <AdminVipInstallmentProductsPanel />

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-emerald-200">Liberados</p><p className="mt-1 text-2xl font-black text-emerald-300">{stats.enabled}</p></div>
          <div className="rounded-2xl border border-orange-400/20 bg-orange-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-orange-200">Com dívida</p><p className="mt-1 text-2xl font-black text-orange-300">{stats.debt}</p></div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4"><p className="text-[10px] font-black uppercase text-cyan-200">A receber</p><p className="mt-1 text-lg font-black text-cyan-300">{moneyLabel(stats.balance)}</p></div>
        </div>

        <div className="relative"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar VIP por nome, telefone ou cadastro" className="w-full rounded-2xl border border-white/10 bg-slate-950/80 py-3 pl-11 pr-4 text-sm font-semibold text-white outline-none focus:border-emerald-300/50" /></div>

        <div className="grid gap-3">
          {installmentDirectoryQuery.isLoading || vipDirectoryQuery.isLoading ? <div className="p-5 text-center text-slate-400">Carregando VIPs...</div> : rows.length === 0 ? <div className="p-5 text-center text-slate-500">Nenhum cliente VIP ativo encontrado.</div> : rows.map((row) => {
            const debt = Number(row.balanceCents || 0) > 0;
            return <article key={row.customerId} className={`rounded-2xl border p-4 ${debt ? "border-orange-400/35 bg-orange-500/[0.06]" : row.installmentEnabled ? "border-emerald-400/35 bg-emerald-500/[0.05]" : "border-white/10 bg-white/[0.02]"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black">{row.customerNumber ? `*${row.customerNumber} • ` : ""}{row.name}</p>{row.installmentEnabled ? <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase text-emerald-300">Parcelamento ativo</span> : <span className="rounded-full border border-slate-400/20 bg-slate-500/10 px-2 py-1 text-[9px] font-black uppercase text-slate-400">Não liberado</span>}{debt && <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/35 bg-orange-500/10 px-2 py-1 text-[9px] font-black uppercase text-orange-300"><AlertTriangle className="h-3 w-3" /> Dívida aberta</span>}</div><p className="mt-1 font-mono text-xs text-slate-500">{row.phone}</p>{debt && <p className="mt-2 text-xs font-bold text-orange-200">Saldo pendente: {moneyLabel(row.balanceCents)} • Nova compra parcelada bloqueada até quitar.</p>}</div>
                <button type="button" onClick={() => openCustomer(row)} className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase text-emerald-200">Configurar</button>
              </div>
            </article>;
          })}
        </div>
      </div>

      {selected && <div className="fixed inset-0 z-[110] grid place-items-center bg-black/80 p-4"><div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[26px] border border-emerald-400/35 bg-[#07111a] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-300">Parcelamento VIP</p><h3 className="mt-1 text-xl font-black">{selected.name}</h3><p className="mt-1 text-xs text-slate-500">{selected.phone}</p></div><button type="button" onClick={() => setSelectedCustomerId(null)} disabled={setPermissionMutation.isPending} className="rounded-lg bg-white/5 p-2 text-slate-400"><X className="h-5 w-5" /></button></div>
        {Number(selected.balanceCents || 0) > 0 && <div className="mt-4 rounded-2xl border border-orange-400/30 bg-orange-500/10 p-4"><p className="flex items-center gap-2 text-sm font-black text-orange-200"><AlertTriangle className="h-4 w-4" /> Compra parcelada em andamento</p><p className="mt-2 text-sm text-orange-100">Saldo: {moneyLabel(selected.balanceCents)}. Desativar a permissão não cancela nem altera essa dívida.</p></div>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 flex items-center justify-between gap-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4"><div><p className="font-black">Liberar Parcelamento VIP</p><p className="mt-1 text-xs text-slate-400">Só afeta novas compras.</p></div><input type="checkbox" checked={permissionForm.enabled} onChange={(event) => setPermissionForm((value) => ({ ...value, enabled: event.target.checked }))} className="h-5 w-5 accent-emerald-400" /></label>
          <label className="sm:col-span-2 text-[11px] font-black uppercase text-slate-300">Limite de crédito<input value={permissionForm.creditLimit} onChange={(event) => setPermissionForm((value) => ({ ...value, creditLimit: event.target.value }))} placeholder="Vazio = sem limite individual" className={inputClass} /><span className="mt-1 block normal-case font-medium text-slate-500">Parcelas, juros, entrada e periodicidade são definidos exclusivamente no produto.</span></label>
          <label className="sm:col-span-2 text-[11px] font-black uppercase text-slate-300">Observação<textarea rows={2} value={permissionForm.notes} onChange={(event) => setPermissionForm((value) => ({ ...value, notes: event.target.value }))} className={inputClass} /></label>
          <div className="sm:col-span-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.05] p-4 text-xs text-cyan-100"><p className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4" /> Regra de segurança</p><p className="mt-2 text-slate-300">Mesmo liberado, o cliente só pode ter uma compra parcelada aberta. Qualquer saldo pendente bloqueia um novo parcelamento.</p></div>
          <button type="button" onClick={saveCustomer} disabled={setPermissionMutation.isPending} className="sm:col-span-2 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-black uppercase text-emerald-950 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> {setPermissionMutation.isPending ? "Salvando..." : "Salvar permissão do cliente"}</button>
        </div>
      </div></div>}
    </section>
  );
}
