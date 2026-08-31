import type { MouseEvent } from "react";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { resolveH2AdsOrderBrowserShortcutState, resolveH2AdsOrderLinkRepairCandidate } from "@shared/h2adsOrderBrowserShortcut";

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

  const dashboard = dashboardQuery.data;
  const shortcut = resolveH2AdsOrderBrowserShortcutState({
    registrationId,
    subOrderIndex,
    links: (linksQuery.data ?? []) as any[],
    instances: (dashboard?.instances ?? []) as any[],
    assignments: (dashboard?.instanceWorkerAssignments ?? []) as any[],
    workers: (dashboard?.browserWorkers ?? []) as any[],
    runs: (dashboard?.instanceBrowserRuns ?? []) as any[],
  });

  const repairCandidateInstanceId = shortcut ? null : resolveH2AdsOrderLinkRepairCandidate({
    registrationId,
    subOrderIndex,
    customerNumber,
    serviceName,
    serviceOption,
    links: (linksQuery.data ?? []) as any[],
    orders: (ordersQuery.data ?? []) as any[],
  });

  const pending = launchBrowser.isPending || closeBrowser.isPending || setOrderLink.isPending;
  if (!shortcut && repairCandidateInstanceId === null) return null;
  const refresh = async () => {
    await Promise.all([
      utils.h2Ads.listDashboard.invalidate(),
      utils.h2Ads.listOrderLinks.invalidate(),
    ]);
  };

  const openBrowser = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!shortcut.canOpen || pending) return;
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
    if (!shortcut.canClose || pending) return;
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
    if (repairCandidateInstanceId === null || pending) return;
    try {
      await setOrderLink.mutateAsync({ instanceId: repairCandidateInstanceId, registrationId, subOrderIndex });
      toast.success("Vínculo H2ADS corrigido para este pedido.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível corrigir o vínculo H2ADS.");
    }
  };

  if (!shortcut) {
    return <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 p-0.5" title="Existe uma instância compatível vinculada a outro pedido deste mesmo cliente/serviço." onClick={event => event.stopPropagation()}>
      <span className="px-1 text-[9px] font-black uppercase tracking-wide text-amber-300">H2ADS</span>
      <button type="button" onClick={repairLink} disabled={pending} className="rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-1 text-[9px] font-black text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-30">VINCULAR</button>
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
