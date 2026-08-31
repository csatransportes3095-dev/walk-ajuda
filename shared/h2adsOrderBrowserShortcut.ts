export type H2AdsOrderLinkLike = { instanceId: number; registrationId: number; subOrderIndex: number };
export type H2AdsInstanceLike = { id: number; status: string };
export type H2AdsAssignmentLike = { instanceId: number; workerId: number };
export type H2AdsWorkerLike = { id: number; connectionStatus: string };
export type H2AdsBrowserRunLike = { instanceId: number; state: string };

export type H2AdsOrderBrowserShortcutState = {
  linked: true;
  instanceId: number;
  state: string;
  canOpen: boolean;
  canClose: boolean;
  reason: string | null;
};

export function resolveH2AdsOrderBrowserShortcutState(input: {
  registrationId: number;
  subOrderIndex: number;
  links: H2AdsOrderLinkLike[];
  instances: H2AdsInstanceLike[];
  assignments: H2AdsAssignmentLike[];
  workers: H2AdsWorkerLike[];
  runs: H2AdsBrowserRunLike[];
}): H2AdsOrderBrowserShortcutState | null {
  const link = input.links.find(item => item.registrationId === input.registrationId && item.subOrderIndex === input.subOrderIndex);
  if (!link) return null;

  const instance = input.instances.find(item => item.id === link.instanceId);
  const assignment = input.assignments.find(item => item.instanceId === link.instanceId);
  const worker = assignment ? input.workers.find(item => item.id === assignment.workerId) : undefined;
  const run = input.runs.find(item => item.instanceId === link.instanceId);
  const state = run?.state || "not_prepared";

  if (!instance) return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Instância H2ADS não encontrada." };
  if (instance.status === "archived") return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Instância H2ADS arquivada." };
  if (!assignment) return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Worker ainda não atribuído." };
  if (!worker || worker.connectionStatus !== "online") return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Worker offline." };
  if (state === "queued" || state === "preparing") return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Comando em andamento." };
  if (state === "browser_open") return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: true, reason: null };
  if (state === "proxy_verified" || state === "closed") return { linked: true, instanceId: link.instanceId, state, canOpen: true, canClose: false, reason: null };
  if (state === "blocked") return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Instância bloqueada; revise no H2ADS." };
  return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Prepare a instância no H2ADS antes de abrir." };
}
