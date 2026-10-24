import { useState, type MouseEvent, type ChangeEvent } from "react";
import { Play, Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { resolveH2AdsOrderBrowserShortcutState, resolveH2AdsOrderLinkRepairCandidate } from "@shared/h2adsOrderBrowserShortcut";
import { normalizeH2AdsRoutingText, resolveH2AdsAutomaticGroup } from "@shared/h2adsGroupRouting";

export default function OrderH2AdsBrowserShortcut({ registrationId, subOrderIndex, customerNumber, customerName, orderNumber, latestStatus, serviceName, serviceOption }: { registrationId: number; subOrderIndex: number; customerNumber?: number | null; customerName?: string | null; orderNumber?: number | null; latestStatus?: string | null; serviceName?: string | null; serviceOption?: string | null }) {
  const utils = trpc.useUtils();
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroupId, setNewGroupId] = useState<number | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [linkingExisting, setLinkingExisting] = useState(false);
  const linksQuery = trpc.h2Ads.listOrderLinks.useQuery(undefined, {
    staleTime: 0,
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const dashboardQuery = trpc.h2Ads.listDashboard.useQuery(undefined, {
    staleTime: 0,
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const ordersQuery = trpc.orderStatus.listOrders.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const launchBrowser = trpc.h2Ads.launchBrowser.useMutation();
  const closeBrowser = trpc.h2Ads.closeBrowser.useMutation();
  const validateProxy = trpc.h2Ads.validateProxy.useMutation();
  const updateInstance = trpc.h2Ads.updateInstance.useMutation();
  const setOrderLink = trpc.h2Ads.setOrderLink.useMutation();
  const createInstanceLinkedOrderAuto = trpc.h2Ads.createInstanceLinkedOrderAuto.useMutation();
  const rotateProxyAuto = trpc.h2Ads.rotateProxyAuto.useMutation();
  const deleteInstance = trpc.h2Ads.deleteInstance.useMutation();

  const dashboard = dashboardQuery.data;
  const orders = (ordersQuery.data ?? []) as any[];
  const activeOrder = orders.find(order => order.id === registrationId && (order.subOrderIndex ?? 0) === subOrderIndex);
  const currentOrder = activeOrder ?? {
    id: registrationId,
    subOrderIndex,
    customerNumber: customerNumber ?? null,
    customerName: customerName ?? null,
    codeClientName: customerName ?? null,
    orderNumber: orderNumber ?? null,
    serviceName: serviceName ?? null,
    serviceOption: serviceOption ?? null,
    latestStatus: latestStatus ?? null,
  };
  const activeGroups = (dashboard?.groups ?? []).filter(group => group.status === "active");
  const automaticGroup = resolveH2AdsAutomaticGroup(activeGroups, currentOrder);
  const deliveredGroup = activeGroups.find(group => {
    const name = normalizeH2AdsRoutingText(group.name);
    return name === "entregue" || name === "entregues" || name === "grupo entregue" || name === "grupo entregues";
  }) ?? null;

  const linkedIds = (linksQuery.data ?? []).filter(link => link.registrationId === registrationId && link.subOrderIndex === subOrderIndex).map(link => link.instanceId);
  const allLinkedInstanceIds = new Set((linksQuery.data ?? []).map(link => link.instanceId));
  const activeGroupIds = new Set(activeGroups.map(group => group.id));
  const unlinkedInstances = (dashboard?.instances ?? [])
    .filter(instance => !allLinkedInstanceIds.has(instance.id) && instance.status !== "archived" && activeGroupIds.has(instance.groupId))
    .map(instance => ({
      instance,
      group: activeGroups.find(group => group.id === instance.groupId),
    }))
    .sort((a, b) => (a.group?.name || "").localeCompare(b.group?.name || "", "pt-BR") || a.instance.name.localeCompare(b.instance.name, "pt-BR"));
  const activeInstanceId = linkedIds.includes(selectedInstanceId ?? -1) ? selectedInstanceId : linkedIds.length === 1 ? linkedIds[0] : null;
  const shortcut = resolveH2AdsOrderBrowserShortcutState({
    registrationId,
    subOrderIndex,
    links: (linksQuery.data ?? []) as any[],
    instanceId: activeInstanceId ?? undefined,
    instances: (dashboard?.instances ?? []) as any[],
    assignments: (dashboard?.instanceWorkerAssignments ?? []) as any[],
    workers: (dashboard?.browserWorkers ?? []) as any[],
    runs: (dashboard?.instanceBrowserRuns ?? []) as any[],
  });
  const linkedInstance = shortcut ? (dashboard?.instances ?? []).find(instance => instance.id === shortcut.instanceId) : undefined;

  const repairCandidate = shortcut ? null : resolveH2AdsOrderLinkRepairCandidate({
    registrationId,
    subOrderIndex,
    customerNumber,
    serviceName,
    serviceOption,
    links: (linksQuery.data ?? []) as any[],
    orders,
    instances: (dashboard?.instances ?? []) as any[],
    groups: (dashboard?.groups ?? []) as any[],
  });

  const pending = launchBrowser.isPending || closeBrowser.isPending || validateProxy.isPending || updateInstance.isPending || setOrderLink.isPending || createInstanceLinkedOrderAuto.isPending || rotateProxyAuto.isPending || deleteInstance.isPending;

  const refresh = async () => {
    await Promise.all([
      utils.h2Ads.listDashboard.invalidate(),
      utils.h2Ads.listOrderLinks.invalidate(),
    ]);
  };

  const createLinkedInstance = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (pending || dashboardQuery.isLoading || ordersQuery.isLoading) return;
    if (activeGroups.length === 0) {
      toast.error("Não existe grupo H2ADS ativo para receber a instância.");
      return;
    }

    let group = newGroupId ? activeGroups.find(item => item.id === newGroupId) ?? null : automaticGroup;
    if (!group) {
      const options = activeGroups.map((item, index) => `${index + 1} - ${item.name}`).join("\n");
      const choice = window.prompt(`Não foi possível definir o grupo automaticamente.\n\nEscolha o grupo digitando o número:\n\n${options}`);
      if (choice === null) return;
      const selectedIndex = Number(choice.trim()) - 1;
      if (!Number.isInteger(selectedIndex) || !activeGroups[selectedIndex]) {
        toast.error("Grupo inválido. A instância não foi criada.");
        return;
      }
      group = activeGroups[selectedIndex];
    }

    const prefix = currentOrder.customerNumber ? `*${currentOrder.customerNumber}` : customerNumber ? `*${customerNumber}` : `#${currentOrder.orderNumber || registrationId}`;
    const customerName = String(currentOrder.customerName || currentOrder.codeClientName || "CLIENTE").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
    const name = (newName.trim() || `${prefix} ${customerName}`).slice(0, 128);
    const confirmed = window.confirm(`Criar a instância H2ADS:\n\n${name}\n\nGrupo: ${group.name}\n\nEla será vinculada automaticamente a este pedido.`);
    if (!confirmed) return;

    try {
      const created = await createInstanceLinkedOrderAuto.mutateAsync({
        groupId: group.id,
        name,
        notes: newNote.trim() || null,
        status: "draft",
        registrationId,
        subOrderIndex,
      });
      const provision = created.provision;
      if (provision.status === "preparing") toast.success("Instância criada. Proxy + WALK1 configurados e preparação enviada.");
      else if (provision.status === "awaiting_proxy") toast.warning("Instância criada, mas a fila de proxies está vazia.");
      else if (provision.status === "worker_unavailable") toast.warning(provision.message);
      else toast.error(provision.message);
      setNewNote("");
      setNewName("");
      setNewGroupId(null);
      setCreating(false);
      setSelectedInstanceId(created.id);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a instância H2ADS.");
    }
  };

  const openBrowser = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!shortcut?.canOpen || pending) return;
    try {
      await launchBrowser.mutateAsync({ instanceId: shortcut.instanceId });
      toast.success("Comando para abrir o browser H2ADS enviado.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o browser H2ADS.");
    }
  };

  const closeBrowserNow = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!shortcut?.canClose || pending) return;
    try {
      await closeBrowser.mutateAsync({ instanceId: shortcut.instanceId });
      toast.success("Comando para fechar o browser H2ADS enviado.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível fechar o browser H2ADS.");
    }
  };

  const prepareAgain = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!shortcut || pending) return;
    try {
      const result = await validateProxy.mutateAsync({ instanceId: shortcut.instanceId });
      if ((result as any)?.healthy === false) toast.error((result as any)?.message || "A rota continua indisponível.");
      else toast.success("Conexão revalidada. A instância aberta vai reconectar sem fechar.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível preparar novamente.");
    }
  };

  const rotateProxy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!shortcut || pending) return;
    if (!window.confirm("Trocar o proxy desta instância?\n\nO proxy atual será marcado como USADO e não voltará para a fila.")) return;
    try {
      const result = await rotateProxyAuto.mutateAsync({ instanceId: shortcut.instanceId });
      if (result.status === "preparing") toast.success("Proxy trocado. WALK1 recebeu a nova preparação.");
      else if (result.status === "reconnecting") toast.success("Proxy trocado. A instância aberta está aplicando a nova conexão.");
      else if (result.status === "awaiting_proxy") toast.warning("Fila vazia. O proxy atual foi mantido.");
      else if (result.status === "worker_unavailable") toast.warning(result.message);
      else toast.error(result.message);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível trocar o proxy.");
    }
  };

  const deleteLinkedInstance = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!shortcut || pending) return;
    if (shortcut.state === "browser_open") {
      toast.error("Feche o browser antes de deletar a instância.");
      return;
    }
    const label = linkedInstance?.name || `instância #${shortcut.instanceId}`;
    if (!window.confirm(`DELETAR ${label}?\n\nA instância H2ADS e o vínculo com este pedido serão apagados. O pedido e o cliente não serão excluídos.`)) return;
    try {
      const result = await deleteInstance.mutateAsync({ id: shortcut.instanceId });
      await refresh();
      if (result.success) {
        toast.success("Instância H2ADS excluída. Limpeza confirmada.");
      } else if (result.pending) {
        toast.info("Exclusão em andamento. Aguardando limpeza local e dos backups; não clique novamente.");
      } else {
        toast.error("Exclusão não confirmada. A instância permanece em verificação.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível deletar a instância H2ADS.");
    }
  };

  const moveToDelivered = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!shortcut || pending) return;
    if (!deliveredGroup) {
      toast.error("Não encontrei um grupo H2ADS ativo chamado ENTREGUE.");
      return;
    }
    if (linkedInstance?.groupId === deliveredGroup.id) {
      toast.info(`A instância já está em ${deliveredGroup.name}.`);
      return;
    }
    try {
      await updateInstance.mutateAsync({ id: shortcut.instanceId, groupId: deliveredGroup.id });
      toast.success(`Instância movida para ${deliveredGroup.name}.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mover a instância para ENTREGUE.");
    }
  };

  const changeLinkedInstanceGroup = async (event: ChangeEvent<HTMLSelectElement>) => {
    event.stopPropagation();
    if (!shortcut || !linkedInstance || pending) return;
    const groupId = Number(event.target.value);
    const group = activeGroups.find(item => item.id === groupId);
    if (!group || group.id === linkedInstance.groupId) return;
    try {
      await updateInstance.mutateAsync({ id: shortcut.instanceId, groupId: group.id });
      toast.success(`Instância movida para ${group.name}.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível trocar o grupo da instância.");
    }
  };

  const unlinkLinkedInstance = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!shortcut || pending) return;
    const label = linkedInstance?.name || `instância #${shortcut.instanceId}`;
    if (!window.confirm(`DESVINCULAR ${label} deste pedido?\n\nA instância NÃO será apagada. Proxy, perfil e dados H2ADS serão mantidos. Ela ficará livre para ser vinculada a outro pedido.`)) return;
    try {
      await setOrderLink.mutateAsync({
        instanceId: shortcut.instanceId,
        registrationId: null,
        subOrderIndex: 0,
      });
      setSelectedInstanceId(null);
      setEditingNote(false);
      toast.success("Instância desvinculada do pedido sem apagar os dados.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desvincular a instância.");
    }
  };

  const repairLink = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!repairCandidate || pending) return;
    // A confirmação usa a referência calculada; o servidor valida novamente o vínculo antes de transferir.

    const sourceLabel = repairCandidate.linkedOrderNumber
      ? `pedido #${repairCandidate.linkedOrderNumber}`
      : `registro ${repairCandidate.linkedRegistrationId}, subpedido ${repairCandidate.linkedSubOrderIndex + 1}`;
    const confirmed = window.confirm(
      `A instância H2ADS compatível está vinculada atualmente ao ${sourceLabel}.\n\nDeseja transferir o vínculo para este pedido/subpedido?\n\nO browser não será aberto automaticamente.`
    );
    if (!confirmed) return;

    try {
      await setOrderLink.mutateAsync({ instanceId: repairCandidate.instanceId, registrationId, subOrderIndex });
      toast.success("Vínculo H2ADS corrigido para este pedido.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível corrigir o vínculo H2ADS.");
    }
  };

  const linkExistingInstance = async (event: ChangeEvent<HTMLSelectElement>) => {
    event.stopPropagation();
    if (pending) return;
    const instanceId = Number(event.target.value);
    if (!Number.isInteger(instanceId) || instanceId < 1) return;
    const candidate = unlinkedInstances.find(item => item.instance.id === instanceId);
    if (!candidate) {
      toast.error("Esta instância não está mais disponível para vínculo.");
      await refresh();
      return;
    }
    const label = `${candidate.group?.name || "SEM GRUPO"} — ${candidate.instance.name}`;
    if (!window.confirm(`VINCULAR esta instância ao pedido atual?\n\n${label}\n\nA instância será mantida com o mesmo grupo, proxy, perfil e dados H2ADS.`)) {
      event.target.value = "";
      return;
    }
    try {
      await setOrderLink.mutateAsync({
        instanceId,
        registrationId,
        subOrderIndex,
      });
      setSelectedInstanceId(instanceId);
      setLinkingExisting(false);
      toast.success(`Instância vinculada: ${label}.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível vincular a instância.");
    }
  };

  const saveNote = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!shortcut || pending) return;
    try {
      await updateInstance.mutateAsync({ id: shortcut.instanceId, notes: noteDraft.trim() || null });
      setEditingNote(false);
      toast.success("OBS atualizada.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a OBS.");
    }
  };

  const linkExistingPanel = linkingExisting ? <span className="flex max-w-full flex-wrap items-center gap-1.5 sm:gap-2" onClick={event => event.stopPropagation()}>
    <select
      aria-label="Vincular instância H2ADS existente"
      defaultValue=""
      onChange={linkExistingInstance}
      disabled={pending || unlinkedInstances.length === 0}
      className="h-8 min-w-[190px] max-w-full rounded-lg border border-emerald-400/40 bg-slate-950 px-2 text-[10px] font-bold text-white disabled:opacity-40 sm:h-9 sm:min-w-[240px] sm:text-[11px] lg:h-10 lg:text-xs"
    >
      <option value="" disabled>{unlinkedInstances.length ? "GRUPO — INSTÂNCIA" : "NENHUMA INSTÂNCIA LIVRE"}</option>
      {unlinkedInstances.map(({ instance, group }) => (
        <option key={instance.id} value={instance.id}>{group?.name || "SEM GRUPO"} — {instance.name}</option>
      ))}
    </select>
    <button type="button" onClick={event => { event.stopPropagation(); setLinkingExisting(false); }} className="min-h-8 rounded-lg border border-white/10 bg-black/20 px-2.5 text-[10px] font-black text-slate-200 sm:min-h-9 sm:text-[11px]">X</button>
  </span> : <button
    type="button"
    onClick={event => { event.stopPropagation(); setLinkingExisting(true); }}
    disabled={pending || unlinkedInstances.length === 0}
    className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-emerald-400/35 bg-emerald-400/15 px-2.5 py-1.5 text-[10px] font-black text-emerald-100 disabled:cursor-not-allowed disabled:opacity-30 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:px-3.5 lg:text-xs"
    title={unlinkedInstances.length ? "Vincular uma instância H2ADS sem vínculo a este pedido" : "Não há instâncias H2ADS livres para vincular"}
  >
    VINCULAR INSTÂNCIA
  </button>;

  const createPanel = creating ? <span className="flex max-w-full flex-wrap items-center gap-1.5 sm:gap-2" onClick={event => event.stopPropagation()}>
    <input value={newName} onChange={event => setNewName(event.target.value)} maxLength={128} placeholder="Nome (automático)" aria-label="Nome da nova instância" className="h-8 w-40 max-w-full rounded-lg border border-violet-400/40 bg-slate-950 px-2 text-[10px] text-white sm:h-9 sm:w-44 sm:text-[11px] lg:h-10 lg:text-xs" />
    <select aria-label="Grupo da nova instância" value={newGroupId ?? automaticGroup?.id ?? ""} onChange={event => setNewGroupId(Number(event.target.value))} className="h-8 min-w-[140px] max-w-full rounded-lg border border-violet-400/40 bg-slate-950 px-2 text-[10px] text-white sm:h-9 sm:text-[11px] lg:h-10 lg:text-xs">
      <option value="" disabled>Escolha o grupo</option>
      {activeGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
    </select>
    <input value={newNote} onChange={event => setNewNote(event.target.value)} maxLength={150} placeholder="OBS: TESTE DOC" aria-label="OBS da nova instância" className="h-8 w-36 max-w-full rounded-lg border border-violet-400/40 bg-slate-950 px-2 text-[10px] text-white sm:h-9 sm:w-40 sm:text-[11px] lg:h-10 lg:text-xs" />
    <button type="button" onClick={createLinkedInstance} disabled={pending} className="min-h-8 rounded-lg border border-violet-400/30 bg-violet-500/25 px-2.5 text-[10px] font-black text-violet-100 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:text-xs">CONFIRMAR</button>
    <button type="button" onClick={() => setCreating(false)} className="min-h-8 rounded-lg border border-white/10 bg-black/20 px-2.5 text-[10px] font-black text-slate-200 sm:min-h-9 sm:text-[11px] lg:min-h-10 lg:text-xs">CANCELAR</button>
  </span> : <button type="button" onClick={event => { event.stopPropagation(); setNewNote(""); setCreating(true); }} disabled={pending} className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-violet-400/35 bg-violet-400/15 px-2.5 py-1.5 text-[10px] font-black text-violet-100 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:px-3.5 lg:text-xs"><Plus className="h-3.5 w-3.5 lg:h-4 lg:w-4" />CRIAR</button>;

  if (!shortcut && linkedIds.length > 1) {
    return <span className="flex w-full max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-1.5 sm:gap-2 sm:p-2" onClick={event => event.stopPropagation()}>
      <span className="text-[10px] font-black text-cyan-100 sm:text-[11px] lg:text-xs">H2ADS: {linkedIds.length} instâncias</span>
      <select aria-label="Escolher instância H2ADS" value="" onChange={event => { event.stopPropagation(); setSelectedInstanceId(Number(event.target.value)); setEditingNote(false); }} className="h-8 min-w-[150px] max-w-full rounded-lg border border-cyan-400/30 bg-slate-950 px-2 text-[10px] font-bold text-white sm:h-9 sm:text-[11px] lg:h-10 lg:text-xs">
        <option value="" disabled>SELECIONE</option>
        {linkedIds.map(id => <option key={id} value={id}>{(dashboard?.instances ?? []).find(item => item.id === id)?.name || `Instância #${id}`}</option>)}
      </select>
      {createPanel}
    </span>;
  }

  if (!shortcut && repairCandidate && !linkedIds.length) {
    const sourceTitle = repairCandidate.linkedOrderNumber
      ? `Instância compatível vinculada ao pedido #${repairCandidate.linkedOrderNumber}. Clique em VINCULAR para revisar e confirmar a transferência.`
      : "Instância compatível vinculada a outro pedido/subpedido. Clique em VINCULAR para revisar e confirmar a transferência.";
    return <span className="flex w-full max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 p-1.5 sm:gap-2 sm:p-2" title={sourceTitle} onClick={event => event.stopPropagation()}>
      <span className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-200 sm:px-2.5 sm:text-[11px] lg:text-xs">H2ADS</span>
      <button type="button" onClick={repairLink} disabled={pending} className="inline-flex min-h-8 items-center justify-center rounded-lg border border-amber-500/35 bg-amber-500/15 px-2.5 py-1.5 text-[10px] font-black text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-30 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:text-xs">VINCULAR</button>
      {linkExistingPanel}
    </span>;
  }

  if (!shortcut) {
    return <span className="flex w-full max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-violet-500/35 bg-violet-500/10 p-1.5 sm:gap-2 sm:p-2" title="Criar uma instância H2ADS já vinculada a este pedido" onClick={event => event.stopPropagation()}>
      <span className="rounded-lg border border-violet-400/20 bg-violet-400/10 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-violet-200 sm:px-2.5 sm:text-[11px] lg:text-xs">H2ADS</span>
      {linkExistingPanel}
      {createPanel}
    </span>;
  }

  const statusTitle = shortcut.reason || (shortcut.state === "browser_open" ? "Browser H2ADS aberto" : "Browser H2ADS pronto");
  const alreadyDelivered = Boolean(deliveredGroup && linkedInstance?.groupId === deliveredGroup.id);
  const deliveredTitle = !deliveredGroup
    ? "Crie um grupo H2ADS ativo chamado ENTREGUE para usar este atalho."
    : alreadyDelivered
      ? `A instância já está em ${deliveredGroup.name}.`
      : `Mover esta instância para ${deliveredGroup.name}.`;

  return <span className="flex w-full max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-1.5 sm:gap-2 sm:p-2 xl:gap-2.5" title={statusTitle} onClick={event => event.stopPropagation()}>
    <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-cyan-200 sm:px-2.5 sm:text-[11px] lg:text-xs">H2ADS</span>
    {linkedIds.length > 1 && <select aria-label="Selecionar instância H2ADS" value={activeInstanceId ?? ""} onChange={event => { event.stopPropagation(); setSelectedInstanceId(Number(event.target.value)); setEditingNote(false); }} className="h-8 min-w-[120px] max-w-full rounded-lg border border-cyan-400/30 bg-slate-950 px-2 text-[10px] font-bold text-white sm:h-9 sm:min-w-[140px] sm:text-[11px] lg:h-10 lg:text-xs">{linkedIds.map(id => { const item = (dashboard?.instances ?? []).find(instance => instance.id === id); return <option key={id} value={id}>{item?.name || `Instância #${id}`}</option>; })}</select>}
    {linkedInstance && <select
      aria-label="Grupo da instância H2ADS"
      value={linkedInstance.groupId}
      onChange={changeLinkedInstanceGroup}
      disabled={pending}
      className="h-8 min-w-[130px] max-w-full rounded-lg border border-amber-400/30 bg-slate-950 px-2 text-[10px] font-bold text-amber-100 disabled:opacity-40 sm:h-9 sm:min-w-[150px] sm:text-[11px] lg:h-10 lg:text-xs"
      title="Mover esta instância para outro grupo H2ADS"
    >
      {activeGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
    </select>}
    {linkedInstance && <span className="max-w-44 truncate rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-slate-200 sm:max-w-52 sm:text-[11px]" title={linkedInstance.notes || ""}>OBS: {linkedInstance.notes || "—"}</span>}
    {editingNote ? <span className="flex max-w-full flex-wrap items-center gap-1.5 sm:gap-2"><input value={noteDraft} onChange={event => setNoteDraft(event.target.value)} maxLength={150} aria-label="Editar OBS H2ADS" className="h-8 w-36 max-w-full rounded-lg border border-cyan-400/30 bg-slate-950 px-2 text-[10px] text-white sm:h-9 sm:w-44 sm:text-[11px]" /><button type="button" onClick={saveNote} disabled={pending} className="min-h-8 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 text-[10px] font-black text-emerald-200 sm:min-h-9 sm:text-[11px]">SALVAR</button><button type="button" onClick={event => {event.stopPropagation();setEditingNote(false);}} className="min-h-8 rounded-lg border border-white/10 bg-black/20 px-2.5 text-[10px] font-black text-slate-200 sm:min-h-9 sm:text-[11px]">X</button></span> : <button type="button" onClick={event => {event.stopPropagation();setNoteDraft(linkedInstance?.notes || "");setEditingNote(true);}} className="min-h-8 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 text-[10px] font-black text-cyan-100 sm:min-h-9 sm:text-[11px]">EDITAR OBS</button>}
    <span className="flex w-full flex-wrap items-center gap-1.5 border-t border-white/10 pt-1.5 sm:gap-2 sm:pt-2">
      {linkExistingPanel}
      {createPanel}
      <button
      type="button"
      onClick={openBrowser}
      disabled={!shortcut.canOpen || pending}
      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1.5 text-[10px] font-black text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-30 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:px-3.5 lg:text-xs"
      title={shortcut.canOpen ? "Abrir browser da instância vinculada" : statusTitle}
    >
      <Play className="h-3.5 w-3.5 lg:h-4 lg:w-4" />ABRIR
    </button>
    <button
      type="button"
      onClick={closeBrowserNow}
      disabled={!shortcut.canClose || pending}
      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/15 px-2.5 py-1.5 text-[10px] font-black text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-30 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:px-3.5 lg:text-xs"
      title={shortcut.canClose ? "Fechar browser da instância vinculada" : statusTitle}
    >
      <Square className="h-3.5 w-3.5 lg:h-4 lg:w-4" />FECHAR
    </button>
    <button
      type="button"
      onClick={prepareAgain}
      disabled={pending || shortcut.state === "queued" || shortcut.state === "preparing"}
      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-sky-400/35 bg-sky-400/15 px-2.5 py-1.5 text-[10px] font-black text-sky-100 transition hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-30 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:px-3.5 lg:text-xs"
      title="Revalidar e restaurar a conexão sem fechar a instância"
    >
      <RefreshCw className="h-3.5 w-3.5 lg:h-4 lg:w-4" />PREPARAR NOVAMENTE
    </button>
    <button
      type="button"
      onClick={rotateProxy}
      disabled={pending || shortcut.state === "queued" || shortcut.state === "preparing"}
      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-400/15 px-2.5 py-1.5 text-[10px] font-black text-amber-100 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-30 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:px-3.5 lg:text-xs"
      title="Trocar para o próximo proxy da fila, inclusive com a instância aberta"
    >
      <RefreshCw className="h-3.5 w-3.5 lg:h-4 lg:w-4" />TROCAR PROXY
    </button>
    <button
      type="button"
      onClick={moveToDelivered}
      disabled={!deliveredGroup || alreadyDelivered || pending}
      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-teal-400/35 bg-teal-400/15 px-2.5 py-1.5 text-[10px] font-black text-teal-100 transition hover:bg-teal-400/25 disabled:cursor-not-allowed disabled:opacity-30 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:px-3.5 lg:text-xs"
      title={deliveredTitle}
    >
      {alreadyDelivered ? "ENTREGUE ✓" : "ENTREGUE"}
    </button>
    <button
      type="button"
      onClick={unlinkLinkedInstance}
      disabled={pending}
      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-orange-400/40 bg-orange-400/15 px-2.5 py-1.5 text-[10px] font-black text-orange-100 transition hover:bg-orange-400/25 disabled:cursor-not-allowed disabled:opacity-30 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:px-3.5 lg:text-xs"
      title="Desvincular esta instância do pedido sem apagar a instância"
    >
      DESVINCULAR
    </button>
    <button
      type="button"
      onClick={deleteLinkedInstance}
      disabled={pending || shortcut.state === "browser_open" || shortcut.state === "queued" || shortcut.state === "preparing"}
      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-red-500/45 bg-red-500/15 px-2.5 py-1.5 text-[10px] font-black text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-30 sm:min-h-9 sm:px-3 sm:text-[11px] lg:min-h-10 lg:px-3.5 lg:text-xs"
      title={shortcut.state === "browser_open" ? "Feche o browser antes de deletar" : "Deletar somente a instância H2ADS vinculada"}
    >
      <Trash2 className="h-3.5 w-3.5 lg:h-4 lg:w-4" />DELETAR
    </button>
    </span>
  </span>;
}
