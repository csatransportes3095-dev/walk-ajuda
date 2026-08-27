import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Activity, ArrowLeft, CheckCircle2, Eye, EyeOff, FolderPlus, KeyRound, Layers3, LockKeyhole, MapPin, Monitor, Network, Pencil, Plus, ShieldCheck, WifiOff, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { H2ADS_NAME_MIN_LENGTH, validateH2AdsName } from "@shared/h2adsValidation";
import { parseH2AdsProxyInput, type H2AdsProxyProtocol } from "@shared/h2adsProxyInput";

const H2ADS_LOGO = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663911003862/NUtvqlTplGBXXVCr.png";

type GroupForm = { id?: number; name: string; description: string; status: "active" | "archived" };
type InstanceForm = { id?: number; groupId: string; name: string; notes: string; status: "draft" | "paused" | "archived" };
type NetworkProfileForm = { instanceId: number; providerName: string; routeLabel: string; targetCountryCode: string; targetCity: string; expectedIsp: string; expectedAsn: string; setupStatus: "not_configured" | "metadata_ready" | "blocked" };
type NetworkProfile = {
  providerName: string | null; routeLabel: string | null; targetCountryCode: string | null; targetCity: string | null;
  expectedIsp: string | null; expectedAsn: string | null; setupStatus: "not_configured" | "metadata_ready" | "blocked";
  healthStatus: "not_checked" | "healthy" | "degraded" | "failed" | "blocked"; observedIp: string | null;
  observedCountryCode: string | null; observedCity: string | null; observedIsp: string | null; observedAsn: string | null;
  latencyMs: number | null; lastCheckMessage: string | null;
};

const emptyGroup: GroupForm = { name: "", description: "", status: "active" };
const emptyInstance: InstanceForm = { groupId: "", name: "", notes: "", status: "draft" };
const errorText = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const statusName = (status: string) => ({ active: "Ativo", archived: "Arquivado", draft: "Rascunho", paused: "Pausado" }[status] ?? status);
const healthName = (status: NetworkProfile["healthStatus"]) => ({ not_checked: "Ainda não testada", healthy: "Aprovada", degraded: "Degradada", failed: "Falhou", blocked: "Bloqueada" }[status]);
const healthClass = (status: NetworkProfile["healthStatus"]) => status === "healthy" ? "text-emerald-200" : status === "failed" || status === "blocked" ? "text-rose-200" : status === "degraded" ? "text-amber-200" : "text-slate-400";
const hasProxyConfigurationFormat = (value: string) => /^[a-zA-Z0-9.-]+:\d{1,5}:[^:\s]+:.+$/.test(value.trim());

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
    <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0D1016] shadow-2xl">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0D1016]/95 px-5 py-4 backdrop-blur sm:px-6"><div><h3 className="text-lg font-black text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button></header>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  </div>;
}

export default function H2Ads() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const dashboard = trpc.h2Ads.listDashboard.useQuery(undefined, { retry: false });
  const proxySecurityStatus = trpc.h2Ads.proxySecurityStatus.useQuery(undefined, { retry: false });
  const createGroup = trpc.h2Ads.createGroup.useMutation();
  const updateGroup = trpc.h2Ads.updateGroup.useMutation();
  const createInstance = trpc.h2Ads.createInstance.useMutation();
  const updateInstance = trpc.h2Ads.updateInstance.useMutation();
  const saveNetworkProfile = trpc.h2Ads.saveNetworkProfile.useMutation();
  const saveProxyCredential = trpc.h2Ads.saveProxyCredential.useMutation();
  const validateProxy = trpc.h2Ads.validateProxy.useMutation();
  const [groupForm, setGroupForm] = useState<GroupForm | null>(null);
  const [instanceForm, setInstanceForm] = useState<InstanceForm | null>(null);
  const [networkForm, setNetworkForm] = useState<NetworkProfileForm | null>(null);
  const [proxyConfig, setProxyConfig] = useState("");
  const [proxyProtocol, setProxyProtocol] = useState<H2AdsProxyProtocol>("http");
  const [showNewRoute, setShowNewRoute] = useState(false);

  const groups = dashboard.data?.groups ?? [];
  const instances = dashboard.data?.instances ?? [];
  const networkProfiles = dashboard.data?.networkProfiles ?? [];
  const credentialStatuses = dashboard.data?.proxyCredentialStatuses ?? [];
  const activeGroups = useMemo(() => groups.filter(group => group.status === "active"), [groups]);
  const instancesByGroup = useMemo(() => instances.reduce((map, instance) => {
    const current = map.get(instance.groupId) ?? [];
    current.push(instance);
    map.set(instance.groupId, current);
    return map;
  }, new Map<number, typeof instances>()), [instances]);
  const profileByInstance = useMemo(() => new Map(networkProfiles.map(profile => [profile.instanceId, profile])), [networkProfiles]);
  const credentialByInstance = useMemo(() => new Map(credentialStatuses.map(status => [status.instanceId, status])), [credentialStatuses]);
  const selectedInstance = networkForm ? instances.find(instance => instance.id === networkForm.instanceId) : undefined;
  const encryptionReady = proxySecurityStatus.data?.encryptionReady === true;
  const saving = createGroup.isPending || updateGroup.isPending || createInstance.isPending || updateInstance.isPending || saveNetworkProfile.isPending || saveProxyCredential.isPending || validateProxy.isPending;
  const refresh = () => utils.h2Ads.listDashboard.invalidate();

  const newInstance = (groupId?: number) => {
    if (!activeGroups.length) { toast.info("Crie primeiro um grupo H2 Ads ativo."); setGroupForm({ ...emptyGroup }); return; }
    setInstanceForm({ ...emptyInstance, groupId: String(groupId ?? activeGroups[0].id) });
  };

  const openRouteEditor = (instanceId: number) => {
    const profile = profileByInstance.get(instanceId);
    setNetworkForm({
      instanceId, providerName: profile?.providerName ?? "", routeLabel: profile?.routeLabel ?? "", targetCountryCode: profile?.targetCountryCode ?? "",
      targetCity: profile?.targetCity ?? "", expectedIsp: profile?.expectedIsp ?? "", expectedAsn: profile?.expectedAsn ?? "", setupStatus: profile?.setupStatus ?? "not_configured",
    });
    setProxyConfig("");
    setProxyProtocol("http");
    setShowNewRoute(false);
  };

  const closeRouteEditor = () => { setNetworkForm(null); setProxyConfig(""); setProxyProtocol("http"); setShowNewRoute(false); };

  const saveGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!groupForm) return;
    const name = groupForm.name.trim();
    const validation = validateH2AdsName(name, "grupo");
    if (validation) { toast.error(validation); return; }
    try {
      const payload = { name, description: groupForm.description.trim() || null, status: groupForm.status };
      if (groupForm.id) await updateGroup.mutateAsync({ id: groupForm.id, ...payload }); else await createGroup.mutateAsync(payload);
      setGroupForm(null); toast.success("Grupo salvo."); await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível salvar o grupo.")); }
  };

  const saveInstance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!instanceForm) return;
    const groupId = Number(instanceForm.groupId);
    const name = instanceForm.name.trim();
    if (!Number.isInteger(groupId) || groupId < 1) { toast.error("Selecione um grupo ativo."); return; }
    const validation = validateH2AdsName(name, "instância");
    if (validation) { toast.error(validation); return; }
    try {
      const payload = { groupId, name, notes: instanceForm.notes.trim() || null, status: instanceForm.status };
      if (instanceForm.id) await updateInstance.mutateAsync({ id: instanceForm.id, ...payload }); else await createInstance.mutateAsync(payload);
      setInstanceForm(null); toast.success("Instância salva."); await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível salvar a instância.")); }
  };

  const saveMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!networkForm) return;
    const visibleFields = [networkForm.providerName, networkForm.routeLabel, networkForm.targetCity, networkForm.expectedIsp, networkForm.expectedAsn];
    if (visibleFields.some(hasProxyConfigurationFormat)) { toast.error("Cole a rota apenas no campo de rota nova."); return; }
    const country = networkForm.targetCountryCode.trim().toUpperCase();
    if (country && !/^[A-Z]{2}$/.test(country)) { toast.error("Use a sigla de país com 2 letras, por exemplo BR."); return; }
    try {
      await saveNetworkProfile.mutateAsync({
        instanceId: networkForm.instanceId, providerName: networkForm.providerName.trim() || null, routeLabel: networkForm.routeLabel.trim() || null,
        targetCountryCode: country || null, targetCity: networkForm.targetCity.trim() || null, expectedIsp: networkForm.expectedIsp.trim() || null,
        expectedAsn: networkForm.expectedAsn.trim() || null, setupStatus: networkForm.setupStatus,
      });
      toast.success("Metadados salvos."); await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível salvar os metadados.")); }
  };

  const replaceRoute = async () => {
    if (!networkForm) return;
    if (!encryptionReady) { toast.error("A chave segura não está disponível no ambiente."); return; }
    if (!proxyConfig.trim()) { toast.error("Cole uma rota nova antes de salvar."); return; }
    try {
      await saveProxyCredential.mutateAsync({ instanceId: networkForm.instanceId, proxyConfig: proxyConfig.trim(), proxyProtocol });
      setProxyConfig(""); setShowNewRoute(false); toast.success("Rota vinculada a esta instância."); await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível salvar a rota.")); }
  };

  const validateRoute = async () => {
    if (!networkForm) return;
    try {
      const result = await validateProxy.mutateAsync({ instanceId: networkForm.instanceId });
      toast.success(`Rota aprovada: ${result.observed.countryCode ?? "país não informado"}.`); await refresh();
    } catch (error) { toast.error(errorText(error, "A validação da rota falhou.")); await refresh(); }
  };

  return <div className="min-h-screen overflow-hidden bg-[#06070A] text-slate-100">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_-5%,rgba(245,184,0,0.18),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(20,140,255,0.16),transparent_28%)]" />
    <header className="relative border-b border-white/10 bg-black/30 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setLocation("/admin/codes")} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 hover:border-[#F5B800]/40 hover:text-[#FFE37A]" aria-label="Voltar ao painel administrativo"><ArrowLeft className="h-4 w-4" /></button><img src={H2ADS_LOGO} alt="H2 Colombia" className="h-11 w-11 rounded-xl border border-[#F5B800]/45 object-cover" /><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#FFE37A]">H2 Colombia</p><h1 className="text-lg font-black text-white sm:text-xl">H2 ADS <span className="font-medium text-slate-400">· Instâncias</span></h1></div></div>
      <div className="hidden items-center gap-2 rounded-full border border-[#F5B800]/25 bg-[#F5B800]/10 px-3 py-1.5 text-xs font-bold text-[#FFE37A] sm:flex"><LockKeyhole className="h-3.5 w-3.5" />Acesso administrativo</div>
    </div></header>
    <main className="relative mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_300px]"><div><div className="inline-flex items-center gap-2 rounded-full border border-[#148CFF]/25 bg-[#148CFF]/10 px-3 py-1.5 text-xs font-bold text-[#8CC8FF]"><Activity className="h-3.5 w-3.5" />Painel de instâncias autorizado</div><h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">Uma rota por instância, sem confusão.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Edite, substitua e teste a rota no cartão da própria instância. Grupos, instâncias e configurações permanecem isolados de todas as outras áreas.</p></div><aside className="rounded-2xl border border-[#F5B800]/25 bg-gradient-to-br from-[#171208]/90 to-[#101823]/90 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFE37A]">Uso direto</p><p className="mt-1 text-sm font-semibold text-white">Rota individual por instância</p><p className="mt-3 text-xs leading-5 text-slate-400">Cole uma rota nova, confira antes de salvar e valide por clique. Sem browser remoto ou automação.</p></aside></section>
      <section className="mt-7 grid gap-3 sm:grid-cols-3"><Metric icon={Layers3} value={groups.length} label="grupos" text="Organização própria do módulo." tone="gold" /><Metric icon={Monitor} value={instances.length} label="instâncias" text="Cada uma possui rota própria." tone="blue" /><Metric icon={WifiOff} value={credentialStatuses.length} label="rotas vinculadas" text="Teste manual por instância." tone="red" /></section>
      {dashboard.isError && <section className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5 text-sm text-rose-100" role="alert"><strong>Base H2 Ads indisponível.</strong><p className="mt-1 text-xs">Nenhum dado de outra área será usado como alternativa.</p></section>}
      <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#0D1016]/90 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"><header className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFE37A]">Grupos e instâncias</p><h3 className="mt-1 text-xl font-black text-white">Configuração no lugar certo</h3></div><div className="flex gap-2"><button type="button" onClick={() => setGroupForm({ ...emptyGroup })} className="inline-flex items-center gap-2 rounded-xl border border-[#F5B800]/30 bg-[#F5B800]/10 px-4 py-2.5 text-sm font-black text-[#FFE37A]"><FolderPlus className="h-4 w-4" />Novo grupo</button><button type="button" onClick={() => newInstance()} className="inline-flex items-center gap-2 rounded-xl bg-[#F5B800] px-4 py-2.5 text-sm font-black text-[#171003]"><Plus className="h-4 w-4" />Nova instância</button></div></header>
        <div className="p-4 sm:p-6">{dashboard.isLoading && <div className="grid min-h-48 place-items-center text-sm text-slate-400">Carregando instâncias H2 Ads...</div>}{!dashboard.isLoading && groups.length === 0 && <EmptyState />}{groups.map(group => <GroupSection key={group.id} group={group} instances={instancesByGroup.get(group.id) ?? []} profileByInstance={profileByInstance} credentialByInstance={credentialByInstance} onEditGroup={() => setGroupForm({ id: group.id, name: group.name, description: group.description ?? "", status: group.status })} onNewInstance={() => newInstance(group.id)} onEditInstance={instance => setInstanceForm({ id: instance.id, groupId: String(instance.groupId), name: instance.name, notes: instance.notes ?? "", status: instance.status })} onEditRoute={openRouteEditor} />)}</div>
      </section>
      <section className="mt-6 grid gap-3 md:grid-cols-2"><article className="rounded-2xl border border-[#148CFF]/20 bg-[#148CFF]/[0.055] p-5"><div className="flex items-center gap-2 text-[#8CC8FF]"><ShieldCheck className="h-4 w-4" /><p className="text-sm font-black">Uma instância, uma rota</p></div><p className="mt-2 text-xs leading-5 text-slate-400">Cada configuração fica vinculada somente à instância escolhida.</p></article><article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-center gap-2 text-slate-300"><Network className="h-4 w-4" /><p className="text-sm font-black">Teste por clique</p></div><p className="mt-2 text-xs leading-5 text-slate-400">IP, localização, ISP, ASN e latência só são atualizados quando você clicar em validar.</p></article></section>
    </main>
    {groupForm && <Modal title={groupForm.id ? "Editar grupo" : "Novo grupo"} subtitle="Organização interna do H2 Ads." onClose={() => setGroupForm(null)}><form onSubmit={saveGroup} className="grid gap-4"><Field label="Nome do grupo"><input required minLength={H2ADS_NAME_MIN_LENGTH} value={groupForm.name} onChange={event => setGroupForm({ ...groupForm, name: event.target.value })} placeholder="Ex.: Operação São Paulo" /></Field><Field label="Descrição"><textarea value={groupForm.description} onChange={event => setGroupForm({ ...groupForm, description: event.target.value })} placeholder="Opcional" /></Field><Field label="Estado"><select value={groupForm.status} onChange={event => setGroupForm({ ...groupForm, status: event.target.value as GroupForm["status"] })}><option value="active">Ativo</option><option value="archived">Arquivado</option></select></Field><ActionBar saving={saving} label="Salvar grupo" onCancel={() => setGroupForm(null)} /></form></Modal>}
    {instanceForm && <Modal title={instanceForm.id ? "Editar instância" : "Nova instância"} subtitle="A rota será configurada no cartão da instância depois de salvar." onClose={() => setInstanceForm(null)}><form onSubmit={saveInstance} className="grid gap-4"><div className="grid gap-4 sm:grid-cols-3"><Field label="Grupo"><select required value={instanceForm.groupId} onChange={event => setInstanceForm({ ...instanceForm, groupId: event.target.value })}><option value="">Selecione</option>{activeGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field><Field label="Nome da instância" className="sm:col-span-2"><input required minLength={H2ADS_NAME_MIN_LENGTH} value={instanceForm.name} onChange={event => setInstanceForm({ ...instanceForm, name: event.target.value })} placeholder="Ex.: Instância 01" /></Field></div><Field label="Notas"><textarea value={instanceForm.notes} onChange={event => setInstanceForm({ ...instanceForm, notes: event.target.value })} placeholder="Opcional" /></Field><Field label="Estado"><select value={instanceForm.status} onChange={event => setInstanceForm({ ...instanceForm, status: event.target.value as InstanceForm["status"] })}><option value="draft">Rascunho</option><option value="paused">Pausado</option><option value="archived">Arquivado</option></select></Field><ActionBar saving={saving} label="Salvar instância" onCancel={() => setInstanceForm(null)} /></form></Modal>}
    {networkForm && selectedInstance && <RouteEditor instance={selectedInstance} profile={profileByInstance.get(selectedInstance.id)} hasCredential={credentialByInstance.has(selectedInstance.id)} form={networkForm} setForm={setNetworkForm} proxyConfig={proxyConfig} setProxyConfig={setProxyConfig} proxyProtocol={proxyProtocol} setProxyProtocol={setProxyProtocol} showNewRoute={showNewRoute} setShowNewRoute={setShowNewRoute} encryptionReady={encryptionReady} saving={saving} onSaveRoute={replaceRoute} onValidate={validateRoute} onSaveMetadata={saveMetadata} onClose={closeRouteEditor} />}
  </div>;
}

function RouteEditor({ instance, profile, hasCredential, form, setForm, proxyConfig, setProxyConfig, proxyProtocol, setProxyProtocol, showNewRoute, setShowNewRoute, encryptionReady, saving, onSaveRoute, onValidate, onSaveMetadata, onClose }: { instance: { id: number; name: string; status: "draft" | "paused" | "archived" }; profile?: NetworkProfile; hasCredential: boolean; form: NetworkProfileForm; setForm: (next: NetworkProfileForm) => void; proxyConfig: string; setProxyConfig: (value: string) => void; proxyProtocol: H2AdsProxyProtocol; setProxyProtocol: (value: H2AdsProxyProtocol) => void; showNewRoute: boolean; setShowNewRoute: (value: boolean) => void; encryptionReady: boolean; saving: boolean; onSaveRoute: () => void; onValidate: () => void; onSaveMetadata: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  const isBlocked = profile?.healthStatus === "blocked" || profile?.healthStatus === "failed";
  const parsedRoute = useMemo(() => {
    if (!proxyConfig.trim()) return null;
    try { return parseH2AdsProxyInput(proxyConfig, proxyProtocol); } catch { return null; }
  }, [proxyConfig, proxyProtocol]);
  return <Modal title={`Rota · ${instance.name}`} subtitle="Uma nova rota substitui somente a configuração desta instância." onClose={onClose}><div className="rounded-2xl border border-[#F5B800]/25 bg-[#F5B800]/[0.05] p-4"><div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[#FFE37A]" /><div><p className="text-sm font-black text-white">{hasCredential ? "Substituir rota rotativa" : "Adicionar rota"}</p><p className="mt-1 text-xs leading-5 text-slate-400">Cole uma linha. O H2 Ads extrai o tipo, host, porta e utilizador antes de salvar nesta instância.</p></div></div>{!encryptionReady && <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-100">A chave segura não está disponível no ambiente; a rota não será salva.</p>}<div className="mt-4 grid gap-3 sm:grid-cols-[150px_1fr]"><Field label="Tipo de proxy"><select value={proxyProtocol} onChange={event => setProxyProtocol(event.target.value as H2AdsProxyProtocol)}><option value="http">HTTP</option><option value="https">HTTPS</option><option value="socks5">SOCKS5</option></select></Field><Field label="Linha da rota"><div className="flex gap-2"><input type={showNewRoute ? "text" : "password"} autoComplete="new-password" spellCheck={false} value={proxyConfig} onChange={event => setProxyConfig(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 font-mono text-sm text-white" placeholder="host:porta:utilizador:palavra-passe" aria-label="Nova rota da instância" /><button type="button" onClick={() => setShowNewRoute(!showNewRoute)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-300 hover:bg-white/5">{showNewRoute ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showNewRoute ? "Ocultar" : "Mostrar"}</button></div></Field></div>{proxyConfig.trim() && !parsedRoute && <p className="mt-3 text-xs font-semibold text-rose-200">Formato inválido. Use host:porta:utilizador:palavra-passe.</p>}{parsedRoute && <div className="mt-3 grid gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3 text-xs sm:grid-cols-3"><p><span className="text-slate-500">Tipo</span><br /><strong className="text-emerald-100">{parsedRoute.protocol.toUpperCase()}</strong></p><p><span className="text-slate-500">Host:porta</span><br /><strong className="font-mono text-emerald-100">{showNewRoute ? `${parsedRoute.host}:${parsedRoute.port}` : "Reconhecido"}</strong></p><p><span className="text-slate-500">Utilizador</span><br /><strong className="font-mono text-emerald-100">{showNewRoute ? parsedRoute.username : "Reconhecido"}</strong></p></div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving || !encryptionReady || !parsedRoute} onClick={onSaveRoute} className="inline-flex items-center gap-2 rounded-xl bg-[#F5B800] px-4 py-2.5 text-sm font-black text-[#171003] disabled:cursor-not-allowed disabled:opacity-45"><LockKeyhole className="h-4 w-4" />{hasCredential ? "Substituir rota" : "Salvar rota"}</button><button type="button" disabled={saving || !hasCredential} onClick={onValidate} className="inline-flex items-center gap-2 rounded-xl border border-[#148CFF]/30 bg-[#148CFF]/10 px-4 py-2.5 text-sm font-black text-[#8CC8FF] disabled:cursor-not-allowed disabled:opacity-45"><Activity className="h-4 w-4" />Verificar se está viva</button>{hasCredential && <span className="inline-flex items-center gap-1.5 self-center text-xs font-bold text-emerald-200"><CheckCircle2 className="h-4 w-4" />Rota vinculada</span>}</div>{profile?.lastCheckMessage && <p className={`mt-3 text-xs font-semibold ${healthClass(profile.healthStatus)}`}>{profile.lastCheckMessage}</p>}{isBlocked && <p className="mt-1 text-xs text-rose-200">Substitua a rota e valide novamente para atualizar o estado.</p>}</div><form onSubmit={onSaveMetadata} className="mt-5"><details className="group rounded-2xl border border-white/10 bg-black/20"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-black text-slate-200"><span className="mr-2 text-[#8CC8FF]">+</span>Metadados opcionais da rota</summary><div className="border-t border-white/10 p-4"><p className="mb-4 text-xs leading-5 text-slate-500">Use apenas rótulos administrativos. Não cole uma configuração de proxy nestes campos.</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Fornecedor"><input value={form.providerName} onChange={event => setForm({ ...form, providerName: event.target.value })} placeholder="Ex.: Fornecedor autorizado" /></Field><Field label="Rótulo interno"><input value={form.routeLabel} onChange={event => setForm({ ...form, routeLabel: event.target.value })} placeholder="Ex.: Rota BR-SP-01" /></Field><Field label="País previsto"><input value={form.targetCountryCode} maxLength={2} onChange={event => setForm({ ...form, targetCountryCode: event.target.value.toUpperCase() })} placeholder="BR" /></Field><Field label="Cidade prevista"><input value={form.targetCity} onChange={event => setForm({ ...form, targetCity: event.target.value })} placeholder="São Paulo" /></Field><Field label="ISP previsto"><input value={form.expectedIsp} onChange={event => setForm({ ...form, expectedIsp: event.target.value })} placeholder="Opcional" /></Field><Field label="ASN previsto"><input value={form.expectedAsn} onChange={event => setForm({ ...form, expectedAsn: event.target.value })} placeholder="Opcional" /></Field></div><div className="mt-3"><Field label="Estado"><select value={form.setupStatus} onChange={event => setForm({ ...form, setupStatus: event.target.value as NetworkProfileForm["setupStatus"] })}><option value="not_configured">Não configurado</option><option value="metadata_ready">Metadados prontos</option><option value="blocked">Bloqueado</option></select></Field></div><ActionBar saving={saving} label="Salvar metadados" onCancel={onClose} /></div></details></form></Modal>;
}

function GroupSection({ group, instances, profileByInstance, credentialByInstance, onEditGroup, onNewInstance, onEditInstance, onEditRoute }: { group: { id: number; name: string; description: string | null; status: "active" | "archived" }; instances: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }[]; profileByInstance: Map<number, NetworkProfile>; credentialByInstance: Map<number, unknown>; onEditGroup: () => void; onNewInstance: () => void; onEditInstance: (instance: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }) => void; onEditRoute: (id: number) => void }) {
  return <section className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20"><header className="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><h4 className="text-base font-black text-white">{group.name}</h4><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${group.status === "active" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-slate-400"}`}>{statusName(group.status)}</span></div><p className="mt-1 text-xs text-slate-400">{group.description || "Sem descrição administrativa."}</p></div><div className="flex gap-2"><button type="button" onClick={onEditGroup} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300"><Pencil className="h-3.5 w-3.5" />Editar</button><button type="button" disabled={group.status !== "active"} onClick={onNewInstance} className="inline-flex items-center gap-1.5 rounded-lg border border-[#148CFF]/25 bg-[#148CFF]/10 px-3 py-2 text-xs font-bold text-[#8CC8FF] disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Instância</button></div></header><div className="grid gap-3 p-3 lg:grid-cols-2">{instances.length === 0 ? <p className="px-1 py-2 text-xs text-slate-500">Nenhuma instância cadastrada neste grupo.</p> : instances.map(instance => <InstanceCard key={instance.id} instance={instance} profile={profileByInstance.get(instance.id)} hasCredential={credentialByInstance.has(instance.id)} onEditInstance={() => onEditInstance(instance)} onEditRoute={() => onEditRoute(instance.id)} />)}</div></section>;
}

function InstanceCard({ instance, profile, hasCredential, onEditInstance, onEditRoute }: { instance: { id: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }; profile?: NetworkProfile; hasCredential: boolean; onEditInstance: () => void; onEditRoute: () => void }) {
  const observedLocation = [profile?.observedCountryCode, profile?.observedCity].filter(Boolean).join(" · ");
  const isArchived = instance.status === "archived";
  return <article className="rounded-2xl border border-white/10 bg-[#10131A]/90 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h5 className="text-base font-black text-white">{instance.name}</h5><span className="rounded-full border border-[#148CFF]/25 bg-[#148CFF]/10 px-2 py-0.5 text-[10px] font-black uppercase text-[#8CC8FF]">{statusName(instance.status)}</span></div><p className="mt-1 text-xs text-slate-500">{instance.notes || "Rota individual desta instância."}</p></div><button type="button" disabled={isArchived} onClick={onEditRoute} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#F5B800] px-3 py-2 text-xs font-black text-[#171003] disabled:opacity-40"><KeyRound className="h-3.5 w-3.5" />{hasCredential ? "Editar rota" : "Adicionar rota"}</button></div><div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/8 bg-black/20 p-3 text-xs"><div><p className="text-slate-500">Rota</p><p className={`mt-1 font-bold ${hasCredential ? "text-emerald-200" : "text-slate-400"}`}>{hasCredential ? "Vinculada" : "Não configurada"}</p></div><div><p className="text-slate-500">Último teste</p><p className={`mt-1 font-bold ${healthClass(profile?.healthStatus ?? "not_checked")}`}>{healthName(profile?.healthStatus ?? "not_checked")}</p></div>{profile?.observedIp && <div className="col-span-2 border-t border-white/8 pt-3"><p className="text-slate-500">Resultado</p><p className="mt-1 font-semibold text-slate-200">IP {profile.observedIp}{observedLocation ? ` · ${observedLocation}` : ""}{profile.latencyMs !== null ? ` · ${profile.latencyMs} ms` : ""}</p></div>}</div><div className="mt-3 flex items-center justify-between gap-3"><p className="min-w-0 truncate text-[11px] text-slate-500">{profile?.lastCheckMessage || "Nenhuma validação executada."}</p><button type="button" onClick={onEditInstance} className="shrink-0 text-xs font-bold text-slate-400 hover:text-white">Editar instância</button></div></article>;
}

function Metric({ icon: Icon, value, label, text, tone }: { icon: typeof Monitor; value: number; label: string; text: string; tone: "gold" | "blue" | "red" }) { const color = tone === "gold" ? "text-[#F5B800] bg-[#F5B800]/10 border-[#F5B800]/20" : tone === "blue" ? "text-[#66B5FF] bg-[#148CFF]/10 border-[#148CFF]/20" : "text-[#FF9C9C] bg-rose-400/10 border-rose-400/20"; return <article className="rounded-2xl border border-white/8 bg-[#10131A]/85 p-4"><div className={`grid h-10 w-10 place-items-center rounded-xl border ${color}`}><Icon className="h-5 w-5" /></div><h3 className="mt-4 text-sm font-black text-white">{value} {label}</h3><p className="mt-1.5 text-xs text-slate-400">{text}</p></article>; }
function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) { return <label className={`grid gap-1.5 text-xs font-bold text-slate-300 ${className}`}>{label}<span className="[&>input]:h-10 [&>input]:rounded-lg [&>input]:border [&>input]:border-white/10 [&>input]:bg-black/20 [&>input]:px-3 [&>input]:text-sm [&>input]:text-white [&>select]:h-10 [&>select]:rounded-lg [&>select]:border [&>select]:border-white/10 [&>select]:bg-black/20 [&>select]:px-3 [&>select]:text-sm [&>select]:text-white [&>textarea]:min-h-20 [&>textarea]:rounded-lg [&>textarea]:border [&>textarea]:border-white/10 [&>textarea]:bg-black/20 [&>textarea]:px-3 [&>textarea]:py-2 [&>textarea]:text-sm [&>textarea]:text-white">{children}</span></label>; }
function ActionBar({ saving, label, onCancel }: { saving: boolean; label: string; onCancel: () => void }) { return <div className="mt-5 flex gap-2"><button disabled={saving} className="rounded-lg bg-[#F5B800] px-4 py-2 text-sm font-black text-[#171003] disabled:opacity-60">{saving ? "Salvando..." : label}</button><button type="button" onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-slate-300">Cancelar</button></div>; }
function EmptyState() { return <div className="grid min-h-[250px] place-items-center text-center"><div className="max-w-md"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[#148CFF]/25 bg-[#148CFF]/10 text-[#66B5FF]"><Monitor className="h-8 w-8" /></div><h4 className="mt-5 text-lg font-black text-white">Nenhum grupo criado</h4><p className="mt-2 text-sm leading-6 text-slate-400">Crie um grupo para organizar as instâncias de rota individual.</p></div></div>; }
