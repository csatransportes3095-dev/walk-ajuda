import { type FormEvent, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Activity, Archive, ArrowLeft, FolderPlus, Layers3, LockKeyhole, Monitor, Pencil, Plus, ShieldCheck, WifiOff, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { H2ADS_NAME_MIN_LENGTH, validateH2AdsName } from "@shared/h2adsValidation";

const H2ADS_LOGO = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663911003862/NUtvqlTplGBXXVCr.png";
type GroupForm = { id?: number; name: string; description: string; status: "active" | "archived" };
type InstanceForm = { id?: number; groupId: string; name: string; notes: string; status: "draft" | "paused" | "archived" };
const emptyGroup: GroupForm = { name: "", description: "", status: "active" };
const emptyInstance: InstanceForm = { groupId: "", name: "", notes: "", status: "draft" };

const errorText = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const badgeClass = (status: string) => status === "active" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : status === "draft" ? "border-[#148CFF]/25 bg-[#148CFF]/10 text-[#8CC8FF]" : status === "paused" ? "border-[#F5B800]/25 bg-[#F5B800]/10 text-[#FFE37A]" : "border-white/10 bg-white/[0.04] text-slate-400";
const statusName = (status: string) => ({ active: "Ativo", archived: "Arquivado", draft: "Rascunho", paused: "Pausado" }[status] ?? status);

function FormShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <section className="border-b border-[#F5B800]/20 bg-[#F5B800]/[0.045] p-5 sm:p-6"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-base font-black text-white">{title}</h3><p className="mt-1 text-xs text-slate-400">{subtitle}</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Fechar formulário"><X className="h-4 w-4" /></button></div>{children}</section>;
}

export default function H2Ads() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const dashboard = trpc.h2Ads.listDashboard.useQuery(undefined, { retry: false });
  const createGroup = trpc.h2Ads.createGroup.useMutation();
  const updateGroup = trpc.h2Ads.updateGroup.useMutation();
  const createInstance = trpc.h2Ads.createInstance.useMutation();
  const updateInstance = trpc.h2Ads.updateInstance.useMutation();
  const [groupForm, setGroupForm] = useState<GroupForm | null>(null);
  const [instanceForm, setInstanceForm] = useState<InstanceForm | null>(null);
  const groups = dashboard.data?.groups ?? [];
  const instances = dashboard.data?.instances ?? [];
  const activeGroups = useMemo(() => groups.filter(group => group.status === "active"), [groups]);
  const instancesByGroup = useMemo(() => instances.reduce((map, instance) => {
    const list = map.get(instance.groupId) ?? []; list.push(instance); map.set(instance.groupId, list); return map;
  }, new Map<number, typeof instances>()), [instances]);
  const saving = createGroup.isPending || updateGroup.isPending || createInstance.isPending || updateInstance.isPending;
  const refresh = () => utils.h2Ads.listDashboard.invalidate();

  const saveGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!groupForm) return;
    const name = groupForm.name.trim();
    const nameError = validateH2AdsName(name, "grupo");
    if (nameError) { toast.error(nameError); return; }
    const values = { name, description: groupForm.description.trim() || null, status: groupForm.status };
    try {
      if (groupForm.id) { await updateGroup.mutateAsync({ id: groupForm.id, ...values }); toast.success("Grupo H2 Ads atualizado."); }
      else { await createGroup.mutateAsync(values); toast.success("Grupo H2 Ads criado."); }
      setGroupForm(null); await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível salvar o grupo H2 Ads.")); }
  };

  const saveInstance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!instanceForm) return;
    const groupId = Number(instanceForm.groupId);
    if (!Number.isInteger(groupId) || groupId < 1) { toast.error("Selecione um grupo H2 Ads ativo."); return; }
    const name = instanceForm.name.trim();
    const nameError = validateH2AdsName(name, "instância");
    if (nameError) { toast.error(nameError); return; }
    const values = { groupId, name, notes: instanceForm.notes.trim() || null, status: instanceForm.status };
    try {
      if (instanceForm.id) { await updateInstance.mutateAsync({ id: instanceForm.id, ...values }); toast.success("Instância H2 Ads atualizada."); }
      else { await createInstance.mutateAsync(values); toast.success("Instância H2 Ads criada como rascunho."); }
      setInstanceForm(null); await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível salvar a instância H2 Ads.")); }
  };

  const newInstance = (groupId?: number) => {
    if (!activeGroups.length) { toast.info("Crie primeiro um grupo H2 Ads ativo."); setGroupForm({ ...emptyGroup }); return; }
    setInstanceForm({ ...emptyInstance, groupId: String(groupId ?? activeGroups[0].id) });
  };

  return <div className="min-h-screen overflow-hidden bg-[#06070A] text-slate-100">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_-5%,rgba(245,184,0,0.18),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(20,140,255,0.16),transparent_28%)]" />
    <header className="relative border-b border-white/10 bg-black/30 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setLocation("/admin/codes")} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 hover:border-[#F5B800]/40 hover:text-[#FFE37A]" aria-label="Voltar ao painel administrativo"><ArrowLeft className="h-4 w-4" /></button><img src={H2ADS_LOGO} alt="H2 Colombia" className="h-11 w-11 rounded-xl border border-[#F5B800]/45 object-cover" /><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#FFE37A]">H2 Colombia</p><h1 className="text-lg font-black text-white sm:text-xl">H2 ADS <span className="font-medium text-slate-400">· Base de instâncias</span></h1></div></div>
      <div className="hidden items-center gap-2 rounded-full border border-[#F5B800]/25 bg-[#F5B800]/10 px-3 py-1.5 text-xs font-bold text-[#FFE37A] sm:flex"><LockKeyhole className="h-3.5 w-3.5" />Acesso administrativo</div>
    </div></header>
    <main className="relative mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_300px]"><div><div className="inline-flex items-center gap-2 rounded-full border border-[#148CFF]/25 bg-[#148CFF]/10 px-3 py-1.5 text-xs font-bold text-[#8CC8FF]"><Activity className="h-3.5 w-3.5" />Painel de instâncias autorizado</div><h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">Organize grupos e instâncias de forma isolada.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Esta fase cadastra somente metadados próprios do H2 Ads. Não acessa clientes, pedidos, empréstimos, gastos, cartões ou regras de outras áreas.</p></div><aside className="rounded-2xl border border-[#F5B800]/25 bg-gradient-to-br from-[#171208]/90 to-[#101823]/90 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFE37A]">Escopo atual</p><p className="mt-1 text-sm font-semibold text-white">Cadastro administrativo</p><p className="mt-3 text-xs leading-5 text-slate-400">Sem proxy, segredo, browser remoto, perfil de cookies, worker ou conexão externa.</p></aside></section>
      <section className="mt-7 grid gap-3 sm:grid-cols-3"><Metric icon={Layers3} value={groups.length} label="grupos" text="Organização própria do módulo." tone="gold" /><Metric icon={Monitor} value={instances.length} label="instâncias" text="Registros lógicos, sem browser." tone="blue" /><Metric icon={WifiOff} value="—" label="rede externa" text="Não configurada nesta fase." tone="red" /></section>
      {dashboard.isError && <section className="mt-6 rounded-2xl border border-[#E84242]/30 bg-[#E84242]/10 p-5 text-sm text-[#FFD0D0]" role="alert"><strong>Base H2 Ads indisponível.</strong><p className="mt-1 text-xs">Nenhum dado de outra área será usado como alternativa.</p></section>}
      <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#0D1016]/90 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"><div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFE37A]">Grupos H2 Ads</p><h3 className="mt-1 text-xl font-black text-white">Estrutura própria do módulo</h3></div><div className="flex gap-2"><button type="button" onClick={() => setGroupForm({ ...emptyGroup })} className="inline-flex items-center gap-2 rounded-xl border border-[#F5B800]/30 bg-[#F5B800]/10 px-4 py-2.5 text-sm font-black text-[#FFE37A]"><FolderPlus className="h-4 w-4" />Novo grupo</button><button type="button" onClick={() => newInstance()} className="inline-flex items-center gap-2 rounded-xl bg-[#F5B800] px-4 py-2.5 text-sm font-black text-[#171003]"><Plus className="h-4 w-4" />Nova instância</button></div></div>
        {groupForm && <FormShell title={groupForm.id ? "Editar grupo" : "Novo grupo H2 Ads"} subtitle="Somente metadados isolados do módulo." onClose={() => setGroupForm(null)}><form onSubmit={saveGroup}><div className="grid gap-3 sm:grid-cols-[1fr_180px]"><Field label="Nome do grupo"><input required minLength={H2ADS_NAME_MIN_LENGTH} value={groupForm.name} onChange={event => setGroupForm({ ...groupForm, name: event.target.value })} placeholder="Ex.: Operação São Paulo" /><small className="text-slate-500">Mínimo de {H2ADS_NAME_MIN_LENGTH} caracteres.</small></Field><Field label="Estado"><select value={groupForm.status} onChange={event => setGroupForm({ ...groupForm, status: event.target.value as GroupForm["status"] })}><option value="active">Ativo</option><option value="archived">Arquivado</option></select></Field></div><Field label="Descrição opcional" className="mt-3"><textarea value={groupForm.description} onChange={event => setGroupForm({ ...groupForm, description: event.target.value })} placeholder="Finalidade administrativa" /></Field><Actions disabled={saving} label="Salvar grupo" onCancel={() => setGroupForm(null)} /></form></FormShell>}
        {instanceForm && <FormShell title={instanceForm.id ? "Editar instância" : "Nova instância H2 Ads"} subtitle="O registro não abre navegador e não possui proxy." onClose={() => setInstanceForm(null)}><form onSubmit={saveInstance}><div className="grid gap-3 sm:grid-cols-3"><Field label="Grupo"><select required value={instanceForm.groupId} onChange={event => setInstanceForm({ ...instanceForm, groupId: event.target.value })}><option value="">Selecione</option>{activeGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field><Field label="Nome da instância" className="sm:col-span-2"><input required minLength={H2ADS_NAME_MIN_LENGTH} value={instanceForm.name} onChange={event => setInstanceForm({ ...instanceForm, name: event.target.value })} placeholder="Ex.: Instância 01" /><small className="text-slate-500">Mínimo de {H2ADS_NAME_MIN_LENGTH} caracteres.</small></Field></div><div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]"><Field label="Estado"><select value={instanceForm.status} onChange={event => setInstanceForm({ ...instanceForm, status: event.target.value as InstanceForm["status"] })}><option value="draft">Rascunho</option><option value="paused">Pausado</option><option value="archived">Arquivado</option></select></Field><Field label="Notas administrativas opcionais"><textarea value={instanceForm.notes} onChange={event => setInstanceForm({ ...instanceForm, notes: event.target.value })} placeholder="Sem dados de clientes, contas ou navegação." /></Field></div><Actions disabled={saving} label="Salvar instância" onCancel={() => setInstanceForm(null)} /></form></FormShell>}
        <div className="p-5 sm:p-6">{dashboard.isLoading && <div className="grid min-h-48 place-items-center text-sm text-slate-400">Carregando estrutura H2 Ads...</div>}{!dashboard.isLoading && groups.length === 0 && <EmptyState />}{groups.map(group => <GroupCard key={group.id} group={group} instances={instancesByGroup.get(group.id) ?? []} onEdit={() => setGroupForm({ id: group.id, name: group.name, description: group.description ?? "", status: group.status })} onNewInstance={() => newInstance(group.id)} onEditInstance={instance => setInstanceForm({ id: instance.id, groupId: String(instance.groupId), name: instance.name, notes: instance.notes ?? "", status: instance.status })} />)}</div>
      </section>
      <section className="mt-6 grid gap-3 md:grid-cols-2"><article className="rounded-2xl border border-[#148CFF]/20 bg-[#148CFF]/[0.055] p-5"><div className="flex items-center gap-2 text-[#8CC8FF]"><ShieldCheck className="h-4 w-4" /><p className="text-sm font-black">Isolamento mantido</p></div><p className="mt-2 text-xs leading-5 text-slate-400">A estrutura usa somente tabelas com prefixo <code className="text-[#B8DDFF]">h2ads_</code>.</p></article><article className="rounded-2xl border border-[#E84242]/20 bg-[#E84242]/[0.055] p-5"><div className="flex items-center gap-2 text-[#FF9C9C]"><Archive className="h-4 w-4" /><p className="text-sm font-black">Infraestrutura bloqueada</p></div><p className="mt-2 text-xs leading-5 text-slate-400">Proxy, IP, localização, browser remoto e workers permanecem fora desta fase.</p></article></section>
    </main></div>;
}

function Metric({ icon: Icon, value, label, text, tone }: { icon: typeof Monitor; value: number | string; label: string; text: string; tone: "gold" | "blue" | "red" }) { const color = tone === "gold" ? "text-[#F5B800] bg-[#F5B800]/10 border-[#F5B800]/20" : tone === "blue" ? "text-[#66B5FF] bg-[#148CFF]/10 border-[#148CFF]/20" : "text-[#FF9C9C] bg-[#E84242]/10 border-[#E84242]/20"; return <article className="rounded-2xl border border-white/8 bg-[#10131A]/85 p-4"><div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${color}`}><Icon className="h-5 w-5" /></div><h3 className="mt-4 text-sm font-black text-white">{value} {label}</h3><p className="mt-1.5 text-xs text-slate-400">{text}</p></article>; }
function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={`grid gap-1.5 text-xs font-bold text-slate-300 ${className}`}>{label}<span className="[&>input]:h-10 [&>input]:rounded-lg [&>input]:border [&>input]:border-white/10 [&>input]:bg-black/20 [&>input]:px-3 [&>input]:text-sm [&>input]:text-white [&>select]:h-10 [&>select]:rounded-lg [&>select]:border [&>select]:border-white/10 [&>select]:bg-black/20 [&>select]:px-3 [&>select]:text-sm [&>select]:text-white [&>textarea]:min-h-20 [&>textarea]:rounded-lg [&>textarea]:border [&>textarea]:border-white/10 [&>textarea]:bg-black/20 [&>textarea]:px-3 [&>textarea]:py-2 [&>textarea]:text-sm [&>textarea]:text-white">{children}</span></label>; }
function Actions({ disabled, label, onCancel }: { disabled: boolean; label: string; onCancel: () => void }) { return <div className="mt-4 flex gap-2"><button disabled={disabled} className="rounded-lg bg-[#F5B800] px-4 py-2 text-sm font-black text-[#171003] disabled:opacity-60">{disabled ? "Salvando..." : label}</button><button type="button" onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-slate-300">Cancelar</button></div>; }
function EmptyState() { return <div className="grid min-h-[250px] place-items-center text-center"><div className="max-w-md"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#148CFF]/25 bg-[#148CFF]/10 text-[#66B5FF]"><Monitor className="h-8 w-8" /></div><h4 className="mt-5 text-lg font-black text-white">Nenhum grupo criado</h4><p className="mt-2 text-sm leading-6 text-slate-400">Crie um grupo para organizar instâncias lógicas. Nenhum proxy, browser ou conexão externa será configurado.</p></div></div>; }
function GroupCard({ group, instances, onEdit, onNewInstance, onEditInstance }: { group: { id: number; name: string; description: string | null; status: "active" | "archived" }; instances: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }[]; onEdit: () => void; onNewInstance: () => void; onEditInstance: (instance: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }) => void }) { return <article className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20"><div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-base font-black text-white">{group.name}</h4><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${badgeClass(group.status)}`}>{statusName(group.status)}</span></div><p className="mt-1 text-xs leading-5 text-slate-400">{group.description || "Sem descrição administrativa."}</p></div><div className="flex gap-2"><button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300"><Pencil className="h-3.5 w-3.5" />Editar</button><button type="button" disabled={group.status !== "active"} onClick={onNewInstance} className="inline-flex items-center gap-1.5 rounded-lg border border-[#148CFF]/25 bg-[#148CFF]/10 px-3 py-2 text-xs font-bold text-[#8CC8FF] disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Instância</button></div></div><div className="border-t border-white/8 bg-white/[0.018] p-3">{instances.length === 0 ? <p className="px-1 py-2 text-xs text-slate-500">Nenhuma instância cadastrada neste grupo.</p> : instances.map(instance => <div key={instance.id} className="mb-2 flex flex-col gap-2 rounded-xl border border-white/8 bg-[#11151D]/80 p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-white">{instance.name}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${badgeClass(instance.status)}`}>{statusName(instance.status)}</span></div><p className="mt-1 text-xs text-slate-400">{instance.notes || "Sem notas administrativas."}</p></div><button type="button" onClick={() => onEditInstance(instance)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300"><Pencil className="h-3.5 w-3.5" />Editar</button></div>)}</div></article>; }
