import { encodeWhatsappMessage } from "@shared/whatsappMessageText";
import { filterAdminScheduleAppointments } from "@/lib/adminScheduleAppointmentFilter";
import { trpc } from "@/lib/trpc";
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";
import "@/styles/h2-schedule-gamer.css";
import { CalendarClock, Plus, Trash2, ToggleLeft, ToggleRight, Save, FileText, CalendarDays, MessageSquare, List, MessageCircle, Copy, Check, Calendar, Pencil, RefreshCw, XCircle, CheckCircle, Palette, Sparkles, Activity, Clock3, Users, Monitor, Smartphone, ChevronRight, Eye, ShieldCheck } from "lucide-react";

// Helper function to get local time with timezone offset (GMT-3) — v2
function getLocalTime() {
  const now = new Date();
  // Subtract 3 hours to convert from UTC to GMT-3
  const localDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const hours = String(localDate.getUTCHours()).padStart(2, '0');
  const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
    totalMinutes: parseInt(hours) * 60 + parseInt(minutes)
  };
}

type Tab = "slots" | "appointments" | "finalizados" | "templates" | "visual" | "messages";

const SCHEDULE_SECTIONS: Record<Tab, { title: string; description: string }> = {
  slots: { title: "Central de horários", description: "Crie e gerencie vagas por data, hora e modelo." },
  appointments: { title: "Agendamentos ativos", description: "Acompanhe clientes aguardando e horários confirmados." },
  finalizados: { title: "Histórico concluído", description: "Consulte e gerencie atendimentos encerrados." },
  templates: { title: "Modelos de atendimento", description: "Padronize procedimentos e instruções sem alterar os pedidos." },
  visual: { title: "Visual gamer e banners", description: "Personalize cores e textos com prévia da tela do cliente." },
  messages: { title: "Central de mensagens", description: "Configure WhatsApp, e-mail e instruções de confirmação." },
};

export default function AdminSchedule() {
  const [tab, setTab] = useState<Tab>("slots");
  const { data: cfg } = trpc.schedule.getConfig.useQuery(undefined, { staleTime: 30_000 });
  const section = SCHEDULE_SECTIONS[tab];

  return (
    <div
      className="h2-schedule-adm min-h-screen text-white"
      style={{ "--sg-accent": cfg?.accentColor || "#9964ff" } as React.CSSProperties}
    >
      <AdminHeader icon={<CalendarClock className="w-5 h-5" />} title="Agendamentos" />
      <main className="sg-console">
        <header className="sg-console-hero" aria-label="Central administrativa de agendamentos">
          <div className="sg-eyebrow"><span className="sg-signal" /> H2 Colombiano / Schedule Command Center</div>
          <h1>Controle total de agendamentos<span style={{ color: "var(--sg-cyan)" }}>.</span></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Horários, clientes, modelos e banners em um único painel. A página do cliente utiliza as mesmas configurações salvas aqui.
          </p>
          <div className="sg-console-actions">
            <button className="sg-action sg-action-primary" type="button" onClick={() => setTab("slots")}>
              <Plus className="h-4 w-4" /> Gerenciar horários
            </button>
            <button className="sg-action" type="button" onClick={() => setTab("visual")}>
              <Palette className="h-4 w-4" /> Editar banners
            </button>
            <button className="sg-action" type="button" onClick={() => setTab("appointments")}>
              <Users className="h-4 w-4" /> Ver agendados <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        <ScheduleCommandStats />

        <nav className="sg-nav" role="tablist" aria-label="Seções dos agendamentos">
          <TabBtn active={tab === "slots"} onClick={() => setTab("slots")} icon={<CalendarDays className="h-4 w-4" />} label="Horários" />
          <TabBtn active={tab === "appointments"} onClick={() => setTab("appointments")} icon={<List className="h-4 w-4" />} label="Agendados" />
          <TabBtn active={tab === "finalizados"} onClick={() => setTab("finalizados")} icon={<Check className="h-4 w-4" />} label="Finalizados" />
          <TabBtn active={tab === "templates"} onClick={() => setTab("templates")} icon={<FileText className="h-4 w-4" />} label="Modelos" />
          <TabBtn active={tab === "visual"} onClick={() => setTab("visual")} icon={<Palette className="h-4 w-4" />} label="Visual / Banners" />
          <TabBtn active={tab === "messages"} onClick={() => setTab("messages")} icon={<MessageSquare className="h-4 w-4" />} label="Mensagens" />
        </nav>

        <section className="sg-content" role="tabpanel" aria-label={section.title}>
          <div className="sg-content-heading">
            <div>
              <h2>{section.title}</h2>
              <p className="mt-1">{section.description}</p>
            </div>
            <span className="sg-eyebrow"><Activity className="h-4 w-4" /> Painel integrado</span>
          </div>
          {tab === "slots" && <SlotsTab />}
          {tab === "appointments" && <AppointmentsTab />}
          {tab === "finalizados" && <FinalizadosTab />}
          {tab === "templates" && <TemplatesTab />}
          {tab === "visual" && <ScheduleVisualTab />}
          {tab === "messages" && <MessagesTab />}
        </section>
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className="sg-nav-tab">
      {icon}{label}
    </button>
  );
}

function ScheduleCommandStats() {
  const { data: appointments, isLoading: apptsLoading } = trpc.schedule.listAppointments.useQuery(undefined, {
    staleTime: 20_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const { data: slots, isLoading: slotsLoading } = trpc.schedule.listSlots.useQuery(undefined, {
    staleTime: 20_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const today = getLocalTime().date;
  const pending = appointments?.filter(a => a.status === "pending").length;
  const confirmed = appointments?.filter(a => a.status === "confirmed").length;
  const appointmentsToday = appointments?.filter(a => a.status === "confirmed" && a.slotDate === today).length;
  const freeSpots = slots?.filter(s => s.status === "available").reduce((total, s) => total + Math.max(0, s.capacity - s.bookedCount), 0);
  const metrics = [
    { label: "Aguardando", value: pending, loading: apptsLoading, icon: <Clock3 className="h-4 w-4" />, color: "#ff709a", footer: "Pendente de escolha" },
    { label: "Confirmados", value: confirmed, loading: apptsLoading, icon: <CheckCircle className="h-4 w-4" />, color: "#56eeb0", footer: "Data e hora reservadas" },
    { label: "Atendimentos hoje", value: appointmentsToday, loading: apptsLoading, icon: <CalendarClock className="h-4 w-4" />, color: "#52dafa", footer: "Confirmados para hoje" },
    { label: "Vagas livres", value: freeSpots, loading: slotsLoading, icon: <Activity className="h-4 w-4" />, color: "#b58aff", footer: "Somente horários ativos" },
  ];
  return (
    <div className="sg-stats" aria-label="Resumo atualizado dos agendamentos">
      {metrics.map(metric => (
        <div key={metric.label} className="sg-stat" style={{ "--stat-color": metric.color } as React.CSSProperties}>
          <div className="sg-stat-label" style={{ color: metric.color }}>{metric.icon}<span>{metric.label}</span></div>
          <strong className="sg-stat-value">{metric.loading || metric.value === undefined ? "—" : metric.value}</strong>
          <p className="sg-stat-footer">{metric.footer}</p>
        </div>
      ))}
    </div>
  );
}

function ScheduleVisualTab() {
  const utils = trpc.useUtils();
  const { data: cfg, isLoading } = trpc.schedule.getConfig.useQuery(undefined, { refetchOnWindowFocus: true });
  const [form, setForm] = useState<{ title: string; introMessage: string; accentColor: string } | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"pending" | "confirmed">("pending");
  const [previewSize, setPreviewSize] = useState<"mobile" | "desktop">("mobile");
  useEffect(() => {
    if (!cfg) return;
    setForm({
      title: cfg.title || "",
      introMessage: cfg.introMessage || "",
      accentColor: cfg.accentColor || "#9964ff",
    });
  }, [cfg]);
  const save = trpc.schedule.updateConfig.useMutation({
    onSuccess: async () => {
      toast.success("Visual salvo. O cliente receberá o banner atualizado.");
      await utils.schedule.getConfig.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  if (isLoading || !form) return <div className="sg-editor-panel text-sm text-slate-300">Carregando configurações visuais...</div>;
  const set = (key: keyof typeof form, value: string) => setForm(current => current ? { ...current, [key]: value } : current);
  const validColor = /^#[0-9a-f]{6}$/i.test(form.accentColor) ? form.accentColor : "#9964ff";
  const dirty = form.title !== (cfg?.title || "") || form.introMessage !== (cfg?.introMessage || "") || validColor !== (cfg?.accentColor || "#9964ff");
  const presets = ["#9964ff", "#00bdd8", "#ea4bff", "#008a77", "#fa7148", "#4285ff"];
  return (
    <div className="sg-editor-grid">
      <div className="sg-editor-panel">
        <div className="sg-eyebrow"><Sparkles className="h-4 w-4" /> Central de identidade visual</div>
        <h3 className="mt-3 mb-2 text-xl font-black text-white">Personalizar a página do cliente</h3>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">
          Ajuste o banner e a cor de destaque. O aviso pendente continua vermelho e a confirmação verde para identificar cada situação.
        </p>
        <label className="sg-field">
          <span className="sg-field-label">Título principal do banner</span>
          <input type="text" maxLength={160} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Agende seu atendimento" />
        </label>
        <label className="sg-field">
          <span className="sg-field-label">Texto de apresentação</span>
          <textarea rows={4} maxLength={1000} value={form.introMessage} onChange={e => set("introMessage", e.target.value)} placeholder="Escolha abaixo a data e o horário para o seu atendimento." />
        </label>
        <div className="sg-field">
          <span className="sg-field-label">Cor principal dos botões e detalhes</span>
          <div className="sg-swatches" role="group" aria-label="Paletas de destaque">
            {presets.map(color => (
              <button key={color} type="button" aria-label={"Escolher cor " + color} aria-pressed={validColor.toLowerCase() === color.toLowerCase()} className="sg-swatch" style={{ background: color }} onClick={() => set("accentColor", color)} />
            ))}
          </div>
          <label className="flex items-center gap-3 text-xs text-slate-300">
            <input aria-label="Escolher outra cor" type="color" value={validColor} onChange={e => set("accentColor", e.target.value)} className="h-11 w-16 cursor-pointer rounded-lg border border-white/20 bg-transparent p-1" />
            Cor personalizada: <span className="font-mono text-white">{validColor.toUpperCase()}</span>
          </label>
        </div>
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-xs leading-relaxed text-slate-300">
          <ShieldCheck className="mb-1 inline h-4 w-4 text-cyan-300" /> A personalização altera apenas a aparência e os textos públicos. Datas, reservas, limites e regras do atendimento continuam iguais.
        </div>
        <button type="button" disabled={save.isPending || !dirty} onClick={() => save.mutate({ title: form.title, introMessage: form.introMessage, accentColor: validColor })} className="sg-action sg-action-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-45">
          <Save className="h-4 w-4" /> {save.isPending ? "Salvando..." : dirty ? "Salvar visual e sincronizar" : "Visual salvo e sincronizado"}
        </button>
      </div>
      <div className="sg-preview-shell" style={{ "--sg-accent": validColor } as React.CSSProperties}>
        <div className="sg-eyebrow"><Eye className="h-4 w-4" /> Prévia em tempo real</div>
        <p className="mt-2 text-sm text-slate-400">Confira o banner antes de salvar. Os dados do exemplo não são de clientes reais.</p>
        <div className="sg-preview-toggles" role="group" aria-label="Prévia dos estados do agendamento">
          <button type="button" aria-pressed={previewStatus === "pending"} className="sg-preview-toggle" onClick={() => setPreviewStatus("pending")}>Pendente</button>
          <button type="button" aria-pressed={previewStatus === "confirmed"} className="sg-preview-toggle" onClick={() => setPreviewStatus("confirmed")}>Confirmado</button>
        </div>
        <div className="sg-preview-toggles" role="group" aria-label="Largura da prévia">
          <button type="button" aria-pressed={previewSize === "mobile"} className="sg-preview-toggle" onClick={() => setPreviewSize("mobile")}><Smartphone className="mr-1 inline h-4 w-4" /> Celular</button>
          <button type="button" aria-pressed={previewSize === "desktop"} className="sg-preview-toggle" onClick={() => setPreviewSize("desktop")}><Monitor className="mr-1 inline h-4 w-4" /> Computador</button>
        </div>
        <div className={"sg-phone-preview" + (previewSize === "desktop" ? " sg-preview-wide" : "")}>
          <div className="sg-preview-banner" style={previewStatus === "confirmed"
            ? { "--banner-border": "rgba(81, 244, 170, .5)", "--banner-bg": "#0e302c" } as React.CSSProperties
            : { "--banner-border": "rgba(255, 110, 141, .5)", "--banner-bg": "#301a28" } as React.CSSProperties}>
            <div className="sg-preview-status" style={{ color: previewStatus === "confirmed" ? "#66f0b2" : "#ff859d" }}>
              {previewStatus === "confirmed" ? "✓ AGENDAMENTO CONFIRMADO" : "● AGENDAMENTO DISPONÍVEL"}
            </div>
            <h3>{previewStatus === "confirmed" ? "Atendimento agendado!" : (form.title.trim() || "Agende seu atendimento")}</h3>
            <p>{previewStatus === "confirmed" ? "Seu atendimento está confirmado. Confira os detalhes abaixo." : (form.introMessage.trim() || "Escolha o melhor dia e horário para o atendimento.")}</p>
            {previewStatus === "confirmed" && <p className="mt-2 font-bold text-emerald-300">Data e horário: exemplo ilustrativo</p>}
            {previewStatus === "pending" && <div className="sg-preview-sample"><span>Escolher dia</span><span>Selecionar horário</span><span>Confirmar</span></div>}
            <div className="sg-preview-cta">{previewStatus === "confirmed" ? "VER AGENDAMENTO" : "ESCOLHER DATA E HORÁRIO"}</div>
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">Após salvar, o cliente usa a nova configuração ao abrir o agendamento ou na próxima sincronização automática.</p>
      </div>
    </div>
  );
}

// ─────────────────── HORÁRIOS (SLOTS) ───────────────────
function SlotsTab() {
  const utils = trpc.useUtils();
  const { data: slots, isLoading } = trpc.schedule.listSlots.useQuery();
  const { data: templates } = trpc.schedule.listTemplates.useQuery();
  const [dates, setDates] = useState<string[]>([""]);
  const [times, setTimes] = useState<string>("09:00, 09:30, 10:00, 10:30");
  const [capacity, setCapacity] = useState(1);
  const [templateId, setTemplateId] = useState<string>(""); // "" = geral

  // Mapa id -> nome do modelo, para exibir nos horários
  const templateName = (id: number | null | undefined) => {
    if (id === null || id === undefined) return null;
    return (templates || []).find(t => t.id === id)?.name ?? `Modelo #${id}`;
  };

  const createMut = trpc.schedule.createSlots.useMutation({
    onSuccess: (r) => { toast.success(`${r.created} horário(s) criado(s)`); utils.schedule.listSlots.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const delMut = trpc.schedule.deleteSlot.useMutation({
    onSuccess: () => { utils.schedule.listSlots.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const toggleMut = trpc.schedule.toggleSlot.useMutation({
    onSuccess: () => { utils.schedule.listSlots.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const setTplMut = trpc.schedule.setSlotTemplate.useMutation({
    onSuccess: () => { toast.success("Modelo do horário atualizado"); utils.schedule.listSlots.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // Agrupar slots por data
  const grouped = useMemo(() => {
    const g: Record<string, typeof slots> = {};
    (slots || []).forEach(s => { (g[s.slotDate] ||= [] as any).push(s); });
    return g;
  }, [slots]);

  function handleCreate() {
    const validDates = dates.map(d => d.trim()).filter(Boolean);
    const validTimes = times.split(",").map(t => t.trim()).filter(Boolean);
    if (validDates.length === 0) return toast.error("Adicione ao menos uma data");
    if (validTimes.length === 0) return toast.error("Adicione ao menos um horário");
    createMut.mutate({ dates: validDates, times: validTimes, capacity, templateId: templateId ? Number(templateId) : null });
  }

  return (
    <div className="space-y-5">
      <div className="bg-black/40 border border-fuchsia-500/30 rounded-2xl p-4 md:p-5">
        <h2 className="text-base font-bold mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-fuchsia-400" /> Adicionar horários disponíveis</h2>
        <p className="text-xs text-white/50 mb-3">Escolha as datas e digite os horários. O sistema cria um horário para cada combinação de data + hora.</p>

        <label className="block text-xs font-semibold text-white/70 mb-1">Datas</label>
        {dates.map((d, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input type="date" value={d} onChange={e => { const n = [...dates]; n[i] = e.target.value; setDates(n); }}
              className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
            {dates.length > 1 && (
              <button onClick={() => setDates(dates.filter((_, idx) => idx !== i))} className="px-2 bg-red-600/20 border border-red-500/30 rounded-lg text-red-400"><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
        ))}
        <button onClick={() => setDates([...dates, ""])} className="text-xs text-fuchsia-400 hover:text-fuchsia-300 mb-3">+ adicionar outra data</button>

        <label className="block text-xs font-semibold text-white/70 mb-1">Horários (separados por vírgula)</label>
        <input value={times} onChange={e => setTimes(e.target.value)} placeholder="09:00, 09:30, 10:00"
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm mb-3" />

        <label className="block text-xs font-semibold text-white/70 mb-1">Vagas por horário</label>
        <input type="number" min={1} value={capacity} onChange={e => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-32 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm mb-4" />

        <label className="block text-xs font-semibold text-white/70 mb-1">Para qual modelo são estes horários?</label>
        <select value={templateId} onChange={e => setTemplateId(e.target.value)}
          className="w-full md:w-80 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm mb-1 [&>option]:bg-[#1a1a2e]">
          <option value="">Geral (vale para qualquer modelo)</option>
          {(templates || []).map(t => (<option key={t.id} value={String(t.id)}>{t.name}</option>))}
        </select>
        <p className="text-[11px] text-white/40 mb-4">Cada modelo tem horários próprios. "Geral" aparece para todos os agendamentos.</p>

        <div>
          <button onClick={handleCreate} disabled={createMut.isPending}
            className="bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {createMut.isPending ? "Criando..." : "Criar horários"}
          </button>
        </div>
      </div>

      <div className="bg-black/40 border border-white/10 rounded-2xl p-4 md:p-5">
        <h2 className="text-base font-bold mb-3">Horários cadastrados</h2>
        {isLoading ? <p className="text-white/50 text-sm">Carregando...</p> :
          Object.keys(grouped).length === 0 ? <p className="text-white/50 text-sm">Nenhum horário cadastrado ainda.</p> :
          <div className="space-y-4">
            {Object.entries(grouped).map(([date, daySlots]) => (
              <div key={date}>
                <p className="text-sm font-semibold text-fuchsia-300 mb-2">{formatDate(date)}</p>
                <div className="flex flex-wrap gap-2">
                  {(daySlots || []).map(s => {
                    const full = s.bookedCount >= s.capacity;
                    return (
                      <div key={s.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${s.status === "disabled" ? "bg-white/5 border-white/10 text-white/40" : full ? "bg-red-600/15 border-red-500/30 text-red-300" : "bg-green-600/15 border-green-500/30 text-green-300"}`}>
                        <span className="font-semibold">{s.slotTime}</span>
                        <span className="text-[10px] opacity-70">{s.bookedCount}/{s.capacity}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.templateId ? "bg-fuchsia-500/20 text-fuchsia-200" : "bg-white/10 text-white/50"}`}>{templateName(s.templateId) ?? "Geral"}</span>
                        <select
                          value={s.templateId ? String(s.templateId) : ""}
                          onChange={e => setTplMut.mutate({ id: s.id, templateId: e.target.value ? Number(e.target.value) : null })}
                          title="Alterar modelo deste horário"
                          className="bg-transparent border border-white/15 rounded px-1 py-0.5 text-[10px] text-white/70 [&>option]:bg-[#1a1a2e]">
                          <option value="">Geral</option>
                          {(templates || []).map(t => (<option key={t.id} value={String(t.id)}>{t.name}</option>))}
                        </select>
                        <button onClick={() => toggleMut.mutate({ id: s.id, status: s.status === "disabled" ? "available" : "disabled" })} title={s.status === "disabled" ? "Reativar" : "Desativar"}>
                          {s.status === "disabled" ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                        </button>
                        <button onClick={() => delMut.mutate({ id: s.id })} title="Excluir"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>}
      </div>
    </div>
  );
}

// ─────────────────── MODELOS PRONTOS ───────────────────
function TemplatesTab() {
  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.schedule.listTemplates.useQuery();
  const [name, setName] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [scheduledWhatsappMessage, setScheduledWhatsappMessage] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editServiceName, setEditServiceName] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editEmailSubject, setEditEmailSubject] = useState("");
  const [editEmailMessage, setEditEmailMessage] = useState("");
  const [editWhatsappMessage, setEditWhatsappMessage] = useState("");
  const [editScheduledWhatsappMessage, setEditScheduledWhatsappMessage] = useState("");

  const createMut = trpc.schedule.createTemplate.useMutation({
    onSuccess: () => { toast.success("Modelo criado"); setName(""); setServiceName(""); setInstructions(""); setEmailSubject(""); setEmailMessage(""); setWhatsappMessage(""); setScheduledWhatsappMessage(""); utils.schedule.listTemplates.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.schedule.updateTemplate.useMutation({
    onSuccess: () => { toast.success("Modelo atualizado"); setEditingId(null); utils.schedule.listTemplates.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const delMut = trpc.schedule.deleteTemplate.useMutation({
    onSuccess: () => { utils.schedule.listTemplates.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  function startEdit(t: { id: number; name: string; serviceName?: string | null; instructions?: string | null; emailSubject?: string | null; emailMessage?: string | null; whatsappMessage?: string | null; scheduledWhatsappMessage?: string | null }) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditServiceName(t.serviceName ?? "");
    setEditInstructions(t.instructions ?? "");
    setEditEmailSubject(t.emailSubject ?? "");
    setEditEmailMessage(t.emailMessage ?? "");
    setEditWhatsappMessage(t.whatsappMessage ?? "");
    setEditScheduledWhatsappMessage((t as any).scheduledWhatsappMessage ?? "");
  }

  return (
    <div className="space-y-5">
      <div className="bg-black/40 border border-fuchsia-500/30 rounded-2xl p-4 md:p-5">
        <h2 className="text-base font-bold mb-1 flex items-center gap-2"><Plus className="w-4 h-4 text-fuchsia-400" /> Criar modelo pronto</h2>
        <p className="text-xs text-white/50 mb-3">Crie modelos reutilizáveis (ex.: "Agendamento para foto de perfil"). Depois é só aplicar com um clique dentro de qualquer pedido.</p>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do modelo (ex: Foto de perfil)"
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm mb-2" />
        <input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="O que será agendado (ex: Sessão de foto de perfil)"
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm mb-2" />
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Instruções para o cliente (opcional)" rows={3}
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm mb-2" />
        <p className="text-xs text-fuchsia-300 font-semibold mt-3 mb-1">📧 Texto do E-mail (deixe vazio para usar o padrão global)</p>
        <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Assunto do e-mail (ex: Agende seu atendimento)"
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm mb-2" />
        <textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} placeholder="Texto do e-mail para este modelo..." rows={3}
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm mb-2" />
        <p className="text-xs text-green-400 font-semibold mt-2 mb-1">📋 WhatsApp — Enviar link para agendar (sem horário). Use &#123;nome&#125;, &#123;link&#125;</p>
        <textarea value={whatsappMessage} onChange={e => setWhatsappMessage(e.target.value)} placeholder="Texto do WhatsApp para enviar o link de agendamento..." rows={3}
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm mb-2" />
        <p className="text-xs text-yellow-400 font-semibold mt-2 mb-1">📅 WhatsApp — Lembrete com horário confirmado. Use &#123;nome&#125;, &#123;data&#125;, &#123;hora&#125;, &#123;servico&#125;</p>
        <textarea value={scheduledWhatsappMessage} onChange={e => setScheduledWhatsappMessage(e.target.value)} placeholder="Ex: Olá {nome}! Seu atendimento é dia {data} às {hora}..." rows={3}
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm mb-3" />
        <button onClick={() => { if (!name.trim()) return toast.error("Informe o nome do modelo"); createMut.mutate({ name, serviceName, instructions, emailSubject: emailSubject || undefined, emailMessage: emailMessage || undefined, whatsappMessage: whatsappMessage || undefined, scheduledWhatsappMessage: scheduledWhatsappMessage || undefined }); }}
          disabled={createMut.isPending}
          className="bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          {createMut.isPending ? "Salvando..." : "Salvar modelo"}
        </button>
      </div>

      <div className="bg-black/40 border border-white/10 rounded-2xl p-4 md:p-5">
        <h2 className="text-base font-bold mb-3">Modelos salvos</h2>
        {isLoading ? <p className="text-white/50 text-sm">Carregando...</p> :
          (templates || []).length === 0 ? <p className="text-white/50 text-sm">Nenhum modelo criado ainda.</p> :
          <div className="space-y-2">
            {(templates || []).map(t => (
              <div key={t.id} className="bg-white/5 border border-white/10 rounded-lg p-3">
                {editingId === t.id ? (
                  <div className="space-y-2">
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome do modelo"
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
                    <input value={editServiceName} onChange={e => setEditServiceName(e.target.value)} placeholder="O que será agendado"
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
                    <textarea value={editInstructions} onChange={e => setEditInstructions(e.target.value)} placeholder="Instruções para o cliente (opcional)" rows={3}
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
                    <p className="text-xs text-fuchsia-300 font-semibold pt-1">📧 Texto do E-mail (vazio = usa o padrão global)</p>
                    <input value={editEmailSubject} onChange={e => setEditEmailSubject(e.target.value)} placeholder="Assunto do e-mail"
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
                    <textarea value={editEmailMessage} onChange={e => setEditEmailMessage(e.target.value)} placeholder="Texto do e-mail para este modelo..." rows={3}
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
                    <p className="text-xs text-green-400 font-semibold pt-1">📋 WhatsApp — Enviar link para agendar (sem horário). Use &#123;nome&#125;, &#123;link&#125;</p>
                    <textarea value={editWhatsappMessage} onChange={e => setEditWhatsappMessage(e.target.value)} placeholder="Texto do WhatsApp para enviar o link de agendamento..." rows={3}
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
                    <p className="text-xs text-yellow-400 font-semibold pt-1">📅 WhatsApp — Lembrete com horário confirmado. Use &#123;nome&#125;, &#123;data&#125;, &#123;hora&#125;, &#123;servico&#125;</p>
                    <textarea value={editScheduledWhatsappMessage} onChange={e => setEditScheduledWhatsappMessage(e.target.value)} placeholder="Ex: Olá {nome}! Seu atendimento é dia {data} às {hora}..." rows={3}
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm" />
                    <div className="flex gap-2">
                      <button onClick={() => updateMut.mutate({ id: t.id, name: editName, serviceName: editServiceName, instructions: editInstructions, emailSubject: editEmailSubject || null, emailMessage: editEmailMessage || null, whatsappMessage: editWhatsappMessage || null, scheduledWhatsappMessage: editScheduledWhatsappMessage || null })}
                        disabled={updateMut.isPending}
                        className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-500 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                        {updateMut.isPending ? "Salvando..." : "Salvar"}
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t.name}</p>
                      {t.serviceName && <p className="text-xs text-fuchsia-300">{t.serviceName}</p>}
                      {t.instructions && <p className="text-xs text-white/50 mt-1 whitespace-pre-line">{t.instructions}</p>}
                      {(t as any).emailMessage && <p className="text-xs text-fuchsia-400/70 mt-1">📧 E-mail personalizado</p>}
                      {(t as any).whatsappMessage && <p className="text-xs text-green-400/70">📋 WhatsApp — link configurado</p>}
                      {(t as any).scheduledWhatsappMessage && <p className="text-xs text-yellow-400/70">📅 WhatsApp — horário confirmado configurado</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => startEdit({ ...t, emailSubject: (t as any).emailSubject, emailMessage: (t as any).emailMessage, whatsappMessage: (t as any).whatsappMessage, scheduledWhatsappMessage: (t as any).scheduledWhatsappMessage })} title="Editar" className="text-blue-400 hover:text-blue-300 p-1"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => delMut.mutate({ id: t.id })} title="Excluir" className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>}
      </div>
    </div>
  );
}

// ─────────────────── EDITOR DE SEÇÕES ───────────────────
type SectionItem = { type: 'text' | 'item' | 'subitem'; emoji: string; content: string };
type Section = { title: string; titleEmoji: string; items: SectionItem[] };

const ITEM_EMOJIS = ['❌', '✅', '🔄', '⚡', '📲', '💬', '🔒', '🔴', '🟢', '🟡'];
const SECTION_EMOJIS = ['📸', '📱', '🏠', '⚠️', '📋', '🔔', '💡', '📌', '🎯', '🔑', '📝', '🛡️', '⭐', '🚨', '📢'];

function parseTextToSections(text: string): Section[] {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const sectionEmojis = ['📸', '📱', '⚠️', '🏠', '📋', '🔔', '💡', '📌', '🎯', '🔑', '📝', '🛡️', '⭐', '🚨', '📢'];
  const itemEmojis = ['❌', '✅', '🔄', '⚡', '🔒', '🔓', '📲', '💬', '🖼️', '🔴', '🟢', '🟡', '🔵', '⚫', '⚪'];
  const sections: Section[] = [];
  let current: Section = { title: '', titleEmoji: '', items: [] };
  for (const line of lines) {
    const isSectionTitle = sectionEmojis.some(e => line.startsWith(e)) || (line.toUpperCase() === line && line.length > 5 && !line.startsWith('•'));
    const isItem = itemEmojis.some(e => line.startsWith(e));
    const isSubItem = line.startsWith('•');
    if (isSectionTitle) {
      if (current.title || current.items.length > 0) sections.push(current);
      const emoji = sectionEmojis.find(e => line.startsWith(e)) || '';
      current = { title: line.replace(emoji, '').trim(), titleEmoji: emoji, items: [] };
    } else if (isItem) {
      const emoji = itemEmojis.find(e => line.startsWith(e)) || '❌';
      current.items.push({ type: 'item', emoji, content: line.replace(emoji, '').trim() });
    } else if (isSubItem) {
      current.items.push({ type: 'subitem', emoji: '•', content: line.replace(/^•\s*/, '') });
    } else {
      current.items.push({ type: 'text', emoji: '', content: line });
    }
  }
  if (current.title || current.items.length > 0) sections.push(current);
  return sections;
}

function sectionsToText(sections: Section[]): string {
  return sections.map(sec => {
    const titleLine = sec.titleEmoji ? `${sec.titleEmoji} ${sec.title}` : sec.title;
    const itemLines = sec.items.map(item => {
      if (item.type === 'subitem') return `• ${item.content}`;
      if (item.type === 'item') return `${item.emoji} ${item.content}`;
      return item.content;
    });
    return [titleLine, ...itemLines].filter(Boolean).join('\n');
  }).join('\n\n');
}

function SectionEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [sections, setSections] = useState<Section[]>(() => parseTextToSections(value));
  const [mode, setMode] = useState<'visual' | 'raw'>('visual');
  const isFirstRender = useRef(true);

  // Sync para fora (skip no primeiro render para não causar loop)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (mode === 'visual') onChange(sectionsToText(sections));
  }, [sections, mode]);

  const updateSection = (si: number, patch: Partial<Section>) =>
    setSections(prev => prev.map((s, i) => i === si ? { ...s, ...patch } : s));

  const updateItem = (si: number, ii: number, patch: Partial<SectionItem>) =>
    setSections(prev => prev.map((s, i) => i === si ? { ...s, items: s.items.map((it, j) => j === ii ? { ...it, ...patch } : it) } : s));

  const removeItem = (si: number, ii: number) =>
    setSections(prev => prev.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s));

  const removeSection = (si: number) => setSections(prev => prev.filter((_, i) => i !== si));

  const addSection = () => setSections(prev => [...prev, { title: 'Nova Seção', titleEmoji: '📋', items: [] }]);

  const addItem = (si: number, type: 'item' | 'subitem' | 'text') =>
    setSections(prev => prev.map((s, i) => i === si ? { ...s, items: [...s.items, { type, emoji: type === 'item' ? '❌' : '•', content: '' }] } : s));

  const moveSection = (si: number, dir: -1 | 1) => {
    const arr = [...sections];
    const ni = si + dir;
    if (ni < 0 || ni >= arr.length) return;
    [arr[si], arr[ni]] = [arr[ni], arr[si]];
    setSections(arr);
  };

  if (mode === 'raw') {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-white/40">Modo texto — edite diretamente</p>
          <button type="button" onClick={() => { setSections(parseTextToSections(value)); setMode('visual'); }}
            className="text-xs text-fuchsia-400 hover:text-fuchsia-300 underline">← Voltar ao editor visual</button>
        </div>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={14}
          className="w-full bg-[#1a1a2e] border border-white/10 focus:border-fuchsia-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-all resize-y leading-relaxed font-mono"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-white/40">Editor visual — cada seção vira um card separado para o cliente</p>
        <button type="button" onClick={() => setMode('raw')} className="text-xs text-white/30 hover:text-white/60 underline">Editar como texto</button>
      </div>

      <div className="space-y-3">
        {sections.map((sec, si) => (
          <div key={si} className="rounded-xl border border-white/10 bg-[#0d0d1f] overflow-hidden">
            {/* Header da seção */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-white/4 border-b border-white/8">
              <select
                value={sec.titleEmoji}
                onChange={e => updateSection(si, { titleEmoji: e.target.value })}
                className="bg-[#1a1a2e] border border-white/10 rounded-lg px-2 py-1 text-base outline-none cursor-pointer"
              >
                {SECTION_EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <input
                value={sec.title}
                onChange={e => updateSection(si, { title: e.target.value })}
                placeholder="Título da seção"
                className="flex-1 bg-transparent text-sm font-bold text-white placeholder-white/30 outline-none"
              />
              <div className="flex items-center gap-1 ml-auto">
                <button type="button" onClick={() => moveSection(si, -1)} disabled={si === 0}
                  className="w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-white/70 disabled:opacity-20 text-xs">↑</button>
                <button type="button" onClick={() => moveSection(si, 1)} disabled={si === sections.length - 1}
                  className="w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-white/70 disabled:opacity-20 text-xs">↓</button>
                <button type="button" onClick={() => removeSection(si)}
                  className="w-6 h-6 flex items-center justify-center rounded text-red-400/50 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Itens da seção */}
            <div className="p-3 space-y-2">
              {sec.items.map((item, ii) => (
                <div key={ii} className={`flex items-start gap-2 ${item.type === 'subitem' ? 'ml-5' : ''}`}>
                  {item.type === 'item' && (
                    <select
                      value={item.emoji}
                      onChange={e => updateItem(si, ii, { emoji: e.target.value })}
                      className="bg-[#1a1a2e] border border-white/10 rounded-lg px-1.5 py-1 text-base outline-none cursor-pointer shrink-0"
                    >
                      {ITEM_EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  )}
                  {item.type === 'subitem' && (
                    <span className="text-white/30 text-sm mt-2 shrink-0">•</span>
                  )}
                  <input
                    value={item.content}
                    onChange={e => updateItem(si, ii, { content: e.target.value })}
                    placeholder={item.type === 'subitem' ? 'Sub-item...' : item.type === 'text' ? 'Texto...' : 'Descrição do item...'}
                    className="flex-1 bg-[#1a1a2e] border border-white/8 focus:border-white/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/25 outline-none transition-all"
                  />
                  <button type="button" onClick={() => removeItem(si, ii)}
                    className="w-6 h-6 flex items-center justify-center rounded text-red-400/40 hover:text-red-400 shrink-0 mt-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {/* Botões para adicionar itens */}
              <div className="flex items-center gap-2 pt-1">
                <button type="button" onClick={() => addItem(si, 'item')}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/8 rounded-lg px-2.5 py-1.5 transition-all">
                  <Plus className="w-3 h-3" /> Item
                </button>
                <button type="button" onClick={() => addItem(si, 'subitem')}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/8 rounded-lg px-2.5 py-1.5 transition-all">
                  <Plus className="w-3 h-3" /> Sub-item
                </button>
                <button type="button" onClick={() => addItem(si, 'text')}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/8 rounded-lg px-2.5 py-1.5 transition-all">
                  <Plus className="w-3 h-3" /> Texto
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addSection}
        className="mt-3 w-full flex items-center justify-center gap-2 border border-dashed border-white/15 hover:border-fuchsia-500/40 rounded-xl py-3 text-sm text-white/40 hover:text-fuchsia-300 transition-all"
      >
        <Plus className="w-4 h-4" /> Adicionar nova seção
      </button>
    </div>
  );
}

// ─────────────────── SMART TEXTAREA ───────────────────
function SmartTextarea({
  value, onChange, rows = 4, placeholder, vars = [], className = ''
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  vars?: { label: string; value: string; color?: string }[];
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const insertVar = (v: string) => {
    const el = ref.current;
    if (!el) { onChange(value + v); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + v + value.slice(end);
    onChange(next);
    // Reposiciona o cursor após a variável inserida
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + v.length, start + v.length);
    });
  };

  return (
    <div>
      {vars.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {vars.map(v => (
            <button
              key={v.value}
              type="button"
              onClick={() => insertVar(v.value)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border transition-all hover:scale-105 active:scale-95"
              style={{
                background: `${v.color || '#8b5cf6'}15`,
                borderColor: `${v.color || '#8b5cf6'}40`,
                color: v.color || '#c4b5fd'
              }}
            >
              <span className="opacity-60">+</span> {v.label}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`w-full bg-[#1a1a2e] border border-white/10 focus:border-white/25 focus:ring-1 focus:ring-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-all resize-none leading-relaxed ${className}`}
      />
      <div className="flex justify-end mt-1">
        <span className="text-[10px] text-white/20">{value.length} caracteres</span>
      </div>
    </div>
  );
}

// ─────────────────── MENSAGENS / CONFIG — componentes auxiliares (FORA do MessagesTab para evitar remount) ───────────────────
function MsgSectionCard({ color, icon, title, subtitle, children }: { color: string; icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-[#0d0d1f] overflow-hidden" style={{ borderColor: `${color}30` }}>
      <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: `${color}20`, background: `${color}08` }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: `${color}99` }}>{subtitle}</p>}
        </div>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

function MsgField({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">{label}</label>
      {hint && <div className="mb-2">{hint}</div>}
      {children}
    </div>
  );
}

function MsgVarBadge({ v }: { v: string }) {
  return <code className="inline-block px-2 py-0.5 rounded-md text-[11px] font-mono bg-white/8 border border-white/10 text-amber-300 mr-1">{v}</code>;
}

function MessagesTab() {
  const utils = trpc.useUtils();
  const { data: cfg, isLoading } = trpc.schedule.getConfig.useQuery(undefined, { staleTime: Infinity, refetchOnWindowFocus: false });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const formInitialized = useRef(false);

  // Inicializa o form com os dados do banco quando carregarem (apenas uma vez)
  useEffect(() => {
    if (cfg && !formInitialized.current) {
      formInitialized.current = true;
      setForm({
        whatsappMessage: (cfg as any).whatsappMessage ?? "",
        scheduledWhatsappMessage: (cfg as any).scheduledWhatsappMessage ?? "",
        noShowWarning: (cfg as any).noShowWarning ?? "",
        confirmationMessage: (cfg as any).confirmationMessage ?? "",
        emailSubject: (cfg as any).emailSubject ?? "",
        emailMessage: (cfg as any).emailMessage ?? "",
      });
    }
  }, [cfg]);

  const set = (k: string, v: string) => setForm(p => p ? { ...p, [k]: v } : { [k]: v });
  const val = (k: string) => form?.[k] ?? "";

  const saveMut = trpc.schedule.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("✅ Mensagens salvas com sucesso!");
      // Após salvar, permitir re-inicialização do form com dados frescos
      formInitialized.current = false;
      utils.schedule.getConfig.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || form === null) return <p className="text-white/50 text-sm">Carregando...</p>;

  // Aliases para os componentes externos (sem recriação a cada render)
  const SectionCard = MsgSectionCard;
  const Field = MsgField;
  const VarBadge = MsgVarBadge;

  return (
    <div className="space-y-4">

      {/* SEÇÃO WHATSAPP */}
      <SectionCard color="#22c55e" icon={<MessageCircle className="w-4 h-4" />} title="Mensagens de WhatsApp" subtitle="Enviadas manualmente via botão WhatsApp nos pedidos agendados">
        <Field label="📋 Enviar link para agendar (sem horário marcado)">
          <SmartTextarea
            value={val("whatsappMessage")}
            onChange={v => set("whatsappMessage", v)}
            rows={5}
            placeholder="Ex: Olá {nome}! Clique aqui para agendar: {link}"
            vars={[
              { label: '{nome}', value: '{nome}', color: '#22c55e' },
              { label: '{telefone}', value: '{telefone}', color: '#22c55e' },
              { label: '{cadastro}', value: '{cadastro}', color: '#22c55e' },
              { label: '{link}', value: '{link}', color: '#3b82f6' },
              { label: '[LINK DE AGENDAMENTO]', value: '[LINK DE AGENDAMENTO]', color: '#3b82f6' },
              { label: '{status}', value: '{status}', color: '#f59e0b' },
              { label: '{servico}', value: '{servico}', color: '#f59e0b' },
              { label: '{DIA}', value: '{DIA}', color: '#a855f7' },
              { label: '{MES}', value: '{MES}', color: '#a855f7' },
              { label: '{ANO}', value: '{ANO}', color: '#a855f7' },
              { label: '{hora_atual}', value: '{hora_atual}', color: '#a855f7' },
            ]}
          />
        </Field>

        <Field label="📅 Lembrete com horário confirmado">
          <SmartTextarea
            value={val("scheduledWhatsappMessage")}
            onChange={v => set("scheduledWhatsappMessage", v)}
            rows={5}
            placeholder="Ex: Olá {nome}! Seu atendimento está confirmado para {data} às {hora}."
            vars={[
              { label: '{nome}', value: '{nome}', color: '#22c55e' },
              { label: '{telefone}', value: '{telefone}', color: '#22c55e' },
              { label: '{cadastro}', value: '{cadastro}', color: '#22c55e' },
              { label: '{data}', value: '{data}', color: '#22c55e' },
              { label: '{hora}', value: '{hora}', color: '#22c55e' },
              { label: '{servico}', value: '{servico}', color: '#22c55e' },
              { label: '{link}', value: '{link}', color: '#3b82f6' },
              { label: '[LINK DE AGENDAMENTO]', value: '[LINK DE AGENDAMENTO]', color: '#3b82f6' },
              { label: '{status}', value: '{status}', color: '#f59e0b' },
              { label: '{DIA}', value: '{DIA}', color: '#a855f7' },
              { label: '{MES}', value: '{MES}', color: '#a855f7' },
              { label: '{ANO}', value: '{ANO}', color: '#a855f7' },
              { label: '{hora_atual}', value: '{hora_atual}', color: '#a855f7' },
            ]}
          />
        </Field>

        <Field label="⚠️ Aviso de reagendamento (se não atender)">
          <SmartTextarea
            value={val("noShowWarning")}
            onChange={v => set("noShowWarning", v)}
            rows={4}
            placeholder="Ex: ATENÇÃO: O atendimento será feito pelo WhatsApp. Se não atender, será necessário reagendar."
            vars={[
              { label: '{nome}', value: '{nome}', color: '#f59e0b' },
              { label: '{telefone}', value: '{telefone}', color: '#f59e0b' },
              { label: '{cadastro}', value: '{cadastro}', color: '#f59e0b' },
              { label: '{data}', value: '{data}', color: '#f59e0b' },
              { label: '{hora}', value: '{hora}', color: '#f59e0b' },
              { label: '{servico}', value: '{servico}', color: '#f59e0b' },
              { label: '{status}', value: '{status}', color: '#f59e0b' },
              { label: '{link}', value: '{link}', color: '#3b82f6' },
              { label: '{DIA}', value: '{DIA}', color: '#a855f7' },
              { label: '{MES}', value: '{MES}', color: '#a855f7' },
              { label: '{ANO}', value: '{ANO}', color: '#a855f7' },
              { label: '{hora_atual}', value: '{hora_atual}', color: '#a855f7' },
            ]}
          />
        </Field>
      </SectionCard>

      {/* SEÇÃO E-MAIL */}
      <SectionCard color="#3b82f6" icon={<Save className="w-4 h-4" />} title="Mensagens de E-mail" subtitle="E-mail enviado ao cliente quando o agendamento é criado">
        <Field label="Assunto do e-mail">
          <input
            value={val("emailSubject")}
            onChange={e => set("emailSubject", e.target.value)}
            placeholder="Ex: Agende seu atendimento"
            className="w-full bg-[#1a1a2e] border border-white/10 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/15 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-all"
          />
        </Field>

        <Field label="Corpo do e-mail">
          <SmartTextarea
            value={val("emailMessage")}
            onChange={v => set("emailMessage", v)}
            rows={4}
            placeholder="Ex: Olá! Seu pedido precisa ser agendado. Clique no link abaixo para escolher a data e horário."
            vars={[
              { label: '{nome}', value: '{nome}', color: '#3b82f6' },
              { label: '{link}', value: '{link}', color: '#3b82f6' },
              { label: '{data}', value: '{data}', color: '#3b82f6' },
              { label: '{hora}', value: '{hora}', color: '#3b82f6' },
              { label: '{servico}', value: '{servico}', color: '#3b82f6' },
            ]}
          />
        </Field>
      </SectionCard>

      {/* Instruções de confirmação continuam aqui; cor e banner ficam no editor Visual / Banners. */}
      <SectionCard color="#a855f7" icon={<MessageSquare className="w-4 h-4" />} title="Orientações após agendar" subtitle="Instruções exibidas abaixo da data confirmada na página do cliente">
        <Field label="Mensagem de confirmação (após agendar)">
          <SectionEditor value={val("confirmationMessage")} onChange={v => set("confirmationMessage", v)} />
        </Field>
        <p className="text-xs text-violet-200/70">Para mudar o título, a apresentação ou a cor da página, use a aba Visual / Banners. As duas áreas ficam sincronizadas pelo mesmo cadastro de configurações.</p>
      </SectionCard>

      {/* BOTÃO SALVAR */}
      <button
        onClick={() => form && saveMut.mutate({ whatsappMessage: form.whatsappMessage, scheduledWhatsappMessage: form.scheduledWhatsappMessage, noShowWarning: form.noShowWarning, confirmationMessage: form.confirmationMessage, emailSubject: form.emailSubject, emailMessage: form.emailMessage })}
        disabled={saveMut.isPending}
        className="w-full flex items-center justify-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 active:scale-[0.98] px-4 py-4 rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-lg shadow-fuchsia-900/30"
      >
        <Save className="w-4 h-4" />{saveMut.isPending ? "Salvando..." : "Salvar todas as mensagens"}
      </button>
    </div>
  );
}

// ─────────────────── AGENDADOS ───────────────────
function AppointmentsTab() {
  const utils = trpc.useUtils();
  const { data: appts, isLoading } = trpc.schedule.listAppointments.useQuery(undefined, { staleTime: 30_000 });
  const { data: schedCfg } = trpc.schedule.getConfig.useQuery();
  const { data: templates } = trpc.schedule.listTemplates.useQuery();
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [manualApptId, setManualApptId] = useState<number | null>(null);
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('');
  const reopenAndNotifyMut = trpc.schedule.reopenAndNotify.useMutation({
    onSuccess: (data) => {
      toast.success("Liberado para o cliente reagendar");
      if (data.emailSent) toast.success("E-mail de reagendamento enviado");
      if (data.waLink) {
        toast.success("Abrindo WhatsApp...");
        const a = document.createElement('a');
        a.href = data.waLink;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      utils.schedule.listAppointments.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.schedule.cancel.useMutation({
    onSuccess: () => { toast.success("Agendamento cancelado"); utils.schedule.listAppointments.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.schedule.remove.useMutation({
    onSuccess: () => { toast.success("Agendamento excluído"); utils.schedule.listAppointments.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const completeMut = trpc.schedule.complete.useMutation({
    onSuccess: () => { toast.success("Agendamento finalizado"); utils.schedule.listAppointments.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const manualConfirmMut = trpc.schedule.manualConfirm.useMutation({
    onSuccess: (data) => {
      toast.success("Agendamento confirmado!");
      if ((data as any).waLink) {
        toast.success("Abrindo WhatsApp...");
        const a = document.createElement('a');
        a.href = (data as any).waLink;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setManualApptId(null);
      setManualDate('');
      setManualTime('');
      utils.schedule.listAppointments.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  function openManualModal(id: number, currentDate?: string | null, currentTime?: string | null) {
    setManualApptId(id);
    setManualDate(currentDate || '');
    setManualTime(currentTime || '');
  }
  function submitManual() {
    if (!manualApptId || !manualDate || !manualTime) { toast.error('Preencha data e hora'); return; }
    manualConfirmMut.mutate({ id: manualApptId, slotDate: manualDate, slotTime: manualTime });
  }

  // Monta link WhatsApp usando APENAS a mensagem global (ignora template)
  function buildWhatsappHrefGlobal(a: any): string {
    const d = (a.customerPhone || '').replace(/\D/g, '');
    const phone = d.startsWith('55') ? d : '55' + d;
    const scheduleLink = a.token ? `${window.location.origin}/agendar/${a.token}` : '';
    const hasSchedule = !!(a.slotDate && a.slotTime);
    let msg = '';
    if (hasSchedule) {
      msg = (schedCfg as any)?.scheduledWhatsappMessage || '';
      if (!msg) msg = `Olá {nome}! Seu atendimento está confirmado para o dia {data} às {hora}. Fique disponível no WhatsApp nesse horário!`;
      msg = applyMsgVars(msg, a, scheduleLink);
      return `https://wa.me/${phone}?text=${encodeWhatsappMessage(msg)}`;
    }
    msg = (schedCfg as any)?.whatsappMessage || '';
    if (msg) {
      msg = applyMsgVars(msg, a, scheduleLink);
      if (scheduleLink && !msg.includes(scheduleLink)) msg = msg + '\n\n🔗 Link para agendar:\n' + scheduleLink;
      return `https://wa.me/${phone}?text=${encodeWhatsappMessage(msg)}`;
    }
    if (scheduleLink) {
      const defaultMsg = `Olá ${a.customerName || ''}! Aqui está seu link para agendar:\n${scheduleLink}`;
      return `https://wa.me/${phone}?text=${encodeWhatsappMessage(defaultMsg)}`;
    }
    return `https://wa.me/${phone}`;
  }

  // Substitui todas as variáveis suportadas em uma mensagem de WhatsApp
  function applyMsgVars(msg: string, a: any, scheduleLink: string): string {
    // Data e hora atuais
    const now = new Date();
    const dia = String(now.getDate()).padStart(2, '0');
    const mes = String(now.getMonth() + 1).padStart(2, '0');
    const ano = String(now.getFullYear());
    const horaAtual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    // Data formatada do agendamento
    const dataAgendamento = a.slotDate || '';
    const horaAgendamento = a.slotTime || '';
    // Status do pedido: usa orderStatusLabel (label legível) ou orderStatusKey como fallback
    const statusLabel = (a.orderStatusLabel || a.orderStatusKey || '').trim();
    // Telefone do cliente
    const telefone = a.customerPhone || '';
    // Número do cadastro (customerNumber)
    const cadastro = a.customerNumber ? `*${a.customerNumber}` : '';

    let result = msg;
    // Variáveis de cliente
    result = result.replace(/\{nome\}/gi, a.customerName || '');
    result = result.replace(/\{telefone\}/gi, telefone);
    result = result.replace(/\{cadastro\}/gi, cadastro);
    // Variáveis de agendamento
    result = result.replace(/\{data\}/gi, dataAgendamento);
    result = result.replace(/\{hora\}/gi, horaAgendamento);
    result = result.replace(/\{servico\}/gi, a.serviceName || '');
    // Variáveis de link
    result = result.replace(/\{link\}/gi, scheduleLink);
    result = result.replace(/\[LINK DE AGENDAMENTO\]/gi, scheduleLink);
    result = result.replace(/\[LINK\]/gi, scheduleLink);
    // Variáveis de status do pedido
    result = result.replace(/\{status\}/gi, statusLabel);
    // Variáveis de data/hora atuais (momento do envio)
    result = result.replace(/\{DIA\}/g, dia);
    result = result.replace(/\{MES\}/g, mes);
    result = result.replace(/\{ANO\}/g, ano);
    result = result.replace(/\{hora_atual\}/gi, horaAtual);
    return result;
  }

  function buildWhatsappHref(a: any): string {
    const d = (a.customerPhone || '').replace(/\D/g, '');
    const phone = d.startsWith('55') ? d : '55' + d;
    // Link de agendamento do cliente
    const scheduleLink = a.token ? `${window.location.origin}/agendar/${a.token}` : '';
    const hasSchedule = !!(a.slotDate && a.slotTime);
    let msg = '';

    if (hasSchedule) {
      // Agendamento com horário marcado: usa scheduledWhatsappMessage do modelo (prioridade) ou global
      if (a.templateId && templates) {
        const tpl = (templates as any[]).find((t: any) => t.id === a.templateId);
        if (tpl?.scheduledWhatsappMessage) msg = tpl.scheduledWhatsappMessage;
      }
      if (!msg) msg = (schedCfg as any)?.scheduledWhatsappMessage || '';
      if (!msg) msg = `Olá {nome}! Seu atendimento está confirmado para o dia {data} às {hora}. Fique disponível no WhatsApp nesse horário!`;
      msg = applyMsgVars(msg, a, scheduleLink);
      return `https://wa.me/${phone}?text=${encodeWhatsappMessage(msg)}`;
    }

    // Sem horário: usa mensagem do template ou global + link
    if (a.templateId && templates) {
      const tpl = (templates as any[]).find((t: any) => t.id === a.templateId);
      if (tpl?.whatsappMessage) msg = tpl.whatsappMessage;
    }
    if (!msg && (schedCfg as any)?.whatsappMessage) msg = (schedCfg as any).whatsappMessage;
    if (msg) {
      msg = applyMsgVars(msg, a, scheduleLink);
      // Se a mensagem não contém o link mas tem token, adiciona o link no final
      if (scheduleLink && !msg.includes(scheduleLink)) {
        msg = msg + '\n\n🔗 Link para agendar:\n' + scheduleLink;
      }
      return `https://wa.me/${phone}?text=${encodeWhatsappMessage(msg)}`;
    }
    // Sem mensagem configurada: só o link
    if (scheduleLink) {
      const defaultMsg = `Olá ${a.customerName || ''}! Aqui está seu link para agendar:\n${scheduleLink}`;
      return `https://wa.me/${phone}?text=${encodeWhatsappMessage(defaultMsg)}`;
    }
    return `https://wa.me/${phone}`;
  }

  // Group appointments by date, then by time
  const groupedByDate = useMemo(() => {
    // Filtra por nome, telefone, serviço, *código do cadastro ou #pedido.
    const matches = filterAdminScheduleAppointments(appts || [], searchTerm);
    const list = statusFilter === 'all' ? matches : matches.filter(a => a.status === statusFilter);
    const groups: { [key: string]: typeof list } = {};
    
    // Ordena: data menor (mais próxima) primeiro; sem data por último; mesmo dia: horário mais cedo primeiro
    const sorted = [...list].sort((a, b) => {
      const aHasDate = !!a.slotDate;
      const bHasDate = !!b.slotDate;
      if (aHasDate && bHasDate) {
        const dateCompare = a.slotDate!.localeCompare(b.slotDate!); // asc: data menor primeiro
        if (dateCompare !== 0) return dateCompare;
        // Mesmo dia: horário mais cedo primeiro
        if (a.slotTime && b.slotTime) return a.slotTime.localeCompare(b.slotTime);
        return 0;
      }
      if (aHasDate && !bHasDate) return -1; // com data vem antes de sem data
      if (!aHasDate && bHasDate) return 1;
      return 0;
    });
    
    // Group by date
    sorted.forEach(appt => {
      const date = appt.slotDate || 'Sem data';
      if (!groups[date]) groups[date] = [];
      groups[date].push(appt);
    });
    
    return groups;
  }, [appts, searchTerm, statusFilter]);
  
  // Datas ordenadas: menor primeiro, 'Sem data' por último
  const dateSlots = Object.keys(groupedByDate).sort((a, b) => {
    if (a === 'Sem data') return 1;
    if (b === 'Sem data') return -1;
    return a.localeCompare(b); // asc: 2026-06-19 antes de 2026-06-22
  });
  // Calcular localTime - atualiza a cada minuto para manter ATRASADO correto
  const [localTimeNow, setLocalTimeNow] = useState(() => getLocalTime());
  useEffect(() => {
    const interval = setInterval(() => setLocalTimeNow(getLocalTime()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) return <p className="text-white/50 text-sm">Carregando...</p>;

  return (
    <>
      {/* Manual Schedule Modal */}
      {manualApptId !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setManualApptId(null)}>
          <div className="bg-[#13132a] border border-fuchsia-500/30 rounded-2xl p-5 max-w-xs w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-fuchsia-300 mb-4 flex items-center gap-2"><Calendar className="w-4 h-4" /> Agendar manualmente</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/60 mb-1 block">Data</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-fuchsia-500/60" />
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">Hora</label>
                <input type="time" value={manualTime} onChange={e => setManualTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-fuchsia-500/60" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={submitManual} disabled={manualConfirmMut.isPending || !manualDate || !manualTime}
                  className="flex-1 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors">
                  {manualConfirmMut.isPending ? 'Salvando...' : 'Confirmar'}
                </button>
                <button onClick={() => setManualApptId(null)} className="px-4 py-2 bg-white/5 border border-white/15 text-white/60 rounded-lg text-sm">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Modal */}
      {expandedPhoto && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setExpandedPhoto(null)}
        >
          <div
            className="bg-black border border-white/20 rounded-2xl p-4 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-white">Foto do Cliente</h3>
              <button
                onClick={() => setExpandedPhoto(null)}
                className="text-white/60 hover:text-white text-xl"
              >
                ×
              </button>
            </div>
            <img
              src={expandedPhoto}
              alt="Foto do cliente"
              className="w-full h-auto rounded-lg object-cover"
            />
          </div>
        </div>
      )}

      <div className="sg-appt-console rounded-2xl p-3 sm:p-5">
      <div className="sg-appt-heading flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-black text-white">Central de agendamentos</h2>
        {(appts || []).length > 0 && <span className="sg-appt-count">{(appts || []).length} registros</span>}
      </div>
      {/* Filtros visuais sem modificar dados salvos */}
      <div className="sg-appt-filters" role="group" aria-label="Filtrar agendamentos">
        {([
          ['all', 'Todos', (appts || []).length],
          ['pending', 'Aguardando', (appts || []).filter(a => a.status === 'pending').length],
          ['confirmed', 'Confirmados', (appts || []).filter(a => a.status === 'confirmed').length],
          ['cancelled', 'Cancelados', (appts || []).filter(a => a.status === 'cancelled').length],
        ] as const).map(([key, label, count]) => (
          <button type="button" key={key} aria-pressed={statusFilter === key} className="sg-filter-chip" onClick={() => setStatusFilter(key)}>{label} <span>{count}</span></button>
        ))}
      </div>
      <div className="sg-appt-search relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Buscar nome, telefone, *cadastro, #pedido ou serviço..."
          className="w-full bg-white/5 border border-white/15 rounded-xl pl-9 pr-9 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-fuchsia-500/60 transition-colors"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
          >
            ×
          </button>
        )}
      </div>
      {searchTerm && (
        <p className="text-xs text-white/40 mb-3">
          {Object.values(groupedByDate).flat().length} resultado{Object.values(groupedByDate).flat().length !== 1 ? 's' : ''} para "{searchTerm}"
        </p>
      )}
      {dateSlots.length === 0 ? <p className="text-white/50 text-sm">{searchTerm || statusFilter !== 'all' ? 'Nenhum agendamento neste filtro.' : 'Nenhum agendamento ainda.'}</p> :
        <div className="space-y-4">
          {dateSlots.map(date => (
            <div key={date} className="sg-appt-day">
              <div className="sg-appt-day-heading">
                <p className="sg-appt-day-title"><CalendarDays className="h-4 w-4" /> {date === "Sem data" ? "Sem data definida" : formatDate(date)}</p>
                 <span className="sg-appt-day-count">{groupedByDate[date].length} agendamento(s)</span>
              </div>
              <div className="sg-appt-day-grid">
                {groupedByDate[date].map((a: any) => (
            <div key={a.id} className="sg-appt-card" data-status={a.status}>
              <div className="min-w-0 flex-1">
                <div className="sg-appt-orderline"><span className="sg-appt-order">Pedido #{a.registrationId}</span>{a.serviceName && <strong className="sg-appt-service">{a.serviceName}</strong>}{(a as any).serviceOption && <span className="sg-appt-service-option">{(a as any).serviceOption}</span>}</div>
                <div className="sg-appt-customer flex flex-wrap items-center gap-2 mt-1">
                   {a.customerPhotoUrl && (
                    <button
                      onClick={() => setExpandedPhoto(a.customerPhotoUrl)}
                      className="cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                      title="Clique para expandir a foto"
                    >
                      <img src={a.customerPhotoUrl} alt={a.customerName} className="sg-appt-avatar object-cover" />
                    </button>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(a as any).customerNumber && (
                      <span className="sg-appt-number" title="Número de cadastro">
                        *{(a as any).customerNumber}
                      </span>
                    )}
                    <p className="sg-appt-name">{a.customerName || a.customerPhone}</p>
                  </div>
                  {a.customerPhone && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(a.customerPhone);
                        toast.success("Telefone copiado");
                      }}
                      className="text-xs px-1.5 py-0.5 bg-white/5 border border-white/15 text-white/60 hover:text-white hover:border-white/30 rounded transition-colors flex-shrink-0"
                      title="Copiar telefone"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {a.status === "confirmed"
                  ? (() => {
                      const today = localTimeNow.date;
                      const currentTotalMin = localTimeNow.totalMinutes;
                      // Convert slot time to minutes
                      const [slotHour, slotMin] = a.slotTime.split(':').map(Number);
                      const slotTotalMin = slotHour * 60 + slotMin;
                      // Mark as ATRASADO if appointment date is in the past, OR same day but 15+ min ago
                      const isPast = a.slotDate < today || (a.slotDate === today && (slotTotalMin + 15) < currentTotalMin);
                      return (
                        <div className={`sg-appt-status ${isPast ? "sg-appt-overdue" : "sg-appt-confirmed"} flex flex-wrap items-center gap-2`}>
                           <p className="sg-appt-datetime"><CalendarClock className="h-4 w-4 shrink-0" />
                            Agendado: {a.slotDate ? formatDate(a.slotDate) : ""} às {a.slotTime}
                          </p>
                          {isPast && <span className="text-xs bg-red-600/30 border border-red-500/50 text-red-300 px-2 py-0.5 rounded font-semibold">ATRASADO</span>}
                        </div>
                      );
                    })()
                  : a.status === "cancelled"
                    ? <p className="sg-appt-status sg-appt-cancelled"><XCircle className="h-4 w-4" /> Cancelado</p>
                    : <p className="sg-appt-status sg-appt-pending"><Clock3 className="h-4 w-4" /> Aguardando o cliente escolher</p>}
              </div>
              <div className="sg-appt-controls">
                <p className="sg-appt-control-label">CONTATO</p>
                 {/* Linha 1: Telefone + WhatsApp + Global */}
                {a.customerPhone && (
                  <div className="sg-appt-action-row">
                    <button
                      onClick={() => {
                        const digitsOnly = a.customerPhone.replace(/\D/g, '');
                        let phoneWithCountry = '';
                        if (digitsOnly.startsWith('55')) {
                          phoneWithCountry = '+' + digitsOnly;
                        } else if (digitsOnly.length === 11) {
                          phoneWithCountry = '+55 ' + digitsOnly.substring(0, 2) + ' ' + digitsOnly.substring(2, 7) + '-' + digitsOnly.substring(7);
                        } else if (digitsOnly.length === 10) {
                          phoneWithCountry = '+55 ' + digitsOnly.substring(0, 2) + ' ' + digitsOnly.substring(2, 6) + '-' + digitsOnly.substring(6);
                        } else {
                          phoneWithCountry = '+55' + digitsOnly;
                        }
                        navigator.clipboard.writeText(phoneWithCountry);
                        toast.success('Telefone copiado: ' + phoneWithCountry);
                      }}
                      className="sg-appt-action text-xs px-2 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 rounded-lg transition-colors flex items-center gap-1 justify-center truncate"
                      title="Copiar número com código do país"
                    >
                      📋 <span className="truncate">{a.customerPhone}</span>
                    </button>
                    <a
                      href={buildWhatsappHref(a)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sg-appt-action text-xs px-2 py-1.5 bg-green-600/20 border border-green-500/30 text-green-300 hover:bg-green-600/30 rounded-lg transition-colors flex items-center gap-1 justify-center"
                      title="WhatsApp — mensagem do template"
                    >
                      <MessageCircle className="w-3 h-3 shrink-0" /> WhatsApp
                    </a>
                    <a
                      href={buildWhatsappHrefGlobal(a)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sg-appt-action text-xs px-2 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 rounded-lg transition-colors flex items-center gap-1 justify-center"
                      title="WhatsApp — mensagem global"
                    >
                      <MessageCircle className="w-3 h-3 shrink-0" /> Global
                    </a>
                  </div>
                )}
                <p className="sg-appt-control-label">ATENDIMENTO</p>
                 {/* Linha 2: Ver Pedido + Alterar/Agendar + Reagendar */}
                <div className="sg-appt-action-row">
                  {a.registrationId ? (
                    <a
                      href={`/admin/orders?open=${a.registrationId}`}
                      className="sg-appt-action text-xs px-2 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 rounded-lg transition-colors flex items-center gap-1 justify-center"
                      title="Ver pedido completo"
                    >
                      <FileText className="w-3 h-3 shrink-0" /> Ver Pedido
                    </a>
                  ) : <div />}
                  {a.status === "pending" ? (
                    <button onClick={() => openManualModal(a.id, a.slotDate, a.slotTime)} className="sg-appt-action text-xs px-2 py-1.5 bg-fuchsia-600/20 border border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-600/30 rounded-lg transition-colors flex items-center gap-1 justify-center"><Calendar className="w-3 h-3 shrink-0" /> Agendar</button>
                  ) : a.status === "confirmed" ? (
                    <button onClick={() => openManualModal(a.id, a.slotDate, a.slotTime)} className="sg-appt-action text-xs px-2 py-1.5 bg-fuchsia-600/20 border border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-600/30 rounded-lg transition-colors flex items-center gap-1 justify-center"><Calendar className="w-3 h-3 shrink-0" /> Alterar</button>
                  ) : <div />}
                  {a.status === "confirmed" ? (
                    <button onClick={() => reopenAndNotifyMut.mutate({ id: a.id, origin: window.location.origin })} disabled={reopenAndNotifyMut.isPending} className="sg-appt-action text-xs px-2 py-1.5 bg-yellow-600/20 border border-yellow-500/30 text-yellow-300 rounded-lg disabled:opacity-50 flex items-center gap-1 justify-center">{reopenAndNotifyMut.isPending ? "..." : <><RefreshCw className="w-3 h-3 shrink-0" /> Reagendar</>}</button>
                  ) : <div />}
                </div>
                <p className="sg-appt-control-label">GERENCIAMENTO</p>
                 {/* Linha 3: Cancelar + Finalizado + Excluir */}
                <div className="sg-appt-action-row">
                  {a.status !== "cancelled" ? (
                    <button onClick={() => cancelMut.mutate({ id: a.id })} className="sg-appt-action text-xs px-2 py-1.5 bg-red-600/20 border border-red-500/30 text-red-300 hover:bg-red-600/30 rounded-lg transition-colors flex items-center gap-1 justify-center"><XCircle className="w-3 h-3 shrink-0" /> Cancelar</button>
                  ) : <div />}
                  {a.status === "confirmed" ? (
                    <button onClick={() => completeMut.mutate({ id: a.id })} disabled={completeMut.isPending} className="sg-appt-action text-xs px-2 py-1.5 bg-green-600/20 border border-green-500/30 text-green-300 hover:bg-green-600/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 justify-center"><CheckCircle className="w-3 h-3 shrink-0" /> Finalizado</button>
                  ) : <div />}
                  <button
                    onClick={() => { if (confirm("Excluir este agendamento da lista? Esta ação não pode ser desfeita.")) removeMut.mutate({ id: a.id }); }}
                    disabled={removeMut.isPending}
                    className="sg-appt-action text-xs px-2 py-1.5 bg-white/5 border border-white/15 text-white/60 hover:text-red-300 hover:border-red-500/40 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 justify-center"
                  ><Trash2 className="w-3 h-3 shrink-0" /> Excluir</button>
                </div>
              </div>
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>}
      </div>
    </>
  );
}

// ─────────────────── FINALIZADOS ───────────────────
function FinalizadosTab() {
  const utils = trpc.useUtils();
  const { data: appts, isLoading } = trpc.schedule.listAppointments.useQuery(undefined, { staleTime: 30_000 });
  const removeMut = trpc.schedule.remove.useMutation({
    onSuccess: () => { toast.success("Agendamento excluído"); utils.schedule.listAppointments.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const reopenMut = trpc.schedule.reopen.useMutation({
    onSuccess: () => { toast.success("Horário original restaurado"); utils.schedule.listAppointments.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // Filter only completed appointments
  const finalizados = useMemo(() => {
    return (appts || []).filter(a => a.status === 'completed');
  }, [appts]);

  if (isLoading) return <p className="text-white/50 text-sm">Carregando...</p>;

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-4 md:p-5">
      <h2 className="text-base font-bold mb-3">Agendamentos Finalizados</h2>
      {finalizados.length === 0 ? <p className="text-white/50 text-sm">Nenhum agendamento finalizado ainda.</p> :
        <div className="space-y-2">
          {finalizados.map(a => (
            <div key={a.id} className="flex items-start justify-between gap-3 bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Pedido #{a.registrationId} {a.serviceName ? `— ${a.serviceName}` : ""}{(a as any).serviceOption ? ` / ${(a as any).serviceOption}` : ""}</p>
                <div className="flex items-center gap-2 mt-1">
                  {a.customerPhotoUrl && (
                    <img src={a.customerPhotoUrl || ''} alt={a.customerName || ''} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                  )}
                  <div className="flex items-center gap-1.5">
                    {(a as any).customerNumber && (
                      <span className="flex-shrink-0 text-[11px] font-mono font-bold text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5 leading-none" title="Número de cadastro">
                        *{(a as any).customerNumber}
                      </span>
                    )}
                    <p className="text-xs text-white/60">{a.customerName || a.customerPhone}</p>
                  </div>
                </div>
                <p className="text-xs text-green-300 mt-1">✓ Concluído</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => reopenMut.mutate({ id: a.id })}
                  disabled={reopenMut.isPending}
                  className="text-xs px-2 py-1 bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 rounded transition-colors disabled:opacity-50"
                >Restaurar horário</button>
                <button
                  onClick={() => { if (confirm("Excluir este agendamento da lista? Esta ação não pode ser desfeita.")) removeMut.mutate({ id: a.id }); }}
                  disabled={removeMut.isPending}
                  className="text-xs px-2 py-1 bg-white/5 border border-white/15 text-white/60 hover:text-red-300 hover:border-red-500/40 rounded transition-colors disabled:opacity-50"
                >Excluir</button>
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}

function formatDate(d: string): string {
  // d = YYYY-MM-DD
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  const dt = new Date(y, (m || 1) - 1, day || 1);
  return dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}
