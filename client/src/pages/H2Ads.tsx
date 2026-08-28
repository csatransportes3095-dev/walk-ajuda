import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Activity, ArrowLeft, CheckCircle2, Copy, Eye, EyeOff, FolderPlus, KeyRound, Layers3, LockKeyhole, MapPin, Monitor, Network, Pencil, Play, Plus, ShieldCheck, Square, Wifi, WifiOff, X } from "lucide-react";
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
type WorkerForm = { name: string; capacity: string };
type BrowserWorker = { id: number; workerKey: string; name: string; operatingSystem: "windows"; status: "active" | "revoked"; capacity: number; computerName: string | null; agentVersion: string | null; lastSeenAt: Date | null; connectionStatus: "online" | "offline" | "revoked" };
type WorkerAssignment = { instanceId: number; workerId: number; profileState: "not_started" | "local_only" | "snapshot_ready" | "transferring" | "restore_failed"; profileVersion: number; lastSnapshotAt: Date | null };
type BrowserRun = { instanceId: number; workerId: number; state: "not_prepared" | "queued" | "preparing" | "proxy_verified" | "blocked" | "browser_open" | "closed"; observedIp: string | null; lastErrorCategory: string | null; preparedAt: Date | null };

const emptyGroup: GroupForm = { name: "", description: "", status: "active" };
const emptyInstance: InstanceForm = { groupId: "", name: "", notes: "", status: "draft" };
const emptyWorker: WorkerForm = { name: "", capacity: "1" };
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
  const createWorkerPairing = trpc.h2Ads.createWorkerPairing.useMutation();
  const assignWorker = trpc.h2Ads.assignWorker.useMutation();
  const revokeWorker = trpc.h2Ads.revokeWorker.useMutation();
  const prepareBrowser = trpc.h2Ads.prepareBrowser.useMutation();
  const launchBrowser = trpc.h2Ads.launchBrowser.useMutation();
  const closeBrowser = trpc.h2Ads.closeBrowser.useMutation();
  const updateProxyRotation = trpc.h2Ads.updateProxyRotation.useMutation();
  const [groupForm, setGroupForm] = useState<GroupForm | null>(null);
  const [instanceForm, setInstanceForm] = useState<InstanceForm | null>(null);
  const [networkForm, setNetworkForm] = useState<NetworkProfileForm | null>(null);
  const [proxyConfig, setProxyConfig] = useState("");
  const [proxyProtocol, setProxyProtocol] = useState<H2AdsProxyProtocol>("http");
  const [proxyRotationMinutes, setProxyRotationMinutes] = useState("");
  const [showNewRoute, setShowNewRoute] = useState(false);
  const [workerForm, setWorkerForm] = useState<WorkerForm | null>(null);
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: Date } | null>(null);

  const groups = dashboard.data?.groups ?? [];
  const instances = dashboard.data?.instances ?? [];
  const networkProfiles = dashboard.data?.networkProfiles ?? [];
  const credentialStatuses = dashboard.data?.proxyCredentialStatuses ?? [];
  const browserWorkers = (dashboard.data?.browserWorkers ?? []) as BrowserWorker[];
  const workerAssignments = (dashboard.data?.instanceWorkerAssignments ?? []) as WorkerAssignment[];
  const browserRuns = (dashboard.data?.instanceBrowserRuns ?? []) as BrowserRun[];
  const activeGroups = useMemo(() => groups.filter(group => group.status === "active"), [groups]);
  const instancesByGroup = useMemo(() => instances.reduce((map, instance) => {
    const current = map.get(instance.groupId) ?? [];
    current.push(instance);
    map.set(instance.groupId, current);
    return map;
  }, new Map<number, typeof instances>()), [instances]);
  const profileByInstance = useMemo(() => new Map(networkProfiles.map(profile => [profile.instanceId, profile])), [networkProfiles]);
  const credentialByInstance = useMemo(() => new Map(credentialStatuses.map(status => [status.instanceId, status])), [credentialStatuses]);
  const workerById = useMemo(() => new Map(browserWorkers.map(worker => [worker.id, worker])), [browserWorkers]);
  const assignmentByInstance = useMemo(() => new Map(workerAssignments.map(assignment => [assignment.instanceId, assignment])), [workerAssignments]);
  const browserRunByInstance = useMemo(() => new Map(browserRuns.map(run => [run.instanceId, run])), [browserRuns]);
  const selectedInstance = networkForm ? instances.find(instance => instance.id === networkForm.instanceId) : undefined;
  const encryptionReady = proxySecurityStatus.data?.encryptionReady === true;
  const saving = createGroup.isPending || updateGroup.isPending || createInstance.isPending || updateInstance.isPending || saveNetworkProfile.isPending || saveProxyCredential.isPending || updateProxyRotation.isPending || validateProxy.isPending || createWorkerPairing.isPending || assignWorker.isPending || revokeWorker.isPending || prepareBrowser.isPending || launchBrowser.isPending || closeBrowser.isPending;
const refresh = () => utils.h2Ads.listDashboard.invalidate();
const refreshCommandState = () => {
  void refresh();
  for (const delay of [600, 1_400, 2_600, 4_200]) window.setTimeout(() => { void refresh(); }, delay);
};

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
    setProxyRotationMinutes(String(credentialByInstance.get(instanceId)?.rotationMinutes ?? ""));
    setShowNewRoute(false);
  };

  const closeRouteEditor = () => { setNetworkForm(null); setProxyConfig(""); setProxyProtocol("http"); setProxyRotationMinutes(""); setShowNewRoute(false); };

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
    try {
      await saveNetworkProfile.mutateAsync({
        instanceId: networkForm.instanceId, providerName: networkForm.providerName.trim() || null, routeLabel: networkForm.routeLabel.trim() || null,
        targetCountryCode: null, targetCity: networkForm.targetCity.trim() || null, expectedIsp: networkForm.expectedIsp.trim() || null,
        expectedAsn: networkForm.expectedAsn.trim() || null, setupStatus: networkForm.setupStatus,
      });
      toast.success("Metadados salvos."); await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível salvar os metadados.")); }
  };

  const replaceRoute = async () => {
    if (!networkForm) return;
    if (!encryptionReady) { toast.error("A chave segura não está disponível no ambiente."); return; }
    if (!proxyConfig.trim()) { toast.error("Cole uma rota nova antes de salvar."); return; }
    const rotationMinutes = proxyRotationMinutes.trim() ? Number(proxyRotationMinutes) : null;
    if (rotationMinutes !== null && (!Number.isInteger(rotationMinutes) || rotationMinutes < 1 || rotationMinutes > 1_440)) { toast.error("Informe um tempo de rotação entre 1 e 1440 minutos."); return; }
    try {
      await saveProxyCredential.mutateAsync({ instanceId: networkForm.instanceId, proxyConfig: proxyConfig.trim(), proxyProtocol, rotationMinutes });
      setProxyConfig(""); setShowNewRoute(false); toast.success("Rota vinculada a esta instância."); await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível salvar a rota.")); }
  };

const saveRotation = async () => {
  if (!networkForm || !credentialByInstance.has(networkForm.instanceId)) return;
  const rotationMinutes = proxyRotationMinutes.trim() ? Number(proxyRotationMinutes) : null;
  if (rotationMinutes !== null && (!Number.isInteger(rotationMinutes) || rotationMinutes < 1 || rotationMinutes > 1_440)) { toast.error("Informe um tempo de rotação entre 1 e 1440 minutos."); return; }
  try {
    await updateProxyRotation.mutateAsync({ instanceId: networkForm.instanceId, rotationMinutes });
    toast.success(rotationMinutes ? `Rotação ajustada para ${rotationMinutes} minuto(s).` : "Rotação automática desativada.");
    await refresh();
  } catch (error) { toast.error(errorText(error, "Não foi possível atualizar o tempo de rotação.")); }
};

const validateRoute = async () => {

    if (!networkForm) return;
    try {
      const result = await validateProxy.mutateAsync({ instanceId: networkForm.instanceId });
      toast.success(`Rota aprovada: ${result.observed.countryCode ?? "país não informado"}.`); await refresh();
    } catch (error) { toast.error(errorText(error, "A validação da rota falhou.")); await refresh(); }
  };

  const createPairing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workerForm) return;
    const capacity = Number(workerForm.capacity);
    if (!workerForm.name.trim() || !Number.isInteger(capacity) || capacity < 1 || capacity > 20) { toast.error("Informe nome e capacidade entre 1 e 20 instâncias."); return; }
    try {
      const result = await createWorkerPairing.mutateAsync({ name: workerForm.name.trim(), capacity });
      setPairingCode({ code: result.pairingCode, expiresAt: result.expiresAt });
      toast.success("Código temporário criado.");
    } catch (error) { toast.error(errorText(error, "Não foi possível criar o pareamento.")); }
  };

  const copyPairingCode = async () => {
    if (!pairingCode) return;
    try { await navigator.clipboard.writeText(pairingCode.code); toast.success("Código copiado."); } catch { toast.error("Não foi possível copiar. Selecione e copie o código manualmente."); }
  };

  const updateInstanceWorker = async (instanceId: number, workerId: string) => {
    if (!workerId) return;
    try { await assignWorker.mutateAsync({ instanceId, workerId: Number(workerId) }); toast.success("Worker atribuído à instância."); await refresh(); } catch (error) { toast.error(errorText(error, "Não foi possível atribuir o Worker.")); }
  };

  const disableWorker = async (worker: BrowserWorker) => {
    if (!window.confirm(`Revogar o Worker ${worker.name}? Ele não poderá mais enviar presença até ser pareado novamente.`)) return;
    try { await revokeWorker.mutateAsync({ workerId: worker.id }); toast.success("Worker revogado."); await refresh(); } catch (error) { toast.error(errorText(error, "Não foi possível revogar o Worker.")); }
  };

  const requestBrowserPreparation = async (instanceId: number) => {
    try {
      await prepareBrowser.mutateAsync({ instanceId });
      toast.success("Preparação enviada ao Worker. O browser permanecerá fechado.");
      await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível preparar esta instância.")); }
  };

  const requestBrowserLaunch = async (instanceId: number) => {
    try {
      await launchBrowser.mutateAsync({ instanceId });
      toast.success("Abertura manual enviada ao Worker. O browser só abre no perfil preparado.");
      await refresh();
    } catch (error) { toast.error(errorText(error, "Não foi possível solicitar a abertura do browser.")); }
  };

  const requestBrowserClose = async (instanceId: number) => {
    try {
      await closeBrowser.mutateAsync({ instanceId });
      toast.success("Encerrando browser...");
      refreshCommandState();
    } catch (error) { toast.error(errorText(error, "Não foi possível solicitar o encerramento do browser.")); }
  };

  return <div className="min-h-screen overflow-hidden bg-[#06070A] text-slate-100">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_-5%,rgba(245,184,0,0.18),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(20,140,255,0.16),transparent_28%)]" />
    <header className="relative border-b border-white/10 bg-black/30 backdrop-blur-xl"><div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setLocation("/admin/codes")} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 hover:border-[#F5B800]/40 hover:text-[#FFE37A]" aria-label="Voltar ao painel administrativo"><ArrowLeft className="h-4 w-4" /></button><img src={H2ADS_LOGO} alt="H2 Colombia" className="h-11 w-11 rounded-xl border border-[#F5B800]/45 object-cover" /><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#FFE37A]">H2 Colombia</p><h1 className="text-lg font-black text-white sm:text-xl">H2 ADS <span className="font-medium text-slate-400">· Instâncias</span></h1></div></div>
      <div className="hidden items-center gap-2 rounded-full border border-[#F5B800]/25 bg-[#F5B800]/10 px-3 py-1.5 text-xs font-bold text-[#FFE37A] sm:flex"><LockKeyhole className="h-3.5 w-3.5" />Acesso administrativo</div>
    </div></header>
    <main className="relative mx-auto max-w-[1800px] px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_300px]"><div><div className="inline-flex items-center gap-2 rounded-full border border-[#148CFF]/25 bg-[#148CFF]/10 px-3 py-1.5 text-xs font-bold text-[#8CC8FF]"><Activity className="h-3.5 w-3.5" />Painel de instâncias autorizado</div><h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">Uma rota por instância, sem confusão.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Edite, substitua e teste a rota no cartão da própria instância. Grupos, instâncias e configurações permanecem isolados de todas as outras áreas.</p></div><aside className="rounded-2xl border border-[#F5B800]/25 bg-gradient-to-br from-[#171208]/90 to-[#101823]/90 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFE37A]">Uso direto</p><p className="mt-1 text-sm font-semibold text-white">Rota individual por instância</p><p className="mt-3 text-xs leading-5 text-slate-400">Cole uma rota nova, confira antes de salvar e valide por clique. Sem browser remoto ou automação.</p></aside></section>
      <section className="mt-7 grid gap-3 sm:grid-cols-4"><Metric icon={Layers3} value={groups.length} label="grupos" text="Organização própria do módulo." tone="gold" /><Metric icon={Monitor} value={instances.length} label="instâncias" text="Cada uma possui rota própria." tone="blue" /><Metric icon={WifiOff} value={credentialStatuses.length} label="rotas vinculadas" text="Teste manual por instância." tone="red" /><Metric icon={Wifi} value={browserWorkers.filter(worker => worker.connectionStatus === "online").length} label="Workers online" text={`${browserWorkers.length} computador(es) autorizado(s).`} tone="blue" /></section>
      {dashboard.isError && <section className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5 text-sm text-rose-100" role="alert"><strong>Base H2 Ads indisponível.</strong><p className="mt-1 text-xs">Nenhum dado de outra área será usado como alternativa.</p></section>}
      <WorkerPanel workers={browserWorkers} onCreate={() => { setPairingCode(null); setWorkerForm({ ...emptyWorker }); }} onRevoke={disableWorker} busy={saving} />
      <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#0D1016]/90 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"><header className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFE37A]">Grupos e instâncias</p><h3 className="mt-1 text-xl font-black text-white">Configuração no lugar certo</h3></div><div className="flex gap-2"><button type="button" onClick={() => setGroupForm({ ...emptyGroup })} className="inline-flex items-center gap-2 rounded-xl border border-[#F5B800]/30 bg-[#F5B800]/10 px-4 py-2.5 text-sm font-black text-[#FFE37A]"><FolderPlus className="h-4 w-4" />Novo grupo</button><button type="button" onClick={() => newInstance()} className="inline-flex items-center gap-2 rounded-xl bg-[#F5B800] px-4 py-2.5 text-sm font-black text-[#171003]"><Plus className="h-4 w-4" />Nova instância</button></div></header>
        <div className="p-4 sm:p-6">{dashboard.isLoading && <div className="grid min-h-48 place-items-center text-sm text-slate-400">Carregando instâncias H2 Ads...</div>}{!dashboard.isLoading && groups.length === 0 && <EmptyState />}{groups.map(group => <GroupSection key={group.id} group={group} instances={instancesByGroup.get(group.id) ?? []} profileByInstance={profileByInstance} credentialByInstance={credentialByInstance} workerById={workerById} assignmentByInstance={assignmentByInstance} browserRunByInstance={browserRunByInstance} workers={browserWorkers} busy={saving} onEditGroup={() => setGroupForm({ id: group.id, name: group.name, description: group.description ?? "", status: group.status })} onNewInstance={() => newInstance(group.id)} onEditInstance={instance => setInstanceForm({ id: instance.id, groupId: String(instance.groupId), name: instance.name, notes: instance.notes ?? "", status: instance.status })} onEditRoute={openRouteEditor} onAssignWorker={updateInstanceWorker} onPrepareBrowser={requestBrowserPreparation} onLaunchBrowser={requestBrowserLaunch} onCloseBrowser={requestBrowserClose} />)}</div>
      </section>
      <section className="mt-6 grid gap-3 md:grid-cols-2"><article className="rounded-2xl border border-[#148CFF]/20 bg-[#148CFF]/[0.055] p-5"><div className="flex items-center gap-2 text-[#8CC8FF]"><ShieldCheck className="h-4 w-4" /><p className="text-sm font-black">Uma instância, uma rota</p></div><p className="mt-2 text-xs leading-5 text-slate-400">Cada configuração fica vinculada somente à instância escolhida.</p></article><article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-center gap-2 text-slate-300"><Network className="h-4 w-4" /><p className="text-sm font-black">Teste por clique</p></div><p className="mt-2 text-xs leading-5 text-slate-400">IP, localização, ISP, ASN e latência só são atualizados quando você clicar em validar.</p></article></section>
    </main>
    {groupForm && <Modal title={groupForm.id ? "Editar grupo" : "Novo grupo"} subtitle="Organização interna do H2 Ads." onClose={() => setGroupForm(null)}><form onSubmit={saveGroup} className="grid gap-4"><Field label="Nome do grupo"><input required minLength={H2ADS_NAME_MIN_LENGTH} value={groupForm.name} onChange={event => setGroupForm({ ...groupForm, name: event.target.value })} placeholder="Ex.: Operação São Paulo" /></Field><Field label="Descrição"><textarea value={groupForm.description} onChange={event => setGroupForm({ ...groupForm, description: event.target.value })} placeholder="Opcional" /></Field><Field label="Estado"><select value={groupForm.status} onChange={event => setGroupForm({ ...groupForm, status: event.target.value as GroupForm["status"] })}><option value="active">Ativo</option><option value="archived">Arquivado</option></select></Field><ActionBar saving={saving} label="Salvar grupo" onCancel={() => setGroupForm(null)} /></form></Modal>}
    {workerForm && !pairingCode && <Modal title="Adicionar Browser Worker" subtitle="Crie um código temporário para parear um computador Windows autorizado." onClose={() => setWorkerForm(null)}><form onSubmit={createPairing} className="grid gap-4"><Field label="Nome do computador"><input required value={workerForm.name} onChange={event => setWorkerForm({ ...workerForm, name: event.target.value })} placeholder="Ex.: Computador principal" /></Field><Field label="Capacidade de instâncias"><input required type="number" min="1" max="20" value={workerForm.capacity} onChange={event => setWorkerForm({ ...workerForm, capacity: event.target.value })} /></Field><p className="-mt-2 text-xs leading-5 text-slate-500">Defina quantas instâncias este computador poderá manter abertas no futuro. Nesta entrega, nenhum browser será iniciado.</p><ActionBar saving={saving} label="Criar código de pareamento" onCancel={() => setWorkerForm(null)} /></form></Modal>}
    {pairingCode && <Modal title="Código temporário do Worker" subtitle="Use este código apenas no seu computador Windows. Ele expira em 15 minutos e não será mostrado novamente depois de fechar." onClose={() => { setPairingCode(null); setWorkerForm(null); }}><div className="space-y-4"><div className="rounded-2xl border border-[#F5B800]/30 bg-[#F5B800]/[0.08] p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-[#FFE37A]">Código de pareamento</p><code className="mt-3 block break-all rounded-xl bg-black/40 p-3 text-sm font-bold text-white">{pairingCode.code}</code><p className="mt-3 text-xs text-slate-400">Expira às {new Date(pairingCode.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={copyPairingCode} className="inline-flex items-center gap-2 rounded-xl border border-[#148CFF]/35 bg-[#148CFF]/10 px-4 py-2.5 text-sm font-black text-[#8CC8FF]"><Copy className="h-4 w-4" />Copiar código</button><a href="/api/h2ads/worker/windows-agent.ps1" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-slate-200"><Monitor className="h-4 w-4" />Baixar agente Windows</a></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs font-bold text-slate-200">No PowerShell, execute apenas:</p><code className="mt-2 block break-all text-xs text-[#8CC8FF]">powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\H2AdsWorker.ps1" -Install</code><p className="mt-2 text-[11px] leading-4 text-slate-500">O próprio agente solicitará o código uma única vez; cole somente o código copiado acima. Ele não aparecerá no terminal.</p></div></div></Modal>}
    {instanceForm && <Modal title={instanceForm.id ? "Editar instância" : "Nova instância"} subtitle="A rota será configurada no cartão da instância depois de salvar." onClose={() => setInstanceForm(null)}><form onSubmit={saveInstance} className="grid gap-4"><div className="grid gap-4 sm:grid-cols-3"><Field label="Grupo"><select required value={instanceForm.groupId} onChange={event => setInstanceForm({ ...instanceForm, groupId: event.target.value })}><option value="">Selecione</option>{activeGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field><Field label="Nome da instância" className="sm:col-span-2"><input required minLength={H2ADS_NAME_MIN_LENGTH} value={instanceForm.name} onChange={event => setInstanceForm({ ...instanceForm, name: event.target.value })} placeholder="Ex.: Instância 01" /></Field></div><Field label="Notas"><textarea value={instanceForm.notes} onChange={event => setInstanceForm({ ...instanceForm, notes: event.target.value })} placeholder="Opcional" /></Field><Field label="Estado"><select value={instanceForm.status} onChange={event => setInstanceForm({ ...instanceForm, status: event.target.value as InstanceForm["status"] })}><option value="draft">Rascunho</option><option value="paused">Pausado</option><option value="archived">Arquivado</option></select></Field><ActionBar saving={saving} label="Salvar instância" onCancel={() => setInstanceForm(null)} /></form></Modal>}
    {networkForm && selectedInstance && <RouteEditor instance={selectedInstance} profile={profileByInstance.get(selectedInstance.id)} hasCredential={credentialByInstance.has(selectedInstance.id)} form={networkForm} setForm={setNetworkForm} proxyConfig={proxyConfig} setProxyConfig={setProxyConfig} proxyProtocol={proxyProtocol} setProxyProtocol={setProxyProtocol} rotationMinutes={proxyRotationMinutes} setRotationMinutes={setProxyRotationMinutes} showNewRoute={showNewRoute} setShowNewRoute={setShowNewRoute} encryptionReady={encryptionReady} saving={saving} onSaveRoute={replaceRoute} onSaveRotation={saveRotation} onValidate={validateRoute} onSaveMetadata={saveMetadata} onClose={closeRouteEditor} />}
  </div>;
}

function RouteEditor({ instance, profile, hasCredential, form, setForm, proxyConfig, setProxyConfig, proxyProtocol, setProxyProtocol, rotationMinutes, setRotationMinutes, showNewRoute, setShowNewRoute, encryptionReady, saving, onSaveRoute, onSaveRotation, onValidate, onSaveMetadata, onClose }: { instance: { id: number; name: string; status: "draft" | "paused" | "archived" }; profile?: NetworkProfile; hasCredential: boolean; form: NetworkProfileForm; setForm: (next: NetworkProfileForm) => void; proxyConfig: string; setProxyConfig: (value: string) => void; proxyProtocol: H2AdsProxyProtocol; setProxyProtocol: (value: H2AdsProxyProtocol) => void; rotationMinutes: string; setRotationMinutes: (value: string) => void; showNewRoute: boolean; setShowNewRoute: (value: boolean) => void; encryptionReady: boolean; saving: boolean; onSaveRoute: () => void; onSaveRotation: () => void; onValidate: () => void; onSaveMetadata: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  const isBlocked = profile?.healthStatus === "blocked" || profile?.healthStatus === "failed";
  const parsedRoute = useMemo(() => { if (!proxyConfig.trim()) return null; try { return parseH2AdsProxyInput(proxyConfig, proxyProtocol); } catch { return null; } }, [proxyConfig, proxyProtocol]);
  const protocols: { value: H2AdsProxyProtocol; label: string }[] = [{ value: "http", label: "HTTP" }, { value: "https", label: "HTTPS" }, { value: "socks5", label: "SOCKS5" }];
  const rotationNumber = rotationMinutes.trim() ? Number(rotationMinutes) : null;
  const rotationValid = rotationNumber === null || (Number.isInteger(rotationNumber) && rotationNumber >= 1 && rotationNumber <= 1_440);
  return <Modal title={`Rota · ${instance.name}`} subtitle="Uma rota pertence somente a esta instância. Trocar a linha não altera as demais." onClose={onClose}>
    <section className="overflow-hidden rounded-2xl border border-[#F5B800]/30 bg-[#0A0C11] shadow-[0_16px_42px_rgba(0,0,0,0.28)]">
      <header className="flex flex-col gap-3 border-b border-[#F5B800]/15 bg-gradient-to-r from-[#1E1705] via-[#15130B] to-[#0C1119] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#F5B800]/35 bg-[#F5B800]/12 text-sm font-black text-[#FFE37A]">1</span><div><h4 className="text-base font-black text-white">{hasCredential ? "Substituir rota rotativa" : "Adicionar rota à instância"}</h4><p className="mt-1 text-xs leading-5 text-slate-400">Selecione o protocolo, cole uma linha e confira os dados extraídos antes de vincular.</p></div></div><span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${hasCredential ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-slate-400"}`}>{hasCredential ? <CheckCircle2 className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}{hasCredential ? "Rota vinculada" : "Sem rota"}</span></header>
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(270px,0.75fr)]">
        <div className="space-y-4"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#FFE37A]">Protocolo da rota</p><div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Tipo de proxy">{protocols.map(option => <button key={option.value} type="button" onClick={() => setProxyProtocol(option.value)} aria-pressed={proxyProtocol === option.value} className={`rounded-xl border px-2 py-2.5 text-xs font-black transition-colors ${proxyProtocol === option.value ? "border-[#F5B800]/60 bg-[#F5B800] text-[#171003]" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-[#F5B800]/35 hover:text-[#FFE37A]"}`}>{option.label}</button>)}</div></div><label className="grid gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Linha da nova rota<div className="flex rounded-xl border border-white/10 bg-black/30 p-1.5 focus-within:border-[#148CFF]/55 focus-within:ring-2 focus-within:ring-[#148CFF]/15"><input type={showNewRoute ? "text" : "password"} autoComplete="new-password" spellCheck={false} value={proxyConfig} onChange={event => setProxyConfig(event.target.value)} className="h-10 min-w-0 flex-1 bg-transparent px-2 font-mono text-sm tracking-tight text-white outline-none placeholder:text-slate-600" placeholder="host:porta:utilizador:palavra-passe" aria-label="Nova rota da instância" /><button type="button" onClick={() => setShowNewRoute(!showNewRoute)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-bold normal-case tracking-normal text-slate-300 hover:bg-white/5 hover:text-white">{showNewRoute ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showNewRoute ? "Ocultar" : "Mostrar"}</button></div></label><p className="text-xs leading-5 text-slate-500">A palavra-passe fica somente nesta entrada temporária e não é exibida na conferência.</p><label className="grid gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Tempo de rotação (minutos)<div className="flex flex-col gap-2 sm:flex-row"><input type="number" min="1" max="1440" inputMode="numeric" value={rotationMinutes} onChange={event => setRotationMinutes(event.target.value)} placeholder="Ex.: 30" className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-bold text-white outline-none focus:border-[#148CFF]/55 focus:ring-2 focus:ring-[#148CFF]/15" />{hasCredential && <button type="button" disabled={saving || !rotationValid} onClick={onSaveRotation} className="rounded-xl border border-[#148CFF]/35 bg-[#148CFF]/10 px-4 py-2.5 text-xs font-black normal-case tracking-normal text-[#8CC8FF] disabled:cursor-not-allowed disabled:opacity-45">Salvar tempo</button>}</div><span className="normal-case tracking-normal text-slate-500">Deixe vazio para desativar. A credencial continua cifrada; somente o tempo fica visível no ADM. A mudança entra na próxima abertura do browser.</span></label>{proxyConfig.trim() && !parsedRoute && <p className="rounded-xl border border-rose-400/25 bg-rose-400/[0.08] px-3 py-2.5 text-xs font-semibold text-rose-100">Formato inválido. Use <span className="font-mono">host:porta:utilizador:palavra-passe</span>.</p>}</div>
        <aside className="rounded-2xl border border-[#148CFF]/22 bg-[linear-gradient(145deg,rgba(20,140,255,0.10),rgba(7,12,20,0.38))] p-4"><div className="flex items-start gap-2"><span className="grid h-6 w-6 place-items-center rounded-lg bg-[#148CFF]/15 text-[11px] font-black text-[#8CC8FF]">2</span><div><p className="text-sm font-black text-white">Conferência automática</p><p className="mt-0.5 text-[11px] leading-4 text-slate-400">Dados extraídos da nova linha antes de salvar.</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><ExtractedRouteField label="Tipo" value={parsedRoute?.protocol.toUpperCase() ?? proxyProtocol.toUpperCase()} highlight /><ExtractedRouteField label="Porta" value={parsedRoute ? String(parsedRoute.port) : "Aguardando"} /><ExtractedRouteField label="Host" value={parsedRoute?.host ?? "Aguardando linha"} className="col-span-2" /><ExtractedRouteField label="Utilizador" value={parsedRoute?.username ?? "Aguardando linha"} className="col-span-2" /></div><p className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-4 text-slate-500">Host, porta e utilizador ficam visíveis para conferência. A palavra-passe não aparece aqui.</p></aside>
      </div>
      <footer className="flex flex-col gap-3 border-t border-white/10 bg-black/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div>{!encryptionReady ? <p className="text-xs font-semibold text-rose-200">A chave segura não está disponível; a rota não será salva.</p> : profile?.lastCheckMessage ? <p className={`text-xs font-semibold ${healthClass(profile.healthStatus)}`}>{profile.lastCheckMessage}</p> : <p className="text-xs text-slate-500">Salve a rota para deixá-la vinculada a esta instância.</p>}{isBlocked && <p className="mt-1 text-xs text-rose-200">Substitua a rota e valide novamente para atualizar o estado.</p>}</div><div className="flex flex-wrap gap-2"><button type="button" disabled={saving || !encryptionReady || !parsedRoute} onClick={onSaveRoute} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F5B800] px-4 py-2.5 text-sm font-black text-[#171003] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"><LockKeyhole className="h-4 w-4" />{hasCredential ? "Substituir rota" : "Salvar e vincular"}</button><button type="button" disabled={saving || !hasCredential} onClick={onValidate} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#148CFF]/35 bg-[#148CFF]/10 px-4 py-2.5 text-sm font-black text-[#8CC8FF] hover:bg-[#148CFF]/15 disabled:cursor-not-allowed disabled:opacity-45"><Activity className="h-4 w-4" />Verificar rota</button></div></footer>
    </section>
    <form onSubmit={onSaveMetadata} className="mt-5"><details className="group rounded-2xl border border-white/10 bg-black/20"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-black text-slate-200"><span className="mr-2 text-[#8CC8FF]">+</span>Metadados opcionais da rota</summary><div className="border-t border-white/10 p-4"><div className="mb-4 rounded-xl border border-[#148CFF]/20 bg-[#148CFF]/[0.06] px-3 py-2.5"><p className="text-xs font-black text-[#8CC8FF]">País e cidade vêm do teste da própria rota</p><p className="mt-1 text-[11px] leading-4 text-slate-400">O painel registra a localização devolvida pelo proxy; esse dado não precisa ser preenchido manualmente.</p></div><p className="mb-4 text-xs leading-5 text-slate-500">Use apenas rótulos administrativos. Não cole uma configuração de proxy nestes campos.</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Fornecedor"><input value={form.providerName} onChange={event => setForm({ ...form, providerName: event.target.value })} placeholder="Ex.: Fornecedor autorizado" /></Field><Field label="Rótulo interno"><input value={form.routeLabel} onChange={event => setForm({ ...form, routeLabel: event.target.value })} placeholder="Ex.: Rota BR-SP-01" /></Field><Field label="ISP previsto"><input value={form.expectedIsp} onChange={event => setForm({ ...form, expectedIsp: event.target.value })} placeholder="Opcional" /></Field><Field label="ASN previsto"><input value={form.expectedAsn} onChange={event => setForm({ ...form, expectedAsn: event.target.value })} placeholder="Opcional" /></Field></div><div className="mt-3"><Field label="Estado"><select value={form.setupStatus} onChange={event => setForm({ ...form, setupStatus: event.target.value as NetworkProfileForm["setupStatus"] })}><option value="not_configured">Não configurado</option><option value="metadata_ready">Metadados prontos</option><option value="blocked">Bloqueado</option></select></Field></div><ActionBar saving={saving} label="Salvar metadados" onCancel={onClose} /></div></details></form>
  </Modal>;
}

function ExtractedRouteField({ label, value, highlight = false, className = "" }: { label: string; value: string; highlight?: boolean; className?: string }) { return <div className={`min-w-0 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 ${className}`}><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className={`mt-1 truncate font-mono text-xs font-bold ${highlight ? "text-[#8CC8FF]" : value.startsWith("Aguardando") ? "text-slate-500" : "text-slate-100"}`} title={value}>{value}</p></div>; }

function WorkerPanel({ workers, onCreate, onRevoke, busy }: { workers: BrowserWorker[]; onCreate: () => void; onRevoke: (worker: BrowserWorker) => void; busy: boolean }) {
  return <section className="mt-6 overflow-hidden rounded-3xl border border-[#148CFF]/20 bg-[#0D1016]/90"><header className="flex flex-col gap-3 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#8CC8FF]">Browser Workers</p><h3 className="mt-1 text-xl font-black text-white">Computadores de execução</h3><p className="mt-1 text-xs leading-5 text-slate-400">Cada computador é pareado individualmente. Nesta fase, o painel acompanha somente a presença e a atribuição.</p></div><button type="button" onClick={onCreate} className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#148CFF]/30 bg-[#148CFF]/10 px-4 py-2.5 text-sm font-black text-[#8CC8FF]"><Plus className="h-4 w-4" />Adicionar Worker</button></header><div className="p-4 sm:p-5">{workers.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-5"><p className="font-bold text-slate-200">Nenhum computador pareado.</p><p className="mt-1 text-xs leading-5 text-slate-500">Crie um código temporário para conectar o seu Windows principal. Outros computadores poderão ser adicionados depois.</p></div> : <div className="grid gap-3 lg:grid-cols-2">{workers.map(worker => <article key={worker.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-white">{worker.name}</p><WorkerPresence worker={worker} /></div><p className="mt-1 text-xs text-slate-500">{worker.computerName || "Aguardando primeiro contacto"} · Windows · capacidade {worker.capacity}</p></div>{worker.status === "active" && <button type="button" disabled={busy} onClick={() => onRevoke(worker)} className="text-xs font-bold text-rose-200 hover:text-rose-100 disabled:opacity-50">Revogar</button>}</div><div className="mt-3 border-t border-white/8 pt-3 text-[11px] text-slate-500"><p>{worker.agentVersion ? `Agente ${worker.agentVersion}` : "Agente ainda não identificado"}</p><p className="mt-1">{worker.lastSeenAt ? `Último sinal: ${new Date(worker.lastSeenAt).toLocaleString("pt-BR")}` : "Ainda não recebeu sinal."}</p></div></article>)}</div>}</div></section>;
}

function WorkerPresence({ worker }: { worker: BrowserWorker }) { const present = worker.connectionStatus === "online"; const revoked = worker.connectionStatus === "revoked"; return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${present ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : revoked ? "border-rose-400/25 bg-rose-400/10 text-rose-200" : "border-amber-400/25 bg-amber-400/10 text-amber-100"}`}>{present ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{present ? "Online" : revoked ? "Revogado" : "Offline"}</span>; }

function GroupSection({ group, instances, profileByInstance, credentialByInstance, workerById, assignmentByInstance, browserRunByInstance, workers, busy, onEditGroup, onNewInstance, onEditInstance, onEditRoute, onAssignWorker, onPrepareBrowser, onLaunchBrowser, onCloseBrowser }: { group: { id: number; name: string; description: string | null; status: "active" | "archived" }; instances: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }[]; profileByInstance: Map<number, NetworkProfile>; credentialByInstance: Map<number, unknown>; workerById: Map<number, BrowserWorker>; assignmentByInstance: Map<number, WorkerAssignment>; browserRunByInstance: Map<number, BrowserRun>; workers: BrowserWorker[]; busy: boolean; onEditGroup: () => void; onNewInstance: () => void; onEditInstance: (instance: { id: number; groupId: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }) => void; onEditRoute: (id: number) => void; onAssignWorker: (instanceId: number, workerId: string) => void; onPrepareBrowser: (instanceId: number) => void; onLaunchBrowser: (instanceId: number) => void; onCloseBrowser: (instanceId: number) => void }) {
  return <section className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20"><header className="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><h4 className="text-base font-black text-white">{group.name}</h4><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${group.status === "active" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-slate-400"}`}>{statusName(group.status)}</span></div><p className="mt-1 text-xs text-slate-400">{group.description || "Sem descrição administrativa."}</p></div><div className="flex gap-2"><button type="button" onClick={onEditGroup} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300"><Pencil className="h-3.5 w-3.5" />Editar</button><button type="button" disabled={group.status !== "active"} onClick={onNewInstance} className="inline-flex items-center gap-1.5 rounded-lg border border-[#148CFF]/25 bg-[#148CFF]/10 px-3 py-2 text-xs font-bold text-[#8CC8FF] disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Instância</button></div></header><div className="grid gap-3 p-3 lg:grid-cols-2 2xl:grid-cols-4">{instances.length === 0 ? <p className="px-1 py-2 text-xs text-slate-500">Nenhuma instância cadastrada neste grupo.</p> : instances.map(instance => <InstanceCard key={instance.id} instance={instance} profile={profileByInstance.get(instance.id)} hasCredential={credentialByInstance.has(instance.id)} assignment={assignmentByInstance.get(instance.id)} browserRun={browserRunByInstance.get(instance.id)} worker={assignmentByInstance.get(instance.id) ? workerById.get(assignmentByInstance.get(instance.id)!.workerId) : undefined} workers={workers} busy={busy} onAssignWorker={onAssignWorker} onPrepareBrowser={onPrepareBrowser} onLaunchBrowser={onLaunchBrowser} onCloseBrowser={onCloseBrowser} onEditInstance={() => onEditInstance(instance)} onEditRoute={() => onEditRoute(instance.id)} />)}</div></section>;
}

function InstanceCard({ instance, profile, hasCredential, assignment, browserRun, worker, workers, busy, onAssignWorker, onPrepareBrowser, onLaunchBrowser, onCloseBrowser, onEditInstance, onEditRoute }: { instance: { id: number; name: string; notes: string | null; status: "draft" | "paused" | "archived" }; profile?: NetworkProfile; hasCredential: boolean; assignment?: WorkerAssignment; browserRun?: BrowserRun; worker?: BrowserWorker; workers: BrowserWorker[]; busy: boolean; onAssignWorker: (instanceId: number, workerId: string) => void; onPrepareBrowser: (instanceId: number) => void; onLaunchBrowser: (instanceId: number) => void; onCloseBrowser: (instanceId: number) => void; onEditInstance: () => void; onEditRoute: () => void }) {
  const observedLocation = [profile?.observedCountryCode, profile?.observedCity].filter(Boolean).join(" · ");
  const isArchived = instance.status === "archived";
  const isOnline = worker?.connectionStatus === "online";
  const canPrepare = Boolean(assignment && isOnline && hasCredential && profile?.healthStatus === "healthy" && !isArchived);
  const canLaunch = Boolean(assignment && isOnline && !isArchived && (browserRun?.state === "proxy_verified" || browserRun?.state === "closed"));
  const canClose = Boolean(assignment && isOnline && !isArchived && browserRun?.state === "browser_open");
  const browserState = browserRun?.state === "browser_open" ? "Browser aberto no perfil local" : browserRun?.state === "closed" ? "Browser encerrado · perfil local preservado" : browserRun?.state === "proxy_verified" ? "Perfil local pronto · proxy confirmado" : browserRun?.state === "queued" ? "Comando na fila do Worker" : browserRun?.state === "preparing" ? "Verificando a rota pelo Worker" : browserRun?.state === "blocked" ? "Operação bloqueada: proxy ou browser indisponível" : "Browser ainda não preparado";
  return <article className="rounded-2xl border border-white/10 bg-[#10131A]/90 p-4">
    <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h5 className="text-base font-black text-white">{instance.name}</h5><span className="rounded-full border border-[#148CFF]/25 bg-[#148CFF]/10 px-2 py-0.5 text-[10px] font-black uppercase text-[#8CC8FF]">{statusName(instance.status)}</span></div><p className="mt-1 text-xs text-slate-500">{instance.notes || "Rota individual desta instância."}</p></div><button type="button" disabled={isArchived} onClick={onEditRoute} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#F5B800] px-3 py-2 text-xs font-black text-[#171003] disabled:opacity-40"><KeyRound className="h-3.5 w-3.5" />{hasCredential ? "Editar rota" : "Adicionar rota"}</button></div>
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/8 bg-black/20 p-3 text-xs"><div><p className="text-slate-500">Rota</p><p className={`mt-1 font-bold ${hasCredential ? "text-emerald-200" : "text-slate-400"}`}>{hasCredential ? "Vinculada" : "Não configurada"}</p></div><div><p className="text-slate-500">Último teste</p><p className={`mt-1 font-bold ${healthClass(profile?.healthStatus ?? "not_checked")}`}>{healthName(profile?.healthStatus ?? "not_checked")}</p></div>{profile?.observedIp && <div className="col-span-2 border-t border-white/8 pt-3"><p className="text-slate-500">Resultado</p><p className="mt-1 font-semibold text-slate-200">IP {profile.observedIp}{observedLocation ? ` · ${observedLocation}` : ""}{profile.latencyMs !== null ? ` · ${profile.latencyMs} ms` : ""}</p></div>}</div>
    <div className="mt-3 rounded-xl border border-[#148CFF]/15 bg-[#148CFF]/[0.04] p-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8CC8FF]">Worker de execução</p>{worker && <WorkerPresence worker={worker} />}</div><select disabled={busy || isArchived} value={assignment?.workerId ? String(assignment.workerId) : ""} onChange={event => onAssignWorker(instance.id, event.target.value)} className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs font-bold text-slate-200 disabled:opacity-50"><option value="">{workers.length ? "Selecione um Worker" : "Cadastre um Worker primeiro"}</option>{workers.filter(item => item.status === "active").map(item => <option key={item.id} value={item.id}>{item.name} · {item.connectionStatus === "online" ? "online" : "offline"}</option>)}</select><p className="mt-2 text-[11px] text-slate-500">{assignment ? `Perfil: ${assignment.profileState.replace("_", " ")} · versão ${assignment.profileVersion}` : "Ainda sem Worker atribuído."}</p></div>
    <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.035] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-200">Sessão local</p><p className={`mt-1 text-[11px] ${browserRun?.state === "blocked" ? "text-rose-200" : browserRun?.state === "browser_open" ? "text-emerald-100" : "text-slate-400"}`}>{browserState}{browserRun?.observedIp ? ` · IP ${browserRun.observedIp}` : ""}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !canPrepare || browserRun?.state === "queued" || browserRun?.state === "preparing" || browserRun?.state === "browser_open"} onClick={() => onPrepareBrowser(instance.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"><ShieldCheck className="h-3.5 w-3.5" />Preparar</button><button type="button" disabled={busy || !canLaunch} onClick={() => onLaunchBrowser(instance.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#F5B800] px-3 py-2 text-xs font-black text-[#171003] disabled:cursor-not-allowed disabled:opacity-45"><Play className="h-3.5 w-3.5" />Abrir browser</button><button type="button" disabled={busy || !canClose} onClick={() => onCloseBrowser(instance.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-black text-rose-100 disabled:cursor-not-allowed disabled:opacity-45"><Square className="h-3.5 w-3.5" />Encerrar</button></div></div><p className="mt-2 text-[10px] leading-4 text-slate-500">A abertura depende de perfil e proxy confirmados. O browser abre apenas no Windows atribuído e não executa automação de sites.</p></div>
    <div className="mt-3 flex items-center justify-between gap-3"><p className="min-w-0 truncate text-[11px] text-slate-500">{profile?.lastCheckMessage || "Nenhuma validação executada."}</p><button type="button" onClick={onEditInstance} className="shrink-0 text-xs font-bold text-slate-400 hover:text-white">Editar instância</button></div>
  </article>;
}

function Metric({ icon: Icon, value, label, text, tone }: { icon: typeof Monitor; value: number; label: string; text: string; tone: "gold" | "blue" | "red" }) { const color = tone === "gold" ? "text-[#F5B800] bg-[#F5B800]/10 border-[#F5B800]/20" : tone === "blue" ? "text-[#66B5FF] bg-[#148CFF]/10 border-[#148CFF]/20" : "text-[#FF9C9C] bg-rose-400/10 border-rose-400/20"; return <article className="rounded-2xl border border-white/8 bg-[#10131A]/85 p-4"><div className={`grid h-10 w-10 place-items-center rounded-xl border ${color}`}><Icon className="h-5 w-5" /></div><h3 className="mt-4 text-sm font-black text-white">{value} {label}</h3><p className="mt-1.5 text-xs text-slate-400">{text}</p></article>; }
function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) { return <label className={`grid gap-1.5 text-xs font-bold text-slate-300 ${className}`}>{label}<span className="[&>input]:h-10 [&>input]:rounded-lg [&>input]:border [&>input]:border-white/10 [&>input]:bg-black/20 [&>input]:px-3 [&>input]:text-sm [&>input]:text-white [&>select]:h-10 [&>select]:rounded-lg [&>select]:border [&>select]:border-white/10 [&>select]:bg-black/20 [&>select]:px-3 [&>select]:text-sm [&>select]:text-white [&>textarea]:min-h-20 [&>textarea]:rounded-lg [&>textarea]:border [&>textarea]:border-white/10 [&>textarea]:bg-black/20 [&>textarea]:px-3 [&>textarea]:py-2 [&>textarea]:text-sm [&>textarea]:text-white">{children}</span></label>; }
function ActionBar({ saving, label, onCancel }: { saving: boolean; label: string; onCancel: () => void }) { return <div className="mt-5 flex gap-2"><button disabled={saving} className="rounded-lg bg-[#F5B800] px-4 py-2 text-sm font-black text-[#171003] disabled:opacity-60">{saving ? "Salvando..." : label}</button><button type="button" onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-slate-300">Cancelar</button></div>; }
function EmptyState() { return <div className="grid min-h-[250px] place-items-center text-center"><div className="max-w-md"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[#148CFF]/25 bg-[#148CFF]/10 text-[#66B5FF]"><Monitor className="h-8 w-8" /></div><h4 className="mt-5 text-lg font-black text-white">Nenhum grupo criado</h4><p className="mt-2 text-sm leading-6 text-slate-400">Crie um grupo para organizar as instâncias de rota individual.</p></div></div>; }
