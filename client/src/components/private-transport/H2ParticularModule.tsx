import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, CarFront, ChevronRight, ClipboardList, Edit3, Heart, MapPin, Phone, Plus, Search, Star, Users, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppointmentsPanel } from "./AppointmentsPanel";
import { QuotesPanel } from "./QuotesPanel";
import { TripsPanel } from "./TripsPanel";
import { ReceiptsPanel } from "./ReceiptsPanel";
import { PrivateSettingsPanel } from "./PrivateSettingsPanel";

type ModuleView = "overview" | "clients" | "new-client" | "client" | "appointments" | "quotes" | "trips" | "receivables" | "receipts" | "settings" | "history";

type ClientForm = {
  name: string; phone: string; whatsapp: string; cpf: string; email: string; addressLine: string; addressNumber: string;
  addressComplement: string; neighborhood: string; city: string; state: string; zipCode: string; referencePoint: string; notes: string;
};

const emptyClientForm: ClientForm = {
  name: "", phone: "", whatsapp: "", cpf: "", email: "", addressLine: "", addressNumber: "", addressComplement: "",
  neighborhood: "", city: "", state: "", zipCode: "", referencePoint: "", notes: "",
};

function cleanPhone(phone?: string | null) {
  return String(phone || "").replace(/\D/g, "");
}

function whatsappUrl(phone?: string | null, message?: string) {
  let number = cleanPhone(phone);
  if (number.length <= 11) number = `55${number}`;
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

function formatPhone(phone?: string | null) {
  const digits = cleanPhone(phone);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return phone || "Não informado";
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function H2ParticularModule({ token }: { token: string }) {
  const [view, setView] = useState<ModuleView>("overview");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "favorites">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [form, setForm] = useState<ClientForm>(emptyClientForm);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const bootstrapQuery = trpc.privateTransport.bootstrap.useQuery({ token }, { enabled: !!token, staleTime: 60_000 });
  const dashboardQuery = trpc.privateTransport.dashboard.useQuery({ token }, { enabled: !!token, staleTime: 30_000 });
  const clientsQuery = trpc.privateTransport.clients.list.useQuery({ token, search: debouncedSearch, filter, limit: 50 }, { enabled: !!token });
  const selectedQuery = trpc.privateTransport.clients.get.useQuery({ token, clientId: selectedClientId || 0 }, { enabled: !!token && !!selectedClientId });
  const createClient = trpc.privateTransport.clients.create.useMutation({
    onSuccess: (result) => {
      if (result.duplicate) {
        toast.error(`Este telefone já está cadastrado para ${result.client.name}.`);
        setSelectedClientId(Number(result.client.id)); setView("client"); return;
      }
      toast.success("Passageiro salvo com sucesso.");
      setForm(emptyClientForm); setView("clients"); clientsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar o passageiro. Seus dados continuam no formulário."),
  });
  const updateClient = trpc.privateTransport.clients.update.useMutation({
    onSuccess: () => { toast.success("Cadastro atualizado com sucesso."); setEditing(false); clientsQuery.refetch(); selectedQuery.refetch(); },
    onError: (error) => toast.error(error.message || "Não foi possível atualizar o passageiro."),
  });

  const clients = clientsQuery.data?.items || [];
  const activeCount = useMemo(() => clients.filter((item: any) => Number(item.isActive) === 1).length, [clients]);
  const favoriteCount = useMemo(() => clients.filter((item: any) => Number(item.isFavorite) === 1).length, [clients]);
  const profile = selectedQuery.data?.client as any;

  useEffect(() => {
    if (profile && editing) {
      setForm({
        name: profile.name || "", phone: profile.phone || "", whatsapp: profile.whatsapp || "", cpf: profile.cpf || "", email: profile.email || "",
        addressLine: profile.addressLine || "", addressNumber: profile.addressNumber || "", addressComplement: profile.addressComplement || "",
        neighborhood: profile.neighborhood || "", city: profile.city || "", state: profile.state || "", zipCode: profile.zipCode || "",
        referencePoint: profile.referencePoint || "", notes: profile.notes || "",
      });
    }
  }, [profile, editing]);

  function openClient(clientId: number) { setSelectedClientId(clientId); setEditing(false); setView("client"); }
  function submitClient() {
    if (!form.name.trim() || !form.phone.trim()) { toast.error("Preencha nome completo e telefone do passageiro."); return; }
    if (editing && selectedClientId) updateClient.mutate({ token, clientId: selectedClientId, client: form });
    else createClient.mutate({ token, client: form });
  }
  function showComingSoon(label: string) { toast.info(`${label} será liberado na próxima etapa do H2 Particular.`); }

  const navItems: Array<{ key: ModuleView; label: string; icon: typeof Users }> = [
    { key: "overview", label: "Visão geral", icon: CarFront },
    { key: "clients", label: "Clientes", icon: Users },
    { key: "new-client", label: "Novo cliente", icon: Plus },
    { key: "appointments", label: "Agenda", icon: CalendarPlus },
    { key: "quotes", label: "Orçamentos", icon: ClipboardList },
    { key: "trips", label: "Viagens", icon: CarFront },
    { key: "receivables", label: "A receber", icon: WalletCards },
    { key: "receipts", label: "Recibos", icon: ClipboardList },
    { key: "settings", label: "Configurações", icon: Edit3 },
    { key: "history", label: "Histórico", icon: ClipboardList },
  ];

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/15 via-slate-950 to-indigo-500/15 p-4 sm:p-6 shadow-[0_12px_40px_rgba(8,145,178,0.12)]">
        <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/15 text-cyan-200 shadow-lg shadow-cyan-950/40"><CarFront className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">H2 Particular</p>
            <h2 className="mt-0.5 text-xl font-black text-white sm:text-2xl">Passageiros particulares</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-300 sm:text-sm">Clientes, agenda, orçamentos, viagens e recebimentos organizados no mesmo lugar.</p>
          </div>
          <div className="hidden rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-right sm:block"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Motorista</p><p className="max-w-[145px] truncate text-sm font-bold text-white">{bootstrapQuery.data?.user.name || "Carregando..."}</p></div>
        </div>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {navItems.map((item) => {
          const Icon = item.icon; const active = (item.key === "new-client" && view === "new-client") || item.key === view;
          return <button key={item.key} onClick={() => { if (item.key === "new-client") { setEditing(false); setForm(emptyClientForm); } setView(item.key); }} className={`flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all active:scale-95 ${active ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]" : "border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-800"}`}><Icon className="h-4 w-4" />{item.label}</button>;
        })}
      </div>

      {view === "overview" && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Passageiros ativos" value={dashboardQuery.isLoading ? "—" : String(dashboardQuery.data?.metrics.totalClients ?? activeCount)} icon={<Users className="h-4 w-4" />} tone="cyan" />
          <StatCard label="Favoritos" value={dashboardQuery.isLoading ? "—" : String(dashboardQuery.data?.metrics.favoriteClients ?? favoriteCount)} icon={<Star className="h-4 w-4" />} tone="amber" />
          <StatCard label="Recebido no mês" value={money(dashboardQuery.data?.metrics.paidThisMonth || 0)} icon={<WalletCards className="h-4 w-4" />} tone="emerald" compact />
          <StatCard label="A receber" value={money(dashboardQuery.data?.metrics.receivable || 0)} icon={<CarFront className="h-4 w-4" />} tone="violet" compact />
        </div>
        <div className="grid gap-3 md:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Comece por aqui</p><h3 className="mt-1 text-lg font-black text-white">Organize seu primeiro passageiro</h3><p className="mt-1 text-sm leading-relaxed text-slate-400">Cadastre uma única vez. Depois você poderá localizar pelo nome, telefone ou CPF para criar agendamentos e orçamentos rapidamente.</p></div><Users className="h-8 w-8 flex-none text-cyan-300/65" /></div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2"><Button onClick={() => { setForm(emptyClientForm); setEditing(false); setView("new-client"); }} className="h-11 bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400"><Plus className="mr-2 h-4 w-4" />Cadastrar passageiro</Button><Button onClick={() => setView("clients")} variant="outline" className="h-11 border-white/15 bg-white/5 font-bold text-slate-100 hover:bg-white/10"><Search className="mr-2 h-4 w-4" />Buscar cliente</Button></div>
          </div>
          <div className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 to-slate-950 p-4 sm:p-5"><p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Configuração reutilizada</p><h3 className="mt-1 text-base font-black text-white">Custos do seu veículo</h3><div className="mt-3 space-y-2 text-xs"><Metric label="Consumo" value={`${bootstrapQuery.data?.vehicle?.kmPerLiter || "Não configurado"} km/L`} /><Metric label="Combustível" value={bootstrapQuery.data?.vehicle?.fuelPricePerLiter ? `${money(bootstrapQuery.data.vehicle.fuelPricePerLiter)}/L` : "Não configurado"} /><Metric label="Custo estimado/km" value={bootstrapQuery.data?.vehicle?.kmPerLiter && bootstrapQuery.data?.vehicle?.fuelPricePerLiter ? money(Number(bootstrapQuery.data.vehicle.fuelPricePerLiter) / Number(bootstrapQuery.data.vehicle.kmPerLiter)) : "Configure na Planilha"} /></div></div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Próximos agendamentos</p>{(dashboardQuery.data?.upcoming || []).length === 0 ? <p className="mt-3 text-sm text-slate-400">Nenhum agendamento futuro.</p> : <div className="mt-3 space-y-2">{dashboardQuery.data?.upcoming.slice(0, 4).map((appointment: any) => <div key={appointment.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[.025] p-2.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{appointment.clientNameSnapshot}</p><p className="mt-0.5 truncate text-xs text-slate-500">{new Date(appointment.startsAt).toLocaleString("pt-BR")}</p></div><span className="text-xs font-bold text-cyan-200">{appointment.status}</span></div>)}</div>}</div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Clientes que mais usam</p>{(dashboardQuery.data?.topClients || []).length === 0 ? <p className="mt-3 text-sm text-slate-400">Os clientes frequentes aparecerão aqui.</p> : <div className="mt-3 space-y-2">{dashboardQuery.data?.topClients.map((client: any) => <div key={client.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[.025] p-2.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{client.name}</p><p className="mt-0.5 text-xs text-slate-500">{client.trips} viagem(ns)</p></div><span className="text-sm font-black text-emerald-200">{money(client.paid)}</span></div>)}</div>}</div>
        </div>
      </div>}

      {view === "appointments" && <AppointmentsPanel token={token} clients={clients} />}
      {view === "quotes" && <QuotesPanel token={token} clients={clients} />}
      {view === "trips" && <TripsPanel token={token} />}
      {view === "receivables" && <TripsPanel token={token} receivablesOnly />}
      {view === "receipts" && <ReceiptsPanel token={token} />}
      {view === "settings" && <PrivateSettingsPanel token={token} />}
      {view === "history" && <div className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">H2 Particular • Histórico</p><h3 className="mt-1 text-xl font-black text-white">Últimas movimentações</h3><p className="mt-1 text-sm text-slate-400">Registro auditável de cadastros, agendamentos, pagamentos, recibos e configurações.</p>{dashboardQuery.isLoading ? <div className="mt-5 h-36 animate-pulse rounded-xl bg-white/[.04]" /> : (dashboardQuery.data?.recentEvents || []).length === 0 ? <p className="mt-5 text-sm text-slate-400">Ainda não existem movimentações registradas.</p> : <div className="mt-5 space-y-3">{dashboardQuery.data?.recentEvents.map((event: any) => <div key={event.id} className="border-l-2 border-cyan-400/35 pl-3"><p className="text-sm font-bold text-white">{event.message}</p><p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{event.eventType} • {new Date(event.createdAt).toLocaleString("pt-BR")}</p></div>)}</div>}</div>}

      {view === "clients" && <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, telefone ou CPF" className="h-11 border-white/10 bg-slate-900 pl-10 text-white placeholder:text-slate-500" /></div><Button onClick={() => { setEditing(false); setForm(emptyClientForm); setView("new-client"); }} className="h-11 bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400"><Plus className="mr-2 h-4 w-4" />Novo cliente</Button></div>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-0.5">{([{ key: "all", label: "Todos" }, { key: "active", label: "Ativos" }, { key: "favorites", label: "Favoritos" }, { key: "inactive", label: "Inativos" }] as const).map((option) => <button key={option.key} onClick={() => setFilter(option.key)} className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${filter === option.key ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-slate-900 text-slate-400"}`}>{option.label}</button>)}</div>
        </div>
        {clientsQuery.isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((key) => <div key={key} className="h-40 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60" />)}</div> : clients.length === 0 ? <EmptyClients onCreate={() => { setEditing(false); setForm(emptyClientForm); setView("new-client"); }} search={search} /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{clients.map((client: any) => <ClientCard key={client.id} client={client} onOpen={() => openClient(Number(client.id))} onWhatsApp={() => window.open(whatsappUrl(client.whatsapp || client.phone, `Olá ${client.name}, tudo bem?`), "_blank", "noopener,noreferrer")} />)}</div>}
      </div>}

      {view === "new-client" && <ClientFormView token={token} title="Cadastrar passageiro" subtitle="O cadastro fica salvo de forma permanente e poderá ser usado em todas as viagens." form={form} setForm={setForm} saving={createClient.isPending} onCancel={() => setView("clients")} onSave={submitClient} />}

      {view === "client" && <div className="space-y-4">
        {selectedQuery.isLoading || !profile ? <div className="h-72 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60" /> : editing ? <ClientFormView token={token} title={`Editar ${profile.name}`} subtitle="As alterações preservam o histórico das viagens já realizadas." form={form} setForm={setForm} saving={updateClient.isPending} onCancel={() => setEditing(false)} onSave={submitClient} /> : <ClientProfile client={profile} events={selectedQuery.data?.events || []} onBack={() => setView("clients")} onEdit={() => setEditing(true)} onWhatsApp={() => window.open(whatsappUrl(profile.whatsapp || profile.phone, `Olá ${profile.name}, tudo bem?`), "_blank", "noopener,noreferrer")} onSchedule={() => showComingSoon("Novo agendamento")} onToggleFavorite={() => updateClient.mutate({ token, clientId: Number(profile.id), client: { isFavorite: Number(profile.isFavorite) !== 1 } })} onDeactivate={() => updateClient.mutate({ token, clientId: Number(profile.id), client: { isActive: false } })} />}
      </div>}
    </section>
  );
}

function StatCard({ label, value, icon, tone, compact = false }: { label: string; value: string; icon: React.ReactNode; tone: "cyan" | "amber" | "emerald" | "violet"; compact?: boolean }) {
  const colors = { cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200", amber: "border-amber-400/20 bg-amber-400/10 text-amber-200", emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200", violet: "border-violet-400/20 bg-violet-400/10 text-violet-200" };
  return <div className={`rounded-2xl border p-3 ${colors[tone]}`}><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wide opacity-75">{label}</p>{icon}</div><p className={`${compact ? "text-sm" : "text-xl"} mt-2 truncate font-black text-white`}>{value}</p></div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0"><span className="text-slate-400">{label}</span><span className="max-w-[62%] truncate text-right font-bold text-white">{value}</span></div>; }
function EmptyClients({ onCreate, search }: { onCreate: () => void; search: string }) { return <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/50 px-5 py-12 text-center"><Users className="mx-auto h-10 w-10 text-cyan-300/70" /><h3 className="mt-3 text-lg font-black text-white">{search ? "Nenhum passageiro encontrado" : "Você ainda não possui passageiros cadastrados"}</h3><p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">{search ? "Tente buscar por outro nome, telefone ou CPF." : "Cadastre o primeiro passageiro para organizar seus agendamentos e orçamentos."}</p><Button onClick={onCreate} className="mt-5 bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400"><Plus className="mr-2 h-4 w-4" />Cadastrar primeiro cliente</Button></div>; }
function ClientCard({ client, onOpen, onWhatsApp }: { client: any; onOpen: () => void; onWhatsApp: () => void }) { return <div className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 transition-all hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-slate-900"><div className="flex items-start gap-3"><button onClick={onOpen} className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-base font-black text-slate-950">{String(client.name || "C").charAt(0).toUpperCase()}</button><button onClick={onOpen} className="min-w-0 flex-1 text-left"><div className="flex items-center gap-1.5"><h3 className="truncate text-sm font-black text-white">{client.name}</h3>{Number(client.isFavorite) === 1 && <Star className="h-3.5 w-3.5 flex-none fill-amber-300 text-amber-300" />}</div><p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-400"><Phone className="h-3 w-3" />{formatPhone(client.phone)}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin className="h-3 w-3" />{client.city || "Cidade não informada"}{client.state ? `/${client.state}` : ""}</p></button></div><div className="mt-4 grid grid-cols-2 gap-2"><Button onClick={onOpen} variant="outline" className="h-9 border-white/10 bg-white/5 text-xs font-bold text-slate-100 hover:bg-white/10"><ClipboardList className="mr-1.5 h-3.5 w-3.5" />Abrir</Button><Button onClick={onWhatsApp} variant="outline" className="h-9 border-emerald-400/20 bg-emerald-500/10 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"><Phone className="mr-1.5 h-3.5 w-3.5" />WhatsApp</Button></div></div>; }
function ClientFormView({ token, title, subtitle, form, setForm, saving, onCancel, onSave }: { token: string; title: string; subtitle: string; form: ClientForm; setForm: (value: ClientForm) => void; saving: boolean; onCancel: () => void; onSave: () => void }) { const set = (key: keyof ClientForm, value: string) => setForm({ ...form, [key]: value }); const cepQuery = trpc.privateTransport.addresses.lookupCep.useQuery({ token, cep: form.zipCode || "00000000" }, { enabled: false, retry: false }); useEffect(() => { if (!cepQuery.data) return; setForm({ ...form, zipCode: cepQuery.data.cep, addressLine: cepQuery.data.street || form.addressLine, neighborhood: cepQuery.data.neighborhood || form.neighborhood, city: cepQuery.data.city || form.city, state: (cepQuery.data.state || form.state).toUpperCase(), addressComplement: form.addressComplement || cepQuery.data.complement || "" }); }, [cepQuery.data]); return <div className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 sm:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">H2 Particular</p><h3 className="mt-1 text-xl font-black text-white">{title}</h3><p className="mt-1 text-sm text-slate-400">{subtitle}</p></div><button onClick={onCancel} className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/5"><X className="h-4 w-4" /></button></div><div className="grid gap-4 md:grid-cols-2"><Field label="Nome completo" required><Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ex.: João Silva" /></Field><Field label="Telefone" required><Input inputMode="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder="(11) 99999-9999" /></Field><Field label="WhatsApp"><Input inputMode="tel" value={form.whatsapp} onChange={(event) => set("whatsapp", event.target.value)} placeholder="Se vazio, será usado o telefone" /></Field><Field label="CPF"><Input inputMode="numeric" value={form.cpf} onChange={(event) => set("cpf", event.target.value)} placeholder="Opcional" /></Field><Field label="E-mail" className="md:col-span-2"><Input inputMode="email" value={form.email} onChange={(event) => set("email", event.target.value)} placeholder="Opcional" /></Field></div><div className="my-6 border-t border-white/10" /><p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-300">Endereço principal</p><div className="grid gap-4 md:grid-cols-6"><Field label="Endereço" className="md:col-span-4"><Input value={form.addressLine} onChange={(event) => set("addressLine", event.target.value)} placeholder="Rua, avenida ou condomínio" /></Field><Field label="Número" className="md:col-span-2"><Input value={form.addressNumber} onChange={(event) => set("addressNumber", event.target.value)} placeholder="Número" /></Field><Field label="Complemento" className="md:col-span-3"><Input value={form.addressComplement} onChange={(event) => set("addressComplement", event.target.value)} placeholder="Apartamento, bloco..." /></Field><Field label="Bairro" className="md:col-span-3"><Input value={form.neighborhood} onChange={(event) => set("neighborhood", event.target.value)} placeholder="Bairro" /></Field><Field label="Cidade" className="md:col-span-3"><Input value={form.city} onChange={(event) => set("city", event.target.value)} placeholder="Cidade" /></Field><Field label="UF" className="md:col-span-1"><Input maxLength={2} value={form.state} onChange={(event) => set("state", event.target.value.toUpperCase())} placeholder="SP" /></Field><Field label="CEP" className="md:col-span-2"><div className="flex gap-2"><Input inputMode="numeric" value={form.zipCode} onChange={(event) => set("zipCode", event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="00000-000" /><Button type="button" onClick={() => cepQuery.refetch()} disabled={form.zipCode.replace(/\D/g, "").length !== 8 || cepQuery.isFetching} variant="outline" className="border-cyan-400/25 bg-cyan-500/10 px-3 text-xs font-bold text-cyan-100 hover:bg-cyan-500/20">{cepQuery.isFetching ? "..." : "Buscar"}</Button></div>{cepQuery.error && <p className="mt-1 text-xs text-amber-200">{cepQuery.error.message}</p>}</Field><Field label="Ponto de referência" className="md:col-span-6"><Input value={form.referencePoint} onChange={(event) => set("referencePoint", event.target.value)} placeholder="Opcional" /></Field><Field label="Observações privadas" className="md:col-span-6"><textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Ex.: prefere banco traseiro, tem bagagem grande..." className="min-h-24 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/50" /></Field></div><div className="sticky bottom-2 z-10 mt-6 flex flex-col-reverse gap-2 rounded-2xl border border-white/10 bg-slate-950/95 p-3 backdrop-blur sm:flex-row sm:justify-end"><Button onClick={onCancel} variant="outline" className="h-11 border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">Cancelar</Button><Button onClick={onSave} disabled={saving} className="h-11 bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">{saving ? "Salvando..." : "Salvar passageiro"}</Button></div></div>; }
function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) { return <label className={`block ${className || ""}`}><span className="mb-1.5 block text-xs font-bold text-slate-300">{label}{required && <span className="ml-1 text-cyan-300">*</span>}</span>{children}</label>; }
function ClientProfile({ client, events, onBack, onEdit, onWhatsApp, onSchedule, onToggleFavorite, onDeactivate }: { client: any; events: any[]; onBack: () => void; onEdit: () => void; onWhatsApp: () => void; onSchedule: () => void; onToggleFavorite: () => void; onDeactivate: () => void }) { return <div className="space-y-4"><div className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="flex min-w-0 items-start gap-3"><button onClick={onBack} className="mt-0.5 rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/5">‹</button><div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-xl font-black text-slate-950">{String(client.name).charAt(0).toUpperCase()}</div><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate text-xl font-black text-white">{client.name}</h3>{Number(client.isFavorite) === 1 && <Star className="h-4 w-4 fill-amber-300 text-amber-300" />}</div><p className="mt-1 text-sm text-slate-400">{formatPhone(client.phone)} {client.city ? `• ${client.city}/${client.state || ""}` : ""}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300">{client.clientCode}</p></div></div><div className="flex flex-wrap gap-2"><Button onClick={onSchedule} className="h-10 bg-cyan-500 text-xs font-bold text-slate-950 hover:bg-cyan-400"><CalendarPlus className="mr-1.5 h-4 w-4" />Agendar</Button><Button onClick={onWhatsApp} variant="outline" className="h-10 border-emerald-400/20 bg-emerald-500/10 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"><Phone className="mr-1.5 h-4 w-4" />WhatsApp</Button><Button onClick={onEdit} variant="outline" className="h-10 border-white/15 bg-white/5 text-xs font-bold text-white hover:bg-white/10"><Edit3 className="mr-1.5 h-4 w-4" />Editar</Button></div></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Viagens" value="0" /><MetricCard label="Total pago" value={money(0)} /><MetricCard label="A receber" value={money(0)} /><MetricCard label="Próximo agendamento" value="—" /></div><div className="mt-5 flex flex-wrap gap-2"><button onClick={onToggleFavorite} className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20"><Heart className="mr-1 inline h-3.5 w-3.5" />{Number(client.isFavorite) === 1 ? "Remover favorito" : "Favoritar"}</button>{Number(client.isActive) === 1 && <button onClick={onDeactivate} className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-500/20">Desativar cliente</button>}</div></div><div className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Histórico do passageiro</p>{events.length === 0 ? <p className="mt-4 text-sm text-slate-400">Nenhuma movimentação registrada ainda.</p> : <div className="mt-4 space-y-3">{events.map((event: any) => <div key={event.id} className="border-l-2 border-cyan-400/30 pl-3"><p className="text-sm font-bold text-white">{event.message}</p><p className="mt-0.5 text-xs text-slate-500">{new Date(event.createdAt).toLocaleString("pt-BR")}</p></div>)}</div>}</div></div>; }
function MetricCard({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-black text-white">{value}</p></div>; }
