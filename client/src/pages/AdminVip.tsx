import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Crown, ExternalLink, History, RefreshCw, Save, Search, Settings2, ShieldCheck, UserCheck, UserX, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";

function money(value: string | number | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const normalized = raw.includes(",") ? Number(raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")) : Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(normalized) ? normalized.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : raw;
}

function formatDate(value: number | null | undefined, withTime = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" });
}

function actionLabel(action: string) {
  if (action === "activate") return "VIP ativado";
  if (action === "renew") return "VIP renovado";
  if (action === "set_expiry") return "Validade alterada";
  if (action === "cancel") return "VIP cancelado";
  return action;
}

type ActionMode = "activate" | "renew" | "expiry" | "cancel";

export default function AdminVip() {
  const { data: settings, isLoading } = trpc.settings.getAll.useQuery();
  const { data: activePix } = trpc.pix.getActive.useQuery();
  const utils = trpc.useUtils();
  const initialSearch = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("phone") || "" : "";
  const [search, setSearch] = useState(initialSearch);
  const [filter, setFilter] = useState<"all" | "active" | "expired" | "none" | "cancelled">("all");
  const [historyCustomerId, setHistoryCustomerId] = useState<number | null>(null);
  const [actionModal, setActionModal] = useState<{ mode: ActionMode; customer: any } | null>(null);
  const [daysInput, setDaysInput] = useState("30");
  const [amountInput, setAmountInput] = useState("");
  const [expiryInput, setExpiryInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [form, setForm] = useState({ enabled: true, price: "", days: "30", title: "H2 VIP", subtitle: "Pague menos nos modelos e categorias com benefício VIP.", benefit1: "Preços especiais em modelos e categorias selecionados", benefit2: "Acesso a opções exclusivas marcadas como SOMENTE VIP", benefit3: "O valor VIP aparece antes da compra para você comparar" });
  const [formInitialized, setFormInitialized] = useState(false);

  if (settings && !formInitialized) {
    setFormInitialized(true);
    setForm({
      enabled: settings.vip_membership_enabled !== "0",
      price: settings.vip_membership_price || "",
      days: settings.vip_membership_days || "30",
      title: settings.vip_membership_title || "H2 VIP",
      subtitle: settings.vip_membership_subtitle || "Pague menos nos modelos e categorias com benefício VIP.",
      benefit1: settings.vip_membership_benefit_1 || "Preços especiais em modelos e categorias selecionados",
      benefit2: settings.vip_membership_benefit_2 || "Acesso a opções exclusivas marcadas como SOMENTE VIP",
      benefit3: settings.vip_membership_benefit_3 || "O valor VIP aparece antes da compra para você comparar",
    });
  }

  const directoryQuery = trpc.vipMemberships.adminDirectory.useQuery(undefined, { staleTime: 10_000, refetchOnWindowFocus: true });
  const historyQuery = trpc.vipMemberships.history.useQuery({ customerId: historyCustomerId || 1 }, { enabled: !!historyCustomerId, staleTime: 0 });
  const directory = (directoryQuery.data || []) as any[];
  const planDays = Math.max(1, Number(form.days || 30) || 30);

  const refreshAll = async () => {
    await Promise.all([directoryQuery.refetch(), utils.customers.list.invalidate()]);
  };

  const update = trpc.settings.update.useMutation({
    onSuccess: () => { toast.success("Configuração VIP salva!"); utils.settings.getAll.invalidate(); },
    onError: (error) => toast.error(error.message || "Erro ao salvar VIP"),
  });
  const activateMut = trpc.vipMemberships.activate.useMutation({ onSuccess: () => { toast.success("VIP ativado com sucesso!"); setActionModal(null); refreshAll(); }, onError: (e) => toast.error(e.message) });
  const renewMut = trpc.vipMemberships.renew.useMutation({ onSuccess: () => { toast.success("VIP renovado com sucesso!"); setActionModal(null); refreshAll(); }, onError: (e) => toast.error(e.message) });
  const expiryMut = trpc.vipMemberships.setExpiry.useMutation({ onSuccess: () => { toast.success("Validade alterada!"); setActionModal(null); refreshAll(); }, onError: (e) => toast.error(e.message) });
  const cancelMut = trpc.vipMemberships.cancel.useMutation({ onSuccess: () => { toast.success("VIP cancelado."); setActionModal(null); refreshAll(); }, onError: (e) => toast.error(e.message) });
  const actionPending = activateMut.isPending || renewMut.isPending || expiryMut.isPending || cancelMut.isPending;

  const saveConfig = () => {
    update.mutate({ settings: {
      vip_membership_enabled: form.enabled ? "1" : "0",
      vip_membership_price: form.price.trim(),
      vip_membership_days: String(Math.max(1, Number(form.days || 30) || 30)),
      vip_membership_title: form.title.trim() || "H2 VIP",
      vip_membership_subtitle: form.subtitle.trim(),
      vip_membership_benefit_1: form.benefit1.trim(),
      vip_membership_benefit_2: form.benefit2.trim(),
      vip_membership_benefit_3: form.benefit3.trim(),
    }});
  };

  const stats = useMemo(() => ({
    active: directory.filter((c) => c.active).length,
    expiring: directory.filter((c) => c.active && Number(c.daysLeft || 0) <= 7).length,
    expired: directory.filter((c) => c.status === "expired").length,
    total: directory.length,
  }), [directory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/\D/g, "");
    const raw = search.trim().toLowerCase();
    return directory.filter((c) => {
      const matchesFilter = filter === "all" || c.status === filter;
      if (!matchesFilter) return false;
      if (!raw) return true;
      return String(c.name || "").toLowerCase().includes(raw) || String(c.phone || "").replace(/\D/g, "").includes(q) || String(c.customerNumber || "").includes(raw.replace("*", ""));
    });
  }, [directory, filter, search]);

  const openAction = (mode: ActionMode, customer: any) => {
    setDaysInput(String(planDays));
    setAmountInput(form.price || customer.lastPaymentAmount || "");
    setNotesInput("");
    const date = customer.expiresAtMs && customer.expiresAtMs > Date.now() ? new Date(customer.expiresAtMs) : new Date(Date.now() + planDays * 86400000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    setExpiryInput(local);
    setActionModal({ mode, customer });
  };

  const submitAction = async () => {
    if (!actionModal) return;
    const customerId = Number(actionModal.customer.customerId);
    const notes = notesInput.trim() || undefined;
    if (actionModal.mode === "activate") return activateMut.mutateAsync({ customerId, days: Math.max(1, Number(daysInput) || planDays), amount: amountInput.trim() || undefined, notes });
    if (actionModal.mode === "renew") return renewMut.mutateAsync({ customerId, days: Math.max(1, Number(daysInput) || planDays), amount: amountInput.trim() || undefined, notes });
    if (actionModal.mode === "expiry") {
      const expiresAtMs = expiryInput ? new Date(`${expiryInput}T23:59:59`).getTime() : 0;
      if (!expiresAtMs) return toast.error("Escolha uma data de validade.");
      return expiryMut.mutateAsync({ customerId, expiresAtMs, notes });
    }
    return cancelMut.mutateAsync({ customerId, notes });
  };

  const inputClass = "mt-2 w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70";

  return (
    <div className="min-h-screen bg-slate-950 pb-16 text-white">
      <AdminHeader title="H2 VIP" />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
<div><div className="flex items-center gap-2 text-amber-300"><Crown className="h-6 w-6 fill-amber-300/30" /><span className="text-xs font-black uppercase tracking-[0.16em]">H2 VIP</span></div><h1 className="mt-2 text-3xl font-black">Configuração e Clientes VIP</h1><p className="mt-2 text-sm text-slate-400">Plano, pagamento, ativação, validade, renovação e histórico no mesmo lugar.</p></div>
<a href="/vip" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-violet-400/45 bg-violet-500/10 px-4 py-3 text-sm font-black text-violet-200"><ExternalLink className="h-4 w-4" /> Ver página VIP</a>
        </div>

        {isLoading ? <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-slate-300">Carregando...</div> : <div className="mt-6 grid gap-5">
<section className="rounded-2xl border border-amber-300/25 bg-amber-400/[0.05] p-5"><label className="flex cursor-pointer items-center justify-between gap-4"><div><p className="font-black">VIP disponível para contratação</p><p className="mt-1 text-xs text-slate-400">Desative para esconder o fluxo de pagamento.</p></div><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="h-5 w-5 accent-amber-400" /></label></section>
<section className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-2">
  <label className="text-xs font-black uppercase tracking-wide text-slate-300">Valor do VIP<input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="Ex.: 29,90" className={inputClass} /></label>
  <label className="text-xs font-black uppercase tracking-wide text-slate-300">Duração em dias<input type="number" min="1" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} className={inputClass} /></label>
  <label className="sm:col-span-2 text-xs font-black uppercase tracking-wide text-slate-300">Título<input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} /></label>
  <label className="sm:col-span-2 text-xs font-black uppercase tracking-wide text-slate-300">Descrição<textarea value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} rows={3} className={inputClass} /></label>
</section>
<section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="mb-4 flex items-center gap-2"><Settings2 className="h-5 w-5 text-violet-300" /><h2 className="font-black">Benefícios exibidos ao cliente</h2></div>{(["benefit1", "benefit2", "benefit3"] as const).map((key, index) => <label key={key} className="mb-4 block text-xs font-black uppercase tracking-wide text-slate-300">Benefício {index + 1}<input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={inputClass} /></label>)}</section>
<section className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.05] p-5"><p className="text-sm font-black text-cyan-100">PIX usado na página VIP</p>{activePix ? <p className="mt-2 text-sm text-slate-300">{activePix.pixKey} {activePix.pixName ? `• ${activePix.pixName}` : ""}</p> : <p className="mt-2 text-sm text-rose-300">Nenhuma conta PIX ativa. Ative uma em Configurações.</p>}<a href="/admin/settings" className="mt-3 inline-flex text-xs font-black uppercase text-cyan-300 underline underline-offset-4">Abrir configurações de PIX</a></section>
<button type="button" onClick={saveConfig} disabled={update.isPending} className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-400 px-5 text-sm font-black uppercase text-[#251600] disabled:opacity-50"><Save className="h-5 w-5" /> {update.isPending ? "Salvando..." : "Salvar configuração VIP"}</button>
        </div>}

        <section className="mt-10 overflow-hidden rounded-[28px] border border-amber-300/40 bg-[radial-gradient(circle_at_15%_0%,rgba(251,191,36,.10),transparent_28%),linear-gradient(180deg,#11101d,#080a16)] shadow-[0_25px_70px_rgba(0,0,0,.35)]">
<div className="border-b border-amber-300/20 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-amber-300"><Crown className="h-7 w-7 fill-amber-300/25" /><h2 className="text-2xl font-black">Clientes VIP</h2></div><p className="mt-2 text-sm text-slate-400">Ative depois do pagamento, acompanhe vencimento, renove ou cancele.</p></div><button onClick={() => refreshAll()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-200"><RefreshCw className={`h-4 w-4 ${directoryQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar</button></div></div>
<div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-6">
  <div className="rounded-2xl border border-amber-300/35 bg-amber-400/10 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-amber-200">VIP ativos</p><p className="mt-1 text-3xl font-black text-amber-300">{stats.active}</p></div>
  <div className="rounded-2xl border border-orange-300/25 bg-orange-400/10 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-orange-200">Vencem em 7 dias</p><p className="mt-1 text-3xl font-black text-orange-300">{stats.expiring}</p></div>
  <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-rose-200">Expirados</p><p className="mt-1 text-3xl font-black text-rose-300">{stats.expired}</p></div>
  <div className="rounded-2xl border border-violet-300/25 bg-violet-400/10 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-violet-200">Cadastros</p><p className="mt-1 text-3xl font-black text-violet-300">{stats.total}</p></div>
</div>
<div className="border-y border-white/10 bg-black/20 p-4 sm:p-5"><div className="relative"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente por nome, telefone ou número de cadastro" className="w-full rounded-2xl border border-white/10 bg-slate-950/75 py-3 pl-12 pr-4 text-sm font-semibold text-white outline-none focus:border-amber-300/60" /></div><div className="mt-3 flex flex-wrap gap-2">{([['all','Todos'],['active','VIP ativos'],['expired','Expirados'],['none','Sem VIP'],['cancelled','Cancelados']] as const).map(([key,label]) => <button key={key} onClick={() => setFilter(key)} className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase ${filter === key ? 'border-amber-300 bg-amber-300 text-[#271700]' : 'border-white/10 bg-white/5 text-slate-300'}`}>{label}</button>)}</div></div>
<div className="grid gap-3 p-4 sm:p-6">
  {directoryQuery.isLoading ? <div className="p-6 text-center text-slate-400">Carregando clientes...</div> : filtered.length === 0 ? <div className="p-6 text-center text-slate-500">Nenhum cliente encontrado.</div> : filtered.map((c) => (
    <article key={c.customerId} className={`rounded-2xl border p-4 ${c.active ? 'border-amber-300/55 bg-[linear-gradient(135deg,rgba(120,53,15,.32),rgba(49,25,88,.32))] shadow-[0_0_28px_rgba(251,191,36,.10)]' : c.status === 'expired' ? 'border-rose-400/25 bg-rose-500/[0.04]' : 'border-white/10 bg-white/[0.025]'}`}>
      <div className="flex flex-wrap items-center gap-4"><div className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border ${c.active ? 'border-amber-300/70 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}>{c.profilePhotoUrl ? <img src={c.profilePhotoUrl} alt="" className="h-full w-full object-cover" /> : c.active ? <Crown className="h-7 w-7 fill-amber-300/20 text-amber-300" /> : <UserCheck className="h-6 w-6 text-slate-400" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black text-white">{c.customerNumber ? `*${c.customerNumber} • ` : ''}{c.name}</p>{c.active && <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/50 bg-amber-400/15 px-2 py-1 text-[9px] font-black uppercase text-amber-200"><Crown className="h-3 w-3 fill-amber-300/30" /> VIP ATIVO</span>}{c.status === 'expired' && <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[9px] font-black uppercase text-rose-300">EXPIRADO</span>}{c.status === 'cancelled' && <span className="rounded-full border border-slate-400/30 bg-slate-500/10 px-2 py-1 text-[9px] font-black uppercase text-slate-400">CANCELADO</span>}</div><p className="mt-1 text-xs font-mono text-slate-400">{c.phone}</p>{c.active ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold"><span className="text-amber-200"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{c.daysLeft} dia(s) restantes</span><span className="text-slate-400">Vence: {formatDate(c.expiresAtMs)}</span></div> : c.membershipId ? <p className="mt-2 text-[11px] text-slate-500">Última validade: {formatDate(c.expiresAtMs)}</p> : <p className="mt-2 text-[11px] text-slate-500">Ainda não possui assinatura VIP.</p>}</div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{c.active ? <><button onClick={() => openAction('renew', c)} className="rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase text-emerald-950">Renovar</button><button onClick={() => openAction('expiry', c)} className="rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-200">Alterar validade</button><button onClick={() => openAction('cancel', c)} className="rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase text-rose-300">Cancelar</button></> : <button onClick={() => openAction('activate', c)} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-300 to-yellow-400 px-4 py-2 text-[10px] font-black uppercase text-[#251600]"><Crown className="h-4 w-4" /> {c.membershipId ? 'Reativar VIP' : 'Ativar VIP'}</button>}{c.membershipId && <button onClick={() => setHistoryCustomerId(c.customerId)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase text-slate-300"><History className="h-4 w-4" /> Histórico</button>}</div></div>
    </article>
  ))}
</div>
        </section>
      </main>

      {actionModal && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4"><div className="w-full max-w-md rounded-[24px] border border-amber-300/40 bg-[#0c0d1b] p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-300">Gestão VIP</p><h3 className="mt-1 text-xl font-black">{actionModal.customer.name}</h3><p className="mt-1 text-xs text-slate-400">{actionModal.customer.phone}</p></div><button onClick={() => setActionModal(null)} disabled={actionPending} className="rounded-lg bg-white/5 p-2 text-slate-400"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4">{(actionModal.mode === 'activate' || actionModal.mode === 'renew') && <><label className="text-xs font-black uppercase text-slate-300">Quantidade de dias<input type="number" min="1" value={daysInput} onChange={(e) => setDaysInput(e.target.value)} className={inputClass} /></label><label className="text-xs font-black uppercase text-slate-300">Valor pago<input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder={form.price || '29,90'} className={inputClass} /></label></>}{actionModal.mode === 'expiry' && <label className="text-xs font-black uppercase text-slate-300">Nova data de vencimento<input type="date" value={expiryInput} onChange={(e) => setExpiryInput(e.target.value)} className={inputClass} /></label>}{actionModal.mode === 'cancel' && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-100">O cliente perderá imediatamente os preços e opções exclusivas VIP.</div>}<label className="text-xs font-black uppercase text-slate-300">Observação (opcional)<textarea value={notesInput} onChange={(e) => setNotesInput(e.target.value)} rows={2} className={inputClass} /></label><button onClick={submitAction} disabled={actionPending} className={`min-h-[52px] rounded-2xl px-4 text-sm font-black uppercase ${actionModal.mode === 'cancel' ? 'bg-rose-600 text-white' : 'bg-gradient-to-r from-amber-300 to-yellow-400 text-[#251600]'}`}>{actionPending ? 'Salvando...' : actionModal.mode === 'activate' ? 'Confirmar ativação VIP' : actionModal.mode === 'renew' ? 'Confirmar renovação' : actionModal.mode === 'expiry' ? 'Salvar nova validade' : 'Confirmar cancelamento'}</button></div></div></div>}

      {historyCustomerId && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4"><div className="max-h-[82vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-violet-400/35 bg-[#0c0d1b] p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-300">Histórico VIP</p><h3 className="mt-1 text-xl font-black">Movimentações</h3></div><button onClick={() => setHistoryCustomerId(null)} className="rounded-lg bg-white/5 p-2 text-slate-400"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-3">{historyQuery.isLoading ? <p className="text-sm text-slate-400">Carregando...</p> : (historyQuery.data || []).length === 0 ? <p className="text-sm text-slate-500">Sem histórico.</p> : (historyQuery.data || []).map((h: any) => <div key={h.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-white">{actionLabel(h.action)}</p><p className="mt-1 text-xs text-slate-500">{formatDate(h.createdAt, true)}</p></div>{h.days && <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[9px] font-black text-amber-300">+{h.days} dias</span>}</div>{h.newExpiresAtMs && <p className="mt-2 text-xs text-slate-300">Validade: <b>{formatDate(h.newExpiresAtMs)}</b></p>}{h.amount && <p className="mt-1 text-xs text-emerald-300">Valor: {money(h.amount)}</p>}{h.notes && <p className="mt-2 text-xs leading-5 text-slate-400">{h.notes}</p>}</div>)}</div></div></div>}
    </div>
  );
}
