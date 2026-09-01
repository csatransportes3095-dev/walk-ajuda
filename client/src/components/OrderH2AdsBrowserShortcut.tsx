import type { MouseEvent } from "react";
import { Play, Plus, Square } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { resolveH2AdsOrderBrowserShortcutState, resolveH2AdsOrderLinkRepairCandidate } from "@shared/h2adsOrderBrowserShortcut";
import { resolveH2AdsAutomaticGroup } from "@shared/h2adsGroupRouting";

export default function OrderH2AdsBrowserShortcut({ registrationId, subOrderIndex, customerNumber, serviceName, serviceOption }: { registrationId: number; subOrderIndex: number; customerNumber?: number | null; serviceName?: string | null; serviceOption?: string | null }) {
  const utils = trpc.useUtils();
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
  const setOrderLink = trpc.h2Ads.setOrderLink.useMutation();
  const createInstanceLinkedOrder = trpc.h2Ads.createInstanceLinkedOrder.useMutation();

  const dashboard = dashboardQuery.data;
  const orders = (ordersQuery.data ?? []) as any[];
  const currentOrder = orders.find(order => order.id === registrationId && (order.subOrderIndex ?? 0) === subOrderIndex);
  const activeGroups = (dashboard?.groups ?? []).filter(group => group.status === "active");
  const automaticGroup = resolveH2AdsAutomaticGroup(activeGroups, currentOrder ?? { serviceName, serviceOption, latestStatus: null });

  const shortcut = resolveH2AdsOrderBrowserShortcutState({
    registrationId,
    subOrderIndex,
    links: (linksQuery.data ?? []) as any[],
    instances: (dashboard?.instances ?? []) as any[],
    assignments: (dashboard?.instanceWorkerAssignments ?? []) as any[],
    workers: (dashboard?.browserWorkers ?? []) as any[],
    runs: (dashboard?.instanceBrowserRuns ?? []) as any[],
  });

  const repairCandidate = shortcut ? null : resolveH2AdsOrderLinkRepairCandidate({
    registrationId,
    subOrderIndex,
    customerNumber,
    serviceName,
    serviceOption,
    links: (linksQuery.data ?? []) as any[],
    orders,
  });

  const pending = launchBrowser.isPending || closeBrowser.isPending || setOrderLink.isPending || createInstanceLinkedOrder.isPending;

  const refresh = async () => {
    await Promise.all([
      utils.h2Ads.listDashboard.invalidate(),
      utils.h2Ads.listOrderLinks.invalidate(),
    ]);
  };

  const createLinkedInstance = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (pending || dashboardQuery.isLoading || ordersQuery.isLoading) return;
    if (!currentOrder) {
      toast.error("Não foi possível localizar este pedido para criar a instância H2ADS.");
      return;
    }
    if (activeGroups.length === 0) {
      toast.error("Não existe grupo H2ADS ativo para receber a instância.");
      return;
    }

    let group = automaticGroup;
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
    const name = `${prefix} ${customerName}`.slice(0, 128);
    const confirmed = window.confirm(`Criar a instância H2ADS:\n\n${name}\n\nGrupo: ${group.name}\n\nEla será vinculada automaticamente a este pedido.`);
    if (!confirmed) return;

    try {
      await createInstanceLinkedOrder.mutateAsync({
        groupId: group.id,
        name,
        notes: null,
        status: "draft",
        registrationId,
        subOrderIndex,
      });
      toast.success("Instância H2ADS criada e vinculada ao pedido.");
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

  const repairLink = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!repairCandidate || pending) return;

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

  if (!shortcut && repairCandidate) {
    const sourceTitle = repairCandidate.linkedOrderNumber
      ? `Instância compatível vinculada ao pedido #${repairCandidate.linkedOrderNumber}. Clique em VINCULAR para revisar e confirmar a transferência.`
      : "Instância compatível vinculada a outro pedido/subpedido. Clique em VINCULAR para revisar e confirmar a transferência.";
    return <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 p-0.5" title={sourceTitle} onClick={event => event.stopPropagation()}>
      <span className="px-1 text-[9px] font-black uppercase tracking-wide text-amber-300">H2ADS</span>
      <button type="button" onClick={repairLink} disabled={pending} className="rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-1 text-[9px] font-black text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-30">VINCULAR</button>
    </span>;
  }

  if (!shortcut) {
    return <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/35 bg-violet-500/10 p-0.5" title="Criar uma instância H2ADS já vinculada a este pedido" onClick={event => event.stopPropagation()}>
      <span className="px-1 text-[9px] font-black uppercase tracking-wide text-violet-300">H2ADS</span>
      <button
        type="button"
        onClick={createLinkedInstance}
        disabled={pending || dashboardQuery.isLoading || ordersQuery.isLoading}
        className="inline-flex items-center gap-1 rounded-full border border-violet-400/35 bg-violet-400/15 px-2 py-1 text-[9px] font-black text-violet-200 transition hover:bg-violet-400/25 disabled:cursor-not-allowed disabled:opacity-30"
        title={automaticGroup ? `Criar e vincular no grupo ${automaticGroup.name}` : "Criar e vincular escolhendo o grupo"}
      >
        <Plus className="h-3 w-3" />CRIAR
      </button>
    </span>;
  }

  const statusTitle = shortcut.reason || (shortcut.state === "browser_open" ? "Browser H2ADS aberto" : "Browser H2ADS pronto");

  return <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/35 bg-cyan-500/10 p-0.5" title={statusTitle} onClick={event => event.stopPropagation()}>
    <span className="px-1 text-[9px] font-black uppercase tracking-wide text-cyan-300">H2ADS</span>
    <button
      type="button"
      onClick={openBrowser}
      disabled={!shortcut.canOpen || pending}
      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-1 text-[9px] font-black text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-30"
      title={shortcut.canOpen ? "Abrir browser da instância vinculada" : statusTitle}
    >
      <Play className="h-3 w-3" />ABRIR
    </button>
    <button
      type="button"
      onClick={closeBrowserNow}
      disabled={!shortcut.canClose || pending}
      className="inline-flex items-center gap-1 rounded-full border border-rose-500/35 bg-rose-500/15 px-2 py-1 text-[9px] font-black text-rose-300 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-30"
      title={shortcut.canClose ? "Fechar browser da instância vinculada" : statusTitle}
    >
      <Square className="h-3 w-3" />FECHAR
    </button>
  </span>;
}
